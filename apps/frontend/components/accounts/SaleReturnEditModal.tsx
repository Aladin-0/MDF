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

interface EditItemRow {
    originalSaleItemId: string;
    batchId: string;
    productName: string;
    batchNo: string;
    qtyReturned: number;
    returnRate: number;
    packSize: number;
    totalAmount: number;
}

interface SaleReturnEditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    returnData: any | null; // The data loaded from detail view (includes updatedAt)
    onSaved: (updated: any) => void;
}

export function SaleReturnEditModal({
    open,
    onOpenChange,
    returnData,
    onSaved,
}: SaleReturnEditModalProps) {
    const { toast } = useToast();
    const outletId = useOutletId();

    const [reason, setReason] = useState('');
    const [refundMode, setRefundMode] = useState<'cash' | 'upi' | 'credit_note'>('cash');
    const [items, setItems] = useState<EditItemRow[]>([]);
    const [revisionReasonCode, setRevisionReasonCode] = useState('correction');
    const [revisionReasonText, setRevisionReasonText] = useState('');
    const [saving, setSaving] = useState(false);
    const [conflictError, setConflictError] = useState<string | null>(null);

    // Populate form when returnData changes
    useEffect(() => {
        if (!returnData || !open) return;
        setReason(returnData.reason || '');
        setRefundMode(returnData.refundMode || 'cash');
        setRevisionReasonCode('correction');
        setRevisionReasonText('');
        setConflictError(null);

        // Build item rows from return detail data
        const rows: EditItemRow[] = (returnData.items || []).map((item: any) => ({
            originalSaleItemId: item.originalSaleItemId || '',
            batchId: item.batchId || '',
            productName: item.productName,
            batchNo: item.batchNo,
            qtyReturned: item.qtyReturned,
            returnRate: item.returnRate,
            packSize: item.packSize || 1,
            totalAmount: item.totalAmount,
        }));
        setItems(rows);
    }, [returnData, open]);

    function updateItemQty(idx: number, value: string) {
        const qty = parseInt(value) || 0;
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== idx) return item;
                return {
                    ...item,
                    qtyReturned: qty,
                    totalAmount: qty * item.returnRate,
                };
            })
        );
    }

    const grandTotal = items.reduce((sum, i) => sum + i.qtyReturned * i.returnRate, 0);

    async function handleSave() {
        if (!outletId || !returnData) return;

        if (!revisionReasonCode.trim() || !revisionReasonText.trim()) {
            toast({
                variant: 'destructive',
                title: 'Reason required',
                description: 'Please provide both a reason code and detailed reason text.',
            });
            return;
        }

        // Validate quantities
        for (const item of items) {
            if (item.qtyReturned <= 0) {
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
            refundMode,
            revisionReasonCode,
            revisionReasonText,
            // OCC token — must match server's current updated_at
            expectedUpdatedAt: returnData.updatedAt,
            items: items.map((item) => ({
                originalSaleItemId: item.originalSaleItemId,
                batchId: item.batchId,
                productName: item.productName,
                qtyReturned: item.qtyReturned,
                returnRate: item.returnRate,
                totalAmount: item.qtyReturned * item.returnRate,
            })),
        };

        try {
            const result = await voucherApi.updateSalesReturn(returnData.id, payload);
            toast({ title: 'Sale return updated successfully' });
            onSaved(result.data || result);
            onOpenChange(false);
        } catch (err: any) {
            // 409 = stale edit conflict
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
                    'Failed to update sale return';
                toast({ variant: 'destructive', title: 'Error', description: String(msg) });
            }
        } finally {
            setSaving(false);
        }
    }

    if (!returnData) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto gap-0 p-0 border-t-4 border-t-amber-500">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                        Edit Sale Return
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                            #{returnData.returnNo}
                        </span>
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Original invoice: <span className="font-mono">{returnData.originalInvoiceNo}</span>
                        {returnData.customerName && (
                            <> &bull; Customer: <span className="font-medium">{returnData.customerName}</span></>
                        )}
                    </p>
                </DialogHeader>

                <div className="px-6 py-5 space-y-5">
                    {/* Conflict warning banner */}
                    {conflictError && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                            <p>{conflictError}</p>
                        </div>
                    )}

                    {/* Header fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Return Date</Label>
                            <Input
                                value={returnData.returnDate}
                                disabled
                                className="bg-muted text-muted-foreground"
                            />
                            <p className="text-xs text-muted-foreground">Return date cannot be changed</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Refund Mode</Label>
                            <select
                                value={refundMode}
                                onChange={(e) => setRefundMode(e.target.value as any)}
                                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                            >
                                <option value="cash">Cash</option>
                                <option value="upi">UPI</option>
                                <option value="credit_note">Credit Note</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Reason for Return</Label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Why was this item returned?"
                            rows={2}
                        />
                    </div>

                    {/* Items table */}
                    <div>
                        <Label className="mb-2 block">Return Items</Label>
                        <p className="text-xs text-muted-foreground mb-3">
                            You can only adjust quantities. Product, batch, and rates cannot be changed in V1.
                        </p>
                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Batch</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Rate (₹/loose)</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-28">Qty (loose)</th>
                                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-3 py-2.5 font-medium">{item.productName}</td>
                                            <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                                                {item.batchNo}
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                                                ₹{Number(item.returnRate).toFixed(2)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={item.qtyReturned}
                                                    onChange={(e) => updateItemQty(idx, e.target.value)}
                                                    className="w-24 text-right ml-auto h-8"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-medium">
                                                ₹{(item.qtyReturned * item.returnRate).toFixed(2)}
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
                            Final total is computed server-side from original sale rates. Your preview is approximate.
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
                                    <option value="refund_mode_change">Refund Mode Change</option>
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
