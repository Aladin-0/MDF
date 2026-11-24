/**
 * Credit aging buckets from the credit accounts list.
 *
 * One rule, used by the Credit page's cards (it used to live inside an API call that downloaded the same 500 accounts
 * the page had already downloaded, so the page fetched them twice). Age = whole days since the account's last
 * transaction; only accounts that owe money count.
 */
export interface AgingBucket { count: number; amount: number }
export interface CreditAging {
    current: AgingBucket;
    days30to60: AgingBucket;
    days60to90: AgingBucket;
    over90: AgingBucket;
    totalOverdue: AgingBucket;
    totalOutstanding: AgingBucket;
}

const DAY_MS = 1000 * 60 * 60 * 24;

export function computeCreditAging(accounts: any[] | undefined | null, today: Date = new Date()): CreditAging {
    const result: CreditAging = {
        current:     { count: 0, amount: 0 },
        days30to60:  { count: 0, amount: 0 },
        days60to90:  { count: 0, amount: 0 },
        over90:      { count: 0, amount: 0 },
        totalOverdue:      { count: 0, amount: 0 },
        totalOutstanding:  { count: 0, amount: 0 },
    };

    for (const acc of accounts ?? []) {
        const outstanding = acc.totalOutstanding ?? 0;
        if (outstanding <= 0) continue;

        let days = 0;
        if (acc.lastTransactionDate) {
            days = Math.floor((today.getTime() - new Date(acc.lastTransactionDate).getTime()) / DAY_MS);
        }

        const bucket: keyof CreditAging =
            days <= 30 ? 'current' :
            days <= 60 ? 'days30to60' :
            days <= 90 ? 'days60to90' :
            'over90';

        result[bucket].count++;
        result[bucket].amount += outstanding;
        result.totalOutstanding.count++;
        result.totalOutstanding.amount += outstanding;
        if (bucket !== 'current') {
            result.totalOverdue.count++;
            result.totalOverdue.amount += outstanding;
        }
    }

    return result;
}
