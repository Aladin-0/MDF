'use client';

import { Search, LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface CustomerFiltersBarProps {
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    activeFilter: 'all' | 'chronic' | 'outstanding';
    onFilterChange: (filter: 'all' | 'chronic' | 'outstanding') => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    sortBy: string;
    onSortChange: (sort: string) => void;
    totalCount?: number;
    chronicCount?: number;
    outstandingCount?: number;
}

const FILTERS: { key: 'all' | 'chronic' | 'outstanding'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'chronic', label: 'Chronic' },
    { key: 'outstanding', label: 'With Dues' },
];

export default function CustomerFiltersBar({
    viewMode, onViewModeChange,
    activeFilter, onFilterChange,
    searchQuery, onSearchChange,
    sortBy, onSortChange,
    totalCount, chronicCount, outstandingCount,
}: CustomerFiltersBarProps) {
    const getCount = (key: string) => {
        if (key === 'all') return totalCount;
        if (key === 'chronic') return chronicCount;
        if (key === 'outstanding') return outstandingCount;
        return undefined;
    };

    return (
        <div className="flex gap-3 flex-wrap items-center">
            {/* Search */}
            <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search name, phone, address..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                    const count = getCount(f.key);
                    return (
                        <button
                            key={f.key}
                            onClick={() => onFilterChange(f.key)}
                            className={cn(
                                'px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-colors',
                                activeFilter === f.key
                                    ? 'bg-primary text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            )}
                        >
                            {f.label}{count !== undefined ? ` (${count})` : ''}
                        </button>
                    );
                })}
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={onSortChange}>
                <SelectTrigger className="flex-1 min-w-0 sm:flex-none sm:w-44">
                    <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="name">Name A→Z</SelectItem>
                    <SelectItem value="totalPurchases">Highest Purchases</SelectItem>
                    <SelectItem value="outstanding">Highest Outstanding</SelectItem>
                    <SelectItem value="nextRefill">Refill Due Soon</SelectItem>
                </SelectContent>
            </Select>

            {/* View toggle */}
            <div className="flex gap-1 ml-auto">
                <button
                    onClick={() => onViewModeChange('grid')}
                    className={cn(
                        'p-2.5 sm:p-2 rounded-lg transition-colors',
                        viewMode === 'grid' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    )}
                >
                    <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                    onClick={() => onViewModeChange('list')}
                    className={cn(
                        'p-2.5 sm:p-2 rounded-lg transition-colors',
                        viewMode === 'list' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    )}
                >
                    <List className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
