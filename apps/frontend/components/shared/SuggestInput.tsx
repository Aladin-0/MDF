'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useCatalogSuggestions } from '@/hooks/useCatalogSuggestions';
import { cn } from '@/lib/utils';
import type { ProductSuggestion, SuggestField } from '@/types';

interface SuggestInputProps {
    /** Which catalogue field the options come from */
    field: SuggestField;
    value: string;
    /** Every keystroke, and the chosen option's text */
    onChange: (text: string) => void;
    /** An option was chosen (a composition option also carries its usual HSN / GST / schedule) */
    onPick?: (suggestion: ProductSuggestion) => void;
    id?: string;
    placeholder?: string;
    className?: string;
    maxLength?: number;
    disabled?: boolean;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    name?: string;
    'data-testid'?: string;
}

/** The matching part of an option in bold, so the eye finds why it was offered */
export function Highlight({ text, query }: { text: string; query: string }) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return <>{text}</>;
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
    return (
        <>
            {text.split(re).map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-extrabold">{part}</strong> : <span key={i}>{part}</span>))}
        </>
    );
}

/** "49 products · HSN 3004 · GST 5%" under a composition option; "423 products" under a manufacturer */
export function describeSuggestion(s: ProductSuggestion): string {
    const parts = [`${s.count.toLocaleString('en-IN')} ${s.count === 1 ? 'product' : 'products'}`];
    if (s.hsnCode) parts.push(`HSN ${s.hsnCode}`);
    if (s.gstRate != null) parts.push(`GST ${s.gstRate}%`);
    if (s.scheduleType) parts.push(`Schedule ${s.scheduleType}`);
    return parts.join(' · ');
}

/**
 * A text box that offers the catalogue's own values while you type (the manufacturers and compositions already used by other products), so
 * names are picked, not retyped. It stays an ordinary text box: anything can still be typed, the list never blocks, and if the server
 * cannot be reached there is simply no list.
 *
 * It is an ARIA combobox: ArrowDown / ArrowUp move through the options, Enter takes the highlighted one, Escape closes only the list,
 * Tab moves on without choosing. The list is a popover, so it floats over a scrolling dialog and flips above the box when the phone keyboard
 * leaves no room below. Options are at least 44px tall on touch screens and picking one does not close the keyboard.
 */
export function SuggestInput({ field, value, onChange, onPick, id, placeholder, className, maxLength, disabled, name, ...rest }: SuggestInputProps) {
    const autoId = useId();
    const inputId = id || `suggest-${autoId}`;
    const listId = `${inputId}-list`;
    const [open, setOpen] = useState(false);
    const [touched, setTouched] = useState(false);     // nothing is asked of the server until the box is used
    const [active, setActive] = useState(-1);
    const wrapRef = useRef<HTMLDivElement>(null);
    const { items, loading } = useCatalogSuggestions(field, value, touched);

    // an exact copy of what is typed is not worth offering back
    const shown = items.filter((s) => s.value.trim().toLowerCase() !== value.trim().toLowerCase() || items.length > 1);
    const listOpen = open && (shown.length > 0 || loading);

    useEffect(() => { setActive(-1); }, [value, items]);
    useEffect(() => {
        if (active < 0) return;
        document.getElementById(`${inputId}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    }, [active, inputId]);

    const pick = (s: ProductSuggestion) => {
        onChange(s.value);
        onPick?.(s);
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            if (!open) { setTouched(true); setOpen(true); }
            else if (shown.length) setActive((a) => (a + 1) % shown.length);
            e.preventDefault();
        } else if (e.key === 'ArrowUp' && listOpen && shown.length) {
            setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
            e.preventDefault();
        } else if (e.key === 'Enter' && listOpen && active >= 0 && shown[active]) {
            e.preventDefault();               // take the option, do not submit the form
            pick(shown[active]);
        } else if (e.key === 'Escape' && open) {
            setOpen(false);                   // the popover closes only itself, not the dialog around the box
        }
    };

    return (
        <Popover open={listOpen} onOpenChange={(o) => { if (!o) setOpen(false); }}>
            <PopoverAnchor asChild>
                <div ref={wrapRef} className="relative">
                    <Input
                        id={inputId}
                        name={name}
                        data-testid={rest['data-testid']}
                        role="combobox"
                        aria-expanded={listOpen}
                        aria-controls={listOpen ? listId : undefined}
                        aria-autocomplete="list"
                        aria-activedescendant={active >= 0 ? `${inputId}-opt-${active}` : undefined}
                        aria-invalid={rest['aria-invalid']}
                        aria-describedby={rest['aria-describedby']}
                        autoComplete="off"
                        spellCheck={false}
                        value={value}
                        maxLength={maxLength}
                        disabled={disabled}
                        placeholder={placeholder}
                        className={className}
                        onFocus={() => { setTouched(true); setOpen(true); }}
                        onChange={(e) => { setTouched(true); setOpen(true); onChange(e.target.value); }}
                        onKeyDown={onKeyDown}
                        onBlur={() => setOpen(false)}
                    />
                </div>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={4}
                // keep the cursor in the box: the list is looked at, not entered
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                // a tap on the box itself is not "outside"
                onInteractOutside={(e) => { if (wrapRef.current?.contains(e.target as Node)) e.preventDefault(); }}
                className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden p-0"
            >
                <ul id={listId} role="listbox" aria-label={field === 'manufacturer' ? 'Manufacturers' : 'Compositions'} className="max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain py-1">
                    {shown.map((s, i) => (
                        <li
                            key={s.value}
                            id={`${inputId}-opt-${i}`}
                            role="option"
                            aria-selected={i === active}
                            data-testid="suggestion"
                            // pointerdown would blur the box (and close the phone keyboard) before the tap lands
                            onPointerDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => pick(s)}
                            className={cn('flex min-h-11 cursor-pointer touch-manipulation flex-col justify-center gap-0.5 px-3 py-1.5 text-left sm:min-h-0', i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}
                        >
                            <span className="break-words text-sm text-foreground"><Highlight text={s.value} query={value} /></span>
                            <span className="text-xs text-muted-foreground">{describeSuggestion(s)}</span>
                        </li>
                    ))}
                    {loading && shown.length === 0 && <li role="presentation" className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
                </ul>
                <p role="status" aria-live="polite" className="sr-only">{shown.length ? `${shown.length} suggestions` : loading ? 'Searching' : ''}</p>
            </PopoverContent>
        </Popover>
    );
}
