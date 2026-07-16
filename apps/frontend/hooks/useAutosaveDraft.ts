'use client';

import { useEffect, useRef } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/authStore';
import { salesApi } from '@/lib/apiClient';
import { DraftBill } from '@/types';

// Debounce interval in ms
const AUTOSAVE_DELAY = 2000;

export function useAutosaveDraft() {
    const activeDraftId = useBillingStore(state => state.activeDraftId);
    const draft = useBillingStore(state => activeDraftId ? state.drafts[activeDraftId] : null);
    const getDraftTotals = useBillingStore(state => state.getDraftTotals);
    
    // Use refs to avoid infinite loops
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedStringRef = useRef<string>('');
    const lastQueuedStringRef = useRef<string>('');
    const isInitialLoad = useRef<boolean>(true);
    const isSavingRef = useRef<boolean>(false);

    // We only want to trigger auto-save when the ACTUAL data changes, not when saveStatus changes.
    // So we compute the payload string outside the effect or use a ref.
    
    useEffect(() => {
        if (!activeDraftId || !draft) return;
        
        // Quotations are saved explicitly — never autosave to invoice draft endpoint
        if (draft.documentMode === 'quotation') return;

        // Don't auto-save empty drafts to save DB calls
        const customerId = draft.customerLedger?.linkedCustomerId || draft.customer?.id;
        if (draft.cart.length === 0 && !customerId) return;

        const { outlet } = useAuthStore.getState();
        if (!outlet) return;

        const totals = getDraftTotals(activeDraftId);

        // Build backend payload - Clean all fields as per FIX 1
        const toTwoDecimals = (val: any) => parseFloat(Number(val || 0).toFixed(2));

        const payload: any = {
            id: draft.id,
            outlet: outlet.id,
            doctor: draft.doctor?.id || null,
            hospital_name: draft.hospitalName || '',
            draft_status: draft.status === 'held' ? 'held' : 'draft',
            subtotal: toTwoDecimals(totals.subtotal),
            discount_amount: toTwoDecimals(totals.discountAmount),
            extra_discount_pct: toTwoDecimals(draft.extraDiscountPct),
            taxable_amount: toTwoDecimals(totals.taxableAmount),
            cgst_amount: toTwoDecimals(totals.cgstAmount),
            sgst_amount: toTwoDecimals(totals.sgstAmount),
            round_off: toTwoDecimals(totals.roundOff),
            grand_total: toTwoDecimals(totals.grandTotal),
            payment_mode: draft.payment?.method || 'cash',
            schedule_h_json: draft.scheduleHData || null,
            items: draft.cart.map(item => ({
                batch: item.batchId,
                qty_strips: item.qtyStrips || 0,
                qty_loose: item.qtyLoose || 0,
                discount_pct: toTwoDecimals(item.discountPct)
            }))
        };

        if (customerId) {
            payload.customer = customerId;
        } else {
            payload.customer = null;
        }

        const currentString = JSON.stringify(payload);
        
        // Skip initial autosave for quotation/invoice prefill drafts so they only save on manual change
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            const isQuotationPrefill = !!draft.quotationId || !!draft.sourceInvoiceId;
            const isLocal = draft.id.startsWith('local-');
            if (isQuotationPrefill && isLocal) {
                lastSavedStringRef.current = currentString;
                return;
            }
        }
        
        // If the payload hasn't changed since the last successful save, do nothing.
        if (currentString === lastSavedStringRef.current) return;
        
        // Remove redundant effect churn (stringification loops):
        // If we've already queued this exact payload string, don't clear and reset the timer.
        if (currentString === lastQueuedStringRef.current) return;
        
        lastQueuedStringRef.current = currentString;

        // Debounce
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Only update status to saving if it's not already saving to avoid excessive re-renders
        if (draft.saveStatus !== 'saving') {
            useBillingStore.getState().setDraftSaveStatus(draft.id, 'saving');
        }

        timeoutRef.current = setTimeout(async () => {
            if (isSavingRef.current) {
                // Lock active: postpone this save.
                // Clear lastQueued so a re-render will queue it again
                lastQueuedStringRef.current = '';
                return;
            }
            
            isSavingRef.current = true;
            // Failsafe timeout to release the lock in case of catastrophic network hang
            const safetyTimeout = setTimeout(() => {
                isSavingRef.current = false;
            }, 15000);
            
            const { getHeaders, assertOk, API_URL } = await import('@/lib/apiClient');
            
            try {
                const isLocal = draft.id.startsWith('local-');
                
                if (!isLocal) {
                    // Draft exists on server (has a real UUID), do PUT
                    const response = await fetch(`${API_URL}/sales/drafts/${draft.id}/`, {
                        method: 'PUT',
                        headers: getHeaders(),
                        body: JSON.stringify(payload)
                    });
                    
                    if (response.status === 404) {
                        // Draft not found on server (maybe DB wiped or out of sync). Fallback to POST
                        const payloadWithoutId = { ...payload };
                        delete payloadWithoutId.id; // DO NOT SEND BOGUS UUID
                        
                        const postRes = await fetch(`${API_URL}/sales/drafts/`, {
                            method: 'POST',
                            headers: getHeaders(),
                            body: JSON.stringify(payloadWithoutId)
                        });
                        
                        if (!postRes.ok) {
                            const errorBody = await postRes.text();
                            throw new Error(`POST_FAILED: ${postRes.status} - ${errorBody}`);
                        }
                        
                        const responseData = await postRes.json();
                        
                        // Update last saved and queued refs with the newly assigned UUID 
                        // to prevent a redundant PUT request on the next render.
                        const updatedPayload = { ...payload, id: responseData.id };
                        const updatedString = JSON.stringify(updatedPayload);
                        lastSavedStringRef.current = updatedString;
                        lastQueuedStringRef.current = updatedString;
                        
                        useBillingStore.getState().replaceDraftId(draft.id, responseData.id);
                        useBillingStore.getState().setDraftSaveStatus(responseData.id, 'saved', new Date().toISOString());
                    } else if (!response.ok) {
                        throw new Error(`PUT_FAILED: ${response.status}`);
                    } else {
                        // Success
                        lastSavedStringRef.current = currentString;
                        lastQueuedStringRef.current = currentString;
                        useBillingStore.getState().setDraftSaveStatus(draft.id, 'saved', new Date().toISOString());
                    }
                } else {
                    // Draft is new to server (has a local- ID), do POST
                    const payloadWithoutId = { ...payload };
                    delete payloadWithoutId.id; // DO NOT SEND BOGUS UUID
                    
                    const postRes = await fetch(`${API_URL}/sales/drafts/`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify(payloadWithoutId)
                    });
                    
                    if (!postRes.ok) {
                        const errorBody = await postRes.text();
                        throw new Error(`POST_FAILED: ${postRes.status} - ${errorBody}`);
                    }
                    
                    // Success on POST
                    const responseData = await postRes.json();
                    
                    const updatedPayload = { ...payload, id: responseData.id };
                    const updatedString = JSON.stringify(updatedPayload);
                    lastSavedStringRef.current = updatedString;
                    lastQueuedStringRef.current = updatedString;
                    
                    useBillingStore.getState().replaceDraftId(draft.id, responseData.id);
                    useBillingStore.getState().setDraftSaveStatus(responseData.id, 'saved', new Date().toISOString());
                }
            } catch (err: any) {
                logger.error("AUTOSAVE_FAILED", err, {
                    draftId: draft.id,
                    outletId: payload.outlet,
                });
                useBillingStore.getState().setDraftSaveStatus(draft.id, 'error');
                // Block retry loop to avoid spamming the same failing payload
                lastSavedStringRef.current = currentString;
                lastQueuedStringRef.current = currentString;
            } finally {
                clearTimeout(safetyTimeout);
                isSavingRef.current = false;
            }
        }, AUTOSAVE_DELAY);

        // We omit `draft` from the dependency array because we only want to run this when
        // the stringified payload changes, but since we compute payload inside the effect, 
        // React hooks lint wants `draft`. We'll use a JSON.stringify on the relevant parts.
        // Or simply ignore the exhaustive-deps if we have to, but since we have `if (currentString === ...)` 
        // and we check `draft.saveStatus !== 'saving'`, the infinite loop is broken.
    }, [draft, activeDraftId, getDraftTotals]);

    // Clear timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);
}
