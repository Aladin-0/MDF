'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/lib/logger';
import { salesApi } from '@/lib/apiClient';
import { PaymentSplit } from '@/types';
import { buildSalePayload, buildScheduleHPayload } from '@/utils/payloadBuilders';

export function useSaveBill() {
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveBill = async () => {
        setIsLoading(true);
        setError(null);

        const state = useBillingStore.getState();
        const activeDraftId = state.activeDraftId;
        const { outlet } = useAuthStore.getState();
        const { selectedOutletId } = useSettingsStore.getState();
        const resolvedOutletId = selectedOutletId ?? outlet?.id;

        try {
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
    

            if (!resolvedOutletId || !activeStaff?.id) {
                throw {
                    type: 'AUTH_ERROR',
                    message: 'Your session has expired. Please log in again.',
                    requiresReauth: true,
                };
            }

            const partyLedgerId = (customerLedger && customerLedger.id !== 'mock' && !(customerLedger as any).isMock) ? customerLedger.id : undefined;
            const customerId = (customer && customer.id !== 'mock') ? customer.id : undefined;

            let invoiceDateIso;
            if (draft.invoiceDate) {
                const parsed = new Date(draft.invoiceDate);
                if (!isNaN(parsed.getTime())) {
                    invoiceDateIso = parsed.toISOString();
                }
            }

            const getPaid = (method: string) => {
                if (draft.payment.method === method) return draft.payment.amount || totals.grandTotal;
                if (draft.payment.method === 'split') {
                    return (draft.payment.splitBreakdown as any)?.[method] || 0;
                }
                return 0;
            };

            const finalScheduleHData = (totals.requiresDoctorDetails || totals.hasScheduleH)
                ? buildScheduleHPayload(customer, doctor, draft)
                : undefined;

            const payload = buildSalePayload(draft, finalScheduleHData, totals, activeStaff, resolvedOutletId);
            const editingSaleId = draft.editingSaleId;
            const revisionAction = draft.revisionAction;
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
            logger.error("SAVE_BILL_FAILED", err, {
                draftId: activeDraftId,
                outletId: resolvedOutletId,
                editingSaleId: state.editingSaleId,
            });

            const message =
                err?.detail ??
                err?.message ??
                err?.error?.message ??
                'Failed to save bill. Please try again.';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return { saveBill, isLoading, error };
}
