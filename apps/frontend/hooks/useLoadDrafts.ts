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
        if (hasFetched.current) return;

        const loadDrafts = async () => {
            try {
                const { outlet } = useAuthStore.getState();
                const currentDrafts = useBillingStore.getState().drafts;
                const currentActiveId = useBillingStore.getState().activeDraftId;

                if (!outlet) {
                    if (Object.keys(currentDrafts).length === 0) {
                        createDraft();
                    }
                    setIsLoaded(true);
                    return;
                }

                hasFetched.current = true;
                const { getHeaders, API_URL } = await import('@/lib/apiClient');
                // We hit the backend to get drafts for this outlet
                const res = await fetch(`${API_URL}/sales/drafts/?outletId=${outlet.id}`, {
                    headers: getHeaders()
                });
                if (!res.ok) throw new Error('Failed to load drafts');
                const data = await res.json(); // Expected to be an array of DraftInvoiceSerializer

                const newDrafts: Record<string, DraftBill> = { ...currentDrafts };

                if (Array.isArray(data) && data.length > 0) {
                    data.forEach((draft: any) => {
                        // If we already have this draft locally with items, preserve rich local state
                        if (newDrafts[draft.id] && newDrafts[draft.id].cart.length > 0) return;

                        const items: CartItem[] = (draft.items || []).map((item: any) => ({
                            batchId: item.batch,
                            productId: item.product_id || '',
                            qtyStrips: item.qty_strips || 0,
                            qtyLoose: item.qty_loose || 0,
                            discountPct: Number(item.discount_pct || 0),
                            name: item.product_name || item.name || 'Restored Item',
                            packSize: item.pack_size || 1,
                            packUnit: item.pack_unit || 'unit',
                            batchNo: item.batch_no || '',
                            expiryDate: item.expiry_date || '',
                            scheduleType: item.schedule_type || 'OTC',
                            mrp: Number(item.mrp || 0),
                            ptr: Number(item.ptr || 0),
                            pts: Number(item.pts || 0),
                            purchaseRate: Number(item.purchase_rate || 0),
                            landingRate: Number(item.landing_rate || item.purchase_rate || 0),
                            rate: Number(item.rate || item.sale_rate || 0),
                            totalQty: (item.qty_strips || 0) + ((item.qty_loose || 0) / (item.pack_size || 1)),
                            saleMode: 'loose',
                            gstRate: Number(item.gst_rate || 0),
                            taxableAmount: Number(item.taxable_amount || 0),
                            gstAmount: Number(item.gst_amount || 0),
                            totalAmount: Number(item.total_amount || 0)
                        }));

                        newDrafts[draft.id] = {
                            id: draft.id,
                            localSessionId: newDrafts[draft.id]?.localSessionId || draft.id,
                            documentMode: 'invoice',
                            saleType: 'RETAIL',
                            billingBasis: 'MRP',
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
                            extraDiscountPct: Number(draft.extra_discount_pct || 0),
                            status: (draft.draft_status as any) || 'draft',
                            createdAt: draft.created_at || new Date().toISOString(),
                            updatedAt: draft.updated_at || new Date().toISOString(),
                        };
                    });
                }

                const draftList = Object.values(newDrafts);
                if (draftList.length === 0) {
                    createDraft();
                } else {
                    // Sort by updatedAt / createdAt descending to find the most recently modified draft
                    const sorted = [...draftList].sort((a, b) => {
                        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return timeB - timeA;
                    });
                    const targetId = (currentActiveId && newDrafts[currentActiveId]) 
                        ? currentActiveId 
                        : sorted[0].id;
                    setDrafts(newDrafts, targetId);
                }
            } catch (err) {
                console.error("Failed to load drafts from server", err);
                const currentDrafts = useBillingStore.getState().drafts;
                if (Object.keys(currentDrafts).length === 0) {
                    createDraft();
                }
            } finally {
                setIsLoaded(true);
            }
        };

        loadDrafts();
    }, [setDrafts, createDraft]);

    return isLoaded;
}
