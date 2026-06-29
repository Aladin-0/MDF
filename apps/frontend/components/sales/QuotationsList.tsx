'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Search, Eye, FileEdit, CheckCircle2, ChevronRight, Calculator, FileText, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useQuotationsList } from '@/hooks/useQuotations';
import { useBillingStore } from '@/store/billingStore';
import { salesApi } from '@/lib/apiClient';
import { Quotation } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const fmt = (n: number | undefined) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fd = (d: string) => {
    try {
        return format(new Date(d), 'dd MMM yyyy, hh:mm a');
    } catch {
        return d;
    }
};

const fdShort = (d: string) => {
    try {
        return format(new Date(d), 'dd MMM yyyy');
    } catch {
        return d;
    }
};

export default function QuotationsList() {
    const router = useRouter();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [convertingId, setConvertingId] = useState<string | null>(null);
    
    const { data, isLoading, refetch } = useQuotationsList();
    const quotations: Quotation[] = data?.data ?? [];

    const filteredQuotations = quotations.filter(q => 
        q.quotationNo.toLowerCase().includes(search.toLowerCase()) || 
        (q.customer?.name && q.customer.name.toLowerCase().includes(search.toLowerCase())) ||
        (q.customer?.phone && q.customer.phone.includes(search))
    );

    const handleOpenInBilling = async (quotation: Quotation) => {
        try {
            const fullQ = await salesApi.getQuotationById(quotation.id);
            const store = useBillingStore.getState();
            
            // Re-open quotation in billing
            const draftId = store.createDraft();
            store.switchDraft(draftId);
            
            store.setDraftDocumentMode(draftId, 'quotation');
            store.setDraftValidUntil(draftId, fullQ.validUntil || undefined);
            store.updateDraftHeader(draftId, { 
                quotationId: fullQ.id,
                hospitalName: fullQ.hospitalName || fullQ.hospital_name || null,
                doctor: fullQ.doctorName || fullQ.doctor_name ? { id: 'mock', name: fullQ.doctorName || fullQ.doctor_name } as any : null,
                extraDiscountPct: fullQ.extraDiscountPct || fullQ.extra_discount_pct || 0
            });
            
            // Set customer
            if (fullQ.customer) {
                store.setCustomer(fullQ.customer);
                store.setCustomerLedger({
                    id: 'mock',
                    name: fullQ.customer.name || 'Unknown',
                    groupName: 'Sundry Debtors',
                    currentBalance: 0,
                    isMock: true,
                } as any);
            }
            
            // Set items
            if (fullQ.items) {
                fullQ.items.forEach((item: any) => {
                    // DRF decimal fields come back as strings ("0.00") — coerce everything to Number
                    const mrp         = Number(item.mrp     || item.rate || 0);
                    const rate        = Number(item.rate    || 0);
                    const saleRate    = Number(item.saleRate|| item.rate || 0);
                    const discountPct = Number(item.discountPct || item.discount_pct || 0);
                    const gstRate     = Number(item.gstRate || item.gst_rate || 0);
                    const qtyStrips   = Number(item.qtyStrips || item.qty_strips || 0);
                    const qtyLoose    = Number(item.qtyLoose  || item.qty_loose  || 0);
                    const packSize    = Number(item.packSize   || item.pack_size  || 1);
                    const taxableAmount = Number(item.taxableAmount || item.taxable_amount || 0);
                    const gstAmount     = Number(item.gstAmount     || item.gst_amount     || 0);
                    const totalAmount   = Number(item.totalAmount   || item.total_amount   || 0);
                    const landingRate   = Number(item.landingRate   || item.landing_rate   || 0);
                    const costRate      = Number(item.costRate      || item.cost_rate      || 0);

                    store.addToCart(draftId, {
                        ...item,
                        name: item.medicineName || item.medicine_name || item.name || '',
                        mrp,
                        rate,
                        saleRate,
                        discountPct,
                        gstRate,
                        qtyStrips,
                        qtyLoose,
                        packSize,
                        taxableAmount,
                        gstAmount,
                        totalAmount,
                        landingRate,
                        costRate,
                        totalQty: qtyStrips + (qtyLoose / packSize),
                        saleMode: item.saleMode || 'strip',
                        cgst: item.cgstRate || (gstRate ? gstRate / 2 : 0),
                        sgst: item.sgstRate || (gstRate ? gstRate / 2 : 0),
                        // Prefer camelCase keys, fall back to snake_case from backend
                        batchId:      item.batchId      || item.batch,
                        productId:    item.productId    || item.product,
                        medicineName: item.medicineName || item.medicine_name,
                        batchNo:      item.batchNo      || item.batch_no,
                        expiryDate:   item.expiryDate   || item.expiry_date || '',
                    } as any);
                });
            }
            
            router.push('/billing');
        } catch (error) {
            console.error('Failed to open quotation:', error);
            toast({ title: 'Error', description: 'Failed to open quotation', variant: 'destructive' });
        }
    };

    const handleConvertToInvoice = async (quotation: Quotation) => {
        try {
            setConvertingId(quotation.id);
            const fullQ = await salesApi.getQuotationById(quotation.id);
            const { API_URL, getHeaders } = await import('@/lib/apiClient');
            
            // Call batch availability check
            const batchCheckPayload = (fullQ.items || []).map((item: any) => ({
                batchId: item.batchId || item.batch,
                qtyStrips: Number(item.qtyStrips || item.qty_strips || 0),
                qtyLoose: Number(item.qtyLoose || item.qty_loose || 0)
            }));
            
            let batchStatuses: Record<string, any> = {};
            if (batchCheckPayload.length > 0) {
                const checkRes = await fetch(`${API_URL}/inventory/batches/availability-check/`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify(batchCheckPayload)
                });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    checkData.forEach((res: any) => {
                        batchStatuses[res.batchId] = res;
                    });
                }
            }

            const store = useBillingStore.getState();
            const draftId = store.createDraft();
            store.switchDraft(draftId);
            
            // Mode is invoice because we are converting to invoice
            store.setDraftDocumentMode(draftId, 'invoice');
            store.setDraftValidUntil(draftId, undefined);
            store.updateDraftHeader(draftId, { 
                quotationId: fullQ.id,
                sourceQuotationNo: fullQ.quotationNo,
                hospitalName: fullQ.hospitalName || fullQ.hospital_name || null,
                doctor: fullQ.doctorName || fullQ.doctor_name ? { id: 'mock', name: fullQ.doctorName || fullQ.doctor_name } as any : null,
                extraDiscountPct: fullQ.extraDiscountPct || fullQ.extra_discount_pct || 0
            });
            
            if (fullQ.customer) {
                store.setCustomer(fullQ.customer);
                store.setCustomerLedger({
                    id: 'mock',
                    name: fullQ.customer.name || 'Unknown',
                    groupName: 'Sundry Debtors',
                    currentBalance: 0,
                    isMock: true,
                } as any);
            }
            
            if (fullQ.items) {
                fullQ.items.forEach((item: any) => {
                    const mrp         = Number(item.mrp     || item.rate || 0);
                    const rate        = Number(item.rate    || 0);
                    const saleRate    = Number(item.saleRate|| item.rate || 0);
                    const discountPct = Number(item.discountPct || item.discount_pct || 0);
                    const gstRate     = Number(item.gstRate || item.gst_rate || 0);
                    const qtyStrips   = Number(item.qtyStrips || item.qty_strips || 0);
                    const qtyLoose    = Number(item.qtyLoose  || item.qty_loose  || 0);
                    const packSize    = Number(item.packSize   || item.pack_size  || 1);
                    const taxableAmount = Number(item.taxableAmount || item.taxable_amount || 0);
                    const gstAmount     = Number(item.gstAmount     || item.gst_amount     || 0);
                    const totalAmount   = Number(item.totalAmount   || item.total_amount   || 0);
                    const landingRate   = Number(item.landingRate   || item.landing_rate   || 0);
                    const costRate      = Number(item.costRate      || item.cost_rate      || 0);

                    const batchId = item.batchId || item.batch;
                    const batchInfo = batchStatuses[batchId];

                    store.addToCart(draftId, {
                        ...item,
                        name: item.medicineName || item.medicine_name || item.name || '',
                        mrp, rate, saleRate, discountPct, gstRate, qtyStrips, qtyLoose, packSize,
                        taxableAmount, gstAmount, totalAmount, landingRate, costRate,
                        totalQty: qtyStrips + (qtyLoose / packSize),
                        saleMode: item.saleMode || 'strip',
                        cgst: item.cgstRate || (gstRate ? gstRate / 2 : 0),
                        sgst: item.sgstRate || (gstRate ? gstRate / 2 : 0),
                        batchId:      batchId,
                        productId:    item.productId    || item.product,
                        medicineName: item.medicineName || item.medicine_name,
                        batchNo:      item.batchNo      || item.batch_no,
                        expiryDate:   item.expiryDate   || item.expiry_date || '',
                        batchAvailabilityStatus: batchInfo?.status || 'AVAILABLE',
                        availableStock: batchInfo ? (batchInfo.availableQtyStrips * packSize + batchInfo.availableQtyLoose) : undefined
                    } as any);
                });
            }
            
            router.push('/billing');
        } catch (error: any) {
            console.error('Failed to prepare quotation for conversion:', error);
            const message = error?.detail || error?.message || 'Failed to prepare quotation for conversion';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setConvertingId(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        Quotations & Estimates
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Manage pending quotations and convert them to invoices.</p>
                </div>
                
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                            placeholder="Search Quotation No, Customer..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white"
                        />
                    </div>
                </div>
            </div>

            <Card className="shadow-sm border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Date & No</th>
                                <th className="px-6 py-4 font-semibold">Customer</th>
                                <th className="px-6 py-4 font-semibold">Valid Until</th>
                                <th className="px-6 py-4 font-semibold text-right">Amount</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        Loading quotations...
                                    </td>
                                </tr>
                            ) : filteredQuotations.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 flex justify-center flex-col items-center">
                                        <FileText className="w-12 h-12 text-slate-200 mb-3" />
                                        <p>No quotations found.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredQuotations.map((q) => (
                                    <tr key={q.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900">{q.quotationNo}</div>
                                            <div className="text-slate-500 text-xs mt-0.5">{fd(q.createdAt)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {q.customer?.name ? (
                                                <div>
                                                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                                                        <User className="w-3.5 h-3.5 text-slate-400" />
                                                        {q.customer.name}
                                                    </div>
                                                    <div className="text-slate-500 text-xs mt-0.5 ml-5">{q.customer.phone}</div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 italic">Walk-in</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {q.validUntil ? (
                                                <div className={cn(
                                                    "inline-flex items-center px-2 py-1 rounded text-xs font-medium",
                                                    new Date(q.validUntil) < new Date() ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                                                )}>
                                                    {fdShort(q.validUntil)}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="font-bold text-slate-900 text-base">{fmt(q.grandTotal)}</div>
                                            <div className="text-slate-500 text-xs mt-0.5">{q.items?.length || 0} items</div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {q.status === 'converted' ? (
                                                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                                        ✓ Converted
                                                    </span>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleOpenInBilling(q)}
                                                            className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                                                        >
                                                            <FileEdit className="w-4 h-4 mr-1.5" />
                                                            Open
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleConvertToInvoice(q)}
                                                            disabled={convertingId === q.id}
                                                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                                            {convertingId === q.id ? 'Converting...' : 'Convert'}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
