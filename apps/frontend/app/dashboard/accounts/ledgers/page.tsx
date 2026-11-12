'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { List, Search, RefreshCw, Plus, Eye, EyeOff, Pencil } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi } from '@/lib/apiClient';
import { Ledger } from '@/types';
import { CreateLedgerModal } from '@/components/accounts/CreateLedgerModal';
import { cn } from '@/lib/utils';

const NATURE_COLORS: Record<string, string> = {
    asset: 'bg-blue-100 text-blue-700',
    liability: 'bg-orange-100 text-orange-700',
    income: 'bg-green-100 text-green-700',
    expense: 'bg-red-100 text-red-700',
};

const LEDGER_NAME_COLORS: Record<string, string> = {
    red: 'text-red-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
    normal: '',
};

export default function LedgersPage() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editLedger, setEditLedger] = useState<Ledger | null>(null);

    function load() {
        if (!outletId) return;
        setLoading(true);
        voucherApi
            .getLedgers(outletId, { search: search || undefined })
            .then(setLedgers)
            .catch(() => toast({ variant: 'destructive', title: 'Failed to load ledgers' }))
            .finally(() => setLoading(false));
    }

    useEffect(() => { load(); }, [outletId, search]);

    async function handleSync() {
        if (!outletId) return;
        setSyncing(true);
        try {
            await voucherApi.syncLedgers(outletId);
            toast({ title: 'Ledgers synced', description: 'Customers and distributors updated' });
            load();
        } catch {
            toast({ variant: 'destructive', title: 'Sync failed' });
        } finally {
            setSyncing(false);
        }
    }

    function handleLedgerSaved(ledger: Ledger) {
        setShowCreateModal(false);
        setEditLedger(null);
        load();
    }

    const visibleLedgers = showHidden ? ledgers : ledgers.filter((l) => !l.isHidden);
    const hiddenCount = ledgers.filter((l) => l.isHidden).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <List className="h-4 w-4" />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ledger Master</h1>
                    </div>
                    <p className="pl-[46px] text-sm text-muted-foreground">
                        All accounts — cash, bank, debtors, creditors, income &amp; expenses
                    </p>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                    <Button variant="outline" onClick={handleSync} disabled={syncing}>
                        <RefreshCw className={cn('mr-2 h-4 w-4', syncing && 'animate-spin')} />
                        Sync
                    </Button>
                    <Button className="flex-1 sm:flex-none" onClick={() => setShowCreateModal(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Ledger
                    </Button>
                </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative w-full sm:flex-1 sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search ledger name..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <span className="text-sm text-muted-foreground">{visibleLedgers.length} ledgers</span>
                {hiddenCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHidden((v) => !v)}
                        className="text-muted-foreground"
                    >
                        {showHidden ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
                        {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
            ) : visibleLedgers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <List className="mx-auto h-10 w-10 mb-3 opacity-30" />
                    <p className="font-medium">No ledgers found</p>
                    <p className="text-sm mt-1">Click &quot;Create Ledger&quot; or &quot;Sync&quot; to add ledgers</p>
                </div>
            ) : (
                <>
                <div className="space-y-3 md:hidden">
                    {visibleLedgers.map((ledger) => (
                        <div
                            key={ledger.id}
                            className={cn(
                                'rounded-lg border bg-card p-3',
                                ledger.isHidden && 'opacity-50',
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className={cn(
                                        'font-medium break-words',
                                        LEDGER_NAME_COLORS[ledger.color ?? 'normal'],
                                    )}>
                                        {ledger.name}
                                    </div>
                                    {ledger.isSystem && (
                                        <span className="text-xs text-muted-foreground">System</span>
                                    )}
                                    {ledger.isHidden && (
                                        <span className="text-xs text-muted-foreground ml-1">(hidden)</span>
                                    )}
                                    <p className="mt-0.5 text-xs text-muted-foreground break-words">{ledger.groupName}</p>
                                </div>
                                <div className="shrink-0 text-right font-medium">
                                    <span className={cn(
                                        ledger.currentBalance < 0 ? 'text-destructive' : 'text-foreground'
                                    )}>
                                        ₹{Math.abs(ledger.currentBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="ml-1 text-xs text-muted-foreground">{ledger.balanceType}</span>
                                    <div className="mt-1">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', NATURE_COLORS[ledger.nature] || 'bg-muted text-muted-foreground')}>
                                            {ledger.nature}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-9"
                                    onClick={() => setEditLedger(ledger)}
                                >
                                    <Pencil className="h-3.5 w-3.5 mr-1" />
                                    Edit
                                </Button>
                                <Button asChild variant="outline" size="sm" className="flex-1 h-9">
                                    <Link href={`/dashboard/accounts/ledgers/${ledger.id}`}>
                                        View
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="hidden md:block rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Group</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nature</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {visibleLedgers.map((ledger) => (
                                <tr
                                    key={ledger.id}
                                    className={cn(
                                        'hover:bg-muted/30 transition-colors',
                                        ledger.isHidden && 'opacity-50',
                                    )}
                                >
                                    <td className="px-4 py-3">
                                        <div className={cn(
                                            'font-medium',
                                            LEDGER_NAME_COLORS[ledger.color ?? 'normal'],
                                        )}>
                                            {ledger.name}
                                        </div>
                                        {ledger.isSystem && (
                                            <span className="text-xs text-muted-foreground">System</span>
                                        )}
                                        {ledger.isHidden && (
                                            <span className="text-xs text-muted-foreground ml-1">(hidden)</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{ledger.groupName}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', NATURE_COLORS[ledger.nature] || 'bg-muted text-muted-foreground')}>
                                            {ledger.nature}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium">
                                        <span className={cn(
                                            ledger.currentBalance < 0 ? 'text-destructive' : 'text-foreground'
                                        )}>
                                            ₹{Math.abs(ledger.currentBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </span>
                                        <span className="ml-1 text-xs text-muted-foreground">{ledger.balanceType}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setEditLedger(ledger)}
                                            >
                                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                                Edit
                                            </Button>
                                            <Button asChild variant="ghost" size="sm">
                                                <Link href={`/dashboard/accounts/ledgers/${ledger.id}`}>
                                                    View
                                                </Link>
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            {/* Create Ledger Modal */}
            {showCreateModal && outletId && (
                <CreateLedgerModal
                    outletId={outletId}
                    onSave={handleLedgerSaved}
                    onClose={() => setShowCreateModal(false)}
                />
            )}

            {/* Edit Ledger Modal */}
            {editLedger && outletId && (
                <CreateLedgerModal
                    outletId={outletId}
                    ledgerToEdit={editLedger}
                    onSave={handleLedgerSaved}
                    onClose={() => setEditLedger(null)}
                />
            )}
        </div>
    );
}
