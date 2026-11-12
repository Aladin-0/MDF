/**
 * Editing a batch: the form's shape, the checks that mirror the server's, the "what will change"
 * list and the patch to send. Pure functions (no React) so they are easy to test.
 *
 * The server is still the authority (apps/inventory/views.py BatchDetailUpdateView); these checks
 * only save a round trip and say what is wrong next to the field.
 */
import { formatDay } from '@/lib/dates';
import { formatCurrency } from '@/lib/gst';

export interface BatchFormValues {
    batchNo: string;
    rackLocation: string;
    mfgDate: string;
    expiryDate: string;
    mrp: string;
    purchaseRate: string;
    landingRate: string;
    packSize: string;
    packType: string;
    packUnit: string;
}

export type BatchFormField = keyof BatchFormValues;

export interface EditableBatch {
    batchNo: string;
    rackLocation?: string | null;
    mfgDate?: string | null;
    expiryDate: string;
    mrp: number | string;
    purchaseRate: number | string;
    landingRate?: number | string | null;
    packSize?: number | null;
    packType?: string | null;
    packUnit?: string | null;
}

export const FIELD_LABELS: Record<BatchFormField, string> = {
    batchNo: 'Batch no',
    rackLocation: 'Rack',
    mfgDate: 'Mfg date',
    expiryDate: 'Expiry',
    mrp: 'MRP',
    purchaseRate: 'Purchase rate',
    landingRate: 'Landing rate',
    packSize: 'Pack size',
    packType: 'Pack type',
    packUnit: 'Pack unit',
};

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const day = (v: unknown) => text(v).slice(0, 10);
const price = (v: unknown) => (text(v) === '' ? '' : String(Number(v)));

export function toForm(b: EditableBatch): BatchFormValues {
    return {
        batchNo: text(b.batchNo),
        rackLocation: text(b.rackLocation),
        mfgDate: day(b.mfgDate),
        expiryDate: day(b.expiryDate),
        mrp: price(b.mrp),
        purchaseRate: price(b.purchaseRate),
        landingRate: price(b.landingRate),
        packSize: text(b.packSize ?? 1),
        packType: text(b.packType),
        packUnit: text(b.packUnit),
    };
}

const isMoney = (v: string) => v.trim() !== '' && !Number.isNaN(Number(v));

/** Everything wrong with the form, as { field: message } (empty = fine). Mirrors the server's rules. */
export function validateBatchForm(f: BatchFormValues, opts: { showRates?: boolean } = {}): Partial<Record<BatchFormField, string>> {
    const e: Partial<Record<BatchFormField, string>> = {};
    if (!f.batchNo.trim()) e.batchNo = 'Batch number is required';

    if (!f.expiryDate) e.expiryDate = 'Expiry date is required';
    if (f.mfgDate && f.expiryDate && f.mfgDate > f.expiryDate) e.mfgDate = 'Must be before the expiry date';

    if (!isMoney(f.mrp)) e.mrp = 'Enter the MRP';
    else if (Number(f.mrp) <= 0) e.mrp = 'MRP must be greater than 0';
    else if (Number(f.mrp) > 99999999.99) e.mrp = 'That is too large';

    if (opts.showRates !== false) {
        if (!isMoney(f.purchaseRate)) e.purchaseRate = 'Enter the purchase rate';
        else if (Number(f.purchaseRate) < 0) e.purchaseRate = 'Cannot be negative';
        if (f.landingRate.trim() !== '' && (!isMoney(f.landingRate) || Number(f.landingRate) < 0)) e.landingRate = 'Enter a price, or leave it empty';
    }

    const size = Number(f.packSize);
    if (!Number.isInteger(size) || size < 1) e.packSize = 'Whole number, at least 1';
    if (!f.packUnit.trim()) e.packUnit = 'Pack unit is required';
    return e;
}

export interface Change { field: BatchFormField; label: string; from: string; to: string }

const MONEY_FIELDS: BatchFormField[] = ['mrp', 'purchaseRate', 'landingRate'];
const DATE_FIELDS: BatchFormField[] = ['mfgDate', 'expiryDate'];

function show(field: BatchFormField, value: string): string {
    if (value === '') return 'none';
    if (MONEY_FIELDS.includes(field)) return formatCurrency(Number(value));
    if (DATE_FIELDS.includes(field)) return formatDay(value);
    return value;
}

/** The fields whose value is different now, as readable old -> new pairs. */
export function diffBatchForm(initial: BatchFormValues, now: BatchFormValues): Change[] {
    return (Object.keys(FIELD_LABELS) as BatchFormField[])
        .filter((field) => now[field].trim() !== initial[field].trim() && !(MONEY_FIELDS.includes(field) && price(now[field]) === price(initial[field])))
        .map((field) => ({ field, label: FIELD_LABELS[field], from: show(field, initial[field]), to: show(field, now[field].trim()) }));
}

const PACK_FIELDS: BatchFormField[] = ['packSize', 'packType', 'packUnit'];
export const touchesPack = (changes: Change[]) => changes.some((c) => PACK_FIELDS.includes(c.field));

function value(field: BatchFormField, raw: string): string | number | null {
    const v = raw.trim();
    if (field === 'mrp' || field === 'purchaseRate') return Number(v);
    if (field === 'landingRate') return v === '' ? null : Number(v);
    if (field === 'packSize') return Number(v);
    if (field === 'mfgDate') return v === '' ? null : v;
    return v;
}

/** The request body: ONLY the changed fields (the server writes only those, so nothing else can be overwritten). */
export function buildBatchPatch(initial: BatchFormValues, now: BatchFormValues): Record<string, string | number | null> {
    const patch: Record<string, string | number | null> = {};
    for (const c of diffBatchForm(initial, now)) patch[c.field] = value(c.field, now[c.field]);
    return patch;
}

/** The patch that puts the previous values back (the "Undo" on the saved message). */
export function buildUndoPatch(initial: BatchFormValues, now: BatchFormValues): Record<string, string | number | null> {
    const patch: Record<string, string | number | null> = {};
    for (const c of diffBatchForm(initial, now)) patch[c.field] = value(c.field, initial[c.field]);
    return patch;
}

/** Map the server's { errors: { expiryDate: '...' } } onto form fields. */
export function serverErrors(err: unknown): Partial<Record<BatchFormField, string>> {
    const raw = (err as any)?.errors;
    if (!raw || typeof raw !== 'object') return {};
    const out: Partial<Record<BatchFormField, string>> = {};
    for (const [k, v] of Object.entries(raw)) if (k in FIELD_LABELS) out[k as BatchFormField] = Array.isArray(v) ? String(v[0]) : String(v);
    return out;
}
