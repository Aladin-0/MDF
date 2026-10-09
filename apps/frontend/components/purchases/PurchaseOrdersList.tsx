'use client';

import { useState } from 'react';
import { usePurchaseOrders } from '@/hooks/usePurchases';
import { ClipboardList, Clock, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { NewPurchaseOrderModal } from './NewPurchaseOrderModal';
import { useRouter } from 'next/navigation';

export function PurchaseOrdersList() {
    const router = useRouter();
    const { data: purchaseOrders, isLoading } = usePurchaseOrders();
    const [drawerOpen, setDrawerOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="space-y-4 mt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    if (!isLoading && (!purchaseOrders || purchaseOrders.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-200 mt-4">
                <ClipboardList className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">Purchase Orders</h3>
                <p className="text-slate-500 mt-1 max-w-md">Generated purchase orders will appear here. You can generate them from the Reorder Planning report.</p>
            </div>
        );
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SAVED': return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200"><Clock className="w-3 h-3 mr-1" /> Saved</Badge>;
            case 'SENT': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Sent</Badge>;
            case 'PARTIAL': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Partial</Badge>;
            case 'COMPLETED': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button onClick={() => setDrawerOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    New PO
                </Button>
            </div>
            
            <NewPurchaseOrderModal open={drawerOpen} onOpenChange={setDrawerOpen} />
            
            <div className="rounded-md border bg-white overflow-hidden shadow-sm">
                <Table>
                <TableHeader className="bg-slate-50">
                    <TableRow>
                        <TableHead className="font-semibold text-slate-700">PO Number</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Distributor</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Amount</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[140px]">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {purchaseOrders?.map((po) => (
                        <TableRow 
                            key={po.id} 
                            className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                            onClick={() => router.push(`/dashboard/purchases/orders/${po.id}`)}
                        >
                            <TableCell className="font-medium text-indigo-600">
                                {po.poNumber}
                            </TableCell>
                            <TableCell className="text-slate-600">
                                {format(new Date(po.orderDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="text-slate-700 font-medium">
                                {po.distributorName}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-slate-700">
                                ₹{po.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                                {getStatusBadge(po.status)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </div>
        </div>
    );
}
