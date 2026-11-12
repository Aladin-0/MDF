import { compactInr, comparisonLabel, describeQty, fillHours, greetingFor, hourLabel, percentOf, peakHour, periodTitle, rupees, trendOf } from '@/lib/dashboard';

const NOW = new Date(2026, 2, 12, 15, 0);   // Thu 12 Mar 2026, 3 PM

describe('periodTitle', () => {
    it('names today and yesterday', () => {
        expect(periodTitle('2026-03-12', '2026-03-12', NOW)).toBe('Today');
        expect(periodTitle('2026-03-11', '2026-03-11', NOW)).toBe('Yesterday');
    });
    it('shows other days and ranges as dates, with the year only when it is not this year', () => {
        expect(periodTitle('2026-03-05', '2026-03-05', NOW)).toBe('5 Mar');
        expect(periodTitle('2026-03-01', '2026-03-12', NOW)).toBe('1 Mar – 12 Mar');
        expect(periodTitle('2025-12-30', '2026-01-02', NOW)).toBe('30 Dec 2025 – 2 Jan 2026');
        expect(periodTitle('2025-06-01', '2025-06-01', NOW)).toBe('1 Jun 2025');
    });
});

describe('comparisonLabel', () => {
    it('says "yesterday" for the day before today, a date for any other single day, a length for a range', () => {
        expect(comparisonLabel('2026-03-11', '2026-03-11', NOW)).toBe('yesterday');
        expect(comparisonLabel('2026-03-04', '2026-03-04', NOW)).toBe('4 Mar');
        expect(comparisonLabel('2026-03-02', '2026-03-08', NOW)).toBe('the previous 7 days');
        expect(comparisonLabel(undefined, undefined, NOW)).toBe('the previous period');
    });
});

describe('trendOf', () => {
    it('measures the change against the previous period', () => {
        expect(trendOf(150, 100)).toEqual({ pct: 50, direction: 'up' });
        expect(trendOf(75, 100)).toEqual({ pct: -25, direction: 'down' });
        expect(trendOf(100, 100)).toEqual({ pct: 0, direction: 'flat' });
        expect(trendOf(100.2, 100)).toEqual({ pct: 0, direction: 'flat' });      // rounds to no change
    });
    it('says nothing when there is nothing to compare with (never a made-up percentage)', () => {
        expect(trendOf(100, 0)).toBeNull();
        expect(trendOf(0, 0)).toBeNull();
        expect(trendOf(100, undefined)).toBeNull();
        expect(trendOf(undefined, 100)).toBeNull();
        expect(trendOf(NaN, 100)).toBeNull();
    });
});

describe('hours', () => {
    it('labels hours the way a person says them', () => {
        expect([hourLabel('00:00'), hourLabel('09:00'), hourLabel('12:00'), hourLabel('18:00')]).toEqual(['12 AM', '9 AM', '12 PM', '6 PM']);
    });

    it('fills every hour of the shop day so a quiet hour is an empty slot', () => {
        const out = fillHours([{ hour: '10:00', bills: 2, sales: 200 }, { hour: '13:00', bills: 1, sales: 90 }]);
        expect(out[0].hour).toBe('09:00');
        expect(out[out.length - 1].hour).toBe('21:00');
        expect(out).toHaveLength(13);
        expect(out.find((b) => b.hour === '11:00')).toMatchObject({ sales: 0, bills: 0 });
        expect(out.find((b) => b.hour === '13:00')).toMatchObject({ sales: 90, bills: 1, label: '1 PM' });
    });

    it('widens to cover a sale outside the usual hours, and shows nothing when there were no sales', () => {
        const out = fillHours([{ hour: '06:00', bills: 1, sales: 10 }, { hour: '23:00', bills: 1, sales: 10 }]);
        expect([out[0].hour, out[out.length - 1].hour]).toEqual(['06:00', '23:00']);
        expect(fillHours([])).toEqual([]);
    });

    it('finds the busiest hour, and none when every hour is empty', () => {
        const out = fillHours([{ hour: '10:00', bills: 2, sales: 200 }, { hour: '15:00', bills: 5, sales: 900 }]);
        expect(peakHour(out)).toMatchObject({ hour: '15:00', sales: 900 });
        expect(peakHour(out.map((b) => ({ ...b, sales: 0 })))).toBeNull();
    });
});

describe('amounts', () => {
    it('compacts rupees for axes', () => {
        expect([compactInr(0), compactInr(850), compactInr(999), compactInr(1000), compactInr(12400), compactInr(150000), compactInr(25000000), compactInr(-2500)])
            .toEqual(['₹0', '₹850', '₹999', '₹1k', '₹12.4k', '₹1.5L', '₹2.5Cr', '-₹2.5k']);
    });
    it('does not turn a small axis value into "₹0k"', () => {
        expect(compactInr(400)).toBe('₹400');
    });
    it('formats whole rupees in Indian grouping and survives missing numbers', () => {
        expect(rupees(1234567)).toBe('₹12,34,567');
        expect(rupees(undefined)).toBe('₹0');
        expect(rupees(NaN)).toBe('₹0');
    });
    it('describes quantities with their loose units', () => {
        expect([describeQty(12), describeQty(1), describeQty(1, 3), describeQty(0, 5), describeQty(0)]).toEqual(['12 packs', '1 pack', '1 pack + 3 loose', '5 loose', '0 packs']);
    });
    it('percentages and greetings', () => {
        expect([percentOf(25, 100), percentOf(1, 3), percentOf(5, 0)]).toEqual([25, 33, 0]);
        expect([greetingFor(6), greetingFor(12), greetingFor(16), greetingFor(17), greetingFor(23)]).toEqual(['Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
    });
});
