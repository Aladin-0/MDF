'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useDistributorList } from '@/hooks/usePurchases';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useOutletId } from '@/hooks/useOutletId';
import { API_URL, getHeaders } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { Download, MessageCircle, PackageCheck, XCircle, ArrowLeft, Zap, Save, Trash2, ChevronDown, FileText, Table as TableIcon } from 'lucide-react';
import Link from 'next/link';
import { ProductSearchDropdown } from '@/components/inventory/ProductSearchDropdown';

interface POItem {
    id?: string;
    productId: string;
    productName: string;
    packSize?: number;
    packType?: string;
    available?: number;
    minQty?: number;
    orderQty: number;
    receivedQty?: number;
    lastRate: number;
    taxableAmount?: number;
}

interface PODetail {
    id: string;
    poNumber: string;
    status: string;
    distributorId: string;
    distributorName: string;
    orderDate: string;
    totalAmount: number;
    items: POItem[];
}

export function PODetailView({ orderId }: { orderId: string }) {
    const outletId = useOutletId();
    const router = useRouter();
    const { toast } = useToast();
    
    const [poItems, setPoItems] = useState<POItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [isSeeded, setIsSeeded] = useState(false);
    const searchParams = useSearchParams();
    const isNew = orderId === 'new';
    const distId = searchParams.get('distributorId');
    const { data: distributors } = useDistributorList();
    
    const { data: serverPo, isLoading, refetch } = useQuery<PODetail>({
        queryKey: ['purchaseOrder', orderId, outletId],
        queryFn: async () => {
            const res = await fetch(`${API_URL}/purchases/orders/${orderId}/?outletId=${outletId}`, {
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Failed to fetch PO');
            return res.json();
        },
        enabled: !!outletId && !!orderId && !isNew,
    });

    const po = isNew ? {
        id: 'new',
        poNumber: 'NEW SAVED PO',
        status: 'NEW',
        distributorId: distId || '',
        distributorName: distributors?.find((d: any) => d.id === distId)?.name || 'Unknown Distributor',
        orderDate: new Date().toISOString(),
        totalAmount: poItems.reduce((acc, item) => acc + (item.orderQty * item.lastRate), 0),
        items: poItems,
    } : serverPo;

    useEffect(() => {
        if (po && po.items && !isSeeded) {
            const mapped = po.items.map(it => ({
                id: it.id,
                productId: it.productId || (it as any).masterProductId || it.id,
                productName: it.productName,
                packSize: it.packSize,
                packType: it.packType,
                available: it.currentStock,
                minQty: it.minQty,
                orderQty: (it as any).qtyStrips || 0,
                receivedQty: it.receivedQty || 0,
                lastRate: it.lastRate || 0,
            }));
            setPoItems(mapped);
            setIsSeeded(true);
        }
    }, [serverPo, isNew, isSeeded]);

    if (isLoading && !isNew) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-12 w-1/3" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        );
    }

    if (!po) return <div>PO not found</div>;

    const handleReceiveGRN = () => {
        router.push(`/dashboard/purchases?tab=new&poId=${po.id}`);
    };

    const handleExportExcel = async () => {
        try {
            let orderId = po.id;
            if (isNew) {
                orderId = await handleSaveDraft();
                if (!orderId) return;
            }
            const res = await fetch(`${API_URL}/purchases/orders/${orderId}/export/excel/?outletId=${outletId}`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PurchaseOrder_${po.poNumber || orderId}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            toast({ title: 'Export Failed', variant: 'destructive', description: 'Failed to download Excel file' });
        }
    };

    const handleExportPdf = async () => {
        try {
            let orderId = po.id;
            if (isNew) {
                orderId = await handleSaveDraft();
                if (!orderId) return;
            }
            const res = await fetch(`${API_URL}/purchases/orders/${orderId}/export/pdf/?outletId=${outletId}`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PurchaseOrder_${po.poNumber || orderId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            toast({ title: 'Export Failed', variant: 'destructive', description: 'Failed to download PDF file' });
        }
    };

    // ─── Workspace Interactivity ─────────────────────────────────────────────

    const handleAddFromSearch = (product: any) => {
        const exists = poItems.find(p => p.productId === product.id);
        if (exists) {
            toast({ title: 'Already in PO', description: 'Product is already in the list' });
            return;
        }
        
        setPoItems(prev => [...prev, {
            productId: product.id,
            productName: product.name,
            packSize: product.packSize,
            packType: product.packType,
            available: product.currentStock ?? product.totalStock,
            minQty: product.minQty,
            orderQty: 1,
            lastRate: product.purchaseRate || product.mrp * 0.8 || 0,
        }]);
    };

    const handlePullAlerts = async () => {
        try {
            const res = await fetch(`${API_URL}/purchases/orders/suggestions/?outletId=${outletId}&distributorId=${po.distributorId}`, {
                headers: getHeaders()
            });
            const data = await res.json();
            
            if (data.data) {
                setPoItems(prev => {
                    const next = [...prev];
                    let added = 0;
                    data.data.forEach((alert: any) => {
                        const exists = next.find(p => p.productId === alert.productId);
                        if (!exists) {
                            next.push({
                                productId: alert.productId,
                                productName: alert.productName,
                                packSize: alert.packSize,
                                packType: alert.packType,
                                available: alert.available ?? alert.currentStock,
                                minQty: alert.minQty,
                                orderQty: alert.deficit || 1,
                                lastRate: alert.estimatedPtr || 0,
                            });
                            added++;
                        }
                    });
                    
                    toast({ title: 'Alerts Pulled', description: `Added ${added} low stock items to PO.` });
                    return next;
                });
            }
        } catch (e) {
            toast({ title: 'Error', variant: 'destructive', description: 'Failed to pull alerts' });
        }
    };

    const handleSaveDraft = async () => {
        try {
            setSaving(true);
            const method = isNew ? 'POST' : 'PUT';
            const url = isNew ? `${API_URL}/purchases/orders/` : `${API_URL}/purchases/orders/${po.id}/`;
            
            const res = await fetch(url, {
                method,
                headers: getHeaders(),
                body: JSON.stringify({
                    outletId,
                    distributorId: po.distributorId,
                    items: poItems
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                toast({ title: 'Draft Saved', description: 'Purchase Order saved successfully' });
                if (isNew && data.id) {
                    router.replace(`/dashboard/purchases/orders/${data.id}`);
                    return data.id;
                } else {
                    refetch();
                    return po.id;
                }
            } else {
                toast({ title: 'Error', variant: 'destructive', description: 'Failed to save draft' });
                return null;
            }
        } catch (e) {
            toast({ title: 'Error', variant: 'destructive', description: 'Failed to save draft' });
            return null;
        } finally {
            setSaving(false);
        }
    };
    
    const handleRemoveItem = (index: number) => {
        setPoItems(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:flex-wrap items-start md:items-center gap-4 mb-2">
                <Link href="/dashboard/purchases">
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        {po.poNumber}
                        <Badge variant="outline">{po.status === 'NEW' || po.status === 'SAVED' ? 'SAVED' : po.status}</Badge>
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Distributor: <span className="font-medium text-slate-800">{po.distributorName}</span> &bull; Date: {format(new Date(po.orderDate), 'dd MMM yyyy')}
                    </p>
                </div>
                
                <div className="md:ml-auto flex flex-wrap items-center gap-2">
                    <>
                        <Button variant="outline" className="gap-2" onClick={handleExportPdf} disabled={saving}>
                            <FileText className="w-4 h-4" /> Export PDF
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={handleExportExcel} disabled={saving}>
                            <TableIcon className="w-4 h-4" /> Export Excel
                        </Button>
                    </>
                    <Button onClick={handleSaveDraft} disabled={saving} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                        <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save PO'}
                    </Button>
                </div>
            </div>
            
            {/* ─── Interactive Toolbar ─────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                <div className="w-full md:w-[400px]">
                    <ProductSearchDropdown 
                        onSelect={handleAddFromSearch} 
                        context="procurement" 
                        placeholder="Search product to add manually..." 
                        className="rounded-md border border-gray-300 shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                </div>
                <Button variant="secondary" onClick={handlePullAlerts} className="w-full md:w-auto font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100">
                    <Zap className="w-4 h-4 mr-2 text-indigo-500 fill-indigo-500" /> Pull Low Stock Alerts
                </Button>
            </div>
            
            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                <Table className="min-w-[1000px]">
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-semibold text-slate-700 w-16 text-center">S.No</TableHead>
                            <TableHead className="font-semibold text-slate-700">Product</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-center">Pack</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-center">Current Stock</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-center">Min</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-right w-32">Order Qty</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-right">Est. Rate</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-right">Est. Amount</TableHead>
                            <TableHead className="w-16"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {poItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center text-slate-500 bg-slate-50/50">
                                    <div className="flex flex-col items-center justify-center">
                                        <p>No items in this order.</p>
                                        <p className="text-sm mt-1">Use the search bar above to add products manually, or click 'Pull Low Stock Alerts' to fetch shortages.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            poItems.map((item, i) => (
                                <TableRow key={item.productId || i} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="text-center text-slate-500">{i + 1}</TableCell>
                                    <TableCell className="font-medium text-slate-800">{item.productName}</TableCell>
                                    <TableCell className="text-center text-slate-600">
                                        {item.packSize && item.packType ? `${item.packSize} ${item.packType}` : "1 Piece"}
                                    </TableCell>
                                    <TableCell className="text-center text-slate-600">{item.available !== undefined ? item.available : 0}</TableCell>
                                    <TableCell className="text-center text-slate-600">{item.minQty !== undefined ? item.minQty : 0}</TableCell>
                                    <TableCell className="text-right">
                                        <Input 
                                            type="number" 
                                            min={1} 
                                            className="w-20 text-right ml-auto h-8 bg-white" 
                                            value={item.orderQty} 
                                            onChange={(e) => {
                                                const newQty = parseInt(e.target.value) || 0;
                                                setPoItems(prev => {
                                                    const next = [...prev];
                                                    next[i].orderQty = newQty;
                                                    return next;
                                                });
                                            }} 
                                        />
                                    </TableCell>
                                    <TableCell className="text-right text-slate-600">₹{item.lastRate.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-semibold">
                                        ₹{(item.orderQty * item.lastRate).toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveItem(i)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                
                <div className="p-4 bg-slate-50 border-t flex justify-end">
                    <div className="w-64 flex justify-between items-center font-bold text-lg text-slate-800">
                        <span>Total:</span>
                        <span>₹{poItems.reduce((sum, item) => sum + (item.orderQty * item.lastRate), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
