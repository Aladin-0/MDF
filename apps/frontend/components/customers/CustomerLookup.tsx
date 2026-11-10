'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface LookupResult {
    id: string;
    name: string;
    phone: string;
    /** e.g. "3 family members" / "Owes ₹1,200" */
    detail?: string;
}

interface Props {
    outletId: string;
    /** owners = who can be the account owner (anyone not already a member); people = a person to put under an account */
    mode: 'owners' | 'people';
    excludeId?: string;
    placeholder?: string;
    onPick: (r: LookupResult) => void;
    autoFocus?: boolean;
    className?: string;
    ariaLabel?: string;
}

const money = (n?: number) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '');

/** Search customers by name or mobile. Autofill is switched off: the browser's saved-address popup used to cover the results. */
export function CustomerLookup({ outletId, mode, excludeId, placeholder, onPick, autoFocus, className, ariaLabel = 'Search customers' }: Props) {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<LookupResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const seq = useRef(0);

    useEffect(() => {
        const q = term.trim();
        if (q.length < 2) { setResults(null); return; }
        const mine = ++seq.current;
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await api.get('/customers/search/', {
                    params: { outletId, q, ...(mode === 'owners' ? { accountOwners: 1 } : {}), ...(excludeId ? { excludeId } : {}) },
                });
                if (mine !== seq.current) return;           // a newer search is already running
                const rows: LookupResult[] = (res.data as any[])
                    .filter((r) => r.id !== excludeId && !(mode === 'people' && r.isFamilyMember))
                    .map((r) => ({
                        id: r.id, name: r.name, phone: r.phone,
                        detail: mode === 'owners'
                            ? [r.isFamilyAccount ? 'Shared account' : null, r.memberCount ? `${r.memberCount} family member${r.memberCount > 1 ? 's' : ''}` : null, r.outstanding > 0 ? `Owes ${money(r.outstanding)}` : null].filter(Boolean).join(' · ')
                            : [r.age != null ? `${r.age}y` : null, r.relationship].filter(Boolean).join(' · '),
                    }));
                setResults(rows);
                setHighlight(0);
            } finally {
                if (mine === seq.current) setLoading(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [term, outletId, mode, excludeId]);

    const pick = (r: LookupResult) => { onPick(r); setTerm(''); setResults(null); };

    return (
        <div className={cn('relative', className)}>
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
                aria-label={ariaLabel}
                // "off" + a name Chrome does not recognise: otherwise its saved-address list pops up over our results
                autoComplete="off" name="customer-lookup" data-lpignore="true" data-form-type="other"
                autoFocus={autoFocus}
                className="pl-9 pr-9"
                placeholder={placeholder ?? 'Type a name or mobile number…'}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                    if (!results?.length) return;
                    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
                    if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]); }
                }}
            />
            {loading && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />}

            {term.trim().length >= 2 && results && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 p-1 max-h-60 overflow-y-auto">
                    {results.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-slate-500 font-medium">
                            No customer found for “{term.trim()}”. {mode === 'owners' ? 'Add that customer first, or choose "Own account".' : 'Add them as a new person instead.'}
                        </p>
                    ) : results.map((r, i) => (
                        <div key={r.id} role="button" tabIndex={-1} onMouseEnter={() => setHighlight(i)} onClick={() => pick(r)}
                            className={cn('px-3 py-3 min-h-[48px] cursor-pointer rounded flex flex-col transition-colors select-none',
                                i === highlight ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-blue-50')}>
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn('text-sm font-bold truncate', i === highlight ? 'text-blue-900' : 'text-slate-700')}>{r.name}</span>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{r.phone}</span>
                            </div>
                            {r.detail && <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{r.detail}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
