import { MAX_PKG, LARGE_PKG, parsePkg, sanitizePkgInput, pkgOrZero, pkgNote, packMismatches } from '../purchasePack';
import { schema, emptyItem, computePurchaseTotals } from '../purchaseEntry';
import { buildPurchasePayload } from '@/utils/payloadBuilders';

describe('parsePkg', () => {
    it.each([[1, 1], [15, 15], ['15', 15], [' 7 ', 7], [MAX_PKG, MAX_PKG]])('%p is a valid PKG', (raw, n) => expect(parsePkg(raw)).toEqual({ ok: true, value: n }));

    it.each([[null], [undefined], [''], ['   ']])('blank (%p) is "enter it", never 1', (raw) => expect(parsePkg(raw)).toEqual({ ok: false, message: 'Enter units per pack (Pkg)' }));
    it.each([[7.5], ['7.5'], ['abc'], ['1,5'], [NaN], [Infinity]])('%p is not a whole number', (raw) => expect(parsePkg(raw)).toEqual({ ok: false, message: 'Pkg must be a whole number' }));
    it.each([[0], [-5], [MAX_PKG + 1], [15000]])('%p is out of range', (raw) => expect(parsePkg(raw)).toEqual({ ok: false, message: `Pkg must be 1 to ${MAX_PKG}` }));

    it('has the same limit as the server (apps/inventory/pack_rules.py MAX_PURCHASE_PKG)', () => expect(MAX_PKG).toBe(1000));
});

describe('sanitizePkgInput (what may be typed)', () => {
    it.each([['15', '15'], ['15.5', '15'], ['1,5', '1'], ['-5', ''], ['abc', ''], ['  12 ', '12'], ['12 3', '12'], ['00015', '15'], ['123456', '1234'], ['', '']])('%p -> %p', (raw, out) => expect(sanitizePkgInput(raw)).toBe(out));
    it('15.5 is never read as 155 (the "." is not dropped and the 5 kept)', () => expect(sanitizePkgInput('15.5')).not.toBe('155'));
});

describe('pkgOrZero', () => {
    it('is the number, or 0, never 1', () => { expect(pkgOrZero(10)).toBe(10); expect(pkgOrZero('')).toBe(0); expect(pkgOrZero(undefined)).toBe(0); expect(pkgOrZero(2.5)).toBe(0); });
});

describe('pkgNote', () => {
    it('says when the PKG differs from a real catalogue size', () => expect(pkgNote({ pkg: 15, catalogPkg: 10 })).toEqual({ kind: 'differs', text: 'Catalogue: 10' }));
    it('says nothing when it is the catalogue size', () => expect(pkgNote({ pkg: 10, catalogPkg: 10 })).toBeNull());
    it('says nothing when the catalogue has no pack size (1 usually means never filled in: the normal case is the clerk entering the real one)', () => expect(pkgNote({ pkg: 15, catalogPkg: 1 })).toBeNull());
    it('says nothing when the catalogue size is not known', () => expect(pkgNote({ pkg: 15 })).toBeNull());
    it('warns about an unusually large pack', () => expect(pkgNote({ pkg: LARGE_PKG + 1 })).toEqual({ kind: 'large', text: 'Very large pack: check' }));
    it('says nothing about a PKG that is not valid (the error says it)', () => expect(pkgNote({ pkg: '', catalogPkg: 10 })).toBeNull());
});

describe('packMismatches (what the "check the pack sizes" question lists)', () => {
    const line = (o: any = {}) => ({ productId: 'p', productName: 'DOLO', pkg: 15, catalogPkg: 10, qty: 10, freeQty: 2, ...o });
    it('lists a line whose PKG contradicts the catalogue, with the units it would add', () => {
        expect(packMismatches([line()])).toEqual([{ index: 0, name: 'DOLO', pkg: 15, catalogPkg: 10, packs: 12, units: 180 }]);
    });
    it('does not list lines that agree, have no catalogue size, or have a catalogue size of 1', () => {
        expect(packMismatches([line({ pkg: 10 }), line({ catalogPkg: undefined }), line({ catalogPkg: 1 })])).toEqual([]);
    });
    it('does not list a line whose PKG is not valid (that is an error, not a question)', () => expect(packMismatches([line({ pkg: '' })])).toEqual([]));
    it('keeps each line\'s position, so "go back" can open the right one', () => {
        expect(packMismatches([line({ pkg: 10 }), line({ productName: 'LOSAR', pkg: 12, catalogPkg: 10 })]).map((m) => [m.index, m.name])).toEqual([[1, 'LOSAR']]);
    });
    it('can leave out lines that are unchanged (editing a saved purchase)', () => {
        expect(packMismatches([line(), line({ productName: 'B' })], (_it, i) => i === 0).map((m) => m.name)).toEqual(['B']);
    });
});

describe('the schema and the payload never turn a blank PKG into 1', () => {
    const base = { partyLedgerId: 'l', purchaseType: 'credit', invoiceNo: 'I', invoiceDate: '2026-11-01', freight: 0, invoiceDiscount: 0 };
    const item = (pkg: any) => ({ ...emptyItem(), productId: 'p', productName: 'X', batchNo: 'B', expiryDate: '2027-12-01', qty: 1, purchaseRate: 1, mrp: 1, pkg });
    const problems = (pkg: any) => { const r = schema.safeParse({ ...base, items: [item(pkg)] }); return r.success ? [] : r.error.issues.filter((i) => i.path.join('.') === 'items.0.pkg').map((i) => i.message); };

    it.each([[''], [null], [undefined]])('a blank PKG (%p) is "enter it"', (v) => expect(problems(v)).toEqual(['Enter units per pack (Pkg)']));
    it.each([[0], [-3], [1001]])('%p is out of range', (v) => expect(problems(v)).toEqual(['Pkg must be 1 to 1000']));
    it.each([[7.5], ['7.5']])('%p is not whole', (v) => expect(problems(v)).toEqual(['Pkg must be a whole number']));
    it.each([[1], [15], ['15'], [1000]])('%p is fine', (v) => expect(problems(v)).toEqual([]));
    it('a valid PKG comes out as a number', () => { const r = schema.safeParse({ ...base, items: [item('15')] }); expect(r.success && r.data.items[0].pkg).toBe(15); });

    it('the payload carries the PKG as given and the units worked from it; an invalid one is sent as 0, which the server refuses', () => {
        const t = computePurchaseTotals({ items: [], invoiceDiscount: 0, freight: 0, isInterstate: false, ledgerAdjustment: 0, adjustmentSign: '-' });
        const build = (pkg: any) => buildPurchasePayload({ ...base }, [{ ...item(pkg), qty: 10, freeQty: 2, purchaseRate: 20, gstRate: 5 }], 'o1', 0, 0, 0, 0, 0, 0, 0, 0, '', 0).items[0];
        const good = build(15);
        expect(good.pkg).toBe(15);
        expect(good.actualQty).toBe(180);
        const blank = build('');
        expect(blank.pkg).toBe(0);                                  // not 1
        expect(blank.actualQty).toBe(0);
        void t;
    });
});
