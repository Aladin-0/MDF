'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { voucherApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { DebitNote } from '@/types';

interface PurchaseReturnEditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    note: DebitNote | null;
    onSaved: (updated: DebitNote) => void;
}

export function PurchaseReturnEditModal({
    open,
    onOpenChange,
    note,
    onSaved,
}: PurchaseReturnEditModalProps) {
    const { toast } = useToast();
    const outletId = useOutletId();

    const [reason, setReason] = useState('');
    const [status, setStatus] = useState<'pending' | 'adjusted' | 'refunded'>('pending');
    const [items, setItems] = useState<Array<{
        batchId: string;
        productName: string;
        qty: number;
        rate: number;
        gstRate: number;
        total: number;
    }>>([]);
    const [revisionReasonCode, setRevisionReasonCode] = useState('correction');
    const [revisionReasonText, setRevisionReasonText] = useState('');
    const [saving, setSaving] = useState(false);
    const [conflictError, setConflictError] = useState<string | null>(null);

    useEffect(() => {
        if (!note || !open) return;
        setReason(note.reason || '');
        setStatus(note.status);
        setRevisionReasonCode('correction');
        setRevisionReasonText('');
        setConflictError(null);
        setItems(
            (note.items || []).map((item) => ({
                batchId: item.batchId,
                productName: item.productName,
                qty: item.qty,
                rate: item.rate,
                gstRate: item.gstRate,
                total: item.total,
            }))
        );
    }, [note, open]);

    function updateItemQty(idx: number, value: string) {
        const qty = parseFloat(value) || 0;
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== idx) return item;
                const subtotal = qty * item.rate;
                const gst = subtotal * (item.gstRate / 100);
                return { ...item, qty, total: subtotal + gst };
            })
        );
    }

    const grandTotal = items.reduce((sum, i) => sum + i.total, 0);

    async function handleSave() {
        if (!outletId || !note) return;

        if (!revisionReasonCode.trim() || !revisionReasonText.trim()) {
            toast({
                variant: 'destructive',
                title: 'Reason required',
                description: 'Please provide both a reason code and detailed reason text for the audit trail.',
            });
            return;
        }

        for (const item of items) {
            if (item.qty <= 0) {
                toast({
                    variant: 'destructive',
                    title: 'Invalid quantity',
                    description: `Quantity for "${item.productName}" must be greater than 0.`,
                });
                return;
            }
        }

        setSaving(true);
        setConflictError(null);

        const payload = {
            outletId,
            reason,
            status,
            revisionReasonCode,
            revisionReasonText,
            // OCC token — must match server's current updated_at
            expectedUpdatedAt: note.updatedAt,
            items: items.map((item) => ({
                batch_id: item.batchId,
                product_name: item.productName,
                qty: item.qty,
                gst_rate: item.gstRate,
            })),
        };

        try {
            const result = await voucherApi.updateDebitNote(note.id, payload);
            toast({ title: 'Purchase return updated successfully' });
            onSaved(result as DebitNote);
            onOpenChange(false);
        } catch (err: any) {
            if (err?.status === 409 || err?.response?.status === 409) {
                setConflictError(
                    'This return was modified by someone else while you were editing. Please close and reload to see the latest version.'
                );
                toast({
                    variant: 'destructive',
                    title: 'Edit conflict',
                    description: 'Someone else updated this record. Please reload.',
                });
            } else {
                const msg =
                    err?.response?.data?.error ||
                    err?.message ||
                    'Failed to update purchase return';
                toast({ variant: 'destructive', title: 'Error', description: String(msg) });
            }
        } finally {
            setSaving(false);
        }
    }

    if (!note) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto gap-0 p-0 border-t-4 border-t-amber-500">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                        Edit Purchase Return
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                            #{note.debitNoteNo}
                        </span>
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Distributor: <span className="font-medium">{note.distributorName}</span>
                        {note.purchaseInvoiceId && (
                            <> &bull; Linked Invoice</>
                        )}
                    </p>
                </DialogHeader>

                <div className="px-6 py-5 space-y-5">
                    {conflictError && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                            <p>{conflictError}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Return Date</Label>
                            <Input
                                value={note.date}
                                disabled
                                className="bg-muted text-muted-foreground"
                            />
                            <p className="text-xs text-muted-foreground">Date cannot be changed</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as any)}
                                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                            >
                                <option value="pending">Pending</option>
                                <option value="adjusted">Adjusted</option>
                                <option value="refunded">Refunded</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Reason for Return</Label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Why are these goods being returned to the distributor?"
                            rows={2}
                        />
                    </div>

                    <div>
                        <Label className="mb-2 block">Return Items</Label>
                        <p className="text-xs text-muted-foreground mb-3">
                            You can adjust quantities only. Rates and products are sourced from the original purchase.
                        </p>
                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Rate (₹)</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">GST%</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-28">Qty (strips)</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-3 py-2.5 font-medium">{item.productName}</td>
                                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                                                ₹{Number(item.rate).toFixed(2)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                                                {item.gstRate}%
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={item.qty}
                                                    onChange={(e) => updateItemQty(idx, e.target.value)}
                                                    className="w-24 text-right ml-auto h-8"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-medium">
                                                ₹{Number(item.total).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-muted/30 border-t-2">
                                        <td colSpan={4} className="px-3 py-2.5 text-right font-semibold">
                                            Server-recalculated Total
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-bold text-green-700">
                                            ₹{grandTotal.toFixed(2)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3" />
                            Final total is computed server-side from original purchase rates. Preview is approximate.
                        </p>
                    </div>

                    {/* Mandatory audit reason */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Audit Trail (Required)
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-amber-800">Reason Code</Label>
                                <select
                                    value={revisionReasonCode}
                                    onChange={(e) => setRevisionReasonCode(e.target.value)}
                                    className="w-full border rounded-md px-3 py-2 text-sm bg-white border-amber-200"
                                >
                                    <option value="correction">Correction</option>
                                    <option value="quantity_change">Quantity Change</option>
                                    <option value="status_update">Status Update</option>
                                    <option value="manager_override">Manager Override</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-amber-800">
                                    Detailed Reason <span className="text-red-500">*</span>
                                </Label>
                                <Textarea
                                    value={revisionReasonText}
                                    onChange={(e) => setRevisionReasonText(e.target.value)}
                                    placeholder="Describe exactly what was changed and why…"
                                    rows={2}
                                    className="border-amber-200 focus:border-amber-400"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row justify-between gap-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving || !!conflictError} className="min-w-[120px]">
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
