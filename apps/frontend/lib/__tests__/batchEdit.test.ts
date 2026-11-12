import { buildBatchPatch, buildUndoPatch, diffBatchForm, serverErrors, toForm, touchesPack, validateBatchForm, type EditableBatch } from '../batchEdit';

const batch = (over: Partial<EditableBatch> = {}): EditableBatch => ({
    batchNo: 'B100', rackLocation: null, mfgDate: null, expiryDate: '2027-09-01', mrp: 250, purchaseRate: 180, landingRate: 200,
    packSize: 10, packType: 'strip', packUnit: 'tablet', ...over,
});

describe('toForm', () => {
    it('turns a batch into text fields, with empty text for missing values', () => {
        expect(toForm(batch())).toEqual({
            batchNo: 'B100', rackLocation: '', mfgDate: '', expiryDate: '2027-09-01', mrp: '250', purchaseRate: '180', landingRate: '200',
            packSize: '10', packType: 'strip', packUnit: 'tablet',
        });
        expect(toForm(batch({ landingRate: null, expiryDate: '2027-09-01T00:00:00' })).landingRate).toBe('');
        expect(toForm(batch({ expiryDate: '2027-09-01T00:00:00' })).expiryDate).toBe('2027-09-01');
    });
});

describe('validateBatchForm (mirrors the server)', () => {
    const ok = toForm(batch());
    it('accepts a good batch', () => expect(validateBatchForm(ok)).toEqual({}));

    it('requires the batch number and the expiry (clearing the expiry used to crash the server)', () => {
        expect(validateBatchForm({ ...ok, batchNo: '  ' }).batchNo).toBeDefined();
        expect(validateBatchForm({ ...ok, expiryDate: '' }).expiryDate).toBe('Expiry date is required');
    });

    it('MRP must be a positive number', () => {
        for (const bad of ['', '0', '-3', 'abc']) expect(validateBatchForm({ ...ok, mrp: bad }).mrp).toBeDefined();
        expect(validateBatchForm({ ...ok, mrp: '0.5' }).mrp).toBeUndefined();
    });

    it('rates cannot be negative; landing rate may be left empty', () => {
        expect(validateBatchForm({ ...ok, purchaseRate: '-1' }).purchaseRate).toBeDefined();
        expect(validateBatchForm({ ...ok, landingRate: '-1' }).landingRate).toBeDefined();
        expect(validateBatchForm({ ...ok, landingRate: '' }).landingRate).toBeUndefined();
    });

    it('rates are not checked for people who cannot see them', () => {
        expect(validateBatchForm({ ...ok, purchaseRate: '' }, { showRates: false }).purchaseRate).toBeUndefined();
    });

    it('mfg date cannot be after expiry', () => {
        expect(validateBatchForm({ ...ok, mfgDate: '2028-01-01' }).mfgDate).toBeDefined();
        expect(validateBatchForm({ ...ok, mfgDate: '2027-09-01' }).mfgDate).toBeUndefined();
    });

    it('pack size is a whole number of at least 1, and the unit is required', () => {
        for (const bad of ['0', '1.5', '', 'x']) expect(validateBatchForm({ ...ok, packSize: bad }).packSize).toBeDefined();
        expect(validateBatchForm({ ...ok, packUnit: '' }).packUnit).toBeDefined();
    });
});

describe('diff and patch', () => {
    const initial = toForm(batch());

    it('lists only what changed, readably', () => {
        const now = { ...initial, mrp: '260', rackLocation: 'A1' };
        expect(diffBatchForm(initial, now)).toEqual([
            { field: 'rackLocation', label: 'Rack', from: 'none', to: 'A1' },
            { field: 'mrp', label: 'MRP', from: '₹250', to: '₹260' },
        ]);
    });

    it('typing the same number another way is not a change ("250.00" is 250)', () => {
        expect(diffBatchForm(initial, { ...initial, mrp: '250.00' })).toEqual([]);
    });

    it('sends ONLY the changed fields with the right types', () => {
        const now = { ...initial, mrp: '260.5', landingRate: '', mfgDate: '2026-01-05', packSize: '12', batchNo: ' B101 ' };
        expect(buildBatchPatch(initial, now)).toEqual({ batchNo: 'B101', mfgDate: '2026-01-05', mrp: 260.5, landingRate: null, packSize: 12 });
        expect(buildBatchPatch(initial, initial)).toEqual({});
    });

    it('undo is the same fields with the previous values', () => {
        const now = { ...initial, mrp: '260', landingRate: '', rackLocation: 'A1' };
        expect(buildUndoPatch(initial, now)).toEqual({ mrp: 250, landingRate: 200, rackLocation: '' });
    });

    it('knows when the pack is being changed (it re-counts loose stock)', () => {
        expect(touchesPack(diffBatchForm(initial, { ...initial, packSize: '12' }))).toBe(true);
        expect(touchesPack(diffBatchForm(initial, { ...initial, mrp: '260' }))).toBe(false);
    });
});

describe('serverErrors', () => {
    it('maps the API errors onto the form fields and ignores unknown keys', () => {
        expect(serverErrors({ errors: { batchNo: 'Batch X already exists', expiryDate: ['Required'], nonsense: 'x' } }))
            .toEqual({ batchNo: 'Batch X already exists', expiryDate: 'Required' });
        expect(serverErrors({ detail: 'nope' })).toEqual({});
        expect(serverErrors(null)).toEqual({});
    });
});
