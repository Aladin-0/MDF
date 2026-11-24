import { computeCreditAging } from '@/lib/creditAging';

const TODAY = new Date('2026-11-23T12:00:00');
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86400000).toISOString();

describe('computeCreditAging', () => {
    it('puts each account that owes money in its age bucket and adds up the overdue part', () => {
        const aging = computeCreditAging([
            { totalOutstanding: 100, lastTransactionDate: daysAgo(5) },     // current
            { totalOutstanding: 200, lastTransactionDate: daysAgo(30) },    // current (30 is still current)
            { totalOutstanding: 300, lastTransactionDate: daysAgo(45) },    // 31-60
            { totalOutstanding: 400, lastTransactionDate: daysAgo(75) },    // 61-90
            { totalOutstanding: 500, lastTransactionDate: daysAgo(200) },   // over 90
            { totalOutstanding: 600 },                                      // no transaction date: current
            { totalOutstanding: 0, lastTransactionDate: daysAgo(400) },     // owes nothing: ignored
            { totalOutstanding: -50, lastTransactionDate: daysAgo(400) },   // advance: ignored
        ], TODAY);
        expect(aging.current).toEqual({ count: 3, amount: 900 });
        expect(aging.days30to60).toEqual({ count: 1, amount: 300 });
        expect(aging.days60to90).toEqual({ count: 1, amount: 400 });
        expect(aging.over90).toEqual({ count: 1, amount: 500 });
        expect(aging.totalOverdue).toEqual({ count: 3, amount: 1200 });
        expect(aging.totalOutstanding).toEqual({ count: 6, amount: 2100 });
    });

    it('is all zeros for no accounts', () => {
        expect(computeCreditAging(undefined, TODAY).totalOutstanding).toEqual({ count: 0, amount: 0 });
    });
});
