import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * A zustand `persist` storage that writes to localStorage at most once per `delayMs` (the latest state wins).
 *
 * The billing store persisted every open bill (up to 10) on EVERY state change, synchronously: each key typed in a
 * discount, payment or header box serialised all drafts and wrote them to localStorage before the screen could
 * update. Now the write happens once the burst of changes settles, and immediately when the page is hidden or closed
 * (tab switch, navigation, closing the window), so nothing typed is lost on a normal exit. Reads see the pending
 * value, so the store and storage never disagree inside the app.
 */

const pendingFlushes = new Set<() => void>();
const pendingDiscards = new Set<() => void>();
let exitListenersAdded = false;

function flushAll() {
    pendingFlushes.forEach((flush) => flush());
}

function addExitListeners() {
    if (exitListenersAdded || typeof window === 'undefined') return;
    exitListenersAdded = true;
    window.addEventListener('pagehide', flushAll);
    window.addEventListener('beforeunload', flushAll);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAll();
    });
}

/** Write every pending value now (for code that is about to read localStorage directly or leave the page). */
export function flushPendingStorageWrites() {
    flushAll();
}

/**
 * Forget every pending value without writing it. Call this before wiping localStorage ("Clear data"), or a pending
 * write could put the old drafts back right after the wipe.
 */
export function discardPendingStorageWrites() {
    pendingDiscards.forEach((discard) => discard());
}

export function createDebouncedJSONStorage<S>(getStorage: () => Storage, delayMs = 300): PersistStorage<S> {
    const pending = new Map<string, StorageValue<S>>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const storage = (): Storage | undefined => {
        try {
            return getStorage();
        } catch {
            return undefined;          // no localStorage (server render, privacy mode): behave like zustand's own storage
        }
    };

    const flush = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        const target = storage();
        pending.forEach((value, name) => {
            try {
                target?.setItem(name, JSON.stringify(value));
            } catch (err) {
                console.warn(`Could not save "${name}" to local storage`, err);   // quota full: keep the app working
            }
        });
        pending.clear();
    };

    const discard = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        pending.clear();
    };

    pendingFlushes.add(flush);
    pendingDiscards.add(discard);
    addExitListeners();

    return {
        getItem: (name) => {
            if (pending.has(name)) return pending.get(name)!;
            const raw = storage()?.getItem(name) ?? null;
            return raw === null ? null : (JSON.parse(raw) as StorageValue<S>);
        },
        setItem: (name, value) => {
            pending.set(name, value);
            if (!timer) timer = setTimeout(flush, delayMs);
        },
        removeItem: (name) => {
            pending.delete(name);
            storage()?.removeItem(name);
        },
    };
}
