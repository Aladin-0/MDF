import { computePurchaseTotals, lineAmount, effectivePkg, isInterstateSupply, emptyItem, isNearExpiry, schema, todayStr, defaultDueStr } from '../purchaseEntry';
import type { PurchaseItemFormData } from '@/types';

const line = (o: Partial<PurchaseItemFormData> = {}): PurchaseItemFormData => ({ ...emptyItem(), productId: 'p', productName: 'X', pkg: 10, qty: 1, purchaseRate: 100, gstRate: 12, ...o });

/** The formulas exactly as they were written inline in NewPurchaseForm before they moved here. */
function reference(items: PurchaseItemFormData[], rawDiscount: number, rawFreight: number, isInterstate: boolean, ledgerAdjustment: number, sign: '-' | '+') {
    const goodsValue = items.reduce((s, it) => s + it.qty * it.purchaseRate, 0);
    const totalTradeDisc = items.reduce((s, it) => s + it.qty * it.purchaseRate * (it.discountPct / 100), 0);
    const totalCashDisc = items.reduce((s, it) => { const a = it.qty * it.purchaseRate * (1 - it.discountPct / 100); return s + a * (it.cashDiscountPct / 100); }, 0);
    const pre = goodsValue - totalTradeDisc - totalCashDisc;
    const invoiceDiscount = Number(rawDiscount) || 0;
    const pct = pre > 0 ? invoiceDiscount / pre : 0;
    const taxableValue = pre - invoiceDiscount;
    const totalGST = items.reduce((s, it) => { const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100); return s + base * (1 - pct) * (it.gstRate / 100); }, 0);
    const totalCess = items.reduce((s, it) => { const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100); return s + base * (1 - pct) * (it.cess / 100); }, 0);
    const freight = Number(rawFreight) || 0;
    const preRound = taxableValue + totalGST + totalCess + freight;
    const roundOff = Math.round(preRound) - preRound;
    const computedTotal = preRound + roundOff;
    const effectiveAdjustment = ledgerAdjustment * (sign === '-' ? 1 : -1);
    return { goodsValue, totalTradeDisc, totalCashDisc, taxableValue, totalGST, totalCess, sgst: !isInterstate ? totalGST / 2 : 0, cgst: !isInterstate ? totalGST / 2 : 0, igst: isInterstate ? totalGST : 0, freight, preRound, roundOff, computedTotal, effectiveAdjustment, netPayable: computedTotal - effectiveAdjustment };
}

