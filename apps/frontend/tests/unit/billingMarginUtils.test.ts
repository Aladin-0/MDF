import { calculateLineMargin, calculateTotalMargin, distributeSmartDiscounts, getMaxAllowableBillDiscount } from '../../lib/billingMarginUtils';
import { CartItem } from '../../types';

describe('billingMarginUtils', () => {
    describe('calculateLineMargin', () => {
        it('calculates margin and marginPct for normal case', () => {
            const item = { saleRate: 150, landingRate: 100, totalQty: 2 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.margin).toBe(50);
            expect(result.marginPct).toBe(33.33);
            expect(result.lineGrossProfit).toBe(100);
        });

        it('handles zero margin', () => {
            const item = { saleRate: 100, landingRate: 100, totalQty: 1 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.margin).toBe(0);
            expect(result.marginPct).toBe(0);
            expect(result.lineGrossProfit).toBe(0);
        });

        it('handles negative margin without crashing', () => {
            const item = { saleRate: 90, landingRate: 100, totalQty: 1 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.margin).toBe(-10);
            expect(result.marginPct).toBe(-11.11);
            expect(result.lineGrossProfit).toBe(-10);
        });

        it('handles zero saleRate without crashing', () => {
            const item = { saleRate: 0, landingRate: 100, totalQty: 1 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.margin).toBe(-100);
            expect(result.marginPct).toBe(0); // Explicitly 0% as per requirements
            expect(result.lineGrossProfit).toBe(-100);
        });
        it('detects isLossSale when selling price is below ptr', () => {
            const item = { rate: 70, ptr: 80, mrp: 100, totalAmount: 70, totalQty: 1 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.isLossSale).toBe(true);
            expect(result.costFloor).toBe(80);
        });

        it('detects isLossSale false when selling price is above ptr', () => {
            const item = { rate: 85, ptr: 80, mrp: 100, totalAmount: 85, totalQty: 1 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.isLossSale).toBe(false);
            expect(result.costFloor).toBe(80);
        });

        it('prioritizes landingRate over ptr for cost floor and loss sale detection', () => {
            // ptr is 70, landingRate is 85, selling rate is 75.
            // 75 is above ptr 70, BUT below landingRate 85 -> should be flagged as isLossSale!
            const item = { rate: 75, ptr: 70, landingRate: 85, mrp: 100, totalAmount: 75, totalQty: 1 } as CartItem;
            const result = calculateLineMargin(item);
            expect(result.costFloor).toBe(85);
            expect(result.isLossSale).toBe(true);
        });

        it('falls back to ptr when landingRate is missing or zero', () => {
            const itemNoLanding = { rate: 75, ptr: 80, mrp: 100, totalAmount: 75, totalQty: 1 } as CartItem;
            const result1 = calculateLineMargin(itemNoLanding);
            expect(result1.costFloor).toBe(80);
            expect(result1.isLossSale).toBe(true);

            const itemZeroLanding = { rate: 75, ptr: 80, landingRate: 0, mrp: 100, totalAmount: 75, totalQty: 1 } as CartItem;
            const result2 = calculateLineMargin(itemZeroLanding);
            expect(result2.costFloor).toBe(80);
            expect(result2.isLossSale).toBe(true);
        });
    });

    describe('calculateTotalMargin', () => {
        it('calculates total margin and gross profit', () => {
            const cart = [
                { saleRate: 150, landingRate: 100, totalQty: 2 }, // margin 50 * 2 = 100
                { saleRate: 120, landingRate: 100, totalQty: 1 }, // margin 20 * 1 = 20
                { saleRate: 90, landingRate: 100, totalQty: 2 }   // margin -10 * 2 = -20
            ] as CartItem[];
            
            const result = calculateTotalMargin(cart, 400);
            expect(result.totalMargin).toBe(100);
            expect(result.totalGrossProfit).toBe(100);
            expect(result.totalMarginPct).toBe(25); // 100 / 400 * 100
        });

        it('calculates isGlobalLoss when grandTotal is below total landing cost', () => {
            const cart = [
                { rate: 100, ptr: 80, totalQty: 2, totalAmount: 200 }, // cost 160
                { rate: 50, ptr: 40, totalQty: 1, totalAmount: 50 },   // cost 40
            ] as CartItem[];
            // Total cost = 200. If bill grandTotal is 180, it's a global loss.
            const resultLoss = calculateTotalMargin(cart, 180);
            expect(resultLoss.isGlobalLoss).toBe(true);

            // If grandTotal is 250, it is profitable
            const resultProfit = calculateTotalMargin(cart, 250);
            expect(resultProfit.isGlobalLoss).toBe(false);
        });

        it('marks isGlobalLoss true when any item has isLossSale', () => {
            const cart = [
                { rate: 100, ptr: 80, totalQty: 1, totalAmount: 100 }, // profitable
                { rate: 30, ptr: 40, totalQty: 1, totalAmount: 30 },   // loss sale: 30 < 40
            ] as CartItem[];
            // Even if total bill amount (130) > total cost (120), one item is loss sale
            const result = calculateTotalMargin(cart, 130);
            expect(result.hasLossSale).toBe(true);
            expect(result.isGlobalLoss).toBe(true);
        });

        it('passes saleType to calculateLineMargin correctly in WHOLESALE mode', () => {
            const wholesaleCart = [
                {
                    rate: 70,
                    purchaseRate: 60,
                    landingRate: 85,
                    ptr: 80,
                    totalQty: 1,
                    totalAmount: 70,
                },
            ] as CartItem[];

            // In RETAIL mode: cost floor is 85 -> loss sale (70 < 85)
            const retailResult = calculateTotalMargin(wholesaleCart, 70, 0, 0, 'RETAIL');
            expect(retailResult.hasLossSale).toBe(true);
            expect(retailResult.isGlobalLoss).toBe(true);

            // In WHOLESALE mode: cost floor is 60 -> profitable (70 >= 60)
            const wholesaleResult = calculateTotalMargin(wholesaleCart, 70, 0, 0, 'WHOLESALE');
            expect(wholesaleResult.hasLossSale).toBe(false);
            expect(wholesaleResult.isGlobalLoss).toBe(false);
        });
    });

    describe('dual-mode cost floor priority', () => {
        it('WHOLESALE mode prioritizes purchaseRate > pts > landingRate > ptr', () => {
            const item = {
                rate: 65,
                purchaseRate: 50,
                pts: 55,
                landingRate: 70,
                ptr: 60,
                totalQty: 1,
                totalAmount: 65,
            } as CartItem;

            // WHOLESALE uses purchaseRate = 50 -> not a loss sale
            const wsRes = calculateLineMargin(item, 0, 'WHOLESALE');
            expect(wsRes.costFloor).toBe(50);
            expect(wsRes.isLossSale).toBe(false);

            // Without purchaseRate, falls back to pts = 55
            const itemNoPurchase = { ...item, purchaseRate: 0 };
            const wsResPts = calculateLineMargin(itemNoPurchase, 0, 'WHOLESALE');
            expect(wsResPts.costFloor).toBe(55);

            // Without purchaseRate and pts, falls back to landingRate = 70 -> loss sale!
            const itemNoPts = { ...itemNoPurchase, pts: 0 };
            const wsResLanding = calculateLineMargin(itemNoPts, 0, 'WHOLESALE');
            expect(wsResLanding.costFloor).toBe(70);
            expect(wsResLanding.isLossSale).toBe(true);
        });

        it('RETAIL mode prioritizes landingRate > ptr > purchaseRate', () => {
            const item = {
                rate: 75,
                purchaseRate: 50,
                landingRate: 80,
                ptr: 70,
                totalQty: 1,
                totalAmount: 75,
            } as CartItem;

            // RETAIL uses landingRate = 80 -> loss sale (75 < 80)
            const retRes = calculateLineMargin(item, 0, 'RETAIL');
            expect(retRes.costFloor).toBe(80);
            expect(retRes.isLossSale).toBe(true);

            // Without landingRate, falls back to ptr = 70 -> profitable (75 >= 70)
            const itemNoLanding = { ...item, landingRate: 0 };
            const retResPtr = calculateLineMargin(itemNoLanding, 0, 'RETAIL');
            expect(retResPtr.costFloor).toBe(70);
            expect(retResPtr.isLossSale).toBe(false);

            // Without landingRate and ptr, falls back to purchaseRate = 50
            const itemNoPtr = { ...itemNoLanding, ptr: 0 };
            const retResPurch = calculateLineMargin(itemNoPtr, 0, 'RETAIL');
            expect(retResPurch.costFloor).toBe(50);
            expect(retResPurch.isLossSale).toBe(false);
        });
    });

    describe('distributeSmartDiscounts (Smart Capping & Dynamic Redistribution)', () => {
        it('caps low-margin items at cost floor and redistributes remaining flat discount to high-margin items', () => {
            // Cart with 2 items:
            // Item A: Low-margin (Rate ₹100, landingRate ₹95, qty 1) -> Base ₹100, headroom ₹5
            // Item B: High-margin (Rate ₹1000, landingRate ₹500, qty 1) -> Base ₹1000, headroom ₹500
            // Total Base: ₹1100.
            // Customer is offered a ₹245 flat discount: extraDiscountPct = (245 / 1100) * 100 = 22.2727%
            // Proportional discount would give Item A: 100 * 22.2727% = ₹22.27 -> selling price ₹77.73 < ₹95 (LOSS SALE!)
            // With Smart Cap & Redistribution:
            // Item A is capped at ₹95 (absorbs max ₹5 discount, no loss sale!)
            // The remaining ₹240 discount is absorbed by Item B (selling price ₹760 >= ₹500)
            const cart = [
                {
                    batchId: 'batch-low-margin',
                    rate: 100,
                    landingRate: 95,
                    totalQty: 1,
                    qtyStrips: 1,
                    qtyLoose: 0,
                    totalAmount: 100,
                    gstPct: 0,
                },
                {
                    batchId: 'batch-high-margin',
                    rate: 1000,
                    landingRate: 500,
                    totalQty: 1,
                    qtyStrips: 1,
                    qtyLoose: 0,
                    totalAmount: 1000,
                    gstPct: 0,
                },
            ] as unknown as CartItem[];

            const flatDiscount = 245;
            const extraDiscountPct = (flatDiscount / 1100) * 100;

            const allocations = distributeSmartDiscounts(cart, extraDiscountPct, 'RETAIL');

            const allocA = allocations.get('batch-low-margin')!;
            const allocB = allocations.get('batch-high-margin')!;

            // Item A should be capped at its cost floor (₹95)
            expect(allocA.isSmartCapped).toBe(true);
            expect(allocA.isLossSale).toBe(false);
            expect(allocA.finalRowAmount).toBe(95);
            expect(allocA.discountAmount).toBe(5);

            // Item B should absorb the rest of the discount (₹240)
            expect(allocB.isLossSale).toBe(false);
            expect(allocB.finalRowAmount).toBe(760);
            expect(allocB.discountAmount).toBe(240);

            // Total discount absorbed exactly matches ₹245!
            const totalAbsorbedDiscount = allocA.discountAmount + allocB.discountAmount;
            expect(totalAbsorbedDiscount).toBe(flatDiscount);

            // Sum of final rows equals Gross - Flat Discount (1100 - 245 = 855)
            const totalFinalAmount = allocA.finalRowAmount + allocB.finalRowAmount;
            expect(totalFinalAmount).toBe(855);
        });

        it('safe-harbors scheme items with free quantities so cost floor is evaluated on billed qty', () => {
            // Item sold with scheme: Buy 10 strips, get 2 free strips.
            // Billed strips: 10, Free strips: 2.
            // Rate: ₹100, Landing Rate: ₹90.
            // Revenue comes from 10 strips = ₹1000.
            // Cost floor for 10 billed strips = ₹900.
            // If free quantities erroneously spiked the floor to 12 * 90 = ₹1080, it would falsely fail!
            const itemWithScheme = {
                batchId: 'batch-scheme',
                rate: 100,
                landingRate: 90,
                qtyStrips: 10,
                qtyLoose: 0,
                freeQtyStrips: 2,
                totalQty: 10,
                totalAmount: 1000,
                gstPct: 0,
            } as unknown as CartItem;

            // With 5% extra discount:
            // Billed total = 1000, after 5% discount = 950.
            // 950 >= 900 (billed cost floor) -> perfectly legal and profitable!
            const allocations = distributeSmartDiscounts([itemWithScheme], 5, 'RETAIL');
            const alloc = allocations.get('batch-scheme')!;

            expect(alloc.isLossSale).toBe(false);
            expect(alloc.finalRowAmount).toBe(950);
            expect(alloc.discountAmount).toBe(50);
        });
    });
});


    describe('PROACTIVE EDGE CASES', () => {

        // EDGE CASE 1: 100% Free Promotional Item Safe Harbor in calculateLineMargin
        it('[EC-1] 100% free promo item is NOT flagged as isLossSale in calculateLineMargin', () => {
            const promoItem = {
                batchId: 'promo-item',
                rate: 100,
                landingRate: 90,
                qtyStrips: 0,
                qtyLoose: 0,
                freeQtyStrips: 5,
                totalQty: 0,
                totalAmount: 0,
                gstPct: 0,
            } as unknown as CartItem;

            const result = calculateLineMargin(promoItem, 0, 'RETAIL');
            expect(result.isLossSale).toBe(false);
            expect(result.finalRowAmount).toBe(0);
            expect(result.lineGrossProfit).toBe(0);
        });

        // EDGE CASE 2: getMaxAllowableBillDiscount computes correct ceiling
        it('[EC-2] getMaxAllowableBillDiscount correctly computes the maximum safe flat discount', () => {
            const cart = [
                { batchId: 'a', rate: 200, landingRate: 180, qtyStrips: 1, qtyLoose: 0, totalQty: 1, totalAmount: 200, gstPct: 0 },
                { batchId: 'b', rate: 1000, landingRate: 600, qtyStrips: 1, qtyLoose: 0, totalQty: 1, totalAmount: 1000, gstPct: 0 },
            ] as unknown as CartItem[];

            const result = getMaxAllowableBillDiscount(cart, 'RETAIL');
            expect(result.totalBaseAmount).toBe(1200);
            expect(result.maxDiscountAmount).toBe(420);
            expect(result.maxDiscountPct).toBeCloseTo(35, 1);
        });

        // EDGE CASE 3: Impossible discount is capped at headroom
        it('[EC-3] distributeSmartDiscounts caps impossible discount at total headroom', () => {
            const cart = [
                { batchId: 'low-headroom', rate: 100, landingRate: 95, qtyStrips: 1, qtyLoose: 0, totalQty: 1, totalAmount: 100, gstPct: 0 },
            ] as unknown as CartItem[];

            const allocations = distributeSmartDiscounts(cart, 50, 'RETAIL');
            const alloc = allocations.get('low-headroom')!;

            expect(alloc.finalRowAmount).toBeGreaterThanOrEqual(95);
            expect(alloc.isLossSale).toBe(false);
            expect(alloc.discountAmount).toBeLessThanOrEqual(5);
        });

        // EDGE CASE 4: GST derived post-cap (tax sequencing)
        it('[EC-4] GST is derived post-cap: reflects capped row amount not discounted amount', () => {
            // Rate=130 > floor(100*1.18=118); 20% discount -> 104 < 118 -> cap fires
            const cart = [
                { batchId: 'gst-item', rate: 130, landingRate: 100, qtyStrips: 1, qtyLoose: 0, totalQty: 1, totalAmount: 130, gstPct: 18 },
            ] as unknown as CartItem[];

            const allocations = distributeSmartDiscounts(cart, 20, 'RETAIL');
            const alloc = allocations.get('gst-item')!;

            expect(alloc.finalRowAmount).toBeCloseTo(118, 1);
            expect(alloc.isSmartCapped).toBe(true);

            const gstAmount = alloc.finalRowAmount - alloc.finalTaxable;
            expect(gstAmount).toBeCloseTo(18, 0);
            expect(alloc.finalTaxable).toBeCloseTo(100, 0);
        });
    });
