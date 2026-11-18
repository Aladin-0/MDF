import {
    addMonths, applyExpiryPatch, buildRemovePayload, DEFAULT_FILTERS, daysText, groupConsecutive, isAskable, monthKey, monthLabel,
    readExpiryParams, removalCost, removalProblem, returnGroups, returnHref, selectionTotals, serverParams, toggleId, togglePage, toneOf,
    wholeBatch, windowLabel, ymd, type ExpiryFilters, type ExpiryRow,
} from '../expiryManager';

const row = (id: string, over: Partial<ExpiryRow> = {}): ExpiryRow => ({
    id, productId: 'p', productName: 'Amoxil', manufacturer: '', batchNo: id.toUpperCase(), expiryDate: '2027-03-10', daysToExpiry: 10,
    qtyStrips: 5, qtyLoose: 3, packSize: 10, packType: 'strip', packUnit: 'tablet', packs: 5.3, mrp: 100, mrpValue: 530,
    rackLocation: '', distributorId: 'd1', distributorName: 'Alpha', moreSuppliers: false, supplierAssigned: false, purchaseInvoiceId: 'inv1', purchaseInvoiceNo: 'A-1',
    costValue: 300, ...over,
});
const f = (over: Partial<ExpiryFilters> = {}): ExpiryFilters => ({ ...DEFAULT_FILTERS, ...over });
const TODAY = new Date(2026, 10, 17, 1, 30);          // 17 Nov 2026, 01:30 local: toISOString() would say the 16th in India

describe('dates', () => {
    it('are built from local parts, so early morning in India is still today', () => {
        expect(ymd(TODAY)).toBe('2026-11-17');
        expect(monthKey(TODAY)).toBe('2026-11');
    });
    it('add months across a year end', () => {
        expect(addMonths('2026-11', 1)).toBe('2026-12');
        expect(addMonths('2026-11', 2)).toBe('2027-01');
        expect(addMonths('2026-01', -1)).toBe('2025-12');
    });
    it('label a month', () => expect(monthLabel('2027-03')).toBe('Mar 2027'));
});

describe('what the server is asked for', () => {
    it('Expired = everything before today', () => expect(serverParams(f({ w: 'expired' }), TODAY)).toMatchObject({ to: '2026-11-16' }));
    it('N days = today to today + N, plus expired when asked', () => {
        expect(serverParams(f({ w: '30' }), TODAY)).toMatchObject({ from: '2026-11-17', to: '2026-12-17', includeExpired: 'true' });
        expect(serverParams(f({ w: '30', includeExpired: false }), TODAY).includeExpired).toBeUndefined();
    });
    it('this / next month are whole calendar months', () => {
        expect(serverParams(f({ w: 'this-month', includeExpired: false }), TODAY).months).toBe('2026-11');
        expect(serverParams(f({ w: 'next-month', includeExpired: false }), TODAY).months).toBe('2026-12');
    });
    it('picked months and a custom range are sent as chosen', () => {
        expect(serverParams(f({ w: 'months', months: ['2027-01', '2027-03'] }), TODAY).months).toBe('2027-01,2027-03');
        expect(serverParams(f({ w: 'custom', from: '2027-01-05', to: '2027-02-01' }), TODAY)).toMatchObject({ from: '2027-01-05', to: '2027-02-01' });
    });
    it('sends distributors (and "none") and the search', () => {
        const p = serverParams(f({ distributors: ['d1', 'none'], q: ' amox ' }), TODAY);
        expect(p.distributorIds).toBe('d1,none');
        expect(p.q).toBe('amox');
    });
    it('does not ask with an empty months or an upside-down custom range (the server would answer with its 90-day default)', () => {
        expect(isAskable(f({ w: 'months', months: [] }))).toBe(false);
        expect(isAskable(f({ w: 'custom' }))).toBe(false);
        expect(isAskable(f({ w: 'custom', from: '2027-02-01', to: '2027-01-01' }))).toBe(false);
        expect(isAskable(f({ w: 'custom', from: '2027-01-01' }))).toBe(true);
        expect(isAskable(f())).toBe(true);
    });
    it('describes the window in words', () => {
        expect(windowLabel(f(), TODAY)).toBe('Expiring in the next 90 days plus anything already expired');
        expect(windowLabel(f({ w: 'expired' }), TODAY)).toBe('Already expired');
        expect(windowLabel(f({ w: 'months', months: ['2027-01'], includeExpired: false }), TODAY)).toBe('Expiring in Jan 2027');
    });
});

