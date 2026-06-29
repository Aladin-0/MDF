'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface HourlySalesChartProps {
  data: { hour: string; bills: number; sales: number }[];
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3">
        <p className="font-semibold text-slate-800 mb-1">{label}</p>
        <p className="text-sm text-slate-600">
          Sales: <span className="font-semibold text-blue-600">₹{data.sales.toLocaleString('en-IN')}</span>
        </p>
        <p className="text-sm text-slate-600">
          Bills: <span className="font-medium text-slate-800">{data.bills}</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function HourlySalesChart({ data, isLoading }: HourlySalesChartProps) {
  if (isLoading) {
    return (
      <div className="flex gap-2 items-end h-60 w-full pt-4">
        {[...Array(10)].map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 bg-slate-100 rounded-t-sm"
            style={{ height: `${Math.max(20, Math.random() * 100)}%` }}
          />
        ))}
      </div>
    );
  }

  // If no data
  if (!data || data.length === 0) {
    return (
      <div className="h-60 w-full flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-slate-100 rounded-lg">
        No sales data available today
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 240 }} className="min-h-0 min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval={1}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Bar
            dataKey="sales"
            fill="#2563EB"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            activeBar={{ fill: '#1d4ed8' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
