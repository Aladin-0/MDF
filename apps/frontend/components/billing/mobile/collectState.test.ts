import { getCollectState, getCheckRows, formatINR, countLossLines } from './collectState';

jest.mock('@/lib/billingMarginUtils', () => ({
    calculateLineMargin: (item: any) => ({ isLossSale: Boolean(item.loss) }),
}));

const okCheckout = {
    canCheckout: true, isLoading: false, isScheduleHValid: true, isTenderInvalid: false, isCreditInvalid: false,
    isSplitInvalid: false, isSplitCreditInvalid: false, isLossSale: false, isGlobalLoss: false,
};
const customer = (extra: any = {}) => ({ id: 'c1', name: 'Asha', outstanding: 0, creditLimit: 5000, ...extra });
const draft = (extra: any = {}) => ({
    documentMode: 'invoice', saleType: 'RETAIL', cart: [{ id: 'a' }], payment: { method: 'cash' }, customer: null, extraDiscountPct: 0, ...extra,
}) as any;
const totals = { grandTotal: 1038 };
const run = (d: any, c: any = {}, isOnline = true) => getCollectState({ draft: d, totals, checkout: { ...okCheckout, ...c }, isOnline });

describe('formatINR', () => {
    it('groups the Indian way with two decimals', () => {
        expect(formatINR(1038)).toBe('1,038.00');
        expect(formatINR(1234567.5)).toBe('12,34,567.50');
        expect(formatINR(12)).toBe('12.00');
        expect(formatINR(-250)).toBe('-250.00');
        expect(formatINR(NaN)).toBe('0.00');
    });
});

describe('getCollectState labels', () => {
    it('cash / upi / card / split show the amount to collect', () => {
        for (const method of ['cash', 'upi', 'card', 'split']) {
            expect(run(draft({ payment: { method } })).label).toBe('Collect ₹1,038.00');
        }
    });
    it('every wholesale bill says Save on credit and saves straight away; a retail bill always says Collect (the mode is chosen in the sheet)', () => {
        const w = run(draft({ saleType: 'WHOLESALE', payment: { method: 'cash' }, customer: customer() }));
        expect(w.label).toBe('Save on credit');
        expect(w.needsPaymentStep).toBe(false);
        expect(run(draft({ payment: { method: 'credit' }, customer: customer() })).label).toMatch(/^Collect ₹/);
    });
    it('quotation says Save quotation and skips the payment step', () => {
        const s = run(draft({ documentMode: 'quotation' }));
        expect(s.label).toBe('Save quotation');
        expect(s.needsPaymentStep).toBe(false);
        expect(s.disabledReason).toBeNull();
    });
    it('editing a retail bill says Save changes and still shows the payment step (so the method can be changed)', () => {
        const s = run(draft({ editingSaleId: 's1', payment: { method: 'credit' }, customer: customer() }));
        expect(s.label).toBe('Save changes');
        expect(s.needsPaymentStep).toBe(true);
    });
    it('editing a wholesale bill or a quotation has no payment step (credit / none)', () => {
        expect(run(draft({ editingSaleId: 's1', saleType: 'WHOLESALE', customer: customer() })).needsPaymentStep).toBe(false);
        expect(run(draft({ editingSaleId: 's1', documentMode: 'quotation' })).needsPaymentStep).toBe(false);
    });
    it('a normal bill needs the payment step and has no reason when all is well', () => {
        const s = run(draft());
        expect(s.needsPaymentStep).toBe(true);
        expect(s.disabledReason).toBeNull();
    });
});

