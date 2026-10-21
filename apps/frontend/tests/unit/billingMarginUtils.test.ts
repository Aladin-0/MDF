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

        it('detects isLossSale when extra discount brings net price below ptr', () => {
            // Base rate 90, but 20% extra discount -> net 72, which is < ptr 80
            const item = { rate: 90, ptr: 80, mrp: 100, totalAmount: 90, totalQty: 1 } as CartItem;
            const withoutExtra = calculateLineMargin(item, 0);
            expect(withoutExtra.isLossSale).toBe(false);

            const withExtra = calculateLineMargin(item, 20);
            expect(withExtra.finalRowAmount).toBe(72);
            expect(withExtra.isLossSale).toBe(true);
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
    });
});
