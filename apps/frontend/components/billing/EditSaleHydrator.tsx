'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useBillingStore } from '@/store/billingStore';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export function EditSaleHydrator() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const editId = searchParams.get('edit');
    const hasHydrated = useRef(false);

    useEffect(() => {
        if (!editId || hasHydrated.current) return;
        
        const outlet = useAuthStore.getState().user?.outlet;
        if (!outlet) return;

        hasHydrated.current = true;
        const hydrate = async () => {
            try {
                const [res, optionsRes] = await Promise.all([
                    api.get(`/sales/${editId}/`, { params: { outletId: outlet.id } }),
                    api.get(`/sales/${editId}/modification-options/`, { params: { outletId: outlet.id } }),
                ]);
                const fullInvoice = res.data;

                // Which kind of correction this user may make on this bill is decided by the SERVER (it is the same
                // rule the save call enforces). This used to hard-code 'paid_bill_correction' for every edit, so an
                // unpaid bill was sent as a paid-bill correction and a user without that right was refused at save.
                const allowed: string[] = optionsRes.data?.allowedActions ?? [];
                const info = optionsRes.data?.invoice ?? {};
                const preferred = info.hasReturns ? 'return_aware_correction' : info.isPaid ? 'paid_bill_correction' : 'commercial_correction';
                const revisionAction = allowed.includes(preferred) ? preferred : allowed[0];
                if (!revisionAction) {
                    alert(optionsRes.data?.blockReason || 'You do not have permission to modify this bill.');
                    router.replace('/billing');
                    return;
                }

                const store = useBillingStore.getState();
                
                let targetDraftId = store.activeDraftId;
                const currentDraft = targetDraftId ? store.drafts[targetDraftId] : null;

                const hasItems = currentDraft?.cart && currentDraft.cart.length > 0;
                const hasCustomer = !!currentDraft?.customer;
                const hasEditingSale = !!currentDraft?.editingSaleId;
                const isNonEmptyDraft = hasItems || hasCustomer || hasEditingSale;

                if (!targetDraftId || isNonEmptyDraft) {
                    targetDraftId = store.createDraft();
                } else {
                    store.clearCart(targetDraftId);
                }
                store.setLastInvoice(null);
                
                if (fullInvoice.invoiceDate) {
                    const d = new Date(fullInvoice.invoiceDate);
                    store.updateDraftHeader(targetDraftId, {
                        invoiceDate: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
                        saleType: fullInvoice.saleType || 'RETAIL', // FIX 1: Restore correct tax math
                        billingBasis: fullInvoice.billingBasis || 'mrp'
                    });
                } else {
                    store.updateDraftHeader(targetDraftId, {
                        saleType: fullInvoice.saleType || 'RETAIL',
                        billingBasis: fullInvoice.billingBasis || 'mrp'
                    });
                }

                store.setCustomer(fullInvoice.customer || null);
                if (fullInvoice.customer) {
                    store.setCustomerLedger({
                        id: 'mock',
                        name: fullInvoice.customer.name,
                        phone: fullInvoice.customer.phone || '',
                        address: fullInvoice.customer.address || '',
                        groupName: 'Sundry Debtors',
                        currentBalance: 0,
                        isMock: true,
                    } as any);
                }

                if (!fullInvoice.customer && fullInvoice.walkInName) store.setWalkInName(fullInvoice.walkInName);

                // Set AFTER the customer ledger (setCustomerLedger clears the patient).
                if (fullInvoice.patientId) {
                    // The person the bill was for on a shared family account (kept unless the user picks someone else).
                    store.setPatient({ id: fullInvoice.patientId, name: fullInvoice.patientMemberName || 'Patient' });
                }

                // FIX 1: Read both camelCase and snake_case to prevent UI hallucination
                store.setExtraDiscountPct(Number(fullInvoice.extraDiscountPct ?? fullInvoice.extra_discount_pct ?? 0));

                const method = (fullInvoice.paymentMode || 'cash') as any;
                store.setPayment({
                    method,
                    amount: fullInvoice.amountPaid ?? fullInvoice.grandTotal ?? 0,
                    // A split bill must come back as its split, otherwise saving re-sends it as 0/0/0/0 and the
                    // payment is lost or the bill is turned into a different tender.
                    ...(method === 'split'
                        ? {
                            splitBreakdown: {
                                cash: Number(fullInvoice.cashPaid ?? 0),
                                upi: Number(fullInvoice.upiPaid ?? 0),
                                card: Number(fullInvoice.cardPaid ?? 0),
                                credit: Number(fullInvoice.creditGiven ?? 0),
                            },
                        }
                        : {}),
                });

                if (fullInvoice.doctorId || fullInvoice.doctorName) {
                    store.setDoctor({
                        id: fullInvoice.doctorId || 'mock',
                        name: fullInvoice.doctorName || 'Unknown Doctor',
                        regNo: fullInvoice.doctorRegNo || '',
                    } as any);
                }
                if (fullInvoice.hospitalName) {
                    store.setHospitalName(fullInvoice.hospitalName);
                }

                if (fullInvoice.scheduleHData) {
                     store.setScheduleHData({
                         patientName: fullInvoice.scheduleHData.patientName || '',
                         patientAge: fullInvoice.scheduleHData.patientAge || 0,
                         patientAddress: fullInvoice.scheduleHData.patientAddress || '',
                         doctorName: fullInvoice.scheduleHData.doctorName || '',
                         doctorRegNo: fullInvoice.scheduleHData.doctorRegNo || '',
                         prescriptionNo: fullInvoice.scheduleHData.prescriptionNo || '',
                     });
                     if (fullInvoice.scheduleHData.prescriptionNo || fullInvoice.prescriptionNo) {
                         store.updateDraftHeader(targetDraftId, { 
                             prescriptionNo: fullInvoice.scheduleHData.prescriptionNo || fullInvoice.prescriptionNo 
                         });
                     }
                } else if (fullInvoice.doctorName || fullInvoice.prescriptionNo) {
                     store.setScheduleHData({
                         patientName: '',
                         patientAge: 0,
                         patientAddress: '',
                         doctorName: fullInvoice.doctorName || '',
                         doctorRegNo: fullInvoice.doctorRegNo || '',
                         prescriptionNo: fullInvoice.prescriptionNo || '',
                     });
                     if (fullInvoice.prescriptionNo) {
                         store.updateDraftHeader(targetDraftId, { prescriptionNo: fullInvoice.prescriptionNo });
                     }
                }

                if (fullInvoice.items) {
                     fullInvoice.items.forEach((item: any) => {
                         const packSize = Number(item.packSize ?? item.pack_size ?? 1);
                         const qtyStrips = Number(item.qtyStrips ?? item.qty_strips ?? 0);
                         const qtyLoose = Number(item.qtyLoose ?? item.qty_loose ?? 0);
                         const totalQtyFractional = qtyStrips + (qtyLoose / packSize);
                         
                         const mrp = Number(item.mrp ?? 0);
                         const ptr = Number(item.ptr ?? 0);
                         const pts = Number(item.pts ?? 0);
                         
                         // FIX 2: Always force the base rate to be MRP (or PTR/PTS) before any discounts. 
                         // This prevents the "Double Discount" trap.
                         const isWholesale = fullInvoice.saleType === 'WHOLESALE';
                         // Use the base rate SAVED on the bill (what the counter sent as `rate`), falling back to the
                         // current MRP/PTS only if it is missing. Always using MRP changed a hand-typed rate back to MRP on
                         // every re-save, which the server now (correctly) refuses for staff who may not change rates.
                         const savedRate = Number(item.rate ?? 0);
                         const baseRate = savedRate > 0 ? savedRate : (isWholesale ? (pts || ptr || mrp) : mrp);
                         
                         const discountPct = Number(item.discountPct ?? item.discount_pct ?? 0);
                         const gstRate = Number(item.gstRate ?? item.gst_rate ?? 0);
                         const taxMultiplier = 1 + (gstRate / 100);
                         
                         // CRITICAL FIX: The DB stores item.totalAmount AFTER extraDiscountPct was applied.
                         // distributeSmartDiscounts() uses item.totalAmount as its base and then applies
                         // extraDiscountPct AGAIN => double discount (e.g. ₹358 bill loads as ₹306).
                         // Solution: always pass the PRE-DISCOUNT base amount (baseRate × qty ± GST).
                         const baseRateAfterItemDisc = baseRate * (1 - discountPct / 100);
                         const preTotalAmount = isWholesale
                             ? baseRateAfterItemDisc * totalQtyFractional * taxMultiplier
                             : baseRateAfterItemDisc * totalQtyFractional;
                         
                         store.addToCart(targetDraftId, {
                             ...item,
                             qtyStrips: qtyStrips,
                             qtyLoose: qtyLoose,
                             packSize: packSize,
                             productId: item.productId ?? item.product_id,
                             batchId: item.batchId ?? item.batch_id,
                             batchNo: item.batchNo ?? item.batch_no,
                             expiryDate: item.expiryDate ?? item.expiry_date,
                             
                             // FIX 3: Snake_case fallbacks for API fields so discounts don't vanish
                             discountPct: discountPct,
                             gstRate: gstRate,
                             cgstRate: Number(item.cgstRate ?? item.cgst_rate ?? 0),
                             sgstRate: Number(item.sgstRate ?? item.sgst_rate ?? 0),
                             
                             saleRate: baseRate,
                             rate: baseRate, // The math engine MUST use the pre-discount baseRate
                             totalQty: totalQtyFractional,
                             saleMode: item.saleMode ?? item.sale_mode ?? 'mixed',
                             mrp: mrp,
                             purchaseRate: Number(item.purchaseRate ?? item.purchase_rate ?? 0),
                             landingRate: Number(item.landingRate ?? item.landing_rate ?? item.purchaseRate ?? item.purchase_rate ?? 0),
                             ptr: ptr,
                             pts: pts,
                             // Pass pre-discount total so distributeSmartDiscounts has a clean base
                             totalAmount: preTotalAmount,
                         });
                     });
                }
                
                // Only now is the draft a complete copy of the bill: mark it as an edit of that bill. (It was marked
                // first, so a failure half-way left an empty cart that Save would have sent over the real invoice.)
                store.setEditingSaleId(editId, fullInvoice.updatedAt ?? null);
                store.setRevisionContext(revisionAction, '', '');

                // Clear the URL param without reload
                router.replace('/billing');

            } catch (err) {
                console.error("Hydration failed:", err);
                const detail = (err as any)?.response?.data?.detail;
                alert(detail || "Failed to load invoice details for editing.");
            }
        };

        hydrate();
    }, [editId, router]);

    return null;
}
