'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { voucherApi } from '@/lib/apiClient';
import { Ledger } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { CreateLedgerModal } from './CreateLedgerModal';

type FilterGroup = 'cashbank' | 'party' | undefined;

interface LedgerPickerProps {
    voucherType?: 'receipt' | 'payment' | 'contra' | 'journal';
    filterGroup?: FilterGroup;
    /** Filter by exact ledger group name, e.g. "Sundry Creditors" or "Sundry Debtors" */
    group?: string;
    value: Ledger | null;
    onChange: (ledger: Ledger | null) => void;
    placeholder?: string;
    className?: string;
    showOutstanding?: boolean;
}

export function LedgerPicker({
    voucherType,
    filterGroup,
    group,
    value,
    onChange,
    placeholder = 'Search ledger...',
    className,
    showOutstanding,
}: LedgerPickerProps) {
    const outletId = useOutletId();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // Derive the voucherType filter for cashbank pickers
    const effectiveVoucherType = filterGroup === 'cashbank' ? 'contra' : voucherType;

    useEffect(() => {
        if (!open || !outletId) return;
        let cancelled = false;
        setLoading(true);

        let params: { voucherType?: string; search?: string; type?: string; group?: string } = {};
        if (group) {
            // Direct group filter — used for Sundry Creditors / Sundry Debtors pickers
            params.group = group;
        } else if (filterGroup === 'cashbank') {
            params.voucherType = 'contra';
        } else if (filterGroup === 'party') {
            params.voucherType = voucherType;
        } else if (voucherType) {
            params.voucherType = voucherType;
        }
        if (search) params.search = search;

        voucherApi
            .getLedgers(outletId, params)
            .then((data: Ledger[]) => {
                if (!cancelled) setLedgers(data);
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, outletId, voucherType, filterGroup, search]);

    // Handle Alt+C inside the search box
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (!open) return;
            if (e.altKey && e.key === 'c') {
                e.preventDefault();
                setShowCreateModal(true);
                setOpen(false);
            }
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function select(ledger: Ledger) {
        onChange(ledger);
        setOpen(false);
        setSearch('');
    }

    function clear(e: React.MouseEvent) {
        e.stopPropagation();
        onChange(null);
    }

    function handleCreateLedger(ledger: Ledger) {
        onChange(ledger);
        setShowCreateModal(false);
    }

    return (
        <>
            <div ref={containerRef} className={cn('relative', className)}>
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className={cn(
                        'w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
                        'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                        !value && 'text-muted-foreground'
                    )}
                >
                    <span className="flex-1 truncate">
                        {value ? (
                            <span className="flex flex-col">
                                <span className="font-medium text-foreground">{value.name}</span>
                                <span className="text-xs text-muted-foreground">{value.groupName}</span>
                            </span>
                        ) : (
                            placeholder
                        )}
                    </span>
                    {value ? (
                        <X className="ml-2 h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground" onClick={clear} />
                    ) : (
                        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                </button>

                {open && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                        <div className="p-2 border-b">
                            <div className="flex items-center gap-2 px-2 py-1 rounded border bg-background">
                                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <input
                                    ref={searchRef}
                                    autoFocus
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                    placeholder="Type to search..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto py-1">
                            {loading && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
                            )}
                            {!loading && ledgers.length === 0 && (
                                <div className="px-3 py-4 text-sm text-center">
                                    <p className="text-muted-foreground">
                                        No ledger found{search ? ` for "${search}"` : ''}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Press <kbd className="px-1 py-0.5 rounded bg-muted text-xs">Alt+C</kbd> to create new ledger
                                    </p>
                                </div>
                            )}
                            {!loading && ledgers.map((ledger) => (
                                <button
                                    key={ledger.id}
                                    type="button"
                                    onClick={() => select(ledger)}
                                    className={cn(
                                        'w-full flex flex-col items-start px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                                        value?.id === ledger.id && 'bg-primary/10 text-primary'
                                    )}
                                >
                                    <span className="font-medium">{ledger.name}</span>
                                    <span className="text-xs text-muted-foreground">{ledger.groupName}</span>
                                </button>
                            ))}
                        </div>
                        <div className="border-t px-3 py-1.5">
                            <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => { setShowCreateModal(true); setOpen(false); }}
                            >
                                + Create new ledger (Alt+C)
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showCreateModal && outletId && (
                <CreateLedgerModal
                    initialName={search}
                    outletId={outletId}
                    defaultGroupName={group}
                    isQuickCustomerMode={group === 'Sundry Debtors'}
                    onSave={handleCreateLedger}
                    onClose={() => setShowCreateModal(false)}
                />
            )}
        </>
    );
}
