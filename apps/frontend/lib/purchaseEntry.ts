/**
 * Purchase entry: the pieces both layouts of the New Purchase screen (desktop grid, phone) share.
 * The form schema, the empty line, the small helpers and `computePurchaseTotals` (every number in the totals bar and the payload).
 * Nothing here knows about React or the DOM.
 */
import { z } from 'zod';
import { format, addDays, differenceInDays } from 'date-fns';
import type { PurchaseItemFormData } from '@/types';
import { normalizeExpiryDate } from '@/utils/payloadBuilders';
import { parsePkg, pkgOrZero } from '@/lib/purchasePack';

export const normalizeExpiry = normalizeExpiryDate;

// ─── Schema ───────────────────────────────────────────────────────────────────

const safeNumber = (minVal = 0, defaultVal = 0) =>
    z.preprocess(
        (val) => (val === '' || val === null || val === undefined || Number.isNaN(Number(val)) ? defaultVal : Number(val)),
        z.number().min(minVal)
    );

const safePositiveNumber = (errMsg: string) =>
    z.preprocess(
        (val) => (val === '' || val === null || val === undefined || Number.isNaN(Number(val)) ? 0 : Number(val)),
        z.number().positive(errMsg)
    );

export // PKG: a whole number 1..MAX_PKG, never guessed (the rule and its messages live in lib/purchasePack.ts). It used to be `safeNumber(1, 1)`,
// which turned a blank box into 1: 10 strips of 15 were saved as 10 tablets.
const pkgField = z.any()
    .superRefine((v, ctx) => {
        const r = parsePkg(v);
        if (!r.ok) ctx.addIssue({ code: 'custom', message: r.message });
    })
    .transform((v) => Number(v));

const itemSchema = z.object({
    productId: z.string().min(1, 'Pick the medicine from the list'),
    isCustom: z.boolean().default(false),
    productName: z.string().min(1, 'Pick the medicine from the list'),
    hsnCode: z.string().optional().default(''),
    batchNo: z.string().min(1, 'Enter the batch number'),
    expiryDate: z.string().min(1, 'Enter the expiry (MM/YY)').refine((val) => {
        const norm = normalizeExpiry(val);
        return /^\d{4}-\d{2}-\d{2}$/.test(norm);
    }, 'Enter the expiry as MM/YY or MM/YYYY'),
    pkg: pkgField,
    qty: safePositiveNumber('Enter the quantity'),
    freeQty: safeNumber(0, 0),
    purchaseRate: safePositiveNumber('Enter the purchase rate'),
    discountPct: safeNumber(0, 0),
    cashDiscountPct: safeNumber(0, 0),
    gstRate: safeNumber(0, 0),
    cess: safeNumber(0, 0),
    mrp: safePositiveNumber('Enter the MRP'),
    ptr: safeNumber(0, 0),
    pts: safeNumber(0, 0),
    saleRate: safeNumber(0, 0),
});

export const schema = z.object({
    partyLedgerId: z.string().min(1, 'Select the party (distributor)'),
    purchaseType: z.enum(['credit', 'cash']),
    invoiceNo: z.string().min(1, 'Enter the invoice number'),
    invoiceDate: z.string(),
    dueDate: z.string().optional(),
    purchaseOrderRef: z.string().optional(),
    godown: z.string().optional(),
    freight: safeNumber(0, 0),
    invoiceDiscount: safeNumber(0, 0),
    notes: z.string().optional(),
    items: z.array(itemSchema).min(1, 'Add at least one medicine'),
});

export type FormData = z.infer<typeof schema>;

// ─── Constants ────────────────────────────────────────────────────────────────

export const GODOWNS = [
    { value: 'main', label: 'Main Store' },
    { value: 'cold_storage', label: 'Cold Storage' },
    { value: 'secondary', label: 'Secondary Store' },
];
/** Today's date, asked for when the form opens (a constant would be frozen at page load: a tab left open overnight would default to yesterday) */
export const todayStr = () => format(new Date(), 'yyyy-MM-dd');
/** A credit due date 30 days from today (the default credit period) */
export const defaultDueStr = () => format(addDays(new Date(), 30), 'yyyy-MM-dd');

export const emptyItem = (): PurchaseItemFormData => ({
    productId: '', productName: '', isCustom: false, hsnCode: '',
    batchNo: '', expiryDate: '',
    pkg: '' as unknown as number, packUnitLabel: '', qty: 0, freeQty: 0,
    purchaseRate: 0, freightPerUnit: 0, otherCostPerUnit: 0, discountPct: 0, cashDiscountPct: 0,
    gstRate: 12, cess: 0,
    mrp: 0, ptr: 0, pts: 0, saleRate: 0,
});

// ─── Helper ───────────────────────────────────────────────────────────────────

export const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ocrNumber = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

export const isNearExpiry = (exp: string) => {
    const norm = normalizeExpiry(exp);
    return norm ? differenceInDays(new Date(norm), new Date()) < 90 : false;
};


