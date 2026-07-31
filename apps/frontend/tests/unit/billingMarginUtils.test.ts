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
    });
});