describe('computePurchaseTotals', () => {
    it('hand-worked: 10 x Rs100, 12% GST, nothing else', () => {
        const t = computePurchaseTotals({ items: [line({ qty: 10 })], invoiceDiscount: 0, freight: 0, isInterstate: false, ledgerAdjustment: 0, adjustmentSign: '-' });
        expect(t.goodsValue).toBe(1000);
        expect(t.taxableValue).toBe(1000);
        expect(t.totalGST).toBe(120);
        expect(t.cgst).toBe(60); expect(t.sgst).toBe(60); expect(t.igst).toBe(0);
        expect(t.computedTotal).toBe(1120);
        expect(t.netPayable).toBe(1120);
        expect(t.totalUnits).toBe(100);
    });

    it('hand-worked: trade 10% + cash 5% discount, invoice discount, freight, round-off', () => {
        // 10 x 200 = 2000 ; trade 200 ; cash 90 ; taxable base 1710 ; invoice discount 110 -> taxable 1600 ; GST 5% of (1710 x (1 - 110/1710)) = 80
        const t = computePurchaseTotals({ items: [line({ qty: 10, purchaseRate: 200, discountPct: 10, cashDiscountPct: 5, gstRate: 5 })], invoiceDiscount: 110, freight: 25.4, isInterstate: false, ledgerAdjustment: 0, adjustmentSign: '-' });
        expect(t.totalTradeDisc).toBe(200);
        expect(t.totalCashDisc).toBeCloseTo(90, 10);
        expect(t.taxableValue).toBeCloseTo(1600, 10);
        expect(t.totalGST).toBeCloseTo(80, 10);
        expect(t.preRound).toBeCloseTo(1705.4, 10);
        expect(t.roundOff).toBeCloseTo(-0.4, 10);
        expect(t.computedTotal).toBeCloseTo(1705, 10);
    });

    it('interstate: all GST is IGST, none CGST/SGST', () => {
        const t = computePurchaseTotals({ items: [line({ qty: 10 })], invoiceDiscount: 0, freight: 0, isInterstate: true, ledgerAdjustment: 0, adjustmentSign: '-' });
        expect(t.igst).toBe(120); expect(t.cgst).toBe(0); expect(t.sgst).toBe(0);
    });

    it('ledger adjustment: "-" is deducted from what is payable, "+" is added', () => {
        const base = { items: [line({ qty: 10 })], invoiceDiscount: 0, freight: 0, isInterstate: false, ledgerAdjustment: 120 };
        expect(computePurchaseTotals({ ...base, adjustmentSign: '-' }).netPayable).toBe(1000);
        expect(computePurchaseTotals({ ...base, adjustmentSign: '-' }).effectiveAdjustment).toBe(120);
        expect(computePurchaseTotals({ ...base, adjustmentSign: '+' }).netPayable).toBe(1240);
        expect(computePurchaseTotals({ ...base, adjustmentSign: '+' }).effectiveAdjustment).toBe(-120);
    });

    it('an empty bill is all zeros (no NaN)', () => {
        const t = computePurchaseTotals({ items: [emptyItem()], invoiceDiscount: 0, freight: 0, isInterstate: false, ledgerAdjustment: 0, adjustmentSign: '-' });
        for (const [k, v] of Object.entries(t)) expect(Number.isNaN(v)).toBe(false);
        expect(t.netPayable).toBe(0);
    });

    it('junk in the discount / freight boxes counts as 0', () => {
        const t = computePurchaseTotals({ items: [line({ qty: 1 })], invoiceDiscount: 'abc' as any, freight: undefined as any, isInterstate: false, ledgerAdjustment: 0, adjustmentSign: '-' });
        expect(t.invoiceDiscount).toBe(0); expect(t.freight).toBe(0);
    });

    describe('gives exactly the numbers the old inline code gave', () => {
        const bills: Array<[string, PurchaseItemFormData[], number, number, boolean, number, '-' | '+']> = [
            ['one plain line', [line({ qty: 7, purchaseRate: 33.33 })], 0, 0, false, 0, '-'],
            ['mixed GST, trade + cash discount, cess', [line({ qty: 12, purchaseRate: 87.5, discountPct: 8, gstRate: 5 }), line({ qty: 3, purchaseRate: 512.4, cashDiscountPct: 2, gstRate: 12, cess: 1 }), line({ qty: 40, purchaseRate: 9.99, gstRate: 18, discountPct: 12.5, cashDiscountPct: 1.5 })], 0, 0, false, 0, '-'],
            ['invoice discount and freight', [line({ qty: 5, purchaseRate: 240 }), line({ qty: 9, purchaseRate: 61.2, gstRate: 5 })], 137.55, 45, false, 0, '-'],
            ['interstate with a ledger credit', [line({ qty: 20, purchaseRate: 115.75, gstRate: 12 })], 0, 0, true, 300, '-'],
            ['ledger charge added', [line({ qty: 2, purchaseRate: 999.99, gstRate: 28, cess: 12 })], 10, 12.5, false, 75.25, '+'],
        ];
        it.each(bills)('%s', (_n, items, disc, fr, inter, adj, sign) => {
            const got = computePurchaseTotals({ items, invoiceDiscount: disc, freight: fr, isInterstate: inter, ledgerAdjustment: adj, adjustmentSign: sign });
            const ref = reference(items, disc, fr, inter, adj, sign);
            for (const k of Object.keys(ref) as Array<keyof typeof ref>) expect(got[k]).toBe(ref[k]);
        });
    });
});

