import { toForm } from '@/lib/batchEdit';
import { changedRows, duplicateBatchNos, gridErrors, packSizesDiffer, parsePastedColumn, sellsBelowCost, touchesPackSize, type GridBatch } from '@/lib/batchGrid';

const batch = (id: string, over: Partial<GridBatch> = {}): GridBatch => ({
    id, batchNo: id.toUpperCase(), expiryDate: '2029-06-01', mrp: 100, purchaseRate: 50, landingRate: 50, packSize: 10, packType: 'strip', packUnit: 'tablet', rackLocation: '', mfgDate: null, ...over,
});
const B = [batch('b1'), batch('b2', { mrp: 120 }), batch('b3', { packSize: 15 })];

describe('changedRows', () => {
    it('lists only the batches that really changed, with only the changed fields', () => {
        const drafts = { b1: { ...toForm(B[0]), mrp: '110' }, b2: { ...toForm(B[1]), packSize: '12', rackLocation: 'A1' } };
        const rows = changedRows(B, drafts);
        expect(rows.map((r) => r.id)).toEqual(['b1', 'b2']);
        expect(rows[0].patch).toEqual({ mrp: 110 });
        expect(rows[1].patch).toEqual({ packSize: 12, rackLocation: 'A1' });
        expect(rows[1].undo).toEqual({ packSize: 10, rackLocation: '' });
        expect(rows[0].changes[0]).toMatchObject({ label: 'MRP' });
    });

    it('a cell edited and put back is not a change; a batch with no draft is left alone', () => {
        expect(changedRows(B, { b1: { ...toForm(B[0]), mrp: '100.00' } })).toEqual([]);   // same price, written differently
        expect(changedRows(B, {})).toEqual([]);
    });

    it('knows when a pack size is among the changes (it needs a confirmation)', () => {
        expect(touchesPackSize(changedRows(B, { b1: { ...toForm(B[0]), packSize: '20' } }))).toBe(true);
        expect(touchesPackSize(changedRows(B, { b1: { ...toForm(B[0]), mrp: '1' } }))).toBe(false);
    });
});

describe('gridErrors', () => {
    const ok = toForm(B[0]);
    it('passes a good row', () => expect(gridErrors(ok, { showRates: true })).toEqual({}));

    it('says which cell is wrong', () => {
        expect(gridErrors({ ...ok, mrp: '0' }).mrp).toBeTruthy();
        expect(gridErrors({ ...ok, mrp: 'abc' }).mrp).toBeTruthy();
        expect(gridErrors({ ...ok, packSize: '2.5' }).packSize).toBeTruthy();
        expect(gridErrors({ ...ok, packSize: '0' }).packSize).toBeTruthy();
        expect(gridErrors({ ...ok, batchNo: '  ' }).batchNo).toBeTruthy();
        expect(gridErrors({ ...ok, expiryDate: '' }).expiryDate).toBeTruthy();
        expect(gridErrors({ ...ok, purchaseRate: '-1' }, { showRates: true }).purchaseRate).toBeTruthy();
    });

    it('does not ask people without purchase-rate access for rates', () => {
        expect(gridErrors({ ...ok, purchaseRate: '' }, { showRates: false })).toEqual({});
    });

    it('is not blocked by fields the grid has no column for (a batch with no pack unit)', () => {
        expect(gridErrors({ ...ok, packUnit: '' })).toEqual({});
    });

    it('blames the expiry cell when the expiry is before the mfg date', () => {
        expect(gridErrors({ ...ok, mfgDate: '2030-01-01', expiryDate: '2029-06-01' }).expiryDate).toMatch(/mfg/);
    });
});

describe('duplicateBatchNos', () => {
    it('flags every row that shares a batch number, ignoring case and spaces', () => {
        const forms = { b1: toForm(B[0]), b2: { ...toForm(B[1]), batchNo: ' b1 ' }, b3: toForm(B[2]) };
        expect(Array.from(duplicateBatchNos(forms)).sort()).toEqual(['b1', 'b2']);
    });
    it('is empty when all are different, and ignores blanks', () => {
        expect(duplicateBatchNos({ b1: toForm(B[0]), b2: toForm(B[1]) }).size).toBe(0);
        expect(duplicateBatchNos({ a: { ...toForm(B[0]), batchNo: '' }, b: { ...toForm(B[1]), batchNo: '' } }).size).toBe(0);
    });
});

describe('packSizesDiffer', () => {
    it('is true when batches of one product disagree about the pack size', () => {
        expect(packSizesDiffer(B)).toBe(true);
        expect(packSizesDiffer([B[0], B[1]])).toBe(false);
        expect(packSizesDiffer([])).toBe(false);
        expect(packSizesDiffer([{ packSize: null }, { packSize: 1 }])).toBe(false);   // a missing size counts as 1
    });
});

describe('parsePastedColumn', () => {
    it('reads a column copied from a spreadsheet', () => {
        expect(parsePastedColumn('10\r\n12\r\n15\r\n')).toEqual(['10', '12', '15']);
        expect(parsePastedColumn('10\n12')).toEqual(['10', '12']);
    });
    it('takes the first cell of a wider selection', () => {
        expect(parsePastedColumn('10\tA\n12\tB')).toEqual(['10', '12']);
    });
    it('leaves a single value to the browser\'s normal paste', () => {
        expect(parsePastedColumn('10')).toEqual([]);
        expect(parsePastedColumn('10\n')).toEqual([]);
        expect(parsePastedColumn('')).toEqual([]);
    });
});

describe('sellsBelowCost', () => {
    it('compares the MRP with the landing rate, else the purchase rate', () => {
        const f = toForm(B[0]);
        expect(sellsBelowCost({ ...f, mrp: '40' })).toBe(true);
        expect(sellsBelowCost({ ...f, mrp: '60' })).toBe(false);
        expect(sellsBelowCost({ ...f, landingRate: '', purchaseRate: '80', mrp: '70' })).toBe(true);
        expect(sellsBelowCost({ ...f, landingRate: '', purchaseRate: '', mrp: '70' })).toBe(false);
    });
});
