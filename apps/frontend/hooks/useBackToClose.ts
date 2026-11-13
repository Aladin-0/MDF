'use client';

import { useEffect, useRef } from 'react';

/**
 * While `open`, the phone's Back button (or browser back) closes the sheet instead of leaving the page, so a half-made bill is never lost
 * by a stray Back.
 *
 * One history entry is pushed per open sheet (copying the current history state so Next.js still recognises it as its own) and removed
 * again when the sheet is closed any other way. Sheets can be nested (search -> Add sheet -> camera): a registry keeps them in open order and
 * Back closes ONLY the top one.
 *
 * Removal is deferred by one tick and done in a single `history.go(-n)` for all sheets that closed together, because:
 *  - React (dev / StrictMode) runs an effect, its cleanup and the effect again in one go: an immediate `history.back()` in the cleanup raced the
 *    next push and left stray entries behind (later Back presses did nothing, or closed the wrong sheet);
 *  - closing the Add sheet and the search screen in the same moment ("Add to bill" returns to the bill) must remove BOTH entries.
 * The popstate caused by our own `go()` is counted in `ignorePops` so it is not mistaken for the user pressing Back.
 */
interface Entry { id: string; close: () => void; byBack: boolean; dying: boolean; owner: { current: Entry | null } }

const stack: Entry[] = [];
let ignorePops = 0;
let listening = false;
let flushScheduled = false;

function onPop() {
    if (ignorePops > 0) { ignorePops--; return; }       // our own history.go() after a button close
    const top = [...stack].reverse().find((e) => !e.dying);
    if (top) { top.byBack = true; top.close(); }
}

function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(() => {
        flushScheduled = false;
        const dead = stack.filter((e) => e.dying);
        if (dead.length === 0) return;
        for (const e of dead) { stack.splice(stack.indexOf(e), 1); e.owner.current = null; }
        const ours = new Set(dead.filter((e) => !e.byBack).map((e) => e.id));
        // only walk back over entries that really are ours and on top of the history
        if (ours.size > 0 && ours.has(window.history.state?.mobileSheet)) {
            ignorePops++;
            window.history.go(-ours.size);
        }
    }, 0);
}

export function useBackToClose(open: boolean, onClose: () => void) {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const entryRef = useRef<Entry | null>(null);        // this sheet's own history entry (kept through a cleanup + immediate re-run)

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;
        let entry = entryRef.current;
        if (entry && entry.dying) {
            entry.dying = false;                        // StrictMode ran cleanup + effect again in one go: keep the same history entry
        } else {
            entry = { id: `sheet-${Math.random().toString(36).slice(2)}`, close: () => closeRef.current(), byBack: false, dying: false, owner: entryRef };
            entryRef.current = entry;
            stack.push(entry);
            if (!listening) { window.addEventListener('popstate', onPop); listening = true; }
            window.history.pushState({ ...(window.history.state || {}), mobileSheet: entry.id }, '');
        }
        const mine = entry;
        return () => {
            mine.dying = true;                          // removed by the next flush unless the effect adopts it again first
            scheduleFlush();
        };
    }, [open]);
}
