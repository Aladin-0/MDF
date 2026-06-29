'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { shortcutRegistry, ShortcutDefinition } from '@/lib/shortcuts';
import { NAV_ITEMS } from '@/lib/navConfig';
import { usePermissions } from '@/hooks/usePermissions';

export function useGlobalNavigationShortcuts() {
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    useEffect(() => {
        const shortcutsToRegister: ShortcutDefinition[] = [];

        // Register Help Modal shortcut
        shortcutsToRegister.push({
            id: 'global-help',
            combo: 'Alt+/',
            scope: 'global',
            description: 'Show Keyboard Shortcuts Help',
            handler: () => {
                setIsHelpOpen((prev) => !prev);
            }
        });

        // Register route shortcuts dynamically from config
        NAV_ITEMS.forEach((item) => {
            // Skip if user doesn't have permission
            if (item.permission && !hasPermission(item.permission)) return;

            if (item.shortcut || item.sequence) {
                shortcutsToRegister.push({
                    id: `nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`,
                    combo: item.shortcut,
                    sequence: item.sequence,
                    scope: 'global',
                    description: `Navigate to ${item.label}`,
                    handler: () => {
                        router.push(item.href);
                    }
                });
            }
        });

        // Register them all
        shortcutsToRegister.forEach(s => shortcutRegistry.register(s));

        return () => {
            shortcutsToRegister.forEach(s => shortcutRegistry.unregister(s.id));
        };
    }, [router, hasPermission]);

    return { isHelpOpen, setIsHelpOpen };
}
