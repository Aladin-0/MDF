'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
    MONTH_NAMES, PRESETS, SORTS, UNKNOWN_DISTRIBUTOR, monthKey, monthLabel, windowLabel,
    type ExpiryFilters, type SortKey,
} from '@/lib/expiryManager';
import { cn } from '@/lib/utils';

export interface DistributorOption { id: string; name: string }

interface Props {
    filters: ExpiryFilters;
    distributors: DistributorOption[];
    onChange: (patch: Partial<ExpiryFilters>) => void;
}

const SORT_LABELS: Record<SortKey, string> = { expiry: 'Soonest expiry', distributor: 'Distributor', product: 'Product A–Z', value: 'Highest value' };
const chip = (on: boolean) => cn('h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted');

export function ExpiryFilterBar({ filters, distributors, onChange }: Props) {
    const f = filters;
    const thisMonth = monthKey(new Date());

    return (
        <section aria-label="Find stock" className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expiry window</p>
                <div role="group" aria-label="Expiry window" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar sm:flex-wrap">
                    {PRESETS.map((p) => (
                        <button key={p.key} type="button" aria-pressed={f.w === p.key} className={chip(f.w === p.key)} onClick={() => onChange({ w: p.key })}>{p.label}</button>
                    ))}
                    <button type="button" aria-pressed={f.w === 'months'} className={chip(f.w === 'months')} onClick={() => onChange({ w: 'months', months: f.months.length ? f.months : [thisMonth] })}>Pick months…</button>
                    <button type="button" aria-pressed={f.w === 'custom'} className={chip(f.w === 'custom')} onClick={() => onChange({ w: 'custom' })}>Custom dates…</button>
                </div>
            </div>

            {f.w === 'months' && <MonthPicker selected={f.months} onChange={(months) => onChange({ months })} />}
            {f.w === 'custom' && <DateRange from={f.from} to={f.to} onChange={onChange} />}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_auto_auto]">
                <DistributorPicker options={distributors} selected={f.distributors} onChange={(d) => onChange({ distributors: d })} />
                <div className="relative">
                    <Label htmlFor="expiry-search" className="sr-only">Search product or batch</Label>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="expiry-search" type="search" autoComplete="off" placeholder="Search product or batch" className="h-10 pl-9" value={f.q} onChange={(e) => onChange({ q: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor="expiry-sort" className="sr-only">Sort by</Label>
                    <select id="expiry-sort" value={f.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto">
                        {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Switch checked={f.includeExpired} onCheckedChange={(v) => onChange({ includeExpired: v })} disabled={f.w === 'expired'} aria-label="Include stock that has already expired" />
                    Include already expired
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Switch checked={f.group} onCheckedChange={(v) => onChange({ group: v, sort: v ? 'distributor' : 'expiry' })} aria-label="Group the list by distributor" />
                    Group by distributor
                </label>
                <p className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground max-sm:basis-full max-sm:text-left" aria-live="polite">{windowLabel(f)}</p>
            </div>
        </section>
    );
}

function MonthPicker({ selected, onChange }: { selected: string[]; onChange: (months: string[]) => void }) {
    const [year, setYear] = useState(() => Number((selected[0] ?? monthKey(new Date())).slice(0, 4)));
    const toggle = (key: string) => onChange(selected.includes(key) ? selected.filter((m) => m !== key) : [...selected, key].sort());
    const now = monthKey(new Date());

    return (
        <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><ChevronLeft aria-hidden="true" /></Button>
                <p className="text-sm font-semibold tabular-nums">{year}</p>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Next year" onClick={() => setYear((y) => y + 1)}><ChevronRight aria-hidden="true" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {MONTH_NAMES.map((name, i) => {
                    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                    const on = selected.includes(key);
                    return (
                        <button key={key} type="button" aria-pressed={on} aria-label={monthLabel(key)} onClick={() => toggle(key)}
                            className={cn('h-10 rounded-md border text-sm font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted', key === now && !on && 'border-primary/50')}>
                            {name}
                        </button>
                    );
                })}
            </div>
            {selected.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {selected.map((m) => (
                        <span key={m} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
                            {monthLabel(m)}
                            <button type="button" aria-label={`Remove ${monthLabel(m)}`} className="rounded-full p-0.5 hover:bg-primary/20" onClick={() => toggle(m)}><X className="h-3 w-3" aria-hidden="true" /></button>
                        </span>
                    ))}
                    <button type="button" className="ml-1 text-xs text-muted-foreground underline" onClick={() => onChange([])}>Clear</button>
                </div>
            ) : <p className="mt-3 text-xs text-muted-foreground">Tap one or more months. Nothing is listed until you pick one.</p>}
        </div>
    );
}

function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (p: Partial<ExpiryFilters>) => void }) {
    const bad = !!(from && to && from > to);
    return (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <div>
                <Label htmlFor="expiry-from" className="text-xs">From (expiry date)</Label>
                <Input id="expiry-from" type="date" className="h-10" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value })} aria-invalid={bad || undefined} />
            </div>
            <div>
                <Label htmlFor="expiry-to" className="text-xs">To (expiry date)</Label>
                <Input id="expiry-to" type="date" className="h-10" value={to} min={from || undefined} onChange={(e) => onChange({ to: e.target.value })} aria-invalid={bad || undefined} />
            </div>
            <p className={cn('text-xs sm:col-span-2', bad ? 'font-medium text-destructive' : 'text-muted-foreground')} role={bad ? 'alert' : undefined}>
                {bad ? '"From" is after "To". Swap them.' : <><CalendarDays className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Leave one end empty for &quot;up to&quot; or &quot;from&quot; a date.</>}
            </p>
        </div>
    );
}

function DistributorPicker({ options, selected, onChange }: { options: DistributorOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
    const [q, setQ] = useState('');
    const all = useMemo(() => [...options.map((o) => ({ ...o })).sort((a, b) => a.name.localeCompare(b.name)), { id: UNKNOWN_DISTRIBUTOR, name: 'No purchase record' }], [options]);
    const shown = all.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
    const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    const names = selected.map((id) => all.find((o) => o.id === id)?.name).filter(Boolean) as string[];
    const label = names.length === 0 ? 'All distributors' : names.length === 1 ? names[0] : `${names.length} distributors`;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-10 w-full justify-between font-normal" aria-label={`Distributors: ${label}`}>
                    <span className={cn('truncate', names.length === 0 && 'text-muted-foreground')}>{label}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[22rem] p-0">
                <div className="border-b p-2">
                    <Input autoFocus type="search" placeholder="Search distributors" className="h-9" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search distributors" />
                </div>
                <ul className="max-h-64 overflow-y-auto p-1" role="listbox" aria-multiselectable="true" aria-label="Distributors">
                    {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No distributor matches</li>}
                    {shown.map((o) => {
                        const on = selected.includes(o.id);
                        return (
                            <li key={o.id} role="presentation">
                                <button type="button" role="option" aria-selected={on} onClick={() => toggle(o.id)} className="flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted">
                                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{on && <Check className="h-3 w-3" aria-hidden="true" />}</span>
                                    <span className={cn('min-w-0 flex-1 truncate', o.id === UNKNOWN_DISTRIBUTOR && 'italic text-muted-foreground')}>{o.name}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <div className="flex items-center justify-between border-t p-2 text-xs">
                    <span className="text-muted-foreground">{selected.length ? `${selected.length} selected` : 'Showing all'}</span>
                    <Button type="button" variant="ghost" size="sm" disabled={selected.length === 0} onClick={() => onChange([])}>Clear</Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
