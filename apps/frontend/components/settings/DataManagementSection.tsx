'use client';

import { useState } from 'react';
import { Database, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/use-toast';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { PermissionGate } from '@/components/shared/PermissionGate';

export function DataManagementSection() {
    const store = useSettingsStore();
    const { toast } = useToast();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);

    async function handleBackup() {
        setIsBackingUp(true);
        await new Promise((r) => setTimeout(r, 800));

        const backup = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            settings: {
                outletName: store.outletName,
                gstType: store.gstType,
                printerType: store.printerType,
            },
            meta: {
                totalCustomers: 8,
                totalProducts: 10,
                totalInvoices: 680,
                dataSince: 'Jan 2025',
            },
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mediflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        setIsBackingUp(false);
        toast({ title: 'Backup downloaded' });
    }

    function handleResetConfirm() {
        store.resetToDefaults();
        setShowResetConfirm(false);
        toast({ title: 'Settings reset to defaults' });
    }

    return (
        <PermissionGate
            permission="manage_settings"
            fallback={
                <div className="text-center py-16 text-muted-foreground text-sm">
                    You don&apos;t have permission to access data management.
                </div>
            }
        >
            <div className="space-y-6">
                <SettingsSectionHeader
                    icon={<Database />}
                    title="Data Management"
                    description="Backup, restore, and manage your pharmacy data."
                />

                {/* Data Overview */}
                <div className="bg-slate-50 rounded-xl p-5 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">Data Overview</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {[
                            { label: 'Total Customers', value: '8' },
                            { label: 'Total Products', value: '10' },
                            { label: 'Total Invoices', value: '~680' },
                            { label: 'Total Purchases', value: '5' },
                            { label: 'Data Since', value: 'Jan 2025' },
                            { label: 'Storage Used', value: '~2.4 MB' },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between gap-2 bg-white rounded-lg px-3 py-2 border">
                                <span className="text-slate-500">{label}</span>
                                <span className="font-medium text-slate-900">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Backup */}
                <div className="rounded-xl border bg-white p-4 space-y-4">
                    <p className="text-sm font-semibold text-slate-800">Data Backup</p>
                    <p className="text-sm text-muted-foreground">Last backup: Never</p>
                    <div className="flex flex-col gap-3">
                        <Button
                            variant="outline"
                            onClick={handleBackup}
                            disabled={isBackingUp}
                            className="w-full sm:w-fit"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {isBackingUp ? 'Creating backup...' : 'Create Backup'}
                        </Button>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground opacity-60">
                            <span>Schedule automatic backup</span>
                            <span className="text-xs">(Coming soon in Phase 2)</span>
                        </div>
                    </div>
                </div>

                {/* Reset */}
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-red-700">Reset Settings</p>
                    <p className="text-xs text-red-600">
                        This will reset all settings to their default values. Your pharmacy data will not be affected.
                    </p>
                    <Button
                        variant="outline"
                        className="w-full sm:w-auto border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700"
                        onClick={() => setShowResetConfirm(true)}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset to Defaults
                    </Button>
                </div>

                {/* App Version */}
                <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
                    <p>MediFlow v1.0.0 — Phase 1</p>
                    <p>Build: 2026-03-14</p>
                    <p>© 2026 MediFlow. All rights reserved.</p>
                </div>

                {/* Reset Confirmation Dialog */}
                <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset to Defaults?</DialogTitle>
                            <DialogDescription>
                                This will reset ALL settings to their default values. Your data (invoices, customers, products) will not be affected.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setShowResetConfirm(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={handleResetConfirm}
                            >
                                Yes, Reset
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </PermissionGate>
    );
}
