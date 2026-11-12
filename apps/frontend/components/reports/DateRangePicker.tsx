'use client';

import { useState } from 'react';
import { differenceInDays, format } from 'date-fns';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangeFilter, ReportPeriod } from '@/types';
import { getDateRangeForPeriod } from '@/hooks/useReports';
import { Input } from '@/components/ui/input';

interface DateRangePickerProps {
    value: DateRangeFilter;
    onChange: (range: DateRangeFilter) => void;
}

const PERIOD_LABELS: { key: ReportPeriod; label: string }[] = [
    { key: 'today',      label: 'Today' },
    { key: 'yesterday',  label: 'Yesterday' },
    { key: 'this_week',  label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_year',  label: 'This Year' },
    { key: 'custom',     label: 'Custom' },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
    const [customFrom, setCustomFrom] = useState(value.from);
    const [customTo, setCustomTo] = useState(value.to);

    const today = format(new Date(), 'yyyy-MM-dd');

    const handlePeriodClick = (period: ReportPeriod) => {
        if (period === 'custom') {
            onChange({ from: customFrom, to: customTo, period: 'custom' });
        } else {
            onChange(getDateRangeForPeriod(period));
        }
    };

    const handleCustomFrom = (v: string) => {
        setCustomFrom(v);
        if (v <= customTo) {
            onChange({ from: v, to: customTo, period: 'custom' });
        }
    };

    const handleCustomTo = (v: string) => {
        setCustomTo(v);
        if (customFrom <= v) {
            onChange({ from: customFrom, to: v, period: 'custom' });
        }
    };

    const dayCount = differenceInDays(new Date(value.to), new Date(value.from)) + 1;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {PERIOD_LABELS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => handlePeriodClick(key)}
                        className={cn(
                            'px-3 py-1 rounded-full text-sm font-medium transition-colors',
                            value.period === key
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                    >
                        {label}
                    </button>
                ))}

                {/* Active range label */}
                <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(value.from), 'd MMM')} – {format(new Date(value.to), 'd MMM yyyy')}
                    {' '}({dayCount} day{dayCount !== 1 ? 's' : ''})
                </span>
            </div>

            {/* Custom date inputs */}
            {value.period === 'custom' && (
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">From</span>
                        <Input
                            type="date"
                            value={customFrom}
                            max={today}
                            onChange={e => handleCustomFrom(e.target.value)}
                            className="w-40 text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">To</span>
                        <Input
                            type="date"
                            value={customTo}
                            max={today}
                            min={customFrom}
                            onChange={e => handleCustomTo(e.target.value)}
                            className="w-40 text-sm"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
