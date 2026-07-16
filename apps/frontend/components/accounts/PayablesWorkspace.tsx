'use client';

import { useState } from 'react';
import { BookOpen, Banknote, Building2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDistributorOutstanding } from '@/hooks/useAccounts';
import { DistributorOutstanding } from '@/types';
import { cn } from '@/lib/utils';
import { LedgerDrawer } from './LedgerDrawer';
import { PayDistributorSheet } from './PayDistributorSheet';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AVATAR_COLORS = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
];

function avatarColor(name: string) {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function DistributorCard({
    d,
    onPayNow,
    onViewLedger,
}: {
    d: DistributorOutstanding;
    onPayNow: () => void;
    onViewLedger: () => void;
}) {
    const color = avatarColor(d.name);
    return (
        <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold', color)}>
                        {initials(d.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{d.name}</p>
                        {d.gstin && <p className="font-mono text-[11px] text-muted-foreground truncate">{d.gstin}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {d.totalBills} bill{d.totalBills !== 1 ? 's' : ''}
                            {d.overdueBills > 0 && (
                                <> · <span className="text-red-600 font-medium">{d.overdueBills} overdue</span></>
                            )}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-lg font-bold tabular-nums text-red-600">{formatINR(d.totalOutstanding)}</p>
                        {d.overdueAmount > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                                {formatINR(d.overdueAmount)} overdue
                            </span>
                        )}
                    </div>
                </div>
                <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-8 text-xs" onClick={onViewLedger}>
                        <BookOpen className="h-3.5 w-3.5" />
                        View Ledger
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5 h-8 text-xs" onClick={onPayNow}>
                        <Banknote className="h-3.5 w-3.5" />
                        Pay Now
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export function PayablesWorkspace() {
    const { data: distOutstanding, isLoading: distLoading } = useDistributorOutstanding();
    const [paySheetOpen, setPaySheetOpen] = useState(false);
    const [payDistributorId, setPayDistributorId] = useState<string | undefined>();
    const [ledgerState, setLedgerState] = useState<{
        open: boolean;
        entityId: string;
        entityName: string;
    }>({ open: false, entityId: '', entityName: '' });

    const openLedger = (id: string, name: string) => {
        setLedgerState({ open: true, entityId: id, entityName: name });
    };

    const openPayNow = (id: string) => {
        setPayDistributorId(id);
        setPaySheetOpen(true);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-red-500" />
                <h3 className="font-semibold text-lg">Payables</h3>
            </div>

            {distLoading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-4 space-y-2">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-20" />
                                    </div>
                                    <Skeleton className="h-6 w-24" />
                                </div>
                                <Skeleton className="h-8 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : !(distOutstanding ?? []).length ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-slate-50">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </div>
                    <p className="font-medium">All payments are clear</p>
                    <p className="text-sm text-muted-foreground mt-0.5">No outstanding dues to distributors.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(distOutstanding ?? []).map((d: any) => (
                        <DistributorCard
                            key={d.distributorId}
                            d={d}
                            onPayNow={() => openPayNow(d.distributorId)}
                            onViewLedger={() => openLedger(d.distributorId, d.name)}
                        />
                    ))}
                </div>
            )}

            <LedgerDrawer
                open={ledgerState.open}
                onClose={() => setLedgerState(s => ({ ...s, open: false }))}
                entityType="distributor"
                entityId={ledgerState.entityId}
                entityName={ledgerState.entityName}
            />

            <PayDistributorSheet
                open={paySheetOpen}
                onClose={() => { setPaySheetOpen(false); setPayDistributorId(undefined); }}
                preSelectedDistributorId={payDistributorId}
                onSuccess={() => {}}
            />
        </div>
    );
}
