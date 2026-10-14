'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowUpLeft, Plus, Eye, Pencil } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi } from '@/lib/apiClient';
import { DebitNote } from '@/types';
import { cn } from '@/lib/utils';
import { PurchaseReturnDetailModal } from '@/components/accounts/PurchaseReturnDetailModal';

const STATUS_COLORS = {
    pending: 'bg-yellow-100 text-yellow-800',
    adjusted: 'bg-blue-100 text-blue-800',
    refunded: 'bg-green-100 text-green-800',
};

export default function PurchaseReturnsPage() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const [notes, setNotes] = useState<DebitNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNote, setSelectedNote] = useState<DebitNote | null>(null);

    useEffect(() => {
        if (!outletId) return;
        voucherApi
            .getDebitNotes(outletId)
            .then(setNotes)
            .catch(() => toast({ variant: 'destructive', title: 'Failed to load purchase returns' }))
            .finally(() => setLoading(false));
    }, [outletId]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ArrowUpLeft className="h-4 w-4" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Purchase Returns</h1>
                    </div>
                    <p className="pl-[46px] text-sm text-muted-foreground">
                        Debit notes — return goods to distributors
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/accounts/purchase-returns/new">
                        <Plus className="mr-2 h-4 w-4" /> New Return
                    </Link>
                </Button>
            </div>

            <Separator />

            {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
            ) : notes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <ArrowUpLeft className="mx-auto h-10 w-10 mb-3 opacity-30" />
                    <p className="font-medium">No purchase returns yet</p>
                    <p className="text-sm mt-1">Create a debit note when returning goods to a distributor</p>
                    <Button asChild className="mt-4" variant="outline">
                        <Link href="/dashboard/accounts/purchase-returns/new">Create Debit Note</Link>
                    </Button>
                </div>
            ) : (
                <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note No</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Distributor</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground w-28">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {notes.map((note) => (
                                <tr 
                                    key={note.id} 
                                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedNote(note)}
                                >
                                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{note.debitNoteNo}</td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {format(new Date(note.date), 'dd MMM yyyy')}
                                    </td>
                                    <td className="px-4 py-3">{note.distributorName}</td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                        ₹{note.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[note.status])}>
                                            {note.status.charAt(0).toUpperCase() + note.status.slice(1)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelectedNote(note)}
                                                className="h-8 px-2 text-xs"
                                                title="View return details"
                                            >
                                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                                className="h-8 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                                title="Edit debit note"
                                            >
                                                <Link href={`/dashboard/accounts/purchase-returns/${note.id}/edit`}>
                                                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                                                </Link>
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            <PurchaseReturnDetailModal
                open={!!selectedNote}
                onOpenChange={(open) => !open && setSelectedNote(null)}
                note={selectedNote}
            />
        </div>
    );
}
