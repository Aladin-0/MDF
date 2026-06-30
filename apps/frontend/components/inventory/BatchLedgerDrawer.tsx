'use client';

import React from 'react';
import { useStockLedger } from '@/hooks/useInventory';
import { 
    Drawer, DrawerContent, DrawerClose 
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { X, Calendar, ArrowUpRight, ArrowDownRight, Package, Tag, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function BatchLedgerDrawer({ batchId, batchNo, medicineName, isOpen, onClose }: any) {
    const { data, isLoading } = useStockLedger(batchId);
    
    // API returns PaginatedResponse or list depending on how we structured it.
    // Based on StockLedgerBatchesView it might be a list or paginated object. 
    // Wait, StockLedgerView in apps/backend/apps/inventory/views.py returns a PaginatedResponse.
    const entries = data?.data || data || [];

    // Reverse entries to show chronological order if backend returns descending
    // Wait, we probably want to see newest first, but running balance is easier if chronological.
    // Let's just render them as they come.

    return (
        <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} direction="right">
            <DrawerContent className="h-full w-full sm:w-[95vw] lg:w-[900px] border-l rounded-none p-0 overflow-y-auto bg-slate-50/30">
                
                <div className="sticky top-0 z-20 bg-white border-b px-10 py-6 flex justify-between items-start shadow-sm">
                    {isLoading ? (
                        <div className="space-y-3 w-full">
                            <Skeleton className="h-8 w-1/2" />
                            <Skeleton className="h-4 w-1/3" />
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold text-slate-900">Batch Ledger</h2>
                                <span className="px-3 py-1 bg-primary/10 text-primary font-semibold rounded-full text-sm">
                                    {batchNo}
                                </span>
                            </div>
                            <p className="text-slate-500 mt-2 flex items-center gap-2">
                                <Package className="w-4 h-4" /> {medicineName || 'N/A'}
                            </p>
                        </div>
                    )}
                    
                    <DrawerClose asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                            <X className="w-5 h-5" />
                        </Button>
                    </DrawerClose>
                </div>

                <div className="p-10">
                    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
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
            </DrawerContent>
        </Drawer>
    );
}
