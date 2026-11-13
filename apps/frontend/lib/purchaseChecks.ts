import type { PurchaseItemFormData } from '@/types';
import { isStartedLine, lineIssues, issueText } from '@/lib/purchaseLine';

/** Where a tap on a failing check should go. `index` is the position in `items`. */
export type CheckFix = { type: 'party' } | { type: 'invoice' } | { type: 'add' } | { type: 'line'; index: number } | null;

export interface PurchaseCheck {
    id: string;
    /** One plain line; the bottom bar shows the first one */
    reason: string;
    fix: CheckFix;
}

export interface PurchaseCheckInput {
    partyLedgerId?: string | null;
    invoiceNo?: string | null;
    /** The server already has an invoice with this number from this party */
    isDuplicate?: boolean;
    items: PurchaseItemFormData[];
    isOnline?: boolean;
}

/**
 * Everything that stops a purchase from being saved, in the order a clerk fixes it. The phone's Save button is off while this is not empty
 * and shows the first reason; tapping it jumps to the fix. It mirrors the form's own validation (`schema` in lib/purchaseEntry), so nothing
 * passes here that the form would then refuse.
 */
export function getPurchaseChecks({ partyLedgerId, invoiceNo, isDuplicate, items, isOnline = true }: PurchaseCheckInput): PurchaseCheck[] {
    const rows: PurchaseCheck[] = [];
    if (!isOnline) rows.push({ id: 'offline', reason: 'No internet: the purchase cannot be saved', fix: null });
    if (!partyLedgerId) rows.push({ id: 'party', reason: 'Select the party (distributor)', fix: { type: 'party' } });
    if (!invoiceNo || !invoiceNo.trim()) rows.push({ id: 'invoice', reason: 'Enter the invoice number', fix: { type: 'invoice' } });
    else if (isDuplicate) rows.push({ id: 'duplicate', reason: 'This invoice number is already entered for this party', fix: { type: 'invoice' } });

    const started = items.map((it, index) => ({ it, index })).filter(({ it }) => isStartedLine(it));
    if (started.length === 0) {
        rows.push({ id: 'items', reason: 'Add at least one medicine', fix: { type: 'add' } });
        return rows;
    }
    started.forEach(({ it, index }, n) => {
        const issues = lineIssues(it);
        if (issues.length === 0) return;
        const name = it.productName?.trim() || `Medicine ${n + 1}`;
        rows.push({ id: `line-${index}`, reason: `${name}: ${issueText(issues[0])}`, fix: { type: 'line', index } });
    });
    return rows;
}
