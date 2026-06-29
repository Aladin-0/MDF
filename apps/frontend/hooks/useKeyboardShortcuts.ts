'use client';

import { useEffect, useId } from 'react';
import { shortcutRegistry, ShortcutScope, ShortcutDefinition } from '@/lib/shortcuts';

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(
    shortcuts: ShortcutMap | Omit<ShortcutDefinition, 'id'>[],
    active: boolean = true,
    scope: ShortcutScope = 'route'
) {
    const idPrefix = useId();

    useEffect(() => {
        if (!active) return;

        const registeredIds: string[] = [];

        if (Array.isArray(shortcuts)) {
            // New signature
            shortcuts.forEach((s, idx) => {
                const id = `${idPrefix}-${idx}`;
                registeredIds.push(id);
                shortcutRegistry.register({ ...s, id });
            });
        } else {
            // Backward compatibility
            Object.entries(shortcuts).forEach(([combo, handler], idx) => {
                const id = `${idPrefix}-${idx}`;
                registeredIds.push(id);
                shortcutRegistry.register({
                    id,
                    combo,
                    scope,
                    handler,
                    description: `Shortcut for ${combo}`,
                    allowInInput: combo.includes('Ctrl') || combo.includes('Alt') // Default heuristic
                });
            });
        }

        return () => {
            registeredIds.forEach(id => shortcutRegistry.unregister(id));
        };
    }, [shortcuts, active, scope, idPrefix]);
}
