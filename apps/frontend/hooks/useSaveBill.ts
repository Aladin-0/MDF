'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { salesApi } from '@/lib/apiClient';
import { PaymentSplit } from '@/types';

export function useSaveBill() {
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveBill = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const state = useBillingStore.getState();
            const activeDraftId = state.activeDraftId;
            
            if (!activeDraftId) {
                throw new Error("No active draft selected.");
            }

            const draft = state.drafts[activeDraftId];
            if (!draft) {
                throw new Error("Draft not found.");
            }

            const cart = draft.cart;
            const customer = draft.customer;
            const customerLedger = draft.customerLedger;
            const doctor = draft.doctor;
            const scheduleHData = draft.scheduleHData;
            const totals = state.getDraftTotals(activeDraftId);
            const extraDiscountPct = draft.extraDiscountPct || 0;
            const activeStaff = state.activeStaff;
            const { outlet } = useAuthStore.getState();
            const { selectedOutletId } = useSettingsStore.getState();
            const resolvedOutletId = selectedOutletId ?? outlet?.id;

            if (!resolvedOutletId || !activeStaff?.id) {
                throw {
                    type: 'AUTH_ERROR',
                    message: 'Your session has expired. Please log in again.',
                    requiresReauth: true,
                };
            }

            const getPaid = (method: string) => {
                if (draft.payment.method === method) return draft.payment.amount || totals.grandTotal;
                if (draft.payment.method === 'split') {
                    return (draft.payment.splitBreakdown as any)?.[method] || 0;
                }
                return 0;
            };

            const payload = {
                outletId: resolvedOutletId,
                partyLedgerId: (customerLedger && customerLedger.id !== 'mock') ? customerLedger.id : undefined,
                customerId: (customer && customer.id !== 'mock') ? customer.id : undefined,
                doctorId: (doctor && doctor.id !== 'mock') ? doctor.id : undefined,
                doctorName: doctor?.name,      // Needed by quotation backend (stores text, not FK)
                hospitalName: draft.hospitalName,
                prescriptionNo: draft.prescriptionNo,
                billedBy: activeStaff.id,
                items: cart.map((item: any) => {
                    const rawTotal = item.rate * item.totalQty;
                    const gstRate = item.gstRate || 0;
                    const discountFactor = extraDiscountPct > 0 ? 1 - extraDiscountPct / 100 : 1;
                    const discountedTotal = rawTotal * discountFactor;
                    const taxable = gstRate > 0
                        ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
                        : Number(discountedTotal.toFixed(2));
                    const gst = Number((discountedTotal - taxable).toFixed(2));
                    return {
                        batchId: item.batchId,
                        name: item.name,
                        batchNo: item.batchNo,
                        expiryDate: item.expiryDate,
                        productId: item.productId,
                        qtyStrips: item.qtyStrips,
                        qtyLoose: item.qtyLoose,
                        saleMode: item.saleMode,
                        mrp: item.mrp || 0,            // Snapshot fields for quotation reopen
                        saleRate: item.saleRate || item.rate || 0,
                        packSize: item.packSize || 1,
                        rate: item.rate,
                        discountPct: item.discountPct,
                        gstRate: item.gstRate,
                        scheduleType: item.scheduleType || 'OTC',
                        taxableAmount: taxable,
                        gstAmount: gst,
                        totalAmount: Number(discountedTotal.toFixed(2)),
                    };
                }),
                subtotal: Number(totals.subtotal.toFixed(2)),
                discountAmount: Number((totals.discountAmount + totals.extraDiscountAmount).toFixed(2)),
                taxableAmount: Number(totals.taxableAmount.toFixed(2)),
                cgstAmount: Number(totals.cgstAmount.toFixed(2)),
                sgstAmount: Number(totals.sgstAmount.toFixed(2)),
                igstAmount: 0,
                cgst: Number(totals.cgstAmount.toFixed(2)),
                sgst: Number(totals.sgstAmount.toFixed(2)),
                igst: 0,
                roundOff: Number(totals.roundOff.toFixed(2)),
                grandTotal: Number(totals.grandTotal.toFixed(2)),
                extraDiscountPct,
                paymentMode: draft.payment.method,
                cashPaid: draft.payment.method === 'cash' ? (draft.payment.cashTendered || totals.grandTotal) : getPaid('cash'),
                upiPaid: getPaid('upi'),
                cardPaid: getPaid('card'),
                creditGiven: getPaid('credit'),
                scheduleHData: (totals.requiresDoctorDetails || totals.hasScheduleH) ? scheduleHData : undefined,
                revisionAction: state.revisionAction,
                revisionReasonCode: state.revisionReasonCode,
                revisionReasonText: state.revisionReasonText,
                quotationId: draft.quotationId,
            };

            const editingSaleId = state.editingSaleId;
            const revisionAction = state.revisionAction;
            let invoice;
            try {
                if (draft.documentMode === 'quotation') {
                    if (draft.quotationId) {
                        invoice = await salesApi.updateQuotation(draft.quotationId, payload as never);
                    } else {
                        invoice = await salesApi.createQuotation(payload as never);
                    }
                } else {
                    if (editingSaleId) {
                        if (revisionAction) {
                            invoice = await salesApi.revise(editingSaleId, payload as never);
                        } else {
                            invoice = await salesApi.update(editingSaleId, payload as never);
                        }
                    } else {
                        invoice = await salesApi.create(payload as never);
                    }
                }
            } catch (err: unknown) {
                const isNetworkError =
                    !navigator.onLine ||
                    (err instanceof TypeError && err.message === 'Failed to fetch');
                if (isNetworkError) {
                    throw {
                        type: 'NETWORK_ERROR',
                        message:
                            'Cannot save bill — no connection to server. ' +
                            'Please check your internet connection and try again.',
                        canRetry: true,
                    };
                }
                throw err;
            }

            const enrichedInvoice = {
                ...invoice,
                customer: (invoice as any).customer ?? customer ?? undefined,
                doctorName: doctor?.name ?? scheduleHData?.doctorName ?? undefined,
                doctorRegNo: doctor?.regNo ?? scheduleHData?.doctorRegNo ?? undefined,
                doctorDegree: doctor?.degree ?? undefined,
                patientName: scheduleHData?.patientName ?? undefined,
                patientAddress: scheduleHData?.patientAddress ?? undefined,
            };

            state.setLastInvoice(enrichedInvoice as any);
            state.closeDraft(activeDraftId); // Close the draft since it's finalized
            state.incrementBillsToday();

            if (editingSaleId) {
                state.setEditingSaleId(null);
            }

            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['ledger'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
            queryClient.invalidateQueries({ queryKey: ['pl-ledger-stmt'] });
            queryClient.invalidateQueries({ queryKey: ['products', 'search'] });
            // Refresh quotation list if we saved a quotation
            if (draft.documentMode === 'quotation') {
                queryClient.invalidateQueries({ queryKey: ['quotations'] });
            }

            return invoice;

        } catch (err: any) {
            const message =
                err?.message ??
                err?.error?.message ??
                err?.detail ??
                'Failed to save bill. Please try again.';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return { saveBill, isLoading, error };
}
