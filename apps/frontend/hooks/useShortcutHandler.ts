import { useEffect, useRef } from 'react';

/** Window event used for shortcuts whose action is owned by a mounted component. */
export const SHORTCUT_EVENT = 'mediflow:shortcut';
/** Anything can dispatch this to open the cheat sheet (e.g. the user menu). */
export const OPEN_SHORTCUT_HELP_EVENT = 'mediflow:open-shortcut-help';

/**
 * Run `handler` whenever the shortcut with registry id `id` (config/shortcuts.ts, action type
 * 'event') is triggered. Always calls the latest handler, so it is safe to pass an inline function.
 */
export function useShortcutHandler(id: string, handler: () => void) {
    const ref = useRef(handler);
    ref.current = handler;

    useEffect(() => {
        const onShortcut = (e: Event) => {
            if ((e as CustomEvent<{ id?: string }>).detail?.id === id) ref.current();
        };
        window.addEventListener(SHORTCUT_EVENT, onShortcut);
        return () => window.removeEventListener(SHORTCUT_EVENT, onShortcut);
    }, [id]);
}
