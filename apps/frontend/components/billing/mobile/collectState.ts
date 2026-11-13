import { calculateLineMargin } from '@/lib/billingMarginUtils';
import type { DraftBill } from '@/types';

/** Where tapping a failing check should take the cashier. 'local' = a field on the payment screen itself. */
export type FixTarget = 'doctor' | 'customer' | 'cart' | 'local';

export interface CheckRow {
    id: 'offline' | 'cart' | 'scheduleH' | 'creditCustomer' | 'creditLimit' | 'loss' | 'split' | 'tender';
    /** One human line, the same text the bottom bar shows when this is the first failing check */
    reason: string;
    fix: FixTarget | null;
}

/** The slice of `useCheckout()` the collect rules need (so tests and the bar can pass a plain object). */
export interface CheckoutFlags {
    canCheckout: boolean;
    isLoading?: boolean;
    isScheduleHValid: boolean;
    isTenderInvalid: boolean;
    isCreditInvalid: boolean;
    isSplitInvalid: boolean;
    isSplitCreditInvalid: boolean;
    isLossSale: boolean;
    isGlobalLoss: boolean;
}

export interface CollectStateInput {
    draft: DraftBill | null | undefined;
    totals: { grandTotal: number } | null | undefined;
    checkout: CheckoutFlags;
    isOnline: boolean;
    /** Needed only to count the below-cost lines; the store holds it. */
    landingCostIncludeGst?: boolean;
}

export interface CollectState {
    label: string;
    disabledReason: string | null;
    needsPaymentStep: boolean;
}

/** 1234.5 -> "1,234.50" (Indian grouping: 12,34,567.00). Done by hand: Intl output differs between Node builds. */
export function formatINR(value: number): string {
    const n = Number.isFinite(value) ? value : 0;
    const [intPart, dec] = Math.abs(n).toFixed(2).split('.');
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    return `${n < 0 ? '-' : ''}${grouped}.${dec}`;
}

export function countLossLines(draft: DraftBill | null | undefined, landingCostIncludeGst = false): number {
    if (!draft) return 0;
    const pct = draft.extraDiscountPct || 0;
    const type = draft.saleType || 'RETAIL';
    return draft.cart.filter((item) => calculateLineMargin(item, pct, type, landingCostIncludeGst).isLossSale).length;
}

/** Wholesale credit limit rule, copied from the desktop rail (`isCreditBlocked`). */
export function isCreditLimitExceeded(draft: DraftBill | null | undefined, grandTotal: number): boolean {
    if (!draft || draft.saleType !== 'WHOLESALE' || !draft.customer) return false;
    return (draft.customer.outstanding || 0) + grandTotal > (draft.customer.creditLimit || 0);
}

/**
 * Every blocking problem with the bill, in priority order. The bottom bar shows the first one; the payment screen lists them all
 * (each tappable, jumping to the fix). Quotations take no payment, so payment-only checks are skipped for them.
 */
export function getCheckRows({ draft, totals, checkout, isOnline, landingCostIncludeGst = false }: CollectStateInput): CheckRow[] {
    const rows: CheckRow[] = [];
    const grandTotal = totals?.grandTotal || 0;
    const isQuotation = draft?.documentMode === 'quotation';
    const method = draft?.payment?.method || 'cash';

    if (!isOnline) rows.push({ id: 'offline', reason: 'No internet: bills cannot be saved', fix: null });
    if (!draft || draft.cart.length === 0) {
        rows.push({ id: 'cart', reason: 'Add items to the bill', fix: 'cart' });
        return rows;                                   // nothing else matters until there is something to sell
    }
    if (!checkout.isScheduleHValid) rows.push({ id: 'scheduleH', reason: 'Doctor and patient details needed (Schedule H)', fix: 'doctor' });
    if (!isQuotation && (checkout.isCreditInvalid || checkout.isSplitCreditInvalid)) {
        rows.push({ id: 'creditCustomer', reason: 'Customer needed for credit', fix: 'customer' });
    }
    if (!isQuotation && method === 'credit' && isCreditLimitExceeded(draft, grandTotal)) {
        rows.push({ id: 'creditLimit', reason: 'Credit limit exceeded for this customer', fix: 'customer' });
    }
    if (checkout.isLossSale || checkout.isGlobalLoss) {
        const n = countLossLines(draft, landingCostIncludeGst);
        rows.push({
            id: 'loss',
            reason: n > 0 ? `Below cost on ${n} ${n === 1 ? 'line' : 'lines'}: fix to continue` : 'Bill total is below cost: fix to continue',
            fix: 'cart',
        });
    }
    if (!isQuotation && checkout.isSplitInvalid) rows.push({ id: 'split', reason: 'Split amounts must add up to the total', fix: 'local' });
    if (!isQuotation && checkout.isTenderInvalid) rows.push({ id: 'tender', reason: 'Received amount is less than the total', fix: 'local' });
    return rows;
}

/** The bottom bar's main button: its label, why it is disabled (one line) and whether it opens the payment step. */
export function getCollectState(input: CollectStateInput): CollectState {
    const { draft, totals, checkout } = input;
    const isQuotation = draft?.documentMode === 'quotation';
    const isEdit = Boolean(draft?.editingSaleId);
    const isWholesale = draft?.saleType === 'WHOLESALE';

    let label: string;
    if (isEdit) label = 'Save changes';
    else if (isQuotation) label = 'Save quotation';
    else if (isWholesale) label = 'Save on credit';          // a wholesale bill is always on credit: no payment step
    else label = `Collect ₹${formatINR(totals?.grandTotal || 0)}`;   // retail: the payment mode is chosen in the sheet this opens

    let disabledReason: string | null = getCheckRows(input)[0]?.reason ?? null;
    // Anything useCheckout blocks that the rows above do not explain (it also covers "no draft"): never leave a dead button without a reason
    if (!disabledReason && !checkout.canCheckout && !checkout.isLoading) disabledReason = 'Check the bill before saving';

    // A retail sale asks how the customer pays, and so does a retail EDIT (the sheet then starts on the bill's current mode and has a
    // Save button, so the method can be changed). A quotation takes no payment and a wholesale bill is always credit: both save from the bar.
    return { label, disabledReason, needsPaymentStep: !isQuotation && !isWholesale };
}
