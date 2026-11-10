'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Keyboard } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUTS, type ShortcutDef } from '@/config/shortcuts';
import { formatKeys, isShortcutAvailable } from '@/lib/shortcutEngine';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';

interface ShortcutHelpModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function Keys({ keys }: { keys: string[] }) {
    return (
        <span className="flex shrink-0 items-center gap-1">
            {formatKeys(keys).map((parts, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className="text-[10px] text-slate-300">then</span>}
                    <span className="flex items-center gap-0.5">
                        {parts.map((p) => (
                            <kbd
                                key={p}
                                className="min-w-[1.4rem] rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-slate-600 shadow-sm"
                            >
                                {p}
                            </kbd>
                        ))}
                    </span>
                </React.Fragment>
            ))}
        </span>
    );
}

/** Cheat sheet, generated from config/shortcuts.ts — it can never drift from what the app actually does. */
export function ShortcutHelpModal({ open, onOpenChange }: ShortcutHelpModalProps) {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const role = useAuthStore((s) => s.user?.role as string | undefined);
    const [filter, setFilter] = React.useState('');

    const available = SHORTCUTS.filter((d) =>
        isShortcutAvailable(d, { pathname, hasPermission: hasPermission as (p: string) => boolean, role }),
    );
    const q = filter.trim().toLowerCase();
    const shown = q
        ? available.filter((d) => `${d.label} ${d.group}`.toLowerCase().includes(q))
        : available;

    // "On this page" first (anything not global), then every other group in registry order.
    const groups = new Map<string, ShortcutDef[]>();
    const add = (title: string, d: ShortcutDef) => groups.set(title, [...(groups.get(title) ?? []), d]);
    shown.filter((d) => d.scope !== 'global').forEach((d) => add(`On this page — ${d.group}`, d));
    shown.filter((d) => d.scope === 'global').forEach((d) => add(d.group, d));

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) setFilter(''); onOpenChange(o); }}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Keyboard className="h-5 w-5" /> Keyboard Shortcuts
                    </DialogTitle>
                </DialogHeader>

                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Press <kbd className="rounded border bg-white px-1 font-mono">Alt</kbd>+<kbd className="rounded border bg-white px-1 font-mono">G</kbd>, then the
                    letters shown, to jump anywhere (e.g. <b>Alt+G, S, I</b> = Sales → Invoices). A hint panel lists the next keys;
                    <kbd className="mx-1 rounded border bg-white px-1 font-mono">Esc</kbd> cancels. Nothing here uses a bare letter, so typing in a search box is always safe.
                </div>

                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter shortcuts…"
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                    aria-label="Filter shortcuts"
                />

                <div className="space-y-6 pt-1">
                    {Array.from(groups.entries()).map(([title, items]) => (
                        <section key={title}>
                            <h3 className="mb-2 border-b pb-1 text-sm font-semibold text-slate-900">{title}</h3>
                            <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                                {items.map((d) => (
                                    <div key={d.id} className="flex items-center justify-between gap-3 border-b border-slate-50 pb-1.5">
                                        <span className="truncate text-slate-600">{d.label}</span>
                                        <Keys keys={d.keys} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                    {groups.size === 0 && <p className="py-6 text-center text-sm text-slate-500">No shortcuts match “{filter}”.</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}
