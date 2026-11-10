'use client';

import React, { useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

const SEP = '\u0000';
/** Plain "contains" matching on the name (every typed word must appear), not cmdk's loose letter-by-letter fuzzy match: for supplier names "parag" should find PARAG TRADERS, not PUSHKAR AGENCY. */
const matchName = (value: string, search: string) => {
    const name = value.split(SEP)[0].toLowerCase();
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return 1;
    if (!words.every((w) => name.includes(w))) return 0;
    return name.startsWith(words[0]) ? 1 : 0.5;                    // names that START with what you typed come first
};

interface Props {
    value: string;
    onChange: (id: string) => void;
    distributors: { id: string; name: string }[] | undefined;
    placeholder?: string;
    ariaLabel?: string;
    /** when set, the list starts with this choice and picking it clears the value (e.g. "Last supplier (automatic)") */
    clearLabel?: string;
    invalid?: boolean;
    disabled?: boolean;
    className?: string;
}

/**
 * Pick a distributor by typing part of the name. A long list (hundreds of suppliers) is not scrollable by hand, so every distributor
 * field in the purchase screens uses this instead of a plain dropdown.
 */
export function DistributorCombobox({ value, onChange, distributors, placeholder = 'Select a distributor', ariaLabel = 'Distributor', clearLabel, invalid, disabled, className }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = distributors?.find((d) => d.id === value);
    const changeOpen = (o: boolean) => { setOpen(o); if (!o) setQuery(''); };
    const pick = (id: string) => { onChange(id); changeOpen(false); };

    // The field looks like a search box, so typing into it must work without clicking first: the first letters open the list already
    // filtered (the key that was pressed becomes the start of the search). Arrow-down opens it too.
    const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled || open || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length === 1 && e.key !== ' ') { e.preventDefault(); setQuery(e.key); setOpen(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
    };

    return (
        <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" aria-label={ariaLabel} aria-expanded={open} disabled={disabled} onKeyDown={onTriggerKeyDown}
                    className={cn('h-10 w-full justify-between bg-white px-3 font-normal', !selected && 'text-muted-foreground', invalid && 'border-red-400', className)}>
                    <span className="truncate">{selected ? selected.name : placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
                onOpenAutoFocus={(e) => {
                    // focus the search box with the cursor AFTER any letters already typed (otherwise the next letter would replace them)
                    e.preventDefault();
                    const el = inputRef.current;
                    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
                }}>
                <Command filter={matchName}>
                    <CommandInput ref={inputRef} placeholder="Search distributor…" aria-label="Search distributor" value={query} onValueChange={setQuery} />
                    <CommandList>
                        <CommandEmpty>No distributor matches.</CommandEmpty>
                        <CommandGroup>
                            {clearLabel && (
                                <CommandItem value={`${clearLabel}${SEP}clear`} onSelect={() => pick('')}>
                                    <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} /><span className="text-muted-foreground">{clearLabel}</span>
                                </CommandItem>
                            )}
                            {distributors?.map((d) => (
                                <CommandItem key={d.id} value={`${d.name}${SEP}${d.id}`} onSelect={() => pick(d.id)}>
                                    <Check className={cn('mr-2 h-4 w-4 shrink-0', value === d.id ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{d.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
