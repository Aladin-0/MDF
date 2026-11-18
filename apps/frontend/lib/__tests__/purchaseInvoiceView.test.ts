import { expiryShort, modeWord, packText, qtyText, sumTax, taxMode, taxSummary } from '../purchaseInvoiceView';

const item = (rate: number, taxable: number, gst: number, cess = 0) => ({ gstRate: rate, taxableAmount: taxable, gstAmount: gst, cessAmount: cess });

describe('taxMode', () => {
    it('same state is CGST + SGST, another state is IGST, and unknown is not guessed', () => {
        expect(taxMode('Maharashtra', ' maharashtra ')).toBe('intra');
        expect(taxMode('Gujarat', 'Maharashtra')).toBe('inter');
        expect(taxMode('', 'Maharashtra')).toBe('unknown');
        expect(taxMode('Gujarat', undefined)).toBe('unknown');
    });
});

describe('taxSummary', () => {
    const items = [item(12, 1000, 120), item(5, 400, 20), item(12, 500, 60)];

    it('groups by rate, in rate order, adding the stored amounts', () => {
        expect(taxSummary(items, 'unknown').map((r) => [r.rate, r.taxable, r.gst])).toEqual([[5, 400, 20], [12, 1500, 180]]);
    });
    it('splits a same-state tax into CGST and SGST that add back to the whole (an odd paisa is not lost)', () => {
        const [r] = taxSummary([item(18, 100, 18.01)], 'intra');
        expect(r.cgst + r.sgst).toBeCloseTo(18.01, 2);
        expect(r.igst).toBe(0);
    });
    it('shows one IGST for another state', () => {
        const [r] = taxSummary([item(12, 1000, 120)], 'inter');
        expect([r.cgst, r.sgst, r.igst]).toEqual([0, 0, 120]);
    });
    it('does not split when the states are unknown', () => {
        const [r] = taxSummary([item(12, 1000, 120)], 'unknown');
        expect([r.cgst, r.sgst, r.igst, r.gst]).toEqual([0, 0, 0, 120]);
    });
    it('totals add up, and cess is carried', () => {
        const rows = taxSummary([item(12, 1000, 120, 10), item(5, 400, 20)], 'intra');
        expect(sumTax(rows)).toEqual({ taxable: 1400, gst: 140, cgst: 70, sgst: 70, igst: 0, cess: 10 });
    });
    it('copes with no items and with missing numbers', () => {
        expect(taxSummary([], 'intra')).toEqual([]);
        expect(taxSummary([{ gstRate: 12 } as any], 'intra')[0].taxable).toBe(0);
    });
});

describe('wording', () => {
    it('quantity with its unit and the free quantity', () => {
        expect(qtyText({ qty: 50, freeQty: 0, packUnitLabel: 'strip' })).toEqual({ main: '50 strips', free: '' });
        expect(qtyText({ qty: 1, freeQty: 2, packUnitLabel: 'Box' })).toEqual({ main: '1 box', free: '+ 2 free' });
        expect(qtyText({ qty: 3, freeQty: 0 })).toEqual({ main: '3 packs', free: '' });
    });
    it('pack and expiry', () => {
        expect(packText({ pkg: 10 })).toBe('1 × 10');
        expect(packText({ pkg: 1 })).toBe('—');
        expect(expiryShort('2029-06-01')).toBe('06/29');
        expect(expiryShort('')).toBe('—');
        expect(expiryShort('soon')).toBe('soon');
    });
    it('payment modes in words', () => {
        expect(modeWord('upi')).toBe('UPI');
        expect(modeWord('bank')).toBe('Bank transfer');
        expect(modeWord('other')).toBe('other');
        expect(modeWord(undefined)).toBe('');
    });
});
