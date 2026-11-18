'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchLedgerProducts } from '@/lib/stockLedgerApi';
import type { ProductHit } from '@/lib/stockLedger';
import { cn } from '@/lib/utils';

interface Props {
    outletId: string;
    /** the product being looked at, if any */
    selectedName: string | null;
    onPick: (product: ProductHit) => void;
    onClear: () => void;
}

const DELAY_MS = 250;

/**
 * "Find a product or a batch number": product first, then its batches (the way Tally, Zoho and SAP do it), instead of a
 * list of every batch in the shop. Typing a batch number finds the product that holds it.
 */
export function ProductPicker({ outletId, selectedName, onPick, onClear }: Props) {
    const listId = useId();
    const [text, setText] = useState('');
    const [term, setTerm] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const t = setTimeout(() => setTerm(text.trim()), DELAY_MS);
        return () => clearTimeout(t);
    }, [text]);

    const enabled = !!outletId && term.length >= 2;
    const hits = useQuery({
        queryKey: ['stock-ledger-products', outletId, term],
        queryFn: ({ signal }) => fetchLedgerProducts(outletId, term, signal),
        enabled,
        staleTime: 30_000,
    });
    const results = enabled ? hits.data ?? [] : [];

    useEffect(() => { setActive(0); }, [term]);
    useEffect(() => {
        const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', away);
        return () => document.removeEventListener('mousedown', away);
    }, []);

    const choose = (p: ProductHit) => { onPick(p); setText(''); setTerm(''); setOpen(false); };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); choose(results[active]); }
        else if (e.key === 'Escape') setOpen(false);
    };

    return (
        <div ref={box} className="relative">
            <label htmlFor="ledger-product" className="text-xs text-muted-foreground">Product or batch number</label>
            <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                    id="ledger-product" name="product-search" role="combobox" aria-expanded={open && enabled} aria-controls={listId} aria-autocomplete="list"
                    aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
                    type="search" autoComplete="off" spellCheck={false} value={text}
                    placeholder={selectedName ? `Looking at ${selectedName}. Search another…` : 'Search a product, or a batch number…'}
                    onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
                    className="h-10 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
                />
                {text && <button type="button" aria-label="Clear search" onClick={() => { setText(''); setTerm(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
            </div>

            {open && enabled && (
                <ul id={listId} role="listbox" aria-label="Matching products" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {hits.isFetching && results.length === 0 && <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…</li>}
                    {!hits.isFetching && results.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{hits.isError ? 'Could not search. Try again.' : `No product or batch matches “${term}”.`}</li>}
                    {results.map((p, i) => (
                        <li key={p.id} role="presentation">
                            <button type="button" id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => choose(p)} onMouseEnter={() => setActive(i)}
                                className={cn('flex min-h-11 w-full items-center gap-3 rounded px-2.5 py-1.5 text-left', i === active && 'bg-muted')}>
                                <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{p.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{p.manufacturer ? `${p.manufacturer} · ` : ''}{p.batch_count} {p.batch_count === 1 ? 'batch' : 'batches'}, {p.stocked_batches} in stock</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {selectedName && (
                <button type="button" onClick={onClear} className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground">
                    <X className="h-3 w-3" aria-hidden="true" /> Show every product again
                </button>
            )}
        </div>
    );
}
