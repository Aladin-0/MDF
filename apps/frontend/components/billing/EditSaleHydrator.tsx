'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useBillingStore } from '@/store/billingStore';
import { floorsOf, savedLinePrices } from '@/lib/billingMarginUtils';
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
                // A discount typed in rupees comes back as those rupees; a percent as a percent.
                const savedRupees = Number(fullInvoice.extraDiscountRupees ?? 0);
                if (savedRupees > 0) store.setExtraDiscountRupees(savedRupees);
                else store.setExtraDiscountPct(Number(fullInvoice.extraDiscountPct ?? fullInvoice.extra_discount_pct ?? 0));

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
                         
                         // The rate saved on the bill is the price AFTER the line discount (what the counter sent as `rate`).
                         // The price before it (`saleRate`) is worked back from the discount %. Reading the saved rate as
                         // the pre-discount price took the discount off a second time.
                         const isWholesale = fullInvoice.saleType === 'WHOLESALE';
                         const discountPct = Number(item.discountPct ?? item.discount_pct ?? 0);
                         const gstRate = Number(item.gstRate ?? item.gst_rate ?? 0);
                         const listPrice = isWholesale ? (pts || ptr || mrp) : mrp;
                         // Keep the saved rate (a hand-typed rate must come back as typed); only if it is missing, price
                         // the line from the batch's list price.
                         const prices = savedLinePrices({ rate: Number(item.rate ?? 0), discountPct, mrp, listPrice });
                         let netRate = prices.rate;
                         // The server keeps 2 decimals of the rate. Without a bill discount (in either form: Rs 5 off a very
                         // large bill is saved as 0.00%) the saved line total is exact:
                         // use it to restore the unrounded rate (Rs 100 off 3 packs must come back as 935, not 935.01).
                         const savedTotal = Number(item.totalAmount ?? item.total_amount ?? 0);
                         const extraPct = Number(fullInvoice.extraDiscountPct ?? fullInvoice.extra_discount_pct ?? 0);
                         if (!(extraPct > 0) && !(savedRupees > 0) && savedTotal > 0 && totalQtyFractional > 0) {
                             const exact = savedTotal / totalQtyFractional / (isWholesale ? 1 + gstRate / 100 : 1);
                             if (Math.abs(exact - netRate) <= 0.005) netRate = exact;
                         }
                         const saleRate = prices.saleRate;
                         
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
                             
                             saleRate: saleRate,      // before the line discount (the line editor starts from this)
                             rate: netRate,           // after it: what the totals, the payload and the server read
                             totalQty: totalQtyFractional,
                             saleMode: item.saleMode ?? item.sale_mode ?? 'mixed',
                             mrp: mrp,
                             purchaseRate: Number(item.purchaseRate ?? item.purchase_rate ?? 0),
                             landingRate: Number(item.landingRate ?? item.landing_rate ?? item.purchaseRate ?? item.purchase_rate ?? 0),
                             ...floorsOf(item),      // the floors the server will hold this edit to
                             ptr: ptr,
                             pts: pts,
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
