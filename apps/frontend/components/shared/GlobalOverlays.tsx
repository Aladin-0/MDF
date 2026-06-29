'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calculator, Package, Search, Settings, FileText, ShoppingCart, User, HelpCircle, FileBarChart, CreditCard, Layers } from 'lucide-react';
import { shortcutRegistry } from '@/lib/shortcuts';

export function GlobalOverlays() {
    const [openCommand, setOpenCommand] = useState(false);
    const [openHelp, setOpenHelp] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
                e.preventDefault();
                setOpenCommand((open) => !open);
            }
            if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpenHelp((open) => !open);
            }

        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [router]);

    const runCommand = (command: () => void) => {
        setOpenCommand(false);
        command();
    };

    const shortcuts = shortcutRegistry.getAllShortcuts();

    return (
        <>
            <CommandDialog open={openCommand} onOpenChange={setOpenCommand}>
                <CommandInput placeholder="Type a command or search..." />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    
                    <CommandGroup heading="Navigation">
                        <CommandItem onSelect={() => runCommand(() => router.push('/billing'))}>
                            <ShoppingCart className="mr-2 h-4 w-4" /> Billing (Alt+1)
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/purchases'))}>
                            <Package className="mr-2 h-4 w-4" /> Purchases (Alt+2)
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/inventory'))}>
                            <Layers className="mr-2 h-4 w-4" /> Inventory (Alt+3)
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/credit'))}>
                            <CreditCard className="mr-2 h-4 w-4" /> Accounts (Alt+4)
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/reports'))}>
                            <FileBarChart className="mr-2 h-4 w-4" /> Reports (Alt+5)
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/settings'))}>
                            <Settings className="mr-2 h-4 w-4" /> Settings (Alt+6)
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>

            <Dialog open={openHelp} onOpenChange={setOpenHelp}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <HelpCircle className="w-5 h-5" /> Keyboard Shortcuts
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6 pt-4">
                        <section>
                            <h3 className="font-semibold text-slate-900 mb-3 border-b pb-1">Global Navigation</h3>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Open Command Palette</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Ctrl+Shift+K</kbd>
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Keyboard Help</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Ctrl+/</kbd>
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Go to Billing</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Alt+1</kbd>
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Go to Purchases</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Alt+2</kbd>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="font-semibold text-slate-900 mb-3 border-b pb-1">Billing & Cart</h3>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Focus Search</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">/</kbd>
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Checkout / Save</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Ctrl+S</kbd>
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Navigate Cart Rows</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">↑ / ↓</kbd>
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Cancel / Clear</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Esc</kbd>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="font-semibold text-slate-900 mb-3 border-b pb-1">Purchases</h3>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <div className="flex justify-between items-center pr-4">
                                    <span className="text-slate-600">Fast Entry Mode (Next Field)</span>
                                    <kbd className="px-2 py-1 bg-slate-100 border rounded text-xs">Enter</kbd>
                                </div>
                            </div>
                        </section>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
