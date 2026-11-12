'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TXN_TYPES, isRangeValid, type LedgerFilters } from '@/lib/stockLedger';

interface FilterBarProps {
    filters: LedgerFilters;
    onChange: (patch: Partial<LedgerFilters>) => void;
    hasFilters: boolean;
    onClear: () => void;
}

const ALL = 'all'; // Radix Select cannot hold an empty-string value

const SEARCH_DELAY_MS = 350;

export function FilterBar({ filters, onChange, hasFilters, onClear }: FilterBarProps) {
    // The box is typed into immediately; the URL (and so the request) follows after a short pause.
    const [text, setText] = useState(filters.q);
    const pushed = useRef(filters.q);

    useEffect(() => {
        // the URL changed from outside (Clear, Back button): show it, unless it is just our own push coming back
        if (filters.q !== pushed.current) {
            pushed.current = filters.q;
            setText(filters.q);
        }
    }, [filters.q]);

    useEffect(() => {
        if (text.trim() === pushed.current) return;
        const t = setTimeout(() => {
            pushed.current = text.trim();
            onChange({ q: text });
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(t);
    }, [text, onChange]);

    const rangeBad = !!filters.from && !!filters.to && !isRangeValid(filters.from, filters.to);

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="ledger-from" className="text-xs text-muted-foreground">From</Label>
                    <Input
                        id="ledger-from"
                        name="from"
                        type="date"
                        value={filters.from}
                        max={filters.to || undefined}
                        onChange={(e) => onChange({ from: e.target.value })}
                        aria-invalid={rangeBad || undefined}
                        aria-describedby={rangeBad ? 'ledger-range-error' : undefined}
                        className="w-[10.5rem]"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="ledger-to" className="text-xs text-muted-foreground">To</Label>
                    <Input
                        id="ledger-to"
                        name="to"
                        type="date"
                        value={filters.to}
                        min={filters.from || undefined}
                        onChange={(e) => onChange({ to: e.target.value })}
                        aria-invalid={rangeBad || undefined}
                        aria-describedby={rangeBad ? 'ledger-range-error' : undefined}
                        className="w-[10.5rem]"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="ledger-type" className="text-xs text-muted-foreground">Type</Label>
                    <Select value={filters.type || ALL} onValueChange={(v) => onChange({ type: v === ALL ? '' : v })}>
                        <SelectTrigger id="ledger-type" className="w-[11rem]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All Types</SelectItem>
                            {TXN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="min-w-[14rem] flex-1 space-y-1.5">
                    <Label htmlFor="ledger-search" className="text-xs text-muted-foreground">Search</Label>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                            id="ledger-search"
                            name="q"
                            type="search"
                            autoComplete="off"
                            spellCheck={false}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Product, batch, voucher or party…"
                            className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
                        />
                        {text && (
                            <button
                                type="button"
                                onClick={() => setText('')}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>

                {hasFilters && (
                    <Button type="button" variant="ghost" onClick={onClear}>
                        <X aria-hidden="true" /> Clear Filters
                    </Button>
                )}
            </div>

            {rangeBad && (
                <p id="ledger-range-error" role="alert" className="text-sm text-destructive">
                    The start date must be on or before the end date. Change one of them to see results.
                </p>
            )}
        </div>
    );
}
