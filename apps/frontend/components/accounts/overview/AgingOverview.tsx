'use client';

import { useDashboardAging } from '@/hooks/useAccounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AGING_BUCKETS = ['0-7', '8-15', '16-30', '31-60', '60+'];

export function AgingOverview() {
    const { data, isLoading } = useDashboardAging();

    if (isLoading) {
        return <Skeleton className="h-64 w-full" />;
    }

    const payables = data?.payables || {};
    const receivables = data?.receivables || {};

    const totalPayables = AGING_BUCKETS.reduce((sum, b) => sum + (payables[b] || 0), 0);
    const totalReceivables = AGING_BUCKETS.reduce((sum, b) => sum + (receivables[b] || 0), 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Aging Summary (Risk Visibility)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Payables */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm font-semibold text-red-600 border-b pb-2">
                            <span>Payables (You Owe)</span>
                            <span>{formatINR(totalPayables)}</span>
                        </div>
                        <div className="space-y-3">
                            {AGING_BUCKETS.map(bucket => {
                                const amount = payables[bucket] || 0;
                                const percentage = totalPayables > 0 ? (amount / totalPayables) * 100 : 0;
                                return (
                                    <div key={bucket} className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>{bucket} days</span>
                                            <span>{formatINR(amount)}</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-red-400 rounded-full transition-all" 
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Receivables */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm font-semibold text-emerald-600 border-b pb-2">
                            <span>Receivables (Owed to You)</span>
                            <span>{formatINR(totalReceivables)}</span>
                        </div>
                        <div className="space-y-3">
                            {AGING_BUCKETS.map(bucket => {
                                const amount = receivables[bucket] || 0;
                                const percentage = totalReceivables > 0 ? (amount / totalReceivables) * 100 : 0;
                                return (
                                    <div key={bucket} className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>{bucket} days</span>
                                            <span>{formatINR(amount)}</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-400 rounded-full transition-all" 
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
