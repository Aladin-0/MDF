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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { usePurchaseReturnCart, PurchaseReturnItemRow } from '@/hooks/usePurchaseReturnCart';
import { PurchaseReturnItemsGrid } from '@/components/accounts/PurchaseReturnItemsGrid';

const REVISION_REASON_OPTIONS = [
    { value: 'correction', label: 'Correction' },
    { value: 'quantity_change', label: 'Quantity Change' },
    { value: 'rate_change', label: 'Rate / Price Change' },
    { value: 'distributor_claim', label: 'Distributor Claim Adjustment' },
    { value: 'manager_override', label: 'Manager Override' },
];

function EditPurchaseReturnContent() {
    const params = useParams();
    const returnId = params?.id as string;
    const outletId = useOutletId();
    const router = useRouter();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [conflictError, setConflictError] = useState<string | null>(null);

    // Header fields
    const [debitNoteNo, setDebitNoteNo] = useState('');
    const [date, setDate] = useState('');
    const [distributorName, setDistributorName] = useState('');
    const [distributorId, setDistributorId] = useState('');
    const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<string | undefined>();
    const [reason, setReason] = useState('');
    const [status, setStatus] = useState<'pending' | 'adjusted' | 'refunded'>('pending');
    const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | undefined>();

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
    } = usePurchaseReturnCart([]);

    // Fetch existing debit note details on mount
    useEffect(() => {
        if (!returnId) return;

        let isMounted = true;
        setLoading(true);

        voucherApi.getDebitNote(returnId)
            .then((d: any) => {
                if (!isMounted) return;
                if (!d) return;

                setDebitNoteNo(d.debitNoteNo || '');
                setDate(d.date || format(new Date(), 'yyyy-MM-dd'));
                setDistributorName(d.distributorName || 'Distributor');
                setDistributorId(d.distributorId || '');
                setPurchaseInvoiceId(d.purchaseInvoiceId || undefined);
                setReason(d.reason || '');
                setStatus(d.status || 'pending');
                setExpectedUpdatedAt(d.updatedAt);

                if (Array.isArray(d.items)) {
                    const loadedItems: PurchaseReturnItemRow[] = d.items.map((it: any) => {
                        const packSize = it.packSize || 1;
                        const qty = parseFloat(it.qty) || 0;
                        const strips = Math.floor(qty);
                        const loose = Math.round((qty - strips) * packSize);

                        return {
                            id: it.id || Math.random().toString(36).slice(2),
                            batchId: it.batchId || '',
                            productName: it.productName || 'Unknown Product',
                            batchNo: it.batchNo || '',
                            expiryDate: it.expiryDate || '',
                            packSize,
                            qtyStrips: String(strips),
                            qtyLoose: String(loose),
                            rate: String(it.rate || '0'),
                            gstRate: String(it.gstRate || '0'),
                            total: parseFloat(it.total || 0),
                            reason: it.reason || 'correction',
                        };
                    });
                    setItems(loadedItems);
                }
            })
            .catch((err: any) => {
                if (!isMounted) return;
                toast({
                    variant: 'destructive',
                    title: 'Failed to load debit note',
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

    const handleUpdateItem = (id: string, field: keyof PurchaseReturnItemRow, value: string) => {
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
            status,
            revisionReasonCode,
            revisionReasonText,
            expectedUpdatedAt,
            items: validItems.map((i) => {
                const qs = parseFloat(i.qtyStrips) || 0;
                const ql = parseFloat(i.qtyLoose) || 0;
                const ps = i.packSize || 1;
                const fractionalStrips = qs + (ql / ps);

                return {
                    batch_id: i.batchId,
                    product_name: i.productName,
                    qty: fractionalStrips,
                    rate: parseFloat(i.rate) || 0,
                    gst_rate: parseFloat(i.gstRate) || 0,
                    total: i.total,
                };
            }),
        };

        try {
            await voucherApi.updateDebitNote(returnId, payload);
            toast({
                title: 'Debit Note Revised',
                description: `Return #${debitNoteNo} has been successfully modified.`,
            });
            router.push('/dashboard/accounts/purchase-returns');
        } catch (err: any) {
            const isConflict = err?.status === 409 || err?.response?.status === 409 || err?.code === 'stale_edit_conflict';
            if (isConflict) {
                setConflictError(
                    'This debit note was modified by another session while you were editing. Please reload to see the latest changes.'
                );
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Failed to update debit note',
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
                <p className="text-sm text-muted-foreground">Loading debit note details...</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-4">
            {/* Compressed Top Navigation Bar with Inline Primary Actions */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/dashboard/accounts/purchase-returns">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-slate-800 leading-none">Edit Purchase Return</h1>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                #{debitNoteNo}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Modify quantities, rates, or items with compliance audit tracking
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild disabled={saving} className="h-8 text-xs">
                        <Link href="/dashboard/accounts/purchase-returns">Cancel</Link>
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs min-w-[140px] font-semibold gap-1.5 bg-purple-700 hover:bg-purple-800 text-white">
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Save Revision
                    </Button>
                </div>
            </div>

            {/* Conflict Error Banner */}
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Distributor</span>
                    <span className="font-semibold text-slate-800 text-xs">{distributorName}</span>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Return Date</span>
                    <span className="font-medium text-slate-700 text-xs">{date}</span>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Status</span>
                    <span className="capitalize font-medium text-slate-700 text-xs">{status}</span>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Invoice Linked</span>
                    <span className="font-mono text-slate-700 text-xs">
                        {purchaseInvoiceId ? 'Yes' : 'Manual / Direct'}
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
                            placeholder="Explain why this purchase return is being modified..."
                            value={revisionReasonText}
                            onChange={(e) => setRevisionReasonText(e.target.value)}
                            className="h-8 bg-white text-xs border-amber-200 focus-visible:ring-amber-500"
                        />
                    </div>
                </div>
            </div>

            {/* High-Density POS Returns Items Matrix */}
            <PurchaseReturnItemsGrid
                items={items}
                onUpdateItem={handleUpdateItem}
                onRemoveItem={removeItem}
                mode="edit"
                readOnlyProductInfo={true}
                allowAddItem={false}
            />

            {/* Footer Operations & Formal Ledger Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
                {/* Left Rail: General Return Notes */}
                <div className="lg:col-span-7 space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">General Return Notes</Label>
                    <Textarea
                        rows={3}
                        placeholder="Additional distributor return notes..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="text-xs resize-none bg-white border-slate-200 focus-visible:ring-purple-500"
                    />
                </div>

                {/* Right Rail: Formal Accounting Ledger Summary Card */}
                <div className="lg:col-span-5 flex justify-end">
                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs w-full max-w-sm">
                        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Debit Note Ledger</span>
                            <span className="text-[10px] font-mono font-medium text-slate-500">
                                {items.length} {items.length === 1 ? 'Line Item' : 'Line Items'}
                            </span>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                            <div className="flex justify-between text-slate-600">
                                <span>Subtotal (Taxable Value)</span>
                                <span className="font-mono font-semibold text-slate-800">₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                                <span>GST Value (Exclusive)</span>
                                <span className="font-mono font-semibold text-slate-800">₹{gstAmount.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="px-3.5 py-2.5 bg-slate-100 border-t-2 border-slate-300 flex justify-between items-baseline">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Total Debit Amount</span>
                            <span className="font-mono text-base font-black text-slate-900">₹{totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button variant="outline" size="sm" asChild disabled={saving} className="h-8 text-xs">
                    <Link href="/dashboard/accounts/purchase-returns">Cancel</Link>
                </Button>
                <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs min-w-[140px] font-semibold gap-1.5 bg-purple-700 hover:bg-purple-800 text-white">
                    {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Save className="h-3.5 w-3.5" />
                    )}
                    Save Revision
                </Button>
            </div>
        </div>
    );
}

export default function EditPurchaseReturnPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        }>
            <EditPurchaseReturnContent />
        </Suspense>
    );
}
