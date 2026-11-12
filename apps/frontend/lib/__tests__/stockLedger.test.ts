import {
    applyFilterPatch, defaultRange, expiryTone, formatDay, formatInr, isRangeValid, parseDay, readFilters, toDayString,
} from '../stockLedger';

describe('dates', () => {
    it('reads a plain date as that local day (new Date("2026-11-10") is UTC and can show the 9th)', () => {
        const d = parseDay('2026-11-10');
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 10]);
        expect(toDayString(d)).toBe('2026-11-10');
    });

    it('formats with Intl, not hand-built strings', () => {
        expect(formatDay('2026-11-10')).toMatch(/10\s+Nov\s+2026/);
    });

    it('defaults to the last month up to today', () => {
        expect(defaultRange(new Date(2026, 10, 15))).toEqual({ from: '2026-10-15', to: '2026-11-15' });
    });

    it('a range is valid only when both ends exist and from <= to', () => {
        expect(isRangeValid('2026-11-01', '2026-11-10')).toBe(true);
        expect(isRangeValid('2026-11-10', '2026-11-10')).toBe(true);
        expect(isRangeValid('2026-11-11', '2026-11-10')).toBe(false);
        expect(isRangeValid('', '2026-11-10')).toBe(false);
    });
});

describe('money', () => {
    it('uses Indian grouping and two decimals everywhere', () => {
        expect(formatInr(1234567.5)).toContain('12,34,567.50');
        expect(formatInr(0)).toContain('0.00');
        expect(formatInr(NaN)).toContain('0.00');
    });
});

describe('expiryTone', () => {
    const now = new Date(2026, 10, 10);
    it('flags expired, soon (within 90 days) and ok', () => {
        expect(expiryTone('2026-11-09', now)).toBe('expired');
        expect(expiryTone('2026-11-10', now)).toBe('soon');
        expect(expiryTone('2027-02-08', now)).toBe('soon');
        expect(expiryTone('2027-02-09', now)).toBe('ok');
    });
});

describe('URL filters', () => {
    it('reads defaults and ignores junk', () => {
        const f = readFilters(new URLSearchParams('page=abc&size=7'));
        expect(f).toMatchObject({ batch: null, type: '', q: '', page: 1, size: 50 });
        expect(readFilters(new URLSearchParams('page=3&size=100&batch=b1&type=SALE_OUT&q=dolo'))).toMatchObject({
            page: 3, size: 100, batch: 'b1', type: 'SALE_OUT', q: 'dolo',
        });
    });

    it('any change to WHAT is listed returns to page 1 in the same update (it used to be a second fetch)', () => {
        const start = new URLSearchParams('page=4&type=SALE_OUT');
        expect(applyFilterPatch(start, { q: 'dolo' }).get('page')).toBeNull();
        expect(applyFilterPatch(start, { batch: 'b1' }).get('page')).toBeNull();
        expect(applyFilterPatch(start, { from: '2026-11-01' }).get('page')).toBeNull();
        expect(applyFilterPatch(start, { size: 25 }).get('page')).toBeNull();
    });

    it('changing the page alone keeps everything else', () => {
        const next = applyFilterPatch(new URLSearchParams('type=SALE_OUT&q=dolo'), { page: 3 });
        expect(next.get('page')).toBe('3');
        expect(next.get('type')).toBe('SALE_OUT');
        expect(next.get('q')).toBe('dolo');
    });

    it('drops empty and default values so the URL stays clean', () => {
        const next = applyFilterPatch(new URLSearchParams('type=SALE_OUT&q=x&size=25&page=2'), { type: '', q: '  ', size: 50, page: 1 });
        expect(next.toString()).toBe('');
    });
});
