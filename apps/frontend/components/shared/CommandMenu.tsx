'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Command } from 'cmdk';
import { usePermissions } from '@/hooks/usePermissions';
import { Search } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { COMMAND_SCHEMA, CommandItem } from '@/config/commands';
import { useModalStore } from '@/store/modalStore';
import Fuse from 'fuse.js';



export function CommandMenu() {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [activeValue, setActiveValue] = React.useState('');
    const router = useRouter();
    const pathname = usePathname();
    const { hasPermission } = usePermissions();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                e.stopPropagation();
                console.log("CommandMenu hotkey pressed, open state:", open);
                setOpen((prev) => !prev);
            }
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                console.log("CommandMenu hotkey pressed, open state:", open);
                setOpen((prev) => !prev);
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    const runCommand = React.useCallback((command: () => void) => {
        setOpen(false);
        command();
    }, []);

    const { openModal } = useModalStore();

    const handleExecute = (cmd: CommandItem) => {
        setOpen(false); // Close immediately for seamless transition
        setTimeout(() => {
            if (cmd.actionType === 'navigate') {
                router.push(cmd.payload);
            } else if (cmd.actionType === 'execute_function') {
                window.dispatchEvent(new CustomEvent('mediflow-cmd', { detail: cmd.payload }));
            } else if (cmd.actionType === 'open_modal') {
                openModal(cmd.payload as any);
            } else if (cmd.actionType === 'focus_field') {
                document.querySelector<HTMLElement>(cmd.payload)?.focus();
            }
        }, 50); // Small timeout allows palette to fully unmount/close before focusing new elements
    };

    // Filter commands based on roles and current route
    const roleAndRouteFilteredCommands = React.useMemo(() => {
        return COMMAND_SCHEMA.filter((cmd) => {
            // Check Role
            if (cmd.requiredRole && cmd.requiredRole.length > 0) {
                const hasAccess = cmd.requiredRole.some(role => hasPermission(role));
                if (!hasAccess) return false;
            }
            // Check Route Context
            if (cmd.routeContext && cmd.routeContext !== '*') {
                if (!pathname.startsWith(cmd.routeContext)) return false;
            }
            return true;
        });
    }, [pathname, hasPermission]);

    // Apply Fuse.js fuzzy filtering
    const fuseFilteredCommands = React.useMemo(() => {
        if (!search.trim()) return roleAndRouteFilteredCommands;
        
        const fuse = new Fuse(roleAndRouteFilteredCommands, {
            keys: ['label', 'category'],
            threshold: 0.4,
            ignoreLocation: true,
        });
        
        return fuse.search(search).map(result => result.item);
    }, [search, roleAndRouteFilteredCommands]);

    // Grouping
    const groups = React.useMemo(() => {
        const result: Record<string, CommandItem[]> = {};
        for (const cmd of fuseFilteredCommands) {
            if (!result[cmd.category]) result[cmd.category] = [];
            result[cmd.category].push(cmd);
        }
        return result;
    }, [fuseFilteredCommands]);

    return (
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="bg-gray-900/40 backdrop-blur-sm fixed inset-0 z-50" />
                <DialogPrimitive.Content className="fixed left-[50%] top-[20%] z-50 w-full max-w-2xl translate-x-[-50%] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl outline-none">
                    <DialogPrimitive.Title className="sr-only">Command Menu</DialogPrimitive.Title>
                    <Command 
                        shouldFilter={false} 
                        value={activeValue}
                        onValueChange={setActiveValue}
                        className="flex h-full w-full flex-col overflow-hidden bg-transparent"
                    >
                        <div className="flex items-center px-4" cmdk-input-wrapper="">
                            <Search className="mr-4 h-5 w-5 shrink-0 text-gray-500" />
                            <Command.Input 
                                value={search}
                                onValueChange={setSearch}
                                placeholder="Type a command or search..." 
                                className="w-full border-0 border-b border-gray-100 bg-transparent p-4 text-lg outline-none placeholder:text-gray-400 focus:border-gray-100 focus:outline-none focus:ring-0"
                            />
                        </div>
                        
                        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                            <Command.Empty className="py-6 text-center text-sm text-gray-500">
                                No results found.
                            </Command.Empty>

                            {Object.entries(groups).map(([category, items]) => (
                                <Command.Group 
                                    key={category} 
                                    heading={category} 
                                    className="px-2 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-500 [&_[cmdk-group-heading]]:uppercase"
                                >
                                    {items.map((cmd) => (
                                        <Command.Item
                                            key={cmd.id}
                                            value={`${cmd.category} ${cmd.label}`}
                                            onSelect={() => handleExecute(cmd)}
                                            className="flex cursor-pointer items-center rounded-lg px-3 py-3 text-sm text-gray-700 aria-selected:bg-indigo-50 aria-selected:text-indigo-700 aria-selected:font-medium transition-colors"
                                        >
                                            {cmd.label}
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            ))}
                        </Command.List>
                    </Command>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
