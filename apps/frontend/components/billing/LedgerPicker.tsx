'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { voucherApi } from '@/lib/apiClient';
import { Ledger, FamilyMember } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { CreateLedgerModal } from '@/components/accounts/CreateLedgerModal';

interface LedgerPickerProps {
    currentLedger: Ledger | null;
    /** `member` is set when a row for one person of a shared family ledger was chosen (see expandFamilyMembers). */
    onSelect: (ledger: Ledger | null, member?: FamilyMember | null) => void;
    /** List a shared family ledger as one row per person (name, age, relationship) instead of one row for the ledger. */
    expandFamilyMembers?: boolean;
    defaultGroupName?: string;
    icon: React.ReactNode;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    inputRef?: React.RefObject<HTMLInputElement>;
    nextInputRef?: React.RefObject<HTMLInputElement>;
    /** Billing: open the customer popup (pre-filled with what was typed) instead of the generic ledger form. */
    onAddNew?: (query: string) => void;
    /** Billing: when the search matched a family member (by name or mobile), hand that person back with the ledger. */
    matchFamilyMember?: boolean;
    /** Show the "Family: …" hint on rows. Off for wholesale, which bills one party. Default on. */
    showFamily?: boolean;
}

export function LedgerPicker({ 
    currentLedger, 
    onSelect, 
    expandFamilyMembers = false,
    onAddNew,
    matchFamilyMember = false,
    showFamily = true,
    defaultGroupName, 
    icon, 
    placeholder = 'Search...',
    className,
    autoFocus,
    inputRef: externalInputRef,
    nextInputRef
}: LedgerPickerProps) {
    const outletId = useOutletId();
    
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const internalInputRef = useRef<HTMLInputElement>(null);
    const inputRef = externalInputRef || internalInputRef;

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Close on click/tap outside (handles both touch and mouse events)
    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('pointerdown', handleClickOutside);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Fetch ledgers
    const { data, isFetching } = useQuery({
        queryKey: ['ledgers', 'search', defaultGroupName, debouncedQuery, outletId],
        queryFn: async () => {
            if (!outletId) return [];
            // If defaultGroupName is provided, we filter by it. Otherwise fetch all or let the user search.
            const res = await voucherApi.getLedgers(outletId, { 
                group: defaultGroupName, 
                search: debouncedQuery || undefined,
                limit: 50
            });
            return res as Ledger[];
        },
        enabled: isOpen && !!outletId,
    });

    // One row per person for a shared family ledger, so typing the family's mobile number lists Rahul, Priya and Rohan.
    // Memoised: the highlight-reset effect below depends on this list's identity, and a new array every render would
    // snap the highlight back to the first row after each key press.
    type Row = { key: string; ledger: Ledger; member?: FamilyMember };
    const rows: Row[] = useMemo(() => (data || []).flatMap((l): Row[] =>
        expandFamilyMembers && l.isFamilyAccount && (l.familyMembers?.length ?? 0) > 0
            ? l.familyMembers!.map((m) => ({ key: `${l.id}:${m.id}`, ledger: l, member: m }))
            : [{ key: l.id, ledger: l }]
    ), [data, expandFamilyMembers]);
    const ledgers = rows;

    // Reset highlighted index when ledgers list updates
    useEffect(() => {
        if (ledgers.length > 0) {
            setHighlightedIndex(0);
        } else {
            setHighlightedIndex(-1);
        }
    }, [ledgers]);

    const handleSelect = (row: Row | null) => {
        // Plain rows call onSelect(ledger) exactly as before; only a family row adds the person.
        if (!row) onSelect(null);
        else if (row.member) onSelect(row.ledger, row.member);
        else if (matchFamilyMember) {
            // searching "priya" or her own mobile finds the family; start the bill for her, not for the account owner
            const q = searchQuery.trim().toLowerCase();
            const hit = q.length >= 2
                ? row.ledger.familyMembers?.find((m) => !m.isAccountHolder && (m.name.toLowerCase().includes(q) || (m.phone ?? '').includes(q)))
                : undefined;
            if (hit) onSelect(row.ledger, hit); else onSelect(row.ledger);
        }
        else onSelect(row.ledger);
        setIsOpen(false);
        setHighlightedIndex(-1);
        setSearchQuery('');
        
        if (nextInputRef?.current) {
            setTimeout(() => {
                nextInputRef.current?.focus();
            }, 10);
        }
    };

    const handleCreateLedger = (ledger: Ledger) => {
        onSelect(ledger);
        setIsCreateOpen(false);
        setIsOpen(false);
        setHighlightedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
            } else if (ledgers.length > 0) {
                setHighlightedIndex(prev => (prev < ledgers.length - 1 ? prev + 1 : 0));
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (isOpen && ledgers.length > 0) {
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : ledgers.length - 1));
            }
            return;
        }

        if (e.key === 'Enter') {
            if (isOpen && ledgers.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const targetIdx = (highlightedIndex >= 0 && highlightedIndex < ledgers.length)
                    ? highlightedIndex
                    : 0;
                handleSelect(ledgers[targetIdx]);
            }
            return;
        }

        if (e.key === 'Escape') {
            setIsOpen(false);
            setHighlightedIndex(-1);
            inputRef.current?.blur();
            return;
        }
    };

    if (currentLedger) {
        return (
            <div className={cn("w-full h-9 pl-8 pr-3 border-2 border-blue-400 rounded flex items-center justify-between bg-blue-50/50", className)}>
                <div className="absolute left-2.5 top-2.5 text-blue-500">
                    {icon}
                </div>
                <div className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-blue-900 text-sm truncate">{currentLedger.name}</span>
                    {currentLedger.phone && (
                        <span className="text-[10px] bg-white text-slate-800 px-1.5 py-0.5 rounded font-bold shrink-0">{currentLedger.phone}</span>
                    )}
                </div>
                {/* Hidden input to maintain focus flow and Enter-to-advance */}
                <input 
                    ref={inputRef}
                    className="opacity-0 absolute w-0 h-0"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            nextInputRef?.current?.focus();
                        }
                    }}
                />
                <button 
                    type="button"
                    className="text-xs text-blue-700 hover:text-blue-900 font-bold uppercase tracking-wider ml-2 shrink-0 px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 active:bg-blue-300 transition-colors" 
                    onPointerDown={(e) => {
                        e.preventDefault();
                        handleSelect(null);
                    }}
                    onClick={() => handleSelect(null)}
                >
                    Change
                </button>
            </div>
        );
    }

    const handleBlur = (e: React.FocusEvent) => {
        // If focus moved to an element inside container, don't close
        if (e.relatedTarget && containerRef.current?.contains(e.relatedTarget as Node)) {
            return;
        }
        // Small timeout so tap/touch events on dropdown items can register before closing
        setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) {
                setIsOpen(false);
            }
        }, 150);
    };

    return (
        <div className="relative w-full" ref={containerRef} onBlur={handleBlur}>
            <div className="absolute left-2.5 top-2.5 text-slate-400">
                {icon}
            </div>
            <Input 
                ref={inputRef}
                autoFocus={autoFocus}
                className={cn("w-full h-9 pl-8 pr-3 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-blue-500 font-medium placeholder:text-slate-400 text-sm", className)}
                placeholder={placeholder}
                value={searchQuery}
                onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!isOpen) setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onClick={() => {
                    if (!isOpen) setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
            />

            {isOpen && (
                <div className="absolute top-full left-0 right-0 w-full min-w-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="max-h-60 overflow-y-auto p-1 overscroll-contain touch-pan-y">
                        {isFetching ? (
                            <div className="flex items-center justify-center py-4 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : ledgers.length > 0 ? (
                            ledgers.map((row, idx) => {
                                const ledger = row.ledger;
                                const member = row.member;
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <div 
                                        key={row.key}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            handleSelect(row);
                                        }}
                                        onClick={() => handleSelect(row)}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={cn(
                                            "px-3 py-3 min-h-[48px] cursor-pointer rounded flex flex-col group transition-colors select-none",
                                            isHighlighted 
                                                ? "bg-blue-100 ring-1 ring-blue-300" 
                                                : "hover:bg-blue-50 active:bg-blue-100"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                "text-sm font-bold",
                                                isHighlighted ? "text-blue-900" : "text-slate-700 group-hover:text-blue-700"
                                            )}>{member ? member.name : ledger.name}{member && (
                                                <span className="font-medium text-slate-500">
                                                    {' '}({[member.age != null ? `${member.age}y` : null, member.gender, member.relationship].filter(Boolean).join(' · ')})
                                                </span>
                                            )}</span>
                                            {ledger.phone && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{ledger.phone}</span>}
                                        </div>
                                        <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                                            {member
                                                ? `${ledger.name} • Balance: ₹${Number(ledger.currentBalance || 0).toLocaleString('en-IN')}`
                                                : <>
                                                    {ledger.groupName} {ledger.address && `• ${ledger.address}`}
                                                    {showFamily && ledger.isFamilyAccount && (ledger.familyMembers?.length ?? 0) > 1 && (
                                                        <span className="text-indigo-500 font-semibold"> • Family: {ledger.familyMembers!.map((m) => m.name.split(' ')[0]).join(', ')}</span>
                                                    )}
                                                </>}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="px-3 py-4 text-center text-sm text-slate-500 font-medium">
                                {onAddNew && searchQuery.trim() ? (
                                    <div className="space-y-2">
                                        <p>No customer found for <b>{searchQuery.trim()}</b>.</p>
                                        <button type="button" data-testid="add-new-customer-prompt"
                                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                                            onPointerDown={(e) => e.preventDefault()}
                                            onClick={() => { const q = searchQuery.trim(); setIsOpen(false); onAddNew(q); }}>
                                            <Plus className="w-3.5 h-3.5" /> Add New Customer
                                        </button>
                                    </div>
                                ) : <>No {defaultGroupName || 'records'} found</>}
                            </div>
                        )}
                    </div>

                    <div className="p-2 bg-slate-50 border-t border-slate-100">
                        <button 
                            type="button"
                            className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[40px] text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded transition-colors border border-blue-100 select-none"
                            onPointerDown={(e) => {
                                if (e.pointerType === 'mouse') {
                                    e.preventDefault();
                                }
                            }}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsOpen(false);
                                if (onAddNew) onAddNew(searchQuery.trim());
                                else setIsCreateOpen(true);
                            }}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            ADD NEW {onAddNew ? 'CUSTOMER' : defaultGroupName ? defaultGroupName.replace('Sundry ', '').toUpperCase() : 'RECORD'}
                        </button>
                    </div>
                </div>
            )}

            {isCreateOpen && outletId && (
                <CreateLedgerModal 
                    outletId={outletId}
                    initialName={searchQuery}
                    defaultGroupName={defaultGroupName}
                    isQuickCustomerMode={defaultGroupName === 'Sundry Debtors'}
                    onSave={handleCreateLedger}
                    onClose={() => setIsCreateOpen(false)}
                />
            )}
        </div>
    );
}
