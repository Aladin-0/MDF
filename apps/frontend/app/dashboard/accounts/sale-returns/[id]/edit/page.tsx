'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Save, AlertTriangle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { salesApi, voucherApi } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { useSaleReturnCart, ReturnItemRow } from '@/hooks/useSaleReturnCart';
import { SaleReturnItemsGrid } from '@/components/accounts/SaleReturnItemsGrid';

const REVISION_REASON_OPTIONS = [
    { value: 'correction', label: 'Correction' },
    { value: 'quantity_change', label: 'Quantity Change' },
    { value: 'refund_mode_change', label: 'Refund Mode Change' },
    { value: 'manager_override', label: 'Manager Override' },
];

function EditSaleReturnContent() {
    const params = useParams();
    const returnId = params?.id as string;
    const outletId = useOutletId();
    const router = useRouter();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [conflictError, setConflictError] = useState<string | null>(null);

    // Header fields
    const [returnNo, setReturnNo] = useState('');
    const [date, setDate] = useState('');
    const [originalInvoiceNo, setOriginalInvoiceNo] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [reason, setReason] = useState('');
    const [refundMode, setRefundMode] = useState<'cash' | 'upi' | 'credit_note' | 'adjust'>('cash');
    const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | undefined>();
    const [deductionAmount, setDeductionAmount] = useState('');

    // Audit Trail fields (Mandatory)
    const [revisionReasonCode, setRevisionReasonCode] = useState('correction');
    const [revisionReasonText, setRevisionReasonText] = useState('');

    const {
        items,
        setItems,
        updateItem: updateCartItem,
        removeItem,
        subtotal,
        gstAmount,
        totalAmount,
    } = useSaleReturnCart([]);

    const deductionNum = Math.max(0, parseFloat(deductionAmount) || 0);
    const netRefundAmount = Math.max(0, totalAmount - deductionNum);

    // Fetch existing return details on mount
    useEffect(() => {
        if (!returnId) return;

        let isMounted = true;
        setLoading(true);

        salesApi.getReturnById(returnId)
            .then((res: any) => {
                if (!isMounted) return;
                const d = res?.data || res;
                if (!d) return;

                setReturnNo(d.returnNo || '');
                setDate(d.returnDate || format(new Date(), 'yyyy-MM-dd'));
                setOriginalInvoiceNo(d.originalInvoiceNo || '');
                setCustomerName(d.customerName || 'Walk-in');
                setReason(d.reason || '');
                setRefundMode(d.refundMode || 'cash');
                setExpectedUpdatedAt(d.updatedAt);
                if (d.deductionAmount) {
                    setDeductionAmount(String(d.deductionAmount));
                }

                if (Array.isArray(d.items)) {
                    const loadedItems: ReturnItemRow[] = d.items.map((it: any) => {
                        const packSize = it.packSize || 1;
                        const qtyReturned = it.qtyReturned || 0;
                        const strips = it.qtyStrips !== undefined 
                            ? it.qtyStrips 
                            : Math.floor(qtyReturned / packSize);
                        const loose = it.qtyLoose !== undefined 
                            ? it.qtyLoose 
                            : qtyReturned % packSize;

                        return {
                            id: it.id || Math.random().toString(36).slice(2),
                            saleItemId: it.originalSaleItemId || it.saleItemId,
                            originalSaleItemId: it.originalSaleItemId || it.saleItemId,
                            batchId: it.batchId || '',
                            productName: it.productName || 'Unknown Product',
                            batchNo: it.batchNo || '',
                            packSize,
                            qtyStrips: String(strips),
                            qtyLoose: String(loose),
                            rate: String(it.rate || '0'),
                            gstRate: String(it.gstRate || '0'),
                            total: parseFloat(it.total || 0),
                        };
                    });
                    setItems(loadedItems);
                }
            })
            .catch((err: any) => {
                if (!isMounted) return;
                toast({
                    variant: 'destructive',
                    title: 'Failed to load sale return',
                    description: err?.message || 'Could not retrieve details.',
                });
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [returnId]);

    const updateItem = (id: string, field: keyof ReturnItemRow, value: string) => {
        updateCartItem(id, field, value, (maxUnits, enteredUnits) => {
            toast({
                variant: 'destructive',
                title: 'Quantity Exceeded',
                description: `Entered ${enteredUnits} units exceeds maximum allowed (${maxUnits} units).`,
            });
        });
    };

    const handleSave = async () => {
        if (!outletId || !returnId) return;

        // Validation: Audit Reason fields are mandatory
        if (!revisionReasonCode.trim() || !revisionReasonText.trim()) {
            toast({
                variant: 'destructive',
                title: 'Modification Reason Required',
                description: 'You must select a reason code and provide justification text for compliance.',
            });
            return;
        }

        // Validate items
        const validItems = items.filter((i) => {
            const qs = parseFloat(i.qtyStrips) || 0;
            const ql = parseFloat(i.qtyLoose) || 0;
            return qs > 0 || ql > 0;
        });

        if (validItems.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No Items to Return',
                description: 'Please specify returned quantities for at least one item.',
            });
            return;
        }

        setSaving(true);
        setConflictError(null);

        // Build Payload
        const payload = {
            outletId,
            reason,
            refund_mode: refundMode,
            refundMode,
            revisionReasonCode,
            revisionReasonText,
            expectedUpdatedAt,
            deductionAmount: deductionNum,
            deduction_amount: deductionNum,
            totalAmount: netRefundAmount,
            total_amount: netRefundAmount,
            items: validItems.map((i) => {
                const qs = parseInt(i.qtyStrips, 10) || 0;
                const ql = parseInt(i.qtyLoose, 10) || 0;
                const ps = i.packSize || 1;
                const totalUnits = qs * ps + ql;
                const sid = i.originalSaleItemId || i.saleItemId;
                const rateNum = parseFloat(i.rate) || 0;
                const gstRateNum = parseFloat(i.gstRate) || 0;

                return {
                    originalSaleItemId: sid,
                    original_sale_item_id: sid,
                    saleItemId: sid,
                    sale_item_id: sid,
                    batchId: i.batchId,
                    batch_id: i.batchId,
                    qtyReturned: totalUnits,
                    qty_returned: totalUnits,
                    qtyStrips: qs,
                    qty_strips: qs,
                    qtyLoose: ql,
                    qty_loose: ql,
                    packSize: ps,
                    pack_size: ps,
                    returnRate: rateNum,
                    return_rate: rateNum,
                    rate: rateNum,
                    gstRate: gstRateNum,
                    gst_rate: gstRateNum,
                    total: i.total,
                    totalAmount: i.total,
                };
            }),
        };

        try {
            await voucherApi.updateSalesReturn(returnId, payload);
            toast({
                title: 'Sale Return Revised',
                description: `Return #${returnNo} has been successfully modified.`,
            });
            router.push('/dashboard/accounts/sale-returns');
        } catch (err: any) {
            const isConflict = err?.status === 409 || err?.response?.status === 409 || err?.code === 'stale_edit_conflict';
            if (isConflict) {
                setConflictError(
                    'This return was modified by another session while you were editing. Please reload to see the latest changes.'
                );
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Failed to update return',
                    description: err?.detail || err?.message || 'Server error occurred during update.',
                });
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-16 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading return details...</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-4">
            {/* Compressed Top Navigation Bar with Inline Primary Actions */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/dashboard/accounts/sale-returns">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-slate-800 leading-none">Edit Sale Return</h1>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                #{returnNo}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Update returned quantities and refund terms with full audit tracking
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild disabled={saving} className="h-8 text-xs">
                        <Link href="/dashboard/accounts/sale-returns">Cancel</Link>
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs min-w-[140px] font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700">
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* OCC Conflict Alert */}
            {conflictError && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                    <div className="flex-1">
                        <p className="font-bold">Edit Conflict Detected</p>
                        <p className="mt-0.5 text-red-700">{conflictError}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.location.reload()}
                            className="mt-2 h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                        >
                            Reload Latest Version
                        </Button>
                    </div>
                </div>
            )}

            {/* Compressed Context Strip (Receipt Overview) */}
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-white border border-slate-200 shadow-xs text-xs">
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Original Invoice</span>
                    <span className="font-mono font-bold text-slate-800 text-xs">{originalInvoiceNo || '—'}</span>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer</span>
                    <span className="font-semibold text-slate-800 text-xs">{customerName || 'Walk-in'}</span>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Return Date</span>
                    <span className="font-medium text-slate-700 text-xs">{date}</span>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Integrity</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5" /> Synchronized
                    </span>
                </div>
            </div>

            {/* Compressed Audit Trail Strip */}
            <div className="w-full p-3 rounded-lg border border-amber-200 bg-amber-50/50 shadow-xs space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Audit Trail Compliance (Mandatory)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-amber-950">
                            Reason Code <span className="text-red-600">*</span>
                        </Label>
                        <select
                            value={revisionReasonCode}
                            onChange={(e) => setRevisionReasonCode(e.target.value)}
                            className="w-full h-8 rounded-md border border-amber-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                            {REVISION_REASON_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-amber-950">
                            Justification / Remarks <span className="text-red-600">*</span>
                        </Label>
                        <Input
                            placeholder="Explain why this sale return is being modified..."
                            value={revisionReasonText}
                            onChange={(e) => setRevisionReasonText(e.target.value)}
                            className="h-8 bg-white text-xs border-amber-200 focus-visible:ring-amber-500"
                        />
                    </div>
                </div>
            </div>

            {/* High-Density POS Returns Items Matrix */}
            <SaleReturnItemsGrid
                items={items}
                onUpdateItem={updateItem}
                onRemoveItem={removeItem}
                mode="edit"
                readOnlyProductInfo={true}
                allowAddItem={false}
            />

            {/* Footer Operations & Formal Ledger Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
                {/* Left Rail: Notes & Refund Mode */}
                <div className="lg:col-span-7 space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Reason for Return</Label>
                        <Textarea
                            rows={2}
                            placeholder="e.g. Wrong medicine dispensed, customer returned unopened item..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="text-xs resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Refund Settlement Mode</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { value: 'cash', label: 'Cash' },
                                { value: 'upi', label: 'UPI' },
                                { value: 'credit_note', label: 'Credit Note' },
                                { value: 'adjust', label: 'Adjust Dues' },
                            ].map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setRefundMode(m.value as any)}
                                    className={cn(
                                        'rounded border py-1.5 text-xs font-semibold transition-all text-center',
                                        refundMode === m.value
                                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs ring-1 ring-blue-600'
                                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                    )}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Rail: Formal Accounting Ledger Summary Card */}
                <div className="lg:col-span-5 flex justify-end">
                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs w-full max-w-sm">
                        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Credit Note Ledger</span>
                            <span className="text-[10px] font-mono font-medium text-slate-500">
                                {items.length} {items.length === 1 ? 'Line Item' : 'Line Items'}
                            </span>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                            <div className="flex justify-between text-slate-600">
                                <span>Gross Return Total</span>
                                <span className="font-mono font-semibold text-slate-800">₹{totalAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 text-[11px]">
                                <span>Taxable Subtotal</span>
                                <span className="font-mono text-slate-600">₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 text-[11px]">
                                <span>GST Value (Exact Rate)</span>
                                <span className="font-mono text-slate-600">₹{gstAmount.toFixed(2)}</span>
                            </div>
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="font-semibold text-xs text-amber-900">Return Deduction / Fee (-)</span>
                                <div className="relative w-28">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₹</span>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0.00"
                                        value={deductionAmount}
                                        onChange={(e) => setDeductionAmount(e.target.value)}
                                        className="h-7 text-xs font-mono font-bold text-right pl-5 pr-2 bg-amber-50/60 border-amber-200 focus-visible:ring-amber-500 text-amber-900"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-3.5 py-2.5 bg-slate-100 border-t-2 border-slate-300 flex justify-between items-baseline">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Net Refund Amount</span>
                            <span className="font-mono text-base font-black text-slate-900">₹{netRefundAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function EditSaleReturnPage() {
    return (
        <Suspense fallback={
            <div className="p-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="mt-2 text-sm">Loading sale return workspace...</p>
            </div>
        }>
            <EditSaleReturnContent />
        </Suspense>
    );
}
