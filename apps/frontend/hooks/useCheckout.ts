import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBillingStore } from '@/store/billingStore';
import { useSaveBill } from '@/hooks/useSaveBill';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { calculateLineMargin, calculateTotalMargin } from '@/lib/billingMarginUtils';

export function useCheckout() {
    const router = useRouter();
    const { drafts, activeDraftId, getDraftTotals, landingCostIncludeGst } = useBillingStore();
    const { saveBill, isLoading } = useSaveBill();
    const { toast } = useToast();
    
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [reasonModalOpen, setReasonModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const draft = activeDraftId ? drafts[activeDraftId] : null;
    const totals = activeDraftId ? getDraftTotals(activeDraftId) : null;
    
    const paymentMethod = draft?.payment?.method || 'cash';
    const cashReceived = draft?.payment?.cashTendered ? String(draft.payment.cashTendered) : '';

    const hasScheduleH = activeDraftId ? useBillingStore.getState().hasScheduleHItems(activeDraftId) : false;
    const scheduleHData = draft?.scheduleHData;
    
    // In POS mode, the selected customer acts as the patient, and the selected doctor acts as the prescribing doctor.
    // Allow checkout if explicit scheduleHData is provided OR if both Customer and Doctor are selected in the UI.
    const hasCustomer = Boolean(draft?.customer && draft.customer.id !== 'mock');
    const hasDoctor = Boolean(draft?.doctor && draft.doctor.id !== 'mock');
    
    const isScheduleHValid = !hasScheduleH || 
        Boolean(
            scheduleHData && 
            scheduleHData.patientName?.trim() && 
            scheduleHData.patientAddress?.trim() && 
            scheduleHData.doctorName?.trim() && 
            scheduleHData.doctorRegNo?.trim()
        ) || 
        Boolean(
            hasCustomer && 
            draft?.customer?.address?.trim() && 
            hasDoctor && 
            draft?.doctor?.regNo?.trim()
        );

    const tenderAmount = cashReceived === '' ? (totals?.grandTotal || 0) : Number(cashReceived);
    const balance = Math.max(0, tenderAmount - (totals?.grandTotal || 0));
    
    const isTenderInvalid = paymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < (totals?.grandTotal || 0);
    
    const isCreditInvalid = paymentMethod === 'credit' && !hasCustomer;

    const splitBreakdown = draft?.payment?.splitBreakdown || { cash: 0, upi: 0, card: 0, credit: 0 };
    const splitTotal = Number((
        (Number(splitBreakdown.cash) || 0) +
        (Number(splitBreakdown.upi) || 0) +
        (Number(splitBreakdown.card) || 0) +
        (Number(splitBreakdown.credit) || 0)
    ).toFixed(2));
    const isSplitInvalid = paymentMethod === 'split' && Math.abs(splitTotal - (totals?.grandTotal || 0)) > 0.01;
    const isSplitCreditInvalid = paymentMethod === 'split' && (Number(splitBreakdown.credit) || 0) > 0 && !hasCustomer;

    // Loss-Sale Prevention: Check line-item margins and overall bill margin
    const extraDiscPct = draft?.extraDiscountPct || 0;
    const saleType = draft?.saleType || 'RETAIL';
    const marginData = draft ? calculateTotalMargin(draft.cart, totals?.grandTotal, totals?.extraDiscountAmount, extraDiscPct, saleType, landingCostIncludeGst) : null;
    const hasLossItem = draft ? draft.cart.some(item => calculateLineMargin(item, extraDiscPct, saleType, landingCostIncludeGst).isLossSale) : false;
    const isGlobalLoss = Boolean(marginData?.isGlobalLoss || hasLossItem);
    const isLossSale = Boolean(hasLossItem || marginData?.hasLossSale);

    const canCheckout = Boolean(
        draft &&
        draft.cart.length > 0 && 
        isScheduleHValid && 
        !isTenderInvalid && 
        !isSplitInvalid &&
        !isSplitCreditInvalid &&
        !isLoading && 
        !isCreditInvalid &&
        !isLossSale &&
        !isGlobalLoss &&
        !isSubmitting
    );

    const executeCheckout = async () => {
        if (!totals || !draft || isSubmitting) return;
        setCheckoutError(null);
        setIsSubmitting(true);

        const wasEditingId = draft?.editingSaleId;

        try {
            // Ensure final grandTotal is updated before saving
            useBillingStore.getState().setPayment({
                amount: totals.grandTotal,
                cashReturned: paymentMethod === 'cash' ? balance : 0,
            });
            await saveBill();

            toast({
                title: 'Success',
                description: wasEditingId ? 'Sale Bill Modified Successfully!' : 'Bill Saved Successfully!',
            });

            if (wasEditingId) {
                router.push(`/dashboard/sales?highlight=${wasEditingId}`);
            }
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
        } finally {
            setIsSubmitting(false);
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
        isCreditInvalid,
        splitTotal,
        isSplitInvalid,
        isSplitCreditInvalid,
        isLossSale,
        isGlobalLoss,
    };
}
