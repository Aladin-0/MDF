'use client';

import React from 'react';
import { useStockLedger } from '@/hooks/useInventory';
import { 
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { X, Calendar, ArrowUpRight, ArrowDownRight, Package, Tag, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function BatchLedgerDrawer({ batchId, batchNo, medicineName, isOpen, onClose }: any) {
    const { data, isLoading } = useStockLedger(batchId);
    
    // API returns PaginatedResponse or list depending on how we structured it.
    const entries = data?.data || data || [];

    return (
        <Sheet open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col bg-slate-50 overflow-hidden">
                <SheetHeader className="px-6 py-4 border-b bg-white shrink-0 shadow-sm flex flex-row items-center justify-between space-y-0">
                    {isLoading ? (
                        <div className="space-y-2 w-full">
                            <Skeleton className="h-6 w-1/3" />
                            <Skeleton className="h-4 w-1/4" />
                        </div>
                    ) : (
                        <div className="text-left">
                            <div className="flex items-center gap-3">
                                <SheetTitle className="text-xl font-bold text-slate-900">Batch Ledger</SheetTitle>
                                <span className="px-2.5 py-0.5 bg-primary/10 text-primary font-semibold rounded text-sm">
                                    {batchNo}
                                </span>
                            </div>
                            <p className="text-slate-500 mt-1 flex items-center gap-2 text-sm font-medium">
                                <Package className="w-4 h-4" /> {medicineName || 'N/A'}
                            </p>
                        </div>
                    )}
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50">
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Date</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Type</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Reference</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Party</th>
                                    <th className="py-3 px-4 text-right font-semibold text-slate-600">In</th>
                                    <th className="py-3 px-4 text-right font-semibold text-slate-600">Out</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i}>
                                            <td className="py-4 px-4"><Skeleton className="h-4 w-24" /></td>
                                            <td className="py-4 px-4"><Skeleton className="h-4 w-32" /></td>
                                            <td className="py-4 px-4"><Skeleton className="h-4 w-32" /></td>
                                            <td className="py-4 px-4"><Skeleton className="h-4 w-40" /></td>
                                            <td className="py-4 px-4 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                                            <td className="py-4 px-4 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                                        </tr>
                                    ))
                                ) : entries.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-500">
                                            No ledger entries found for this batch.
                                        </td>
                                    </tr>
                                ) : (
                                    entries.map((entry: any) => {
                                        const qtyIn = entry.qty_in_display?.text || entry.qty_in || 0;
                                        const qtyOut = entry.qty_out_display?.text || entry.qty_out || 0;
                                        const isIn = parseFloat(String(entry.qty_in || 0)) > 0;
                                        const isOut = parseFloat(String(entry.qty_out || 0)) > 0;

                                        return (
                                            <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                                                    {entry.txn_date ? format(new Date(entry.txn_date), 'dd MMM yyyy') : '-'}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
                                                        isIn && "bg-green-50 text-green-700 border-green-200",
                                                        isOut && "bg-blue-50 text-blue-700 border-blue-200",
                                                        (!isIn && !isOut) && "bg-slate-100 text-slate-700 border-slate-200"
                                                    )}>
                                                        {isIn ? <ArrowUpRight className="w-3.5 h-3.5" /> : (isOut ? <ArrowDownRight className="w-3.5 h-3.5" /> : null)}
                                                        {entry.txn_type?.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-medium text-slate-900">
                                                    {entry.voucher_no || entry.entity_label || '-'}
                                                </td>
                                                <td className="py-3 px-4 text-slate-600">
                                                    {entry.party_name || '-'}
                                                </td>
                                                <td className="py-3 px-4 text-right font-medium text-green-700">
                                                    {isIn ? qtyIn : '-'}
                                                </td>
                                                <td className="py-3 px-4 text-right font-medium text-blue-700">
                                                    {isOut ? qtyOut : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