describe('getCollectState disabledReason', () => {
    it('offline', () => expect(run(draft(), {}, false).disabledReason).toBe('No internet: bills cannot be saved'));
    it('empty cart', () => expect(run(draft({ cart: [] })).disabledReason).toBe('Add items to the bill'));
    it('no draft at all counts as an empty cart', () => expect(run(null).disabledReason).toBe('Add items to the bill'));
    it('Schedule H details missing', () => expect(run(draft(), { isScheduleHValid: false }).disabledReason).toMatch(/Schedule H/));
    it('credit needs a customer', () => {
        expect(run(draft({ payment: { method: 'credit' } }), { isCreditInvalid: true }).disabledReason).toBe('Customer needed for credit');
        expect(run(draft({ payment: { method: 'split' } }), { isSplitCreditInvalid: true }).disabledReason).toBe('Customer needed for credit');
    });
    it('wholesale credit limit exceeded', () => {
        const d = draft({ saleType: 'WHOLESALE', payment: { method: 'credit' }, customer: customer({ outstanding: 4500, creditLimit: 5000 }) });
        expect(run(d).disabledReason).toBe('Credit limit exceeded for this customer');
        const fine = draft({ saleType: 'WHOLESALE', payment: { method: 'credit' }, customer: customer({ outstanding: 100, creditLimit: 5000 }) });
        expect(run(fine).disabledReason).toBeNull();
    });
    it('the limit is a wholesale rule: retail credit over the limit is not blocked here', () => {
        const d = draft({ payment: { method: 'credit' }, customer: customer({ outstanding: 4500, creditLimit: 5000 }) });
        expect(run(d).disabledReason).toBeNull();
    });
    it('loss sale counts the lines', () => {
        const one = draft({ cart: [{ id: 'a', loss: true }, { id: 'b' }] });
        expect(run(one, { isLossSale: true }).disabledReason).toBe('Below cost on 1 line: fix to continue');
        const two = draft({ cart: [{ id: 'a', loss: true }, { id: 'b', loss: true }] });
        expect(run(two, { isLossSale: true }).disabledReason).toBe('Below cost on 2 lines: fix to continue');
        expect(countLossLines(two)).toBe(2);
    });
    it('a bill-level loss with no single bad line still explains itself', () => {
        expect(run(draft(), { isGlobalLoss: true }).disabledReason).toMatch(/below cost/i);
    });
    it('split not matching, and cash received below the total', () => {
        expect(run(draft({ payment: { method: 'split' } }), { isSplitInvalid: true }).disabledReason).toBe('Split amounts must add up to the total');
        expect(run(draft(), { isTenderInvalid: true }).disabledReason).toBe('Received amount is less than the total');
    });
    it('priority: offline > empty cart > Schedule H > credit customer > credit limit > loss > split', () => {
        const d = draft({ saleType: 'WHOLESALE', payment: { method: 'credit' }, customer: customer({ outstanding: 9999 }), cart: [{ loss: true }] });
        const all = { isScheduleHValid: false, isCreditInvalid: true, isLossSale: true, isSplitInvalid: true };
        expect(run(d, all, false).disabledReason).toMatch(/No internet/);
        expect(run(draft({ cart: [] }), all).disabledReason).toBe('Add items to the bill');
        expect(run(d, all).disabledReason).toMatch(/Schedule H/);
        expect(run(d, { ...all, isScheduleHValid: true }).disabledReason).toBe('Customer needed for credit');
        expect(run(d, { ...all, isScheduleHValid: true, isCreditInvalid: false }).disabledReason).toBe('Credit limit exceeded for this customer');
        expect(run(draft({ cart: [{ loss: true }], payment: { method: 'split' } }), { isLossSale: true, isSplitInvalid: true }).disabledReason).toMatch(/Below cost/);
    });
    it('a quotation ignores payment-only problems but not Schedule H or loss', () => {
        const q = draft({ documentMode: 'quotation', payment: { method: 'credit' } });
        expect(run(q, { isCreditInvalid: true, isSplitInvalid: true, isTenderInvalid: true }).disabledReason).toBeNull();
        expect(run(q, { isScheduleHValid: false }).disabledReason).toMatch(/Schedule H/);
        expect(run({ ...q, cart: [{ loss: true }] }, { isLossSale: true }).disabledReason).toMatch(/Below cost on 1 line/);
    });
    it('never leaves a dead button without a reason, but says nothing while saving', () => {
        expect(run(draft(), { canCheckout: false }).disabledReason).toBe('Check the bill before saving');
        expect(run(draft(), { canCheckout: false, isLoading: true }).disabledReason).toBeNull();
    });
});

describe('getCheckRows', () => {
    it('lists every failing check with where to fix it', () => {
        const d = draft({ payment: { method: 'credit' }, cart: [{ loss: true }] });
        const rows = getCheckRows({
            draft: d, totals, isOnline: false,
            checkout: { ...okCheckout, isScheduleHValid: false, isCreditInvalid: true, isLossSale: true },
        });
        expect(rows.map((r) => [r.id, r.fix])).toEqual([
            ['offline', null], ['scheduleH', 'doctor'], ['creditCustomer', 'customer'], ['loss', 'cart'],
        ]);
    });
    it('is empty when the bill is fine', () => {
        expect(getCheckRows({ draft: draft(), totals, isOnline: true, checkout: okCheckout })).toEqual([]);
    });
});
