import { useState } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { useSaveBill } from '@/hooks/useSaveBill';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useCheckout() {
    const { drafts, activeDraftId, getDraftTotals } = useBillingStore();
    const { saveBill, isLoading } = useSaveBill();
    const { toast } = useToast();
    
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [reasonModalOpen, setReasonModalOpen] = useState(false);

    const draft = activeDraftId ? drafts[activeDraftId] : null;
    const totals = activeDraftId ? getDraftTotals(activeDraftId) : null;
    
    const paymentMethod = draft?.payment?.method || 'cash';
    const cashReceived = draft?.payment?.cashTendered ? String(draft.payment.cashTendered) : '';

    const hasScheduleH = activeDraftId ? useBillingStore.getState().hasScheduleHItems(activeDraftId) : false;
    const scheduleHData = draft?.scheduleHData;
    const isScheduleHValid = !hasScheduleH || Boolean(scheduleHData && scheduleHData.patientName && scheduleHData.doctorName);

    const tenderAmount = cashReceived === '' ? (totals?.grandTotal || 0) : Number(cashReceived);
    const balance = Math.max(0, tenderAmount - (totals?.grandTotal || 0));
    
    const isTenderInvalid = paymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < (totals?.grandTotal || 0);
    
    const hasCustomer = Boolean(draft?.customer && draft.customer.id !== 'mock');
    const isCreditInvalid = paymentMethod === 'credit' && !hasCustomer;

    const canCheckout = Boolean(
        draft &&
        draft.cart.length > 0 && 
        isScheduleHValid && 
        !isTenderInvalid && 
        !isLoading && 
        !isCreditInvalid
    );

    const executeCheckout = async () => {
        if (!totals || !draft) return;
        setCheckoutError(null);
        try {
            // Ensure final grandTotal is updated before saving
            useBillingStore.getState().setPayment({
                amount: totals.grandTotal,
                cashReturned: paymentMethod === 'cash' ? balance : 0,
            });
            await saveBill();
            toast({
                title: 'Success',
                description: 'Bill Saved Successfully!',
            });
        } catch (error: any) {
            logger.error('CHECKOUT_FAILED', error);
            const message = error?.message ?? error?.error?.message ?? error?.detail ?? 'Failed to save bill. Please try again.';
            setCheckoutError(message);
            // Instead of native alert, rely on the consumer rendering the checkoutError or using a toast.
            // Keeping toast here for strong feedback based on D2 pattern.
            toast({
                variant: 'destructive',
                title: 'Checkout Failed',
                description: message,
            });
        }
    };

    const handleCheckout = async () => {
        if (draft?.editingSaleId && draft?.revisionAction) {
            setReasonModalOpen(true);
        } else {
            executeCheckout();
        }
    };

    return {
        handleCheckout,
        executeCheckout,
        canCheckout,
        checkoutError,
        reasonModalOpen,
        setReasonModalOpen,
        isLoading,
        balance,
        isScheduleHValid,
        isTenderInvalid,
        isCreditInvalid
    };
}
