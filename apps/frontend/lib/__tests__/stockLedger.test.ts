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

describe('quantities in the batch\'s own words', () => {
    const { packsText, signedPacksText, expiryDayText, rangeEndingToday } = require('../stockLedger');
    const strip = { pack_size: 10, pack_type: 'strip', pack_unit: 'tablet' };

    it('splits fractional packs into packs and loose units', () => {
        expect(packsText(5.3, strip)).toBe('5 strips + 3 tablets');
        expect(packsText(0.4, strip)).toBe('4 tablets');
        expect(packsText(2, strip)).toBe('2 strips');
        expect(packsText(0, strip)).toBe('0');
    });
    it('rounds floating-point noise (11.9999999 packs is 12)', () => {
        expect(packsText(11.9999999, strip)).toBe('12 strips');
    });
    it('uses the batch\'s type and unit, not "strip" and "tablet" for everything (a 300 GM product showed "1 tablet")', () => {
        expect(packsText(3, { pack_size: 1, pack_type: 'jar', pack_unit: 'gm' })).toBe('3 jars');
        expect(packsText(2, { pack_size: 100, pack_type: 'bottle', pack_unit: 'ml' })).toBe('2 bottles');
        expect(packsText(0.5, { pack_size: 100, pack_type: 'bottle', pack_unit: 'ml' })).toBe('50 mls');
    });
    it('lower-cases stored words that vary in case', () => {
        expect(packsText(0.3, { pack_size: 10, pack_type: 'Strip', pack_unit: 'Tablet' })).toBe('3 tablets');
    });
    it('shows the sign', () => {
        expect(signedPacksText(-2, strip)).toBe('−2 strips');
        expect(signedPacksText(1.4, strip)).toBe('+1 strip + 4 tablets');
        expect(signedPacksText(0, strip)).toBe('0');
    });
    it('says an expired batch in words', () => {
        expect(expiryDayText(-1)).toBe('expired 1 day ago');
        expect(expiryDayText(0)).toBe('expires today');
        expect(expiryDayText(12)).toBe('12 days left');
    });
    it('builds a range from local date parts (early morning in India is still today)', () => {
        const now = new Date(2026, 10, 17, 1, 30);
        expect(rangeEndingToday(0, now)).toEqual({ from: '2026-11-17', to: '2026-11-17' });
        expect(rangeEndingToday(7, now)).toEqual({ from: '2026-11-10', to: '2026-11-17' });
        expect(rangeEndingToday(30, now).from).toBe('2026-10-18');
    });
    it('a product in the URL is kept and cleared like the other filters', () => {
        const { readFilters, applyFilterPatch } = require('../stockLedger');
        expect(readFilters(new URLSearchParams('product=p1&batch=b1')).product).toBe('p1');
        const next = applyFilterPatch(new URLSearchParams('product=p1&page=3'), { product: null });
        expect(next.get('product')).toBeNull();
        expect(next.get('page')).toBeNull();
    });
});
