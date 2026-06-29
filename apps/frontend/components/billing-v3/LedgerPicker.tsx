'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { voucherApi } from '@/lib/apiClient';
import { Ledger } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { CreateLedgerModal } from '@/components/accounts/CreateLedgerModal';

interface LedgerPickerProps {
    currentLedger: Ledger | null;
    onSelect: (ledger: Ledger | null) => void;
    defaultGroupName?: string;
    icon: React.ReactNode;
    placeholder?: string;
    className?: string;
}

export function LedgerPicker({ 
    currentLedger, 
    onSelect, 
    defaultGroupName, 
    icon, 
    placeholder = 'Search...',
    className 
}: LedgerPickerProps) {
    const outletId = useOutletId();
    
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch ledgers
    const { data, isFetching } = useQuery({
        queryKey: ['ledgers', 'search', defaultGroupName, debouncedQuery, outletId],
        queryFn: async () => {
            if (!outletId) return [];
            // If defaultGroupName is provided, we filter by it. Otherwise fetch all or let the user search.
            const res = await voucherApi.getLedgers(outletId, { 
                group: defaultGroupName, 
                search: debouncedQuery || undefined 
            });
            // Let's only return top 5-10 for the dropdown
            return (res as Ledger[]).slice(0, 10);
        },
        enabled: isOpen && !!outletId,
    });

    const ledgers = data || [];

    const handleSelect = (ledger: Ledger | null) => {
        onSelect(ledger);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleCreateLedger = (ledger: Ledger) => {
        onSelect(ledger);
        setIsCreateOpen(false);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
        }
        if (e.key === 'Enter' && ledgers.length > 0) {
            handleSelect(ledgers[0]);
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
                <button 
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold uppercase tracking-wider ml-2 shrink-0" 
                    onClick={() => handleSelect(null)}
                >
                    Change
                </button>
            </div>
        );
    }

    const handleBlur = (e: React.FocusEvent) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={containerRef} onBlur={handleBlur}>
            <div className="absolute left-2.5 top-2.5 text-slate-400">
                {icon}
            </div>
            <Input 
                ref={inputRef}
                className={cn("w-full h-9 pl-8 pr-3 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-blue-500 font-medium placeholder:text-slate-400 text-sm", className)}
                placeholder={placeholder}
                value={searchQuery}
                onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!isOpen) setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
            />

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="max-h-60 overflow-y-auto p-1">
                        {isFetching ? (
                            <div className="flex items-center justify-center py-4 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : ledgers.length > 0 ? (
                            ledgers.map(ledger => (
                                <div 
                                    key={ledger.id}
                                    onClick={() => handleSelect(ledger)}
                                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer rounded flex flex-col group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-slate-700 group-hover:text-blue-700">{ledger.name}</span>
                                        {ledger.phone && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{ledger.phone}</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                                        {ledger.groupName} {ledger.address && `• ${ledger.address}`}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-4 text-center text-sm text-slate-500 font-medium">
                                No {defaultGroupName || 'records'} found
                            </div>
                        )}
                    </div>

                    <div className="p-2 bg-slate-50 border-t border-slate-100">
                        <button 
                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors border border-blue-100"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsOpen(false);
                                setIsCreateOpen(true);
                            }}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            ADD NEW {defaultGroupName ? defaultGroupName.replace('Sundry ', '').toUpperCase() : 'RECORD'}
                        </button>
                    </div>
                </div>
            )}

            {isCreateOpen && outletId && (
                <CreateLedgerModal 
                    outletId={outletId}
                    initialName={searchQuery}
                    defaultGroupName={defaultGroupName}
                    onSave={handleCreateLedger}
                    onClose={() => setIsCreateOpen(false)}
                />
            )}
        </div>
    );
}