/** Why an already-saved purchase is being changed (sent with the update; the server keeps it in the audit log) */
export const REVISION_REASONS = [
    { value: 'ENTRY_MISTAKE', label: 'Entry Mistake' },
    { value: 'RATE_CORRECTION', label: 'Rate Correction' },
    { value: 'QTY_CORRECTION', label: 'Quantity Correction' },
    { value: 'DATE_CORRECTION', label: 'Date Correction' },
    { value: 'SUPPLIER_REQUEST', label: 'Supplier Request' },
    { value: 'DUPLICATE_ENTRY_FIX', label: 'Duplicate Entry Fix' },
    { value: 'TAX_CORRECTION', label: 'Tax Correction' },
    { value: 'PAYMENT_ADJUSTMENT', label: 'Payment Adjustment' },
    { value: 'OTHER', label: 'Other' },
] as const;

/** The explanation must be at least this long (the form and the server both insist) */
export const REVISION_TEXT_MIN = 10;

// ─── Totals ───────────────────────────────────────────────────────────────────

export interface PurchaseTotalsInput {
    items: PurchaseItemFormData[];
    invoiceDiscount: number;
    freight: number;
    /** Party state differs from the outlet's: IGST instead of CGST + SGST */
    isInterstate: boolean;
    /** Always positive; `adjustmentSign` says whether it is taken off ('-') or added ('+') */
    ledgerAdjustment: number;
    adjustmentSign: '-' | '+';
}

export interface PurchaseTotals {
    goodsValue: number;
    totalTradeDisc: number;
    totalCashDisc: number;
    invoiceDiscount: number;
    invoiceDiscountPct: number;
    taxableValue: number;
    totalGST: number;
    totalCess: number;
    sgst: number;
    cgst: number;
    igst: number;
    freight: number;
    preRound: number;
    roundOff: number;
    computedTotal: number;
    /** + sign adds to the bill (negative for the backend), - sign deducts (positive for the backend) */
    effectiveAdjustment: number;
    netPayable: number;
    /** Strips x pack size, summed (loose units) */
    totalUnits: number;
}

/** The PKG as a number for unit sums: a valid whole number, else 0. Never 1: a blank PKG must not look like a pack of 1. */
export const effectivePkg = (val: unknown): number => pkgOrZero(val);

/** One line's amount: quantity x rate, less trade then cash discount, plus GST and cess. The Amount column and the phone card show this. */
export const lineAmount = (v: PurchaseItemFormData): number => {
    const afterTradeDisc = v.qty * v.purchaseRate * (1 - v.discountPct / 100);
    const afterCashDisc = afterTradeDisc * (1 - v.cashDiscountPct / 100);
    return afterCashDisc * (1 + v.gstRate / 100 + v.cess / 100);
};

export function computePurchaseTotals({ items, invoiceDiscount: rawDiscount, freight: rawFreight, isInterstate, ledgerAdjustment, adjustmentSign }: PurchaseTotalsInput): PurchaseTotals {
    const goodsValue = items.reduce((s, it) => s + it.qty * it.purchaseRate, 0);
    const totalTradeDisc = items.reduce((s, it) => s + it.qty * it.purchaseRate * (it.discountPct / 100), 0);
    const totalCashDisc = items.reduce((s, it) => {
        const afterTrade = it.qty * it.purchaseRate * (1 - it.discountPct / 100);
        return s + afterTrade * (it.cashDiscountPct / 100);
    }, 0);

    const preInvoiceDiscountBase = goodsValue - totalTradeDisc - totalCashDisc;
    const invoiceDiscount = Number(rawDiscount) || 0;
    const invoiceDiscountPct = preInvoiceDiscountBase > 0 ? (invoiceDiscount / preInvoiceDiscountBase) : 0;

    const taxableValue = preInvoiceDiscountBase - invoiceDiscount;

    const lineBase = (it: PurchaseItemFormData) =>
        it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100) * (1 - invoiceDiscountPct);
    const totalGST = items.reduce((s, it) => s + lineBase(it) * (it.gstRate / 100), 0);
    const totalCess = items.reduce((s, it) => s + lineBase(it) * (it.cess / 100), 0);

    const sgst = !isInterstate ? totalGST / 2 : 0;
    const cgst = !isInterstate ? totalGST / 2 : 0;
    const igst = isInterstate ? totalGST : 0;
    const freight = Number(rawFreight) || 0;
    const preRound = taxableValue + totalGST + totalCess + freight;
    const roundOff = Math.round(preRound) - preRound;
    const computedTotal = preRound + roundOff;

    const effectiveAdjustment = ledgerAdjustment * (adjustmentSign === '-' ? 1 : -1);
    const netPayable = computedTotal - effectiveAdjustment;

    const totalUnits = items.reduce((s, it) => s + it.qty * effectivePkg(it.pkg), 0);

    return {
        goodsValue, totalTradeDisc, totalCashDisc, invoiceDiscount, invoiceDiscountPct, taxableValue, totalGST, totalCess,
        sgst, cgst, igst, freight, preRound, roundOff, computedTotal, effectiveAdjustment, netPayable, totalUnits,
    };
}

/** Does the party's state differ from the outlet's? (Both must be known.) */
export const isInterstateSupply = (partyState?: string | null, outletState?: string | null): boolean =>
    !!(partyState && outletState && partyState.trim().toLowerCase() !== outletState.trim().toLowerCase());
