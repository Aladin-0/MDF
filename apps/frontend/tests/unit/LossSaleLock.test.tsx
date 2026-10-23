import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { calculateLineMargin, calculateTotalMargin } from '@/lib/billingMarginUtils';
import { CartItem } from '@/types';
import { RightBillingRail } from '@/components/billing/RightBillingRail';
import { useBillingStore } from '@/store/billingStore';

jest.mock('uuid', () => ({ v4: () => 'test-id' }));
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useParams: () => ({ id: '1' }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/hooks/useSaveBill', () => ({
    useSaveBill: () => ({ saveBill: jest.fn(), isLoading: false }),
}));

jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: jest.fn() }),
}));

describe('Loss-Sale Prevention & Margin Lock', () => {
    describe('Frontend Math Engine (calculateLineMargin & calculateTotalMargin)', () => {
        it('identifies item selling below PTR as a loss sale', () => {
            const item: CartItem = {
                batchId: 'b-1',
                productId: 'p-1',
                name: 'Paracetamol 500mg',
                packSize: 10,
                packUnit: 'tablet',
                batchNo: 'B001',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                rate: 70,
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 70,
                gstAmount: 0,
                totalAmount: 70,
            };

            const line = calculateLineMargin(item);
            expect(line.isLossSale).toBe(true);
            expect(line.costFloor).toBe(80);
            expect(line.sellingPricePerPack).toBe(70);
            expect(line.margin).toBe(-10);
        });

        it('prioritizes landingRate over ptr for loss sale determination', () => {
            const item: CartItem = {
                batchId: 'b-landing',
                productId: 'p-landing',
                name: 'Paracetamol 500mg',
                packSize: 10,
                packUnit: 'tablet',
                batchNo: 'B001',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 70,
                landingRate: 85,
                rate: 75,
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 75,
                gstAmount: 0,
                totalAmount: 75,
            };

            const line = calculateLineMargin(item);
            expect(line.costFloor).toBe(85);
            expect(line.isLossSale).toBe(true);
            expect(line.margin).toBe(-10);
        });

        it('identifies item selling above PTR as profitable', () => {
            const item: CartItem = {
                batchId: 'b-2',
                productId: 'p-2',
                name: 'Amoxicillin 250mg',
                packSize: 10,
                packUnit: 'capsule',
                batchNo: 'B002',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                rate: 90,
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 90,
                gstAmount: 0,
                totalAmount: 90,
            };

            const line = calculateLineMargin(item);
            expect(line.isLossSale).toBe(false);
            expect(line.costFloor).toBe(80);
            expect(line.sellingPricePerPack).toBe(90);
            expect(line.margin).toBe(10);
        });

        it('smart-caps bill extra discount at cost floor for legally priced items', () => {
            const item: CartItem = {
                batchId: 'b-3',
                productId: 'p-3',
                name: 'Azithromycin 500mg',
                packSize: 3,
                packUnit: 'tablet',
                batchNo: 'B003',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                rate: 90,
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 90,
                gstAmount: 0,
                totalAmount: 90,
            };

            // Without extra discount, selling at 90 >= 80 -> not loss
            const lineNoExtra = calculateLineMargin(item, 0);
            expect(lineNoExtra.isLossSale).toBe(false);

            // With 20% bill extra discount: 90 * 0.8 = 72, which is below PTR 80.
            // Smart Capping intercepts and caps it at 80 (cost floor), preventing a false loss sale!
            const lineWithExtra = calculateLineMargin(item, 20);
            expect(lineWithExtra.isLossSale).toBe(false);
            expect(lineWithExtra.finalRowAmount).toBe(80);
            expect(lineWithExtra.sellingPricePerPack).toBe(80);
        });

        it('does NOT smart-cap an item that was already priced below cost floor before extra discount', () => {
            const illegalItem: CartItem = {
                batchId: 'b-illegal',
                productId: 'p-illegal',
                name: 'Under-cost Item',
                packSize: 1,
                packUnit: 'strip',
                batchNo: 'B004',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                rate: 70, // already below PTR 80
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 70,
                gstAmount: 0,
                totalAmount: 70,
            };

            const line = calculateLineMargin(illegalItem, 10);
            expect(line.isLossSale).toBe(true);
            expect(line.finalRowAmount).toBe(63); // 70 * 0.9 = 63, not capped
        });

        it('detects isGlobalLoss when grandTotal is less than total landing cost', () => {
            const cart: CartItem[] = [
                {
                    batchId: 'b-1',
                    productId: 'p-1',
                    name: 'Item 1',
                    packSize: 1,
                    packUnit: 'strip',
                    batchNo: 'B1',
                    expiryDate: '2026-12-31',
                    scheduleType: 'OTC',
                    mrp: 100,
                    ptr: 80,
                    rate: 80,
                    qtyStrips: 1,
                    qtyLoose: 0,
                    totalQty: 1,
                    saleMode: 'strip',
                    discountPct: 0,
                    gstRate: 0,
                    taxableAmount: 80,
                    gstAmount: 0,
                    totalAmount: 80,
                },
            ];

            // Bill total 75 < total landing cost 80 -> isGlobalLoss true
            const marginLoss = calculateTotalMargin(cart, 75);
            expect(marginLoss.isGlobalLoss).toBe(true);

            // Bill total 85 >= total landing cost 80 -> isGlobalLoss false
            const marginProfit = calculateTotalMargin(cart, 85);
            expect(marginProfit.isGlobalLoss).toBe(false);
        });
    });

    describe('UI Lock in RightBillingRail', () => {
        beforeEach(() => {
            useBillingStore.setState({
                drafts: {},
                activeDraftId: 'draft-test',
            });
        });

        it('disables checkout button and shows warning banner when item is sold below PTR', () => {
            const lossItem: CartItem = {
                batchId: 'b-loss',
                productId: 'p-loss',
                name: 'Paracetamol',
                packSize: 10,
                packUnit: 'tablet',
                batchNo: 'B001',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                rate: 60,
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 60,
                gstAmount: 0,
                totalAmount: 60,
            };

            useBillingStore.setState({
                activeDraftId: 'draft-test',
                drafts: {
                    'draft-test': {
                        id: 'draft-test',
                        outletId: 'outlet-1',
                        customer: null,
                        doctor: null,
                        cart: [lossItem],
                        payment: { method: 'cash', amount: 60, cashTendered: 60 },
                        extraDiscountPct: 0,
                        documentMode: 'invoice',
                        saleType: 'RETAIL',
                        billingBasis: 'MRP',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    } as any,
                },
            });

            render(<RightBillingRail />);

            // Checkout button must be forcefully disabled
            const checkoutBtn = screen.getByTestId('checkout-button');
            expect(checkoutBtn).toBeDisabled();

            // Loss sale lock banner must be displayed
            expect(screen.getByTestId('loss-sale-lock-banner')).toBeInTheDocument();
            expect(screen.getAllByText(/Checkout Locked: One or more items are being sold below landing cost/i).length).toBeGreaterThan(0);
        });

        it('enables checkout button when items are sold at or above landing cost', () => {
            const validItem: CartItem = {
                batchId: 'b-valid',
                productId: 'p-valid',
                name: 'Paracetamol',
                packSize: 10,
                packUnit: 'tablet',
                batchNo: 'B002',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                rate: 90,
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 90,
                gstAmount: 0,
                totalAmount: 90,
            };

            useBillingStore.setState({
                activeDraftId: 'draft-test-2',
                drafts: {
                    'draft-test-2': {
                        id: 'draft-test-2',
                        outletId: 'outlet-1',
                        customer: null,
                        doctor: null,
                        cart: [validItem],
                        payment: { method: 'cash', amount: 90, cashTendered: 90 },
                        extraDiscountPct: 0,
                        documentMode: 'invoice',
                        saleType: 'RETAIL',
                        billingBasis: 'MRP',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    } as any,
                },
            });

            render(<RightBillingRail />);

            const checkoutBtn = screen.getByTestId('checkout-button');
            expect(checkoutBtn).not.toBeDisabled();
            expect(screen.queryByTestId('loss-sale-lock-banner')).not.toBeInTheDocument();
        });

        it('shows below purchase rate warning banner in WHOLESALE mode when sold below purchase rate', () => {
            const wholesaleLossItem: CartItem = {
                batchId: 'b-ws-loss',
                productId: 'p-ws-loss',
                name: 'Paracetamol Wholesale',
                packSize: 10,
                packUnit: 'tablet',
                batchNo: 'B003',
                expiryDate: '2026-12-31',
                scheduleType: 'OTC',
                mrp: 100,
                ptr: 80,
                purchaseRate: 65,
                landingRate: 85,
                rate: 55, // 55 < purchaseRate 65 -> Loss
                qtyStrips: 1,
                qtyLoose: 0,
                totalQty: 1,
                saleMode: 'strip',
                discountPct: 0,
                gstRate: 0,
                taxableAmount: 55,
                gstAmount: 0,
                totalAmount: 55,
            };

            useBillingStore.setState({
                activeDraftId: 'draft-ws-test',
                drafts: {
                    'draft-ws-test': {
                        id: 'draft-ws-test',
                        outletId: 'outlet-1',
                        customer: null,
                        doctor: null,
                        cart: [wholesaleLossItem],
                        payment: { method: 'cash', amount: 55, cashTendered: 55 },
                        extraDiscountPct: 0,
                        documentMode: 'invoice',
                        saleType: 'WHOLESALE',
                        billingBasis: 'PTR',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    } as any,
                },
            });

            render(<RightBillingRail />);

            const checkoutBtn = screen.getByTestId('checkout-button');
            expect(checkoutBtn).toBeDisabled();
            expect(screen.getByTestId('loss-sale-lock-banner')).toBeInTheDocument();
            expect(screen.getAllByText(/Checkout Locked: One or more items are being sold below purchase rate/i).length).toBeGreaterThan(0);
        });
    });

    describe('Dual-Mode Margin Floor Branching (Retail vs Wholesale)', () => {
        const dualModeItem: CartItem = {
            batchId: 'b-dual',
            productId: 'p-dual',
            name: 'Dual Mode Product',
            packSize: 1,
            packUnit: 'strip',
            batchNo: 'B-DUAL',
            expiryDate: '2027-01-01',
            scheduleType: 'OTC',
            mrp: 120,
            purchaseRate: 60,
            pts: 65,
            landingRate: 85,
            ptr: 80,
            rate: 70, // Selling at 70
            qtyStrips: 1,
            qtyLoose: 0,
            totalQty: 1,
            saleMode: 'strip',
            discountPct: 0,
            gstRate: 0,
            taxableAmount: 70,
            gstAmount: 0,
            totalAmount: 70,
        };

        it('uses landing_rate (85) in RETAIL mode, flagging rate 70 as a loss sale', () => {
            const retailResult = calculateLineMargin(dualModeItem, 0, 'RETAIL');
            expect(retailResult.costFloor).toBe(85);
            expect(retailResult.isLossSale).toBe(true);
            expect(retailResult.margin).toBe(-15);
        });

        it('uses purchase_rate (60) in WHOLESALE mode, allowing rate 70 with positive profit', () => {
            const wholesaleResult = calculateLineMargin(dualModeItem, 0, 'WHOLESALE');
            expect(wholesaleResult.costFloor).toBe(60);
            expect(wholesaleResult.isLossSale).toBe(false);
            expect(wholesaleResult.margin).toBe(10);
        });

        it('falls back to PTS in WHOLESALE mode when purchaseRate is zero/missing', () => {
            const itemNoPurchase: CartItem = {
                ...dualModeItem,
                purchaseRate: 0,
            };
            const result = calculateLineMargin(itemNoPurchase, 0, 'WHOLESALE');
            expect(result.costFloor).toBe(65); // falls back to PTS 65
            expect(result.isLossSale).toBe(false); // 70 > 65
        });

        it('falls back to PTR in RETAIL mode when landingRate is zero/missing', () => {
            const itemNoLanding: CartItem = {
                ...dualModeItem,
                landingRate: 0,
            };
            const result = calculateLineMargin(itemNoLanding, 0, 'RETAIL');
            expect(result.costFloor).toBe(80); // falls back to PTR 80
            expect(result.isLossSale).toBe(true); // 70 < 80
        });
    });
});
