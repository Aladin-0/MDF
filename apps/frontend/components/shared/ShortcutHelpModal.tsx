'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HelpCircle, Command } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navConfig';
import { usePermissions } from '@/hooks/usePermissions';

interface ShortcutHelpModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpModal({ open, onOpenChange }: ShortcutHelpModalProps) {
    const { hasPermission } = usePermissions();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Command className="w-5 h-5" /> Keyboard Shortcuts
                    </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-8 pt-4">
                    <section>
                        <h3 className="font-semibold text-slate-900 mb-4 border-b pb-1">Global Navigation</h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            {NAV_ITEMS.map(item => {
                                if (item.permission && !hasPermission(item.permission)) return null;
                                
                                return (
                                    <div key={item.label} className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                        <span className="text-slate-600 flex items-center gap-2">
                                            <item.icon className="w-4 h-4 text-slate-400" />
                                            {item.label}
                                        </span>
                                        <div className="flex gap-2">
                                            {item.sequence && (
                                                <div className="flex gap-1">
                                                    {item.sequence.split(' ').map(key => (
                                                        <kbd key={key} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-500 shadow-sm">{key}</kbd>
                                                    ))}
                                                </div>
                                            )}
                                            {item.shortcut && (
                                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">{item.shortcut}</kbd>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                <span className="text-slate-600">Focus Main Nav</span>
                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">Alt+`</kbd>
                            </div>
                            <div className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                <span className="text-slate-600">Show Shortcuts</span>
                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">Alt+/</kbd>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="font-semibold text-slate-900 mb-4 border-b pb-1">Navigation Within Menus</h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            <div className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                <span className="text-slate-600">Move between items</span>
                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">← / →</kbd>
                            </div>
                            <div className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                <span className="text-slate-600">Enter Child Menu</span>
                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">↓</kbd>
                            </div>
                            <div className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                <span className="text-slate-600">Open Selected Item</span>
                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">Enter</kbd>
                            </div>
                            <div className="flex justify-between items-center pr-4 border-b border-slate-50 pb-2">
                                <span className="text-slate-600">Return to Parent</span>
                                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 shadow-sm">Esc</kbd>
                            </div>
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
