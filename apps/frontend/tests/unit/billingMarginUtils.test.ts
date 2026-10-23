import { calculateLineMargin, calculateTotalMargin } from '../../lib/billingMarginUtils';
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
});