describe('lineAmount (the Amount column and the phone card)', () => {
    it('is qty x rate, less trade then cash discount, plus GST and cess', () => {
        // 10 x 100 = 1000 ; -10% = 900 ; -5% = 855 ; x 1.17 (12 GST + 5 cess) = 1000.35
        expect(lineAmount(line({ qty: 10, discountPct: 10, cashDiscountPct: 5, gstRate: 12, cess: 5 }))).toBeCloseTo(1000.35, 10);
    });
    it('is 0 for an empty line', () => expect(lineAmount(emptyItem())).toBe(0));
});

describe('small helpers', () => {
    it('effectivePkg is the whole number, or 0: a blank is never counted as a pack of 1', () => { expect(effectivePkg(15)).toBe(15); expect(effectivePkg('15')).toBe(15); expect(effectivePkg('')).toBe(0); expect(effectivePkg(0)).toBe(0); expect(effectivePkg(7.5)).toBe(0); expect(effectivePkg(5000)).toBe(0); });
    it('isInterstateSupply needs both states and ignores case/spaces', () => {
        expect(isInterstateSupply('Gujarat', 'Maharashtra')).toBe(true);
        expect(isInterstateSupply(' maharashtra ', 'Maharashtra')).toBe(false);
        expect(isInterstateSupply('', 'Maharashtra')).toBe(false);
        expect(isInterstateSupply('Gujarat', undefined)).toBe(false);
    });
    it('isNearExpiry: under 90 days away', () => {
        const d = (days: number) => { const x = new Date(); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
        expect(isNearExpiry(d(30))).toBe(true);
        expect(isNearExpiry(d(200))).toBe(false);
        expect(isNearExpiry('')).toBe(false);
    });
});

describe('error messages say what to do', () => {
    const issues = (data: any) => { const r = schema.safeParse(data); return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`); };
    const base = { partyLedgerId: 'l1', purchaseType: 'credit', invoiceNo: 'I1', invoiceDate: '2026-11-01', freight: 0, invoiceDiscount: 0 };

    it('the header', () => {
        const m = issues({ ...base, partyLedgerId: '', invoiceNo: '', items: [{ ...emptyItem(), productId: 'p', productName: 'X', batchNo: 'B', expiryDate: '2027-01-01', qty: 1, purchaseRate: 1, mrp: 1 }] });
        expect(m).toContain('partyLedgerId: Select the party (distributor)');
        expect(m).toContain('invoiceNo: Enter the invoice number');
    });
    it('a medicine with nothing filled in', () => {
        const m = issues({ ...base, items: [{ ...emptyItem(), productName: 'Dol' }] }).join(' | ');
        for (const t of ['Pick the medicine from the list', 'Enter the batch number', 'Enter the expiry (MM/YY)', 'Enter the quantity', 'Enter the purchase rate', 'Enter the MRP']) expect(m).toContain(t);
    });
    it('no medicine at all', () => expect(issues({ ...base, items: [] })).toContain('items: Add at least one medicine'));
    it('none of them is a bare "required" or "must be > 0"', () => {
        const m = issues({ ...base, partyLedgerId: '', invoiceNo: '', items: [{ ...emptyItem(), productName: 'Dol' }] }).join(' | ');
        expect(m).not.toMatch(/required|must be/i);
    });
});

describe('today and the default due date are asked for when used, not frozen at page load', () => {
    afterEach(() => jest.useRealTimers());
    it('follows the clock', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 10, 13, 10, 0, 0));
        expect(todayStr()).toBe('2026-11-13');
        expect(defaultDueStr()).toBe('2026-12-13');
        jest.setSystemTime(new Date(2026, 10, 14, 9, 0, 0));      // a tab left open overnight
        expect(todayStr()).toBe('2026-11-14');
        expect(defaultDueStr()).toBe('2026-12-14');
    });
});

