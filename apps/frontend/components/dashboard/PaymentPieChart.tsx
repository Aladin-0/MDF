'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardKPI } from '@/types';
import { formatCurrency } from '@/lib/gst';

interface PaymentPieChartProps {
  kpi?: DashboardKPI;
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = payload[0].payload.totalContext || 1; // Passed down via data mapping hack if needed, or we just show absolute
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 min-w-[120px]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
          <p className="font-semibold text-slate-800 text-sm">{data.name}</p>
        </div>
        <p className="text-sm text-slate-900 font-medium">
          {formatCurrency(data.value)}
        </p>
      </div>
    );
  }
  return null;
};

export default function PaymentPieChart({ kpi, isLoading }: PaymentPieChartProps) {
  if (isLoading || !kpi) {
    return (
      <div className="h-[260px] w-full flex flex-col items-center justify-center gap-6 pt-4">
        <Skeleton className="w-40 h-40 rounded-full" />
        <div className="flex gap-4">
          <Skeleton className="w-16 h-4" />
          <Skeleton className="w-16 h-4" />
        </div>
      </div>
    );
  }

  const rawData = [
    { name: 'Cash', value: kpi.cashCollected, color: '#16a34a' },
    { name: 'UPI', value: kpi.upiCollected, color: '#2563eb' },
    { name: 'Card', value: kpi.cardCollected, color: '#7c3aed' },
    { name: 'Credit', value: kpi.creditGiven, color: '#d97706' },
  ];

  const chartData = rawData.filter((d) => d.value > 0);
  const chartTotal = chartData.reduce((acc, curr) => acc + curr.value, 0);

  if (chartTotal === 0) {
    return (
      <div className="h-[260px] w-full flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-slate-100 rounded-lg">
        No payment data available
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center min-h-0 min-w-0">
      <div className="relative w-full h-[200px] min-h-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Label Absolute */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-slate-900 block translate-y-1">
            {formatCurrency(chartTotal)}
          </span>
          <span className="text-xs text-muted-foreground font-medium">Total</span>
        </div>
      </div>

      {/* Custom Legend */}
      <div className="flex flex-wrap gap-3 justify-center mt-4">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="font-medium text-slate-700">{item.name}</span>
            <span className="text-muted-foreground hidden sm:inline ml-0.5">({Math.round((item.value / chartTotal) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
