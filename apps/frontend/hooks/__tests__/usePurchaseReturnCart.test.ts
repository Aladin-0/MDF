import { renderHook, act } from '@testing-library/react';
import { usePurchaseReturnCart, calcPurchaseItemTotal, newPurchaseReturnItem } from '../usePurchaseReturnCart';

describe('usePurchaseReturnCart hook & math utilities', () => {
    describe('calcPurchaseItemTotal', () => {
        it('calculates total for whole strips with exclusive GST', () => {
            // 2 strips of pack size 10 @ 100.00 base, 12% GST
            // Base = 200, GST = 24 => Total = 224
            expect(calcPurchaseItemTotal(2, 0, 100, 10, 12)).toBe(224);
        });

        it('calculates total for loose units according to pack size with GST', () => {
            // 5 loose units of pack size 10 @ 100.00 base, 18% GST
            // Fractional strips = 0.5 => Base = 50, GST = 9 => Total = 59
            expect(calcPurchaseItemTotal(0, 5, 100, 10, 18)).toBe(59);
        });

        it('calculates combined strip and loose units', () => {
            // 2 strips + 5 loose of pack size 10 @ 100.00 base, 12% GST
            // Fractional = 2.5 => Base = 250, GST = 30 => Total = 280
            expect(calcPurchaseItemTotal(2, 5, 100, 10, 12)).toBe(280);
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
                    rate: '100.00', // Base: 200, GST 12%: 24
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
                    rate: '100.00', // Base: 100, GST 5%: 5
                    gstRate: '5',
                    total: 105.00,
                },
            ];

            const { result } = renderHook(() => usePurchaseReturnCart(initialItems));

            expect(result.current.subtotal).toBe(300);
            expect(result.current.gstAmount).toBe(29);
            expect(result.current.totalAmount).toBe(329);
        });

        it('recalculates dynamically on item update', () => {
            const { result } = renderHook(() => usePurchaseReturnCart([
                {
                    id: 'test-1',
                    productName: 'Cetirizine 10mg',
                    batchId: 'b3',
                    qtyStrips: '1',
                    qtyLoose: '0',
                    packSize: 10,
                    rate: '50.00',
                    gstRate: '12',
                    total: 56.00,
                }
            ]));

            expect(result.current.totalAmount).toBe(56);

            act(() => {
                result.current.updateItem('test-1', 'qtyStrips', '3');
            });

            // 3 strips @ 50 = 150 base + 18 GST = 168.00
            expect(result.current.subtotal).toBe(150);
            expect(result.current.gstAmount).toBe(18);
            expect(result.current.totalAmount).toBe(168);
        });

        it('enforces maximum unit constraint when provided', () => {
            const exceedCallback = jest.fn();
            const { result } = renderHook(() => usePurchaseReturnCart([
                {
                    id: 'test-max',
                    productName: 'Antibiotic 500mg',
                    batchId: 'b4',
                    qtyStrips: '1',
                    qtyLoose: '0',
                    packSize: 10,
                    maxTotalUnits: 20, // max 2 strips
                    rate: '100.00',
                    gstRate: '12',
                    total: 112.00,
                }
            ]));

            act(() => {
                result.current.updateItem('test-max', 'qtyStrips', '5', exceedCallback);
            });

            expect(exceedCallback).toHaveBeenCalledWith(20, 50);
            expect(result.current.items[0].qtyStrips).toBe('1');
        });
    });
});
