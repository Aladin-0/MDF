import { calculateLineMargin, calculateTotalMargin } from '../lib/billingMarginUtils';
import { CartItem } from '../types';

describe('Apples-to-Apples Margin Calculation', () => {
    describe('When landingCostIncludeGst is TRUE (Tax-Inclusive Comparison)', () => {
        it('calculates positive profit and no lock on high-tax item with profitable tax-inclusive selling price', () => {
            // High-tax item (18% GST). Sold at MRP ₹118 (tax-inclusive).
            // Landing cost is ₹100 (tax-inclusive).
            // Previous bug: Taxable revenue ₹100 was compared to ₹100 landing cost or tax-exclusive selling price
            // causing false below-landing-cost locks on profitable items.
            const item: Partial<CartItem> = {
                batchId: 'batch-1',
                name: 'High Tax Med 18%',
                totalQty: 1,
                packSize: 1,
                rate: 118,
                totalAmount: 118,
                gstRate: 18,
                landingRate: 100,
                ptr: 100,
            };

            const result = calculateLineMargin(item as CartItem, 0, 'RETAIL', true);

            // rowProfit = 118 - (100 * 1) = 18.00
            expect(result.rowProfit).toBe(18.00);
            expect(result.lineGrossProfit).toBe(18.00);
            // marginPct = (18 / 118) * 100 = 15.25%
            expect(result.marginPct).toBe(15.25);
            // Checkout lock must NOT be triggered
            expect(result.isBelowLandingCost).toBe(false);
            expect(result.isLossSale).toBe(false);
        });

        it('triggers checkout lock when tax-inclusive selling price is below tax-inclusive landing cost', () => {
            // Sold at ₹90 (tax-inclusive), landing cost is ₹100 (tax-inclusive)
            const item: Partial<CartItem> = {
                batchId: 'batch-2',
                name: 'Discounted Loss Item',
                totalQty: 1,
                packSize: 1,
                rate: 90,
                totalAmount: 90,
                gstRate: 18,
                landingRate: 100,
                ptr: 100,
            };

            const result = calculateLineMargin(item as CartItem, 0, 'RETAIL', true);

            // rowProfit = 90 - (100 * 1) = -10.00
            expect(result.rowProfit).toBe(-10.00);
            expect(result.marginPct).toBe(-11.11);
            // Checkout lock MUST be triggered
            expect(result.isBelowLandingCost).toBe(true);
            expect(result.isLossSale).toBe(true);
        });
    });

    describe('When landingCostIncludeGst is FALSE (Tax-Exclusive Comparison)', () => {
        it('calculates profit and margin comparing tax-exclusive taxable amount against landing cost', () => {
            // Sold at base ₹100 + 18% GST = ₹118.
            // rowTaxableAmount = ₹100.
            // Landing cost is ₹80 (tax-exclusive).
            const item: Partial<CartItem> = {
                batchId: 'batch-3',
                name: 'Standard Med',
                totalQty: 1,
                packSize: 1,
                rate: 118,
                totalAmount: 118,
                gstRate: 18,
                landingRate: 80,
                ptr: 80,
            };

            const result = calculateLineMargin(item as CartItem, 0, 'RETAIL', false);

            // rowTaxableAmount = 118 / 1.18 = 100.00
            // rowProfit = 100 - (80 * 1) = 20.00
            expect(result.rowTaxableAmount).toBe(100.00);
            expect(result.rowProfit).toBe(20.00);
            // marginPct = (20 / 100) * 100 = 20.00%
            expect(result.marginPct).toBe(20.00);
            expect(result.isBelowLandingCost).toBe(false);
            expect(result.isLossSale).toBe(false);
        });

        it('triggers checkout lock when base taxable revenue is below tax-exclusive landing cost', () => {
            // Sold at ₹82.60 (taxable ₹70 + 18% GST), landing cost is ₹80 (tax-exclusive)
            const item: Partial<CartItem> = {
                batchId: 'batch-4',
                name: 'Loss Item Tax Exclusive',
                totalQty: 1,
                packSize: 1,
                rate: 82.60,
                totalAmount: 82.60,
                gstRate: 18,
                landingRate: 80,
                ptr: 80,
            };

            const result = calculateLineMargin(item as CartItem, 0, 'RETAIL', false);

            // rowTaxableAmount = 82.60 / 1.18 = 70.00
            // rowProfit = 70.00 - (80 * 1) = -10.00
            expect(result.rowTaxableAmount).toBe(70.00);
            expect(result.rowProfit).toBe(-10.00);
            // marginPct = (-10 / 70) * 100 = -14.29%
            expect(result.marginPct).toBe(-14.29);
            expect(result.isBelowLandingCost).toBe(true);
            expect(result.isLossSale).toBe(true);
        });
    });

    describe('Zero Sales & Safe Harbor Edge Cases', () => {
        it('safely handles division by zero when sales amount is 0', () => {
            const item: Partial<CartItem> = {
                batchId: 'batch-5',
                name: 'Zero Price Item',
                totalQty: 1,
                packSize: 1,
                rate: 0,
                totalAmount: 0,
                gstRate: 18,
                landingRate: 50,
                ptr: 50,
            };

            const result = calculateLineMargin(item as CartItem, 0, 'RETAIL', true);

            expect(result.marginPct).toBe(0);
            expect(Number.isFinite(result.marginPct)).toBe(true);
            expect(result.rowProfit).toBe(-50.00);
            expect(result.isBelowLandingCost).toBe(true);
        });

        it('preserves safe harbor for 100% free promotional scheme items', () => {
            const item: Partial<CartItem> = {
                batchId: 'batch-6',
                name: 'Promo Free Item',
                totalQty: 0,
                qtyStrips: 0,
                qtyLoose: 0,
                freeQtyStrips: 1,
                packSize: 1,
                rate: 0,
                totalAmount: 0,
                gstRate: 18,
                landingRate: 50,
                ptr: 50,
            };

            const result = calculateLineMargin(item as CartItem, 0, 'RETAIL', true);

            expect(result.isLossSale).toBe(false);
            expect(result.isBelowLandingCost).toBe(false);
            expect(result.rowProfit).toBe(0);
        });
    });
});
