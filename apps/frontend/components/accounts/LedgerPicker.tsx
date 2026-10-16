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
    autoFocus?: boolean;
    variant?: 'default' | 'ghost';
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
    autoFocus,
    variant = 'default',
}: LedgerPickerProps) {
    const outletId = useOutletId();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open || !outletId) return;
        let cancelled = false;
        setLoading(true);

        let params: { voucherType?: string; search?: string; type?: string; group?: string; filterGroup?: string; limit?: number } = { limit: 50 };
        if (group) {
            // Direct group filter — used for Sundry Creditors / Sundry Debtors pickers
            params.group = group;
        } else if (filterGroup === 'cashbank') {
            params.filterGroup = 'cashbank';
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
    }, [open, outletId, voucherType, filterGroup, search, group]);

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

    const handleBlur = (e: React.FocusEvent) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setOpen(false);
            searchRef.current?.blur();
        }
        if (e.key === 'Enter' && ledgers.length > 0) {
            select(ledgers[0]);
        }
    };

    if (value) {
        if (variant === 'ghost') {
            return (
                <>
                    <div className={cn(
                        "relative w-full h-8 px-2 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus-within:border-primary bg-transparent rounded-none flex items-center justify-between transition-colors group",
                        className
                    )}>
                        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                            <span className="font-semibold text-sm text-foreground truncate">{value.name}</span>
                            <span className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded font-normal shrink-0">
                                {value.groupName}
                            </span>
                        </div>
                        <button 
                            type="button"
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded transition-opacity shrink-0 ml-1.5" 
                            onClick={clear}
                            title="Change ledger"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
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

        return (
            <>
                <div className={cn("relative w-full h-10 pl-8 pr-3 border border-input rounded-md flex items-center justify-between bg-background", className)}>
                    <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                        <Search className="w-4 h-4 shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 truncate flex-1">
                        <span className="font-medium text-sm truncate">{value.name}</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-bold shrink-0">{value.groupName}</span>
                    </div>
                    <button 
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2" 
                        onClick={clear}
                    >
                        <X className="w-4 h-4" />
                    </button>
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

    if (variant === 'ghost') {
        return (
            <>
                <div className={cn('relative w-full', className)} ref={containerRef} onBlur={handleBlur}>
                    <input
                        ref={searchRef}
                        autoFocus={autoFocus}
                        className="w-full h-8 px-2 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-primary focus:bg-background focus:outline-none shadow-none rounded-none bg-transparent text-sm placeholder:text-muted-foreground/60 transition-colors"
                        placeholder={placeholder}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            if (!open) setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={handleKeyDown}
                    />

                    {open && (
                        <div className="absolute z-50 mt-1 min-w-[280px] w-full rounded-md border bg-popover shadow-lg left-0 top-full">
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
                                            'w-full flex flex-col items-start px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left'
                                        )}
                                    >
                                        <span className="font-semibold text-foreground">{ledger.name}</span>
                                        <span className="text-[11px] text-muted-foreground">{ledger.groupName}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="border-t px-3 py-1.5 bg-muted/20">
                                <button
                                    type="button"
                                    className="text-xs text-primary hover:underline font-medium"
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

    return (
        <>
            <div className={cn('relative', className)} ref={containerRef} onBlur={handleBlur}>
                <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                    <Search className="w-4 h-4 shrink-0 mt-0.5" />
                </div>
                <input
                    ref={searchRef}
                    autoFocus={autoFocus}
                    className="w-full h-10 pl-9 pr-3 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 text-sm placeholder:text-muted-foreground"
                    placeholder={placeholder}
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                />

                {open && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md left-0 right-0 top-full">
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
                                        'w-full flex flex-col items-start px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors'
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
