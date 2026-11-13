import { getPurchaseChecks } from '../purchaseChecks';
import { emptyItem } from '../purchaseEntry';

const good = { ...emptyItem(), productId: 'p1', productName: 'DOLO 650', batchNo: 'B1', expiryDate: '2027-12-01', pkg: 10, qty: 2, purchaseRate: 20, mrp: 32 };
const ok = { partyLedgerId: 'l1', invoiceNo: 'INV-1', items: [good] };

describe('getPurchaseChecks', () => {
    it('a complete purchase has no checks', () => expect(getPurchaseChecks(ok)).toEqual([]));

    it('an empty form: party, invoice number, then medicine, in that order, each with where to fix it', () => {
        const rows = getPurchaseChecks({ partyLedgerId: '', invoiceNo: '', items: [emptyItem()] });
        expect(rows.map((r) => r.id)).toEqual(['party', 'invoice', 'items']);
        expect(rows[0].fix).toEqual({ type: 'party' });
        expect(rows[1].fix).toEqual({ type: 'invoice' });
        expect(rows[2].fix).toEqual({ type: 'add' });
    });

    it('a blank row is not a medicine', () => {
        expect(getPurchaseChecks({ ...ok, items: [emptyItem()] }).map((r) => r.id)).toEqual(['items']);
        expect(getPurchaseChecks({ ...ok, items: [good, emptyItem()] })).toEqual([]);          // a spare blank row at the end is ignored
    });

    it('a spaces-only invoice number counts as missing', () => {
        expect(getPurchaseChecks({ ...ok, invoiceNo: '   ' }).map((r) => r.id)).toEqual(['invoice']);
    });

    it('a duplicate invoice number is its own message (and not also "enter the number")', () => {
        const rows = getPurchaseChecks({ ...ok, isDuplicate: true });
        expect(rows.map((r) => r.id)).toEqual(['duplicate']);
        expect(rows[0].reason).toMatch(/already entered/);
    });

    it('each unfinished line says its first missing thing and opens that line', () => {
        const rows = getPurchaseChecks({ ...ok, items: [good, { ...good, productName: 'LOSAR', batchNo: '' }, { ...good, productName: 'CALPOL', qty: 0 }] });
        expect(rows).toEqual([
            { id: 'line-1', reason: 'LOSAR: Batch number needed', fix: { type: 'line', index: 1 } },
            { id: 'line-2', reason: 'CALPOL: Quantity needed', fix: { type: 'line', index: 2 } },
        ]);
    });

    it('a line with no PKG says so (it is never taken as 1)', () => {
        const rows = getPurchaseChecks({ ...ok, items: [{ ...good, pkg: '' as unknown as number }] });
        expect(rows).toEqual([{ id: 'line-0', reason: 'DOLO 650: Pkg (units per pack) needed', fix: { type: 'line', index: 0 } }]);
    });

    it('a typed name that was never picked from the list must be picked', () => {
        const rows = getPurchaseChecks({ ...ok, items: [{ ...emptyItem(), productName: 'Dol' }] });
        expect(rows[0].reason).toBe('Dol: Pick the medicine from the list');
    });

    it('offline comes first and has nothing to jump to', () => {
        const rows = getPurchaseChecks({ ...ok, isOnline: false });
        expect(rows[0]).toEqual({ id: 'offline', reason: 'No internet: the purchase cannot be saved', fix: null });
    });
});
