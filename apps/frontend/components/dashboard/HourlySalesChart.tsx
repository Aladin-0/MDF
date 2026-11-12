'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { compactInr, fillHours, peakHour, rupees } from '@/lib/dashboard';

interface HourlySalesChartProps {
    data: { hour: string; bills: number; sales: number }[];
    isLoading?: boolean;
}

const HEIGHT = 224;

function ChartTooltip({ active, payload }: any) {
    const row = active && payload?.[0]?.payload;
    if (!row) return null;
    return (
        <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
            <p className="font-medium">{row.label}</p>
            <p className="tabular-nums">{rupees(row.sales)}</p>
            <p className="text-xs text-muted-foreground">{row.bills} {row.bills === 1 ? 'bill' : 'bills'}</p>
        </div>
    );
}

/** Sales per hour of the day. A quiet hour is an empty slot; the busiest hour is named above the bars. */
export default function HourlySalesChart({ data, isLoading }: HourlySalesChartProps) {
    if (isLoading) {
        return <Skeleton className="w-full" style={{ height: HEIGHT }} role="status" aria-label="Loading chart" />;
    }

    const buckets = fillHours(data ?? []);
    if (buckets.length === 0) {
        return (
            <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground" style={{ height: HEIGHT }}>
                No sales in this period
            </div>
        );
    }

    const peak = peakHour(buckets);
    return (
        <div>
            {peak && (
                <p className="mb-2 text-sm text-muted-foreground">
                    Busiest hour <span className="font-medium text-foreground">{peak.label}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="tabular-nums">{rupees(peak.sales)}</span>, {peak.bills} {peak.bills === 1 ? 'bill' : 'bills'}
                </p>
            )}
            <div role="img" aria-label={`Sales by hour. ${peak ? `Busiest hour ${peak.label}, ${rupees(peak.sales)}.` : ''} The figures are in the table below.`}
                style={{ width: '100%', height: HEIGHT }} className="min-h-0 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={buckets} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={compactInr} width={48} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }} />
                        <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <table className="sr-only">
                <caption>Sales by hour</caption>
                <thead><tr><th scope="col">Hour</th><th scope="col">Sales</th><th scope="col">Bills</th></tr></thead>
                <tbody>
                    {buckets.map((b) => <tr key={b.hour}><th scope="row">{b.label}</th><td>{rupees(b.sales)}</td><td>{b.bills}</td></tr>)}
                </tbody>
            </table>
        </div>
    );
}
