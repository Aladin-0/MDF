'use client';

/**
 * Global keyboard-shortcut listener (replaces the old Ctrl+K command palette).
 * All key definitions live in config/shortcuts.ts — this component only listens, matches and runs.
 *
 *   Alt+G, then a key   → "Go" sequences (pages + New/Create modals); a hint panel shows the next keys
 *   Alt+/               → cheat sheet
 *   billing chords      → Alt+N, Alt+W, Alt+[, Alt+], Alt+Shift+1…0, Alt+M, Alt+P, Alt+L (only on /billing)
 */
import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';

import { SHORTCUTS, HELP_KEYS, type ShortcutDef } from '@/config/shortcuts';
import {
    canonStep,
    eventToStep,
    formatKeys,
    isShortcutAvailable,
    matchNext,
    nextOptions,
    stripAlt,
    withoutShiftOnLetter,
} from '@/lib/shortcutEngine';
import { runShortcutCommand } from '@/lib/shortcutCommands';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { useModalStore } from '@/store/modalStore';
import { toast } from '@/hooks/use-toast';
import { OPEN_SHORTCUT_HELP_EVENT, SHORTCUT_EVENT } from '@/hooks/useShortcutHandler';
import { ShortcutHelpModal } from '@/components/shared/ShortcutHelpModal';

const SEQUENCE_TIMEOUT_MS = 5000;
const HELP_STEP = canonStep(HELP_KEYS[0]);

function consume(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Also stops other window/document listeners (e.g. the grid-navigation hook) from seeing this key.
    e.stopImmediatePropagation();
}

/** Radix dialogs/sheets are modal: while one is open, only the help toggle may fire. */
function isModalOpen(): boolean {
    return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-sm">
            {children}
        </kbd>
    );
}

export function GlobalShortcuts() {
    const router = useRouter();
    const pathname = usePathname();
    const user = useAuthStore((s) => s.user);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const { hasPermission } = usePermissions();
    const openModal = useModalStore((s) => s.openModal);

    const [pending, setPending] = React.useState<string[]>([]);
    const [helpOpen, setHelpOpen] = React.useState(false);
    const pendingRef = React.useRef<string[]>([]);

    const setSteps = React.useCallback((steps: string[]) => {
        pendingRef.current = steps;
        setPending(steps);
    }, []);

    // The key listener is registered once; it reads the latest values from this ref.
    const live = React.useRef({ enabled: false, pathname, hasPermission, role: user?.role as string | undefined, router, openModal });
    live.current = {
        enabled: !!user && isAuthenticated,
        pathname,
        hasPermission,
        role: user?.role as string | undefined,
        router,
        openModal,
    };

    const availableDefs = React.useCallback((): ShortcutDef[] => {
        const L = live.current;
        const ctx = { pathname: L.pathname, hasPermission: L.hasPermission as (p: string) => boolean, role: L.role };
        // 'local' shortcuts are owned by their own component: never match (or swallow) them here.
        return SHORTCUTS.filter((d) => d.action.type !== 'local' && isShortcutAvailable(d, ctx));
    }, []);

    const run = React.useCallback((def: ShortcutDef) => {
        const L = live.current;
        const a = def.action;
        switch (a.type) {
            case 'navigate':
                L.router.push(a.href);
                break;
            case 'modal':
                L.openModal(a.modal);
                break;
            case 'event':
                window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: { id: def.id } }));
                break;
            case 'command':
                runShortcutCommand(a.command, {
                    openHelp: () => setHelpOpen(true),
                    toggleHelp: () => setHelpOpen((o) => !o),
                    notify: (title) => toast({ title }),
                });
                break;
            default:
                break;
        }
    }, []);

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!live.current.enabled || e.isComposing) return;
            const step = eventToStep(e);
            if (!step) return;

            const typed = pendingRef.current;
            const defs = availableDefs();

            // ── Not in the middle of a sequence ─────────────────────────────
            if (typed.length === 0) {
                let first = matchNext(defs, [], step);
                if (first.kind === 'none') {
                    // Alt+Shift+G (capital letter typed) should behave like Alt+G
                    const loose = withoutShiftOnLetter(step);
                    if (loose) first = matchNext(defs, [], loose);
                }
                if (first.kind === 'none') return; // not ours: leave the key alone
                if (isModalOpen() && step !== HELP_STEP) return;
                consume(e);
                if (e.repeat) return;
                if (first.kind === 'exact') run(first.def);
                else setSteps(first.steps);
                return;
            }

            // ── Sequence pending (Alt+G was pressed): this key belongs to the sequence ─
            consume(e);
            if (e.repeat) return;
            if (step === 'Esc') {
                setSteps([]);
                return;
            }
            const next = stripAlt(step);
            if (next === null) {
                setSteps([]); // Ctrl/Shift/Meta combination: abandon the sequence
                return;
            }
            const m = matchNext(defs, typed, next);
            if (m.kind === 'exact') {
                setSteps([]);
                run(m.def);
            } else if (m.kind === 'pending') {
                setSteps(m.steps);
            }
            // kind === 'none': unknown key — stay pending (the hint panel is still showing the valid keys)
        };

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [availableDefs, run, setSteps]);

    // Abandon a half-typed sequence after a pause, on navigation, or when the window loses focus.
    React.useEffect(() => {
        if (pending.length === 0) return;
        const t = setTimeout(() => setSteps([]), SEQUENCE_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [pending, setSteps]);
    React.useEffect(() => {
        setSteps([]);
    }, [pathname, setSteps]);
    React.useEffect(() => {
        const cancel = () => setSteps([]);
        window.addEventListener('blur', cancel);
        return () => window.removeEventListener('blur', cancel);
    }, [setSteps]);

    // Let other UI (the user menu) open the cheat sheet.
    React.useEffect(() => {
        const open = () => setHelpOpen(true);
        window.addEventListener(OPEN_SHORTCUT_HELP_EVENT, open);
        return () => window.removeEventListener(OPEN_SHORTCUT_HELP_EVENT, open);
    }, []);

    if (!user || !isAuthenticated) return null;

    const options = pending.length > 0 ? nextOptions(availableDefs(), pending) : [];

    return (
        <>
            <ShortcutHelpModal open={helpOpen} onOpenChange={setHelpOpen} />

            {pending.length > 0 && (
                <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4" role="status" aria-live="polite">
                    <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur">
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                            {formatKeys(pending).map((parts, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <span className="text-slate-300">›</span>}
                                    <span className="flex items-center gap-0.5">
                                        {parts.map((p) => (
                                            <Kbd key={p}>{p}</Kbd>
                                        ))}
                                    </span>
                                </React.Fragment>
                            ))}
                            <span className="ml-2 font-medium text-slate-600">
                                {pending.length === 1 ? 'Go to…' : 'Choose…'}
                            </span>
                            <span className="ml-auto">
                                <Kbd>Esc</Kbd> cancel
                            </span>
                        </div>
                        {options.length === 0 ? (
                            <div className="py-2 text-sm text-slate-500">Nothing available here for your role.</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
                                {options.map((o) => (
                                    <div key={o.key} className="flex items-center gap-2 text-sm text-slate-700">
                                        <Kbd>{o.key}</Kbd>
                                        <span className="truncate">
                                            {o.label}
                                            {!o.leaf && <span className="text-slate-400"> ›</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
