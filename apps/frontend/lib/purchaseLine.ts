/**
 * Rules for ONE purchase line that both layouts share (the desktop grid row and the phone line editor):
 * typing and finishing an expiry, the expiry warning, the PTR / PTS defaults from the MRP, and what is still missing on a line.
 */
import { differenceInDays } from 'date-fns';
import type { PurchaseItemFormData } from '@/types';
import { parsePkg } from '@/lib/purchasePack';

export type ExpiryStatus = 'expired' | 'near' | 'ok';

/** What the box shows: "2027-12-01" -> "12/2027"; anything typed by hand stays as typed ("12/20" is not "12/2020"). */
export const formatExpiryForDisplay = (exp?: string): string => {
    if (!exp) return '';
    const raw = exp.trim();
    const mIso = raw.match(/^(\d{4})-(\d{1,2})/);
    if (mIso) return `${mIso[2].padStart(2, '0')}/${mIso[1]}`;
    return raw;
};

/** While typing: keep digits only and put the slash after the month ("122027" -> "12/2027"). */
export const maskExpiryInput = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2, 6)}` : digits;
};

/** When leaving the box: "12/27" or "12/2027" becomes the stored "2027-12-01". Anything else is left as it is. */
export const finishExpiryInput = (value: string): string => {
    const raw = (value || '').trim();
    const short = raw.match(/^(\d{1,2})\/(\d{2})$/);
    const long = raw.match(/^(\d{1,2})\/(\d{4})$/);
    const make = (m: number, y: number) => (m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}-01` : value);
    if (short) return make(parseInt(short[1], 10), parseInt(short[2], 10) + 2000);
    if (long) return make(parseInt(long[1], 10), parseInt(long[2], 10));
    return value;
};

export const getExpiryStatus = (exp: string): ExpiryStatus => {
    if (!exp) return 'ok';
    // MM/YY and MM/YYYY first: `new Date("06/29")` would read it as 29 June of THIS year
    const text = exp.trim();
    const mShort = text.match(/^(\d{1,2})[/\-.](\d{2})$/);
    const mLong = text.match(/^(\d{1,2})[/\-.](\d{4})$/);
    let d: Date;
    if (mShort) d = new Date(2000 + parseInt(mShort[2], 10), parseInt(mShort[1], 10) - 1, 1);
    else if (mLong) d = new Date(parseInt(mLong[2], 10), parseInt(mLong[1], 10) - 1, 1);
    else d = new Date(exp);
    if (isNaN(d.getTime())) return 'ok';
    const diff = differenceInDays(d, new Date());
    if (diff < 0) return 'expired';
    if (diff < 90) return 'near';
    return 'ok';
};

/** Retail price to retailer, worked back from the MRP (20% retailer margin, GST taken out) */
export const calcPTR = (mrp: number, gstRate: number, retailMargin = 20) =>
    mrp ? parseFloat(((mrp - mrp * retailMargin / 100) / (1 + gstRate / 100)).toFixed(2)) : 0;

/** Price to stockist, 5% under the PTR */
export const calcPTS = (ptr: number, stockistMargin = 5) =>
    ptr ? parseFloat((ptr * (1 - stockistMargin / 100)).toFixed(2)) : 0;

/** A line the clerk has started (a product chosen or a name typed). Untouched blank rows are ignored everywhere. */
export const isStartedLine = (it: Pick<PurchaseItemFormData, 'productId' | 'productName'>): boolean =>
    !!((it.productId && it.productId.trim()) || (it.productName && it.productName.trim()));

export type LineIssue = 'product' | 'batch' | 'expiry' | 'pkg' | 'qty' | 'rate' | 'mrp';

const ISSUE_TEXT: Record<LineIssue, string> = {
    product: 'Pick the medicine from the list',
    batch: 'Batch number needed',
    expiry: 'Expiry needed (MM/YY)',
    pkg: 'Pkg (units per pack) needed',
    qty: 'Quantity needed',
    rate: 'Rate needed',
    mrp: 'MRP needed',
};
export const issueText = (i: LineIssue) => ISSUE_TEXT[i];

/** What is still missing on a started line (the same things the form's validation insists on), in the order of the desktop columns. */
export function lineIssues(it: PurchaseItemFormData): LineIssue[] {
    const out: LineIssue[] = [];
    if (!it.productId) out.push('product');
    if (!it.batchNo) out.push('batch');
    const exp = (it.expiryDate || '').trim();
    if (!exp || !/^\d{4}-\d{2}-\d{2}$/.test(finishExpiryInput(exp))) out.push('expiry');
    if (!parsePkg(it.pkg).ok) out.push('pkg');                 // blank, decimal or out of range: never silently 1
    if (!(Number(it.qty) > 0)) out.push('qty');
    if (!(Number(it.purchaseRate) > 0)) out.push('rate');
    if (!(Number(it.mrp) > 0)) out.push('mrp');
    return out;
}
