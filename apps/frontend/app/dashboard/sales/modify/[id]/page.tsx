'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useBillingStore } from '@/store/billingStore';

const REASON_CODES = [
    { value: 'CUSTOMER_REQUEST', label: 'Customer Request' },
    { value: 'ENTRY_ERROR_RATE', label: 'Entry Error: Rate/Discount' },
    { value: 'ENTRY_ERROR_QTY', label: 'Entry Error: Quantity' },
    { value: 'ENTRY_ERROR_ITEM', label: 'Entry Error: Wrong Item' },
    { value: 'DOCTOR_CHANGE', label: 'Doctor / Header Change' },
    { value: 'OTHER', label: 'Other' },
];

export default function ModifySalePage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [reasonCode, setReasonCode] = useState('');
    const [reasonText, setReasonText] = useState('');
    const [error, setError] = useState('');
    const outlet = useAuthStore(s => s.user?.outlet);

    useEffect(() => {
        if (!outlet) return;
        api.get(`/sales/${id}/modification-options/`, { params: { outletId: outlet.id } })
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load modification options.');
                setLoading(false);
            });
    }, [id, outlet]);

    if (loading) return <div className="p-8 text-center animate-pulse">Loading modification options...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!data) return null;

    const { invoice, allowedActions, blockReason } = data;

    const handleAction = async (action: string) => {
        if (!reasonCode || !reasonText.trim()) {
            alert('Please select a reason code and provide a brief explanation.');
            return;
        }

        try {
            const res = await api.get(`/sales/${id}/`, { params: { outletId: outlet?.id } });
            const fullInvoice = res.data;

            const store = useBillingStore.getState();
            store.clearCart();
            store.setLastInvoice(null);
            store.setEditingSaleId(id);
            store.setRevisionContext(action, reasonCode, reasonText);

            store.setCustomer(fullInvoice.customer || null);
            if (fullInvoice.customer) {
                store.setCustomerLedger({
                    id: fullInvoice.customer.id,
                    name: fullInvoice.customer.name,
                    groupName: 'Sundry Debtors',
                    currentBalance: 0,
                    isMock: true,
                } as any);
            }

            const totalDiscountAmount = typeof fullInvoice.discountAmount === 'number' ? fullInvoice.discountAmount : 0;
            const totalRateAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
                const qty = item.totalQty || (item.qtyStrips || 0) + ((item.qtyLoose || 0) / (item.packSize || 1));
                return sum + (item.rate * qty);
            }, 0) || 1;
            const itemDiscountAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
                const qty = item.totalQty || (item.qtyStrips || 0) + ((item.qtyLoose || 0) / (item.packSize || 1));
                return sum + ((item.mrp - item.rate) * qty);
            }, 0) || 0;
            
            const extraDiscountAmount = Math.max(0, totalDiscountAmount - itemDiscountAmount);
            const extraDiscountPct = totalRateAmount > 0 ? (extraDiscountAmount / totalRateAmount) * 100 : 0;
            store.setExtraDiscountPct(extraDiscountPct);

            store.setPayment({
                method: fullInvoice.paymentMode as any,
                amount: fullInvoice.amountPaid || fullInvoice.grandTotal,
            });

            if (fullInvoice.doctorName || fullInvoice.prescriptionNo) {
                 store.setScheduleHData({
                     patientName: fullInvoice.patientName || '',
                     patientAge: 0,
                     patientAddress: fullInvoice.patientAddress || '',
                     doctorName: fullInvoice.doctorName || '',
                     doctorRegNo: fullInvoice.doctorRegNo || '',
                     prescriptionNo: fullInvoice.prescriptionNo || '',
                 });
            }

            if (fullInvoice.items) {
                 fullInvoice.items.forEach((item: any) => {
                     store.addToCart(store.activeDraftId, {
                         ...item,
                         totalQty: item.totalQty || (item.qtyStrips || 0) + ((item.qtyLoose || 0) / (item.packSize || 1)),
                         saleMode: item.saleMode || 'mixed',
                         mrp: item.mrp || item.rate,
                         saleRate: item.saleRate || item.rate,
                         cgst: item.cgstRate || (item.gstRate ? item.gstRate / 2 : 0),
                         sgst: item.sgstRate || (item.gstRate ? item.gstRate / 2 : 0),
                     });
                 });
            }

            router.push('/billing');
        } catch (err) {
            console.error("Failed to load invoice for modification", err);
            alert("Failed to load invoice details. Please try again.");
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Modify Sale Invoice</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Choose an action to revise this bill</p>
                </div>
                <div className="ml-auto">
                    <Button variant="outline" onClick={() => router.push(`/dashboard/sales/revisions/${id}`)}>
                        View History
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Context Column */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Invoice Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Invoice No</p>
                                    <p className="font-semibold text-slate-900">{invoice.invoiceNo}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Date</p>
                                    <p className="font-semibold text-slate-900">{new Date(invoice.date).toLocaleDateString()}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-muted-foreground">Customer</p>
                                    <p className="font-semibold text-slate-900">{invoice.customerName}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Grand Total</p>
                                    <p className="font-semibold text-slate-900">₹{parseFloat(invoice.grandTotal).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Balance Due</p>
                                    <p className="font-semibold text-red-600">₹{parseFloat(invoice.balanceDue).toFixed(2)}</p>
                                </div>
                            </div>
                            
                            <Separator />
                            
                            <div className="space-y-2">
                                <p className="text-sm font-medium">State Flags:</p>
                                <div className="flex flex-wrap gap-2">
                                    {invoice.isPaid ? (
                                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Paid/Partially Paid</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">Unpaid (Draft)</span>
                                    )}
                                    {invoice.hasReturns && (
                                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">Has Returns</span>
                                    )}
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">{invoice.itemCount} Items</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Reason for Modification</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Reason Code <span className="text-red-500">*</span></Label>
                                <Select value={reasonCode} onValueChange={setReasonCode}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a code" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REASON_CODES.map(c => (
                                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Detailed Explanation <span className="text-red-500">*</span></Label>
                                <Input 
                                    placeholder="Briefly explain why this is being modified..."
                                    value={reasonText}
                                    onChange={(e) => setReasonText(e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Actions Column */}
                <div className="space-y-6">
                    <Card className="h-full">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Available Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {blockReason ? (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-red-800 text-sm">Action Blocked</h4>
                                        <p className="text-sm text-red-700 mt-1">{blockReason}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {allowedActions.includes('direct_revise') && (
                                        <Button className="w-full justify-start py-6" variant="outline" onClick={() => handleAction('direct_revise')}>
                                            <div className="text-left">
                                                <div className="font-semibold text-primary">Direct Revise</div>
                                                <div className="text-xs text-muted-foreground font-normal">Edit this draft bill directly in the cart</div>
                                            </div>
                                        </Button>
                                    )}
                                    {allowedActions.includes('header_correction') && (
                                        <Button className="w-full justify-start py-6" variant="outline" onClick={() => handleAction('header_correction')}>
                                            <div className="text-left">
                                                <div className="font-semibold text-primary">Header Correction</div>
                                                <div className="text-xs text-muted-foreground font-normal">Change date, doctor, or customer only</div>
                                            </div>
                                        </Button>
                                    )}
                                    {allowedActions.includes('commercial_correction') && (
                                        <Button className="w-full justify-start py-6" variant="outline" onClick={() => handleAction('commercial_correction')}>
                                            <div className="text-left">
                                                <div className="font-semibold text-primary">Commercial Correction</div>
                                                <div className="text-xs text-muted-foreground font-normal">Change rates/qty on unpaid bill</div>
                                            </div>
                                        </Button>
                                    )}
                                    {allowedActions.includes('paid_bill_correction') && (
                                        <Button className="w-full justify-start py-6" variant="outline" onClick={() => handleAction('paid_bill_correction')}>
                                            <div className="text-left">
                                                <div className="font-semibold text-primary">Paid Bill Correction</div>
                                                <div className="text-xs text-muted-foreground font-normal">Revise bill and manage financial differences</div>
                                            </div>
                                        </Button>
                                    )}
                                    {allowedActions.includes('return_aware_correction') && (
                                        <Button className="w-full justify-start py-6" variant="outline" onClick={() => handleAction('return_aware_correction')}>
                                            <div className="text-left">
                                                <div className="font-semibold text-primary">Return-Aware Correction</div>
                                                <div className="text-xs text-muted-foreground font-normal">Modify bill while preserving existing return records</div>
                                            </div>
                                        </Button>
                                    )}
                                    {allowedActions.includes('cancel_and_reissue') && (
                                        <Button className="w-full justify-start py-6" variant="outline" onClick={() => handleAction('cancel_and_reissue')}>
                                            <div className="text-left">
                                                <div className="font-semibold text-primary">Cancel & Reissue</div>
                                                <div className="text-xs text-muted-foreground font-normal">Cancel this bill entirely and create a fresh one</div>
                                            </div>
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
