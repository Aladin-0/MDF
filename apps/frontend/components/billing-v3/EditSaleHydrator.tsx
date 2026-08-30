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
                const res = await api.get(`/sales/${editId}/`, { params: { outletId: outlet.id } });
                const fullInvoice = res.data;

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
                
                store.setEditingSaleId(editId);
                store.setRevisionContext('paid_bill_correction', '', '');

                if (fullInvoice.invoiceDate) {
                    const d = new Date(fullInvoice.invoiceDate);
                    store.updateDraftHeader(targetDraftId, {
                        invoiceDate: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
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

                const totalDiscountAmount = typeof fullInvoice.discountAmount === 'number' ? fullInvoice.discountAmount : 0;
                const totalRateAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
                    const packSize = item.packSize || 1;
                    const qtyStrips = item.qtyStrips || 0;
                    const qtyLoose = item.qtyLoose || 0;
                    const qty = qtyStrips + (qtyLoose / packSize);
                    return sum + ((item.rate || item.saleRate || 0) * qty);
                }, 0) || 1;
                const itemDiscountAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
                    const packSize = item.packSize || 1;
                    const qtyStrips = item.qtyStrips || 0;
                    const qtyLoose = item.qtyLoose || 0;
                    const qty = qtyStrips + (qtyLoose / packSize);
                    return sum + (((item.mrp || 0) - (item.rate || item.saleRate || 0)) * qty);
                }, 0) || 0;
                
                const extraDiscountAmount = Math.max(0, totalDiscountAmount - itemDiscountAmount);
                const extraDiscountPct = totalRateAmount > 0 ? (extraDiscountAmount / totalRateAmount) * 100 : 0;
                store.setExtraDiscountPct(extraDiscountPct);

                store.setPayment({
                    method: (fullInvoice.paymentMode || 'cash') as any,
                    amount: fullInvoice.amountPaid ?? fullInvoice.grandTotal ?? 0,
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
                         const packSize = item.packSize || 1;
                         const qtyStrips = item.qtyStrips || 0;
                         const qtyLoose = item.qtyLoose || 0;
                         const totalQtyFractional = qtyStrips + (qtyLoose / packSize);
                         
                         store.addToCart(targetDraftId, {
                             ...item,
                             qtyStrips: qtyStrips,
                             qtyLoose: qtyLoose,
                             packSize: packSize,
                             productId: item.productId,
                             batchId: item.batchId,
                             batchNo: item.batchNo,
                             expiryDate: item.expiryDate,
                             discountPct: item.discountPct || 0,
                             gstRate: item.gstRate || 0,
                             cgstRate: item.cgstRate || 0,
                             sgstRate: item.sgstRate || 0,
                             saleRate: item.saleRate || item.rate,
                             totalQty: totalQtyFractional,
                             saleMode: item.saleMode || 'mixed',
                             mrp: item.mrp || item.rate,
                         });
                     });
                }
                
                // Clear the URL param without reload
                router.replace('/billing');

            } catch (err) {
                console.error("Hydration failed:", err);
                alert("Failed to load invoice details for editing.");
            }
        };

        hydrate();
    }, [editId, router]);

    return null;
}
