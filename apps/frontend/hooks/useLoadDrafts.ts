'use client';

import { useEffect, useState, useRef } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { salesApi } from '@/lib/apiClient';
import { DraftBill, CartItem } from '@/types';

export function useLoadDrafts() {
    const [isLoaded, setIsLoaded] = useState(false);
    const { setDrafts, createDraft } = useBillingStore();
    const activeStaff = useBillingStore(state => state.activeStaff);

    const hasFetched = useRef(false);

    useEffect(() => {
        if (!activeStaff) return; // Only load when staff is pinned in
        if (hasFetched.current) return;
        hasFetched.current = true;

        const loadDrafts = async () => {
            try {
                const { outlet } = useAuthStore.getState();
                if (!outlet) return;

                const currentDrafts = useBillingStore.getState().drafts;
                const currentActiveId = useBillingStore.getState().activeDraftId;

                const { getHeaders, assertOk, API_URL } = await import('@/lib/apiClient');
                // We hit the backend to get drafts for this outlet
                const res = await fetch(`${API_URL}/sales/drafts/?outletId=${outlet.id}`, {
                    headers: getHeaders()
                });
                if (!res.ok) throw new Error('Failed to load drafts');
                const data = await res.json(); // Expected to be an array of DraftInvoiceSerializer

                if (!Array.isArray(data) || data.length === 0) {
                    if (Object.keys(currentDrafts).length === 0) {
                        createDraft();
                    }
                    setIsLoaded(true);
                    return;
                }

                const newDrafts: Record<string, DraftBill> = { ...currentDrafts };
                let firstId: string | null = currentActiveId;

                data.forEach((draft: any) => {
                    if (newDrafts[draft.id]) return;
                    if (!firstId) firstId = draft.id;
                    const items: CartItem[] = draft.items.map((item: any) => ({
                        batchId: item.batch,
                        productId: '', // We don't have full product info, but we can reconstruct some if needed or wait for re-hydration. For a complete system, the backend should return hydrated product info.
                        qtyStrips: item.qty_strips,
                        qtyLoose: item.qty_loose,
                        discountPct: item.discount_pct,
                        // Defaults for required cart item fields since we only saved basic info:
                        name: item.product_name || 'Restored Item',
                        packSize: 1,
                        packUnit: 'unit',
                        batchNo: item.batch_no || '',
                        expiryDate: '',
                        scheduleType: 'OTC',
                        mrp: 0,
                        rate: 0,
                        totalQty: item.qty_strips + item.qty_loose,
                        saleMode: 'loose',
                        gstRate: 0,
                        taxableAmount: 0,
                        gstAmount: 0,
                        totalAmount: 0
                    }));

                    newDrafts[draft.id] = {
                        id: draft.id,
                        documentMode: 'invoice',
                        customer: draft.customer_details || null,
                        customerLedger: null,
                        doctor: draft.doctor_details || null,
                        hospitalName: draft.hospital_name || null,
                        prescriptionNo: draft.prescription_no || null,
                        scheduleHData: draft.schedule_h_json || null,
                        prescriptionImageUrl: null,
                        cart: items,
                        payment: {
                            method: draft.payment_mode || 'cash',
                            amount: draft.amount_paid || 0,
                        },
                        extraDiscountPct: draft.extra_discount_pct || 0,
                        status: draft.draft_status as any || 'draft',
                        createdAt: draft.created_at,
                        updatedAt: draft.updated_at,
                    };
                });

                setDrafts(newDrafts, firstId);
            } catch (err) {
                console.error("Failed to load drafts from server", err);
                // Fallback to empty draft
                createDraft();
            } finally {
                setIsLoaded(true);
            }
        };

        loadDrafts();
    }, [activeStaff, setDrafts, createDraft]);

    return isLoaded;
}
