import { renderHook, act } from '@testing-library/react';
import { useSaleReturnCart, calcItemTotal, calcItemUnits } from '../useSaleReturnCart';

describe('useSaleReturnCart hook & math utilities', () => {
    describe('calcItemTotal', () => {
        it('calculates total for whole strips', () => {
            // 2 strips of pack size 10 @ 50.00 = 100.00
            expect(calcItemTotal(2, 0, 50, 10)).toBe(100);
        });

        it('calculates total for loose units according to pack size', () => {
            // 5 loose units of pack size 10 @ 50.00/strip = 0.5 * 50 = 25.00
            expect(calcItemTotal(0, 5, 50, 10)).toBe(25);
        });

        it('calculates combined strip and loose units', () => {
            // 2 strips + 5 loose of pack size 10 @ 100.00 = 2.5 * 100 = 250.00
            expect(calcItemTotal(2, 5, 100, 10)).toBe(250);
        });
    });

    describe('calcItemUnits', () => {
        it('returns total loose count', () => {
            expect(calcItemUnits(3, 4, 10)).toBe(34);
        });
    });

    describe('reactive totals calculation', () => {
        it('derives exact subtotal, gstAmount, and totalAmount without approximation', () => {
            const initialItems = [
                {
                    id: '1',
                    productName: 'Paracetamol 500mg',
                    batchId: 'b1',
                    qtyStrips: '2',
                    qtyLoose: '0',
                    packSize: 10,
                    rate: '112.00', // ₹112 inclusive of 12% GST = ₹100 base + ₹12 GST
                    gstRate: '12',
                    total: 224.00,
                },
                {
                    id: '2',
                    productName: 'Amoxicillin 250mg',
                    batchId: 'b2',
                    qtyStrips: '1',
                    qtyLoose: '0',
                    packSize: 10,
                    rate: '105.00', // ₹105 inclusive of 5% GST = ₹100 base + ₹5 GST
                    gstRate: '5',
                    total: 105.00,
                },
            ];

            const { result } = renderHook(() => useSaleReturnCart(initialItems));

            // Total = 2 * 112 + 105 = 224 + 105 = 329.00
            expect(result.current.totalAmount).toBe(329);

            // GST for item 1 = 224 - (224 * 100 / 112) = 224 - 200 = 24.00
            // GST for item 2 = 105 - (105 * 100 / 105) = 105 - 100 = 5.00
            // Total GST = 29.00
            expect(result.current.gstAmount).toBe(29);

            // Subtotal = 329 - 29 = 300.00
            expect(result.current.subtotal).toBe(300);
        });

        it('recalculates dynamically when item quantities change', () => {
            const { result } = renderHook(() => useSaleReturnCart([
                {
                    id: '1',
                    productName: 'Medicine A',
                    batchId: 'b1',
                    qtyStrips: '1',
                    qtyLoose: '0',
                    packSize: 10,
                    rate: '100.00',
                    gstRate: '0',
                    total: 100.00,
                }
            ]));

            expect(result.current.totalAmount).toBe(100);

            // Update strips from 1 to 3
            act(() => {
                result.current.updateItem('1', 'qtyStrips', '3');
            });

            expect(result.current.items[0].qtyStrips).toBe('3');
            expect(result.current.items[0].total).toBe(300);
            expect(result.current.totalAmount).toBe(300);
        });

        it('enforces max total units when defined and invokes callback', () => {
            const onExceed = jest.fn();
            const { result } = renderHook(() => useSaleReturnCart([
                {
                    id: '1',
                    productName: 'Medicine Limited',
                    batchId: 'b1',
                    qtyStrips: '1',
                    qtyLoose: '0',
                    packSize: 10,
                    maxTotalUnits: 15, // max 1 strip + 5 loose
                    rate: '100.00',
                    gstRate: '0',
                    total: 100.00,
                }
            ]));

            // Try to set strips to 2 (20 units > 15)
            act(() => {
                result.current.updateItem('1', 'qtyStrips', '2', onExceed);
            });

            expect(onExceed).toHaveBeenCalledWith(15, 20);
            // Value is kept at previous
            expect(result.current.items[0].qtyStrips).toBe('1');
        });
    });
});