describe('filters in the URL', () => {
    it('read back what was written, with safe defaults for junk', () => {
        const sp = applyExpiryPatch(new URLSearchParams(), { w: 'months', months: ['2027-03', '2027-01'], distributors: ['a', 'none'], q: 'x', group: true, includeExpired: true });
        const back = readExpiryParams(sp);
        expect(back).toMatchObject({ w: 'months', months: ['2027-01', '2027-03'], distributors: ['a', 'none'], q: 'x', group: true, includeExpired: true });
        expect(readExpiryParams(new URLSearchParams('w=banana&m=zz&from=soon&sort=evil&page=-4&size=9')))
            .toMatchObject({ w: '90', months: [], from: '', sort: 'expiry', page: 1, size: 50 });
    });
    it('changing what matches goes back to page 1, changing only the page does not', () => {
        const at3 = new URLSearchParams('page=3');
        expect(applyExpiryPatch(at3, { q: 'a' }).get('page')).toBeNull();
        expect(applyExpiryPatch(at3, { page: 4 }).get('page')).toBe('4');
        expect(applyExpiryPatch(at3, { size: 100 }).get('page')).toBe('3');
    });
    it('keeps the URL short: defaults are not written', () => {
        expect(applyExpiryPatch(new URLSearchParams(), { w: '90', sort: 'expiry' }).toString()).toBe('');
    });
    it('"already expired" is on for "next N days" and off for a month or a date range, until the user says otherwise', () => {
        expect(readExpiryParams(new URLSearchParams('')).includeExpired).toBe(true);
        expect(readExpiryParams(new URLSearchParams('w=60')).includeExpired).toBe(true);
        expect(readExpiryParams(new URLSearchParams('w=months&m=2027-01')).includeExpired).toBe(false);
        expect(readExpiryParams(new URLSearchParams('w=custom')).includeExpired).toBe(false);
        expect(readExpiryParams(new URLSearchParams('w=next-month')).includeExpired).toBe(false);
        expect(readExpiryParams(new URLSearchParams('w=months&m=2027-01&exp=1')).includeExpired).toBe(true);
    });
    it('switching window forgets an earlier choice of the toggle', () => {
        expect(applyExpiryPatch(new URLSearchParams('exp=0'), { w: '30' }).get('exp')).toBeNull();
        expect(applyExpiryPatch(new URLSearchParams(), { includeExpired: false }).get('exp')).toBe('0');
    });
});

describe('showing a row', () => {
    it('colours by how soon (expiring today is not expired)', () => {
        expect([-1, 0, 30, 31, 90, 91].map(toneOf)).toEqual(['expired', 'critical', 'critical', 'warning', 'warning', 'ok']);
    });
    it('says it in words', () => {
        expect(daysText(-1)).toBe('Expired 1 day ago');
        expect(daysText(0)).toBe('Expires today');
        expect(daysText(12)).toBe('12 days left');
    });
});

describe('selection', () => {
    const known = { a: row('a'), b: row('b', { mrpValue: 100, costValue: 50 }) };
    it('ticks and unticks one, and a whole page', () => {
        let s = toggleId({ ids: [], allMatching: false }, 'a');
        expect(s.ids).toEqual(['a']);
        s = togglePage(s, ['a', 'b']);
        expect(s.ids.sort()).toEqual(['a', 'b']);
        expect(togglePage(s, ['a', 'b']).ids).toEqual([]);
    });
    it('totals what is ticked, across pages', () => {
        expect(selectionTotals({ ids: ['a', 'b'], allMatching: false }, known, undefined)).toEqual({ batches: 2, mrpValue: 630, costValue: 350 });
    });
    it('uses the server totals after "select all matching"', () => {
        expect(selectionTotals({ ids: ['a'], allMatching: true }, known, { batches: 40, products: 9, expiredBatches: 1, mrpValue: 9000, distributors: 3, costValue: 5000 }))
            .toEqual({ batches: 40, mrpValue: 9000, costValue: 5000 });
    });
    it('shows no cost for people without rates', () => {
        const noRates = { a: row('a', { costValue: undefined }) };
        expect(selectionTotals({ ids: ['a'], allMatching: false }, noRates, undefined).costValue).toBeUndefined();
    });
});

