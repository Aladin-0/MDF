/**
 * What the purchase-invoice document shows beyond the raw fields: the GST summary by rate (split into CGST + SGST for a
 * same-state supplier, or one IGST for another state), the payments line, the pack and quantity wording. Pure functions
 * so the document component only lays things out.
 */
import type { PurchaseItem } from '@/types';

export type TaxMode = 'intra' | 'inter' | 'unknown';

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** Same state = CGST + SGST; a different state = IGST; if either state is unknown we do not guess a split. */
export function taxMode(supplierState?: string | null, outletState?: string | null): TaxMode {
    if (!norm(supplierState) || !norm(outletState)) return 'unknown';
    return norm(supplierState) === norm(outletState) ? 'intra' : 'inter';
}

export interface TaxRow { rate: number; taxable: number; gst: number; cgst: number; sgst: number; igst: number; cess: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One row per GST rate, in rate order. Amounts are the stored line amounts (taxable, gst, cess), never recomputed. */
export function taxSummary(items: Pick<PurchaseItem, 'gstRate' | 'taxableAmount' | 'gstAmount' | 'cessAmount'>[], mode: TaxMode): TaxRow[] {
    const byRate = new Map<number, TaxRow>();
    for (const it of items) {
        const rate = Number(it.gstRate) || 0;
        const row = byRate.get(rate) ?? { rate, taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
        row.taxable += Number(it.taxableAmount) || 0;
        row.gst += Number(it.gstAmount) || 0;
        row.cess += Number(it.cessAmount) || 0;
        byRate.set(rate, row);
    }
    return Array.from(byRate.values()).sort((a, b) => a.rate - b.rate).map((r) => {
        const half = r2(r.gst / 2);
        return {
            ...r, taxable: r2(r.taxable), gst: r2(r.gst), cess: r2(r.cess),
            cgst: mode === 'intra' ? half : 0, sgst: mode === 'intra' ? r2(r.gst - half) : 0, igst: mode === 'inter' ? r2(r.gst) : 0,
        };
    });
}

export const sumTax = (rows: TaxRow[]) => rows.reduce((t, r) => ({ taxable: r2(t.taxable + r.taxable), gst: r2(t.gst + r.gst), cgst: r2(t.cgst + r.cgst), sgst: r2(t.sgst + r.sgst), igst: r2(t.igst + r.igst), cess: r2(t.cess + r.cess) }),
    { taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });

/** "10" / "5 + 1 free", with the line's unit word: the quantity column. */
export function qtyText(item: Pick<PurchaseItem, 'qty' | 'freeQty' | 'packUnitLabel'>): { main: string; free: string } {
    const unit = (item.packUnitLabel || 'pack').toLowerCase();
    return { main: `${item.qty} ${unit}${item.qty === 1 || unit.endsWith('s') ? '' : 's'}`, free: item.freeQty > 0 ? `+ ${item.freeQty} free` : '' };
}

/** "1 × 10" for a pack of ten units, "—" when a pack is one unit. */
export const packText = (item: Pick<PurchaseItem, 'pkg'>) => (item.pkg > 1 ? `1 × ${item.pkg}` : '—');

/** "Expiry 06/29" like the sale invoice (MM/YY); the stored value is yyyy-MM-dd. */
export function expiryShort(value?: string | null): string {
    const m = /^(\d{4})-(\d{2})/.exec(value ?? '');
    return m ? `${m[2]}/${m[1].slice(2)}` : value || '—';
}

const MODE_WORDS: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', cheque: 'Cheque', credit: 'Credit' };
export const modeWord = (m?: string | null) => (m ? MODE_WORDS[m.toLowerCase()] ?? m : '');
