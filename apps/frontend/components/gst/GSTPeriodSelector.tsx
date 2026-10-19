import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useGSTStore } from '@/store/gstStore';

interface GSTPeriodSelectorProps {
    selectedPeriod?: string | null;
    onSelectPeriod?: (period: string) => void;
}

export function GSTPeriodSelector({ selectedPeriod: propSelectedPeriod, onSelectPeriod }: GSTPeriodSelectorProps = {}) {
    const { periods, selectedPeriod: storeSelectedPeriod, fetchPeriods, setSelectedPeriod, loading } = useGSTStore();

    useEffect(() => {
        fetchPeriods();
    }, [fetchPeriods]);

    const activePeriod = propSelectedPeriod !== undefined ? propSelectedPeriod : storeSelectedPeriod;

    const handlePeriodClick = (periodValue: string) => {
        setSelectedPeriod(periodValue);
        if (onSelectPeriod) {
            onSelectPeriod(periodValue);
        }
    };

    const formatPeriod = (fp: string) => {
        try {
            const date = parse(fp, 'MMyyyy', new Date());
            return format(date, 'MMM yyyy');
        } catch {
            return fp;
        }
    };

    if (loading && periods.length === 0) {
        return <div className="text-sm text-slate-500 animate-pulse">Loading periods...</div>;
    }

    if (!periods || periods.length === 0) {
        return <div className="text-sm text-slate-500">No GST periods available.</div>;
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {periods.map(p => {
                const periodValue = typeof p === 'string' ? p : p.period;
                const status = typeof p === 'string' ? 'draft' : (p.status || 'draft');
                
                const isSelected = Boolean(activePeriod && periodValue === activePeriod);
                const isValidated = status === 'validated';
                
                return (
                    <button
                        key={periodValue}
                        onClick={() => handlePeriodClick(periodValue)}
                        className={cn(
                            "relative flex items-center gap-1.5 px-3 py-1.5 h-8 rounded-md border text-xs sm:text-sm font-medium transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-primary/50",
                            isSelected 
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white text-slate-700 border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                        )}
                    >
                        <span>{formatPeriod(periodValue)}</span>
                        
                        {isValidated ? (
                            <CheckCircle2 className={cn("w-3.5 h-3.5", isSelected ? "text-primary-foreground" : "text-green-500")} />
                        ) : (
                            <AlertCircle className={cn("w-3.5 h-3.5", isSelected ? "text-primary-foreground" : "text-amber-500")} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

