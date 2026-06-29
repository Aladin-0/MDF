'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { voucherApi } from '@/lib/apiClient';
import { PendingBill, BillAdjustment } from '@/types';
import { cn } from '@/lib/utils';

interface BillAdjustmentModalProps {
    outletId: string;
    ledgerId: string;
    totalAmount: number;
    voucherType: 'receipt' | 'payment';
    onConfirm: (adjustments: BillAdjustment[]) => void;
    onSkip: () => void;
}

export function BillAdjustmentModal({
    outletId,
    ledgerId,
    totalAmount,
    voucherType,
    onConfirm,
    onSkip,
}: BillAdjustmentModalProps) {
    const [bills, setBills] = useState<PendingBill[]>([]);
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        voucherApi
            .getPendingBills(outletId, ledgerId)
            .then((data: PendingBill[]) => {
                setBills(data);
                // FIFO auto-fill
                let remaining = totalAmount;
                const filled: Record<string, string> = {};
                for (const bill of data) {
                    if (remaining <= 0) {
                        filled[bill.id] = '0';
                    } else {
                        const adj = Math.min(remaining, bill.outstanding);
                        filled[bill.id] = adj.toFixed(2);
                        remaining -= adj;
                    }
                }
                setAmounts(filled);
            })
            .catch(() => setBills([]))
            .finally(() => setLoading(false));
    }, [outletId, ledgerId, totalAmount]);

    // Handle Escape key
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onSkip();
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onSkip]);

    const totalAdjusted = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const remaining = totalAmount - totalAdjusted;
    const isOver = totalAdjusted > totalAmount;

    function handleConfirm() {
        const adjustments: BillAdjustment[] = bills
            .filter((b) => (parseFloat(amounts[b.id]) || 0) > 0)
            .map((b) => ({
                invoiceId: b.id,
                invoiceType: b.invoiceType,
                adjustedAmount: parseFloat(amounts[b.id]) || 0,
            }));
        onConfirm(adjustments);
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h2 className="text-lg font-semibold">Bill Adjustment</h2>
                        <p className="text-sm text-muted-foreground">
                            Total Amount: ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium">
                            Remaining:{' '}
                            <span className={cn(
                                'font-bold',
                                remaining === 0 && 'text-green-600',
                                isOver && 'text-destructive',
                                remaining > 0 && 'text-orange-500',
                            )}>
                                ₹{remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onSkip}
                        className="ml-4 p-1.5 rounded hover:bg-muted transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="px-6 py-8 text-center text-sm text-muted-foreground">Loading pending bills...</div>
                    ) : bills.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                            No pending bills found. The amount will be applied On Account.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Bill No</th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Pending (₹)</th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Adjust (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {bills.map((bill) => (
                                    <tr key={bill.id} className="hover:bg-muted/20">
                                        <td className="px-4 py-2.5 font-medium">{bill.invoiceNo}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">
                                            {format(new Date(bill.date), 'dd-MM-yy')}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            ₹{bill.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Input
                                                type="number"
                                                min="0"
                                                max={bill.outstanding}
                                                step="0.01"
                                                className="text-right w-28 ml-auto"
                                                value={amounts[bill.id] ?? '0'}
                                                onChange={(e) =>
                                                    setAmounts((prev) => ({ ...prev, [bill.id]: e.target.value }))
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t gap-3">
                    <div className="text-sm">
                        {isOver && (
                            <span className="text-destructive font-medium">
                                Over-adjusted by ₹{Math.abs(remaining).toFixed(2)}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button
                            onClick={handleConfirm}
                            disabled={isOver}
                        >
                            Confirm Adjustment
                        </Button>
                        <Button variant="outline" onClick={onSkip}>
                            On Account <span className="ml-1.5 text-xs opacity-60">Esc</span>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