describe('writing stock off', () => {
    const r = row('a');                                      // 5 strips + 3 loose of 10 = 53 units
    it('a whole batch needs nothing typed', () => expect(removalProblem(r, wholeBatch())).toBeNull());
    it('refuses nothing, too much, and non-numbers', () => {
        expect(removalProblem(r, { strips: '0', loose: '0', custom: true })).toMatch(/Enter a quantity/);
        expect(removalProblem(r, { strips: '6', loose: '', custom: true })).toMatch(/Only/);
        expect(removalProblem(r, { strips: '5', loose: '4', custom: true })).toMatch(/Only/);
        expect(removalProblem(r, { strips: '1.5', loose: '', custom: true })).toMatch(/Whole numbers/);
        expect(removalProblem(r, { strips: '5', loose: '3', custom: true })).toBeNull();
    });
    it('sends no quantity for a whole batch and exact counts for a partial one', () => {
        const payload = buildRemovePayload([r, row('b')], { b: { strips: '2', loose: '', custom: true } }, { type: 'DAMAGED', reason: ' wet ', password: 'x' });
        expect(payload).toEqual({ type: 'DAMAGED', reason: 'wet', password: 'x', items: [{ batchId: 'a' }, { batchId: 'b', qtyStrips: 2, qtyLoose: 0 }] });
    });
    it('works out the cost written off, in proportion for a partial removal', () => {
        expect(removalCost([r], {})).toBe(300);
        expect(removalCost([r], { a: { strips: '', loose: '53', custom: true } })).toBe(300);
        expect(removalCost([r], { a: { strips: '', loose: '10', custom: true } })).toBe(56.6);
        expect(removalCost([row('x', { costValue: undefined })], {})).toBeUndefined();
    });
});

describe('returning to the distributor', () => {
    it('groups by the invoice that brought the stock in, and reports the rest', () => {
        const { groups, cannotReturn } = returnGroups([
            row('a'), row('b'), row('c', { purchaseInvoiceId: 'inv2', purchaseInvoiceNo: 'B-9', distributorName: 'Beta' }),
            row('d', { purchaseInvoiceId: null, purchaseInvoiceNo: '', distributorId: null, distributorName: '' }),
        ]);
        expect(groups.map((g) => [g.invoiceNo, g.rows.length])).toEqual([['A-1', 2], ['B-9', 1]]);
        expect(cannotReturn.map((x) => x.id)).toEqual(['d']);
    });
    it('opens the purchase-return screen on that invoice with only those batches', () => {
        const href = returnHref(returnGroups([row('a'), row('b')]).groups[0]);
        const url = new URL(href, 'http://x');
        expect(url.pathname).toBe('/dashboard/accounts/purchase-returns/new');
        expect(url.searchParams.get('invoiceId')).toBe('inv1');
        expect(url.searchParams.get('batchIds')).toBe('a,b');
    });
});

describe('grouping the table', () => {
    it('groups consecutive rows of one distributor', () => {
        const g = groupConsecutive([row('a'), row('b'), row('c', { distributorId: null, distributorName: '' })]);
        expect(g.map((x) => [x.name, x.rows.length])).toEqual([['Alpha', 2], ['No purchase record', 1]]);
    });
});

describe('assigning a supplier', () => {
    const { splitForAssignment } = require('../expiryManager');
    it('can change only stock with no purchase invoice (an invoice is the evidence)', () => {
        const { can, cannot } = splitForAssignment([row('a', { purchaseInvoiceId: null }), row('b'), row('c', { purchaseInvoiceId: null, supplierAssigned: true })]);
        expect(can.map((r: any) => r.id)).toEqual(['a', 'c']);
        expect(cannot.map((r: any) => r.id)).toEqual(['b']);
    });
});
