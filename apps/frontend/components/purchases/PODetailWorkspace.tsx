'use client';

import React, { useState, useEffect } from 'react';
import { useOutletId } from '@/hooks/useOutletId';
import { API_URL, getHeaders } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Plus, Save, Download, FileText } from 'lucide-react';
import { ProductSearchDropdown } from '@/components/inventory/ProductSearchDropdown';

interface POItem {
    id?: string;
    productId: string;
    productName: string;
    packSize?: number;
    packType?: string;
    currentStock?: number;
    orderQty: number;
    lastRate: number;
    taxableAmount?: number;
}

export function PODetailWorkspace({ poId, distributorId }: { poId: string, distributorId: string }) {
    const outletId = useOutletId();
    const { toast } = useToast();
    const [poItems, setPoItems] = useState<POItem[]>([]);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (!poId || !outletId) return;
        setLoading(true);
        fetch(`${API_URL}/purchases/orders/${poId}/?outletId=${outletId}`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.items) {
                    const mapped = data.items.map((it: any) => ({
                        id: it.id,
                        productId: it.productId,
                        productName: it.productName,
                        packSize: it.packSize,
                        packType: it.packType,
                        currentStock: it.currentStock,
                        orderQty: it.qtyStrips,
                        lastRate: it.lastRate,
                    }));
                    setPoItems(mapped);
                }
            })
            .finally(() => setLoading(false));
    }, [poId, outletId]);
    
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
            currentStock: product.currentStock ?? product.totalStock,
            orderQty: 1,
            lastRate: product.purchaseRate || product.mrp * 0.8 || 0,
        }]);
    };
    
    const handlePullAlerts = async () => {
        try {
            const res = await fetch(`${API_URL}/purchases/orders/suggestions/?outletId=${outletId}&distributorId=${distributorId}`, {
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
                                currentStock: alert.currentStock,
                                orderQty: alert.deficit,
                                lastRate: alert.estimatedPtr,
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
            setLoading(true);
            const res = await fetch(`${API_URL}/purchases/orders/${poId}/`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({
                    outletId,
                    items: poItems
                })
            });
            if (res.ok) {
                toast({ title: 'Draft Saved', description: 'Purchase Order updated successfully' });
            } else {
                toast({ title: 'Error', variant: 'destructive', description: 'Failed to save draft' });
            }
        } catch (e) {
            toast({ title: 'Error', variant: 'destructive', description: 'Failed to save draft' });
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        window.open(`${API_URL}/purchases/orders/${poId}/export/excel/?outletId=${outletId}`, '_blank');
    };

    const handleExportPdf = () => {
        window.open(`${API_URL}/purchases/orders/${poId}/export/pdf/?outletId=${outletId}`, '_blank');
    };
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Draft Builder Workspace</h3>
                <div className="flex space-x-2">
                    <Button variant="outline" onClick={handlePullAlerts}>
                        <AlertCircle className="w-4 h-4 mr-2" /> Pull Alerts
                    </Button>
                    <Button variant="outline" onClick={handleExportExcel}>
                        <Download className="w-4 h-4 mr-2" /> Export Excel
                    </Button>
                    <Button variant="outline" onClick={handleExportPdf}>
                        <FileText className="w-4 h-4 mr-2" /> Export PDF
                    </Button>
                    <Button onClick={handleSaveDraft} disabled={loading}>
                        <Save className="w-4 h-4 mr-2" /> Save Draft
                    </Button>
                </div>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                <div className="w-full md:w-[400px]">
                    <ProductSearchDropdown 
                        onSelect={handleAddFromSearch} 
                        context="procurement" 
                        placeholder="Search product catalog to order..." 
                    />
                </div>
            </div>
            
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">Pack</th>
                            <th className="px-4 py-3 text-right">Current Stock</th>
                            <th className="px-4 py-3 text-right">Rate</th>
                            <th className="px-4 py-3 text-right w-32">Order Qty</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {poItems.map((item, i) => (
                            <tr key={item.productId || i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                                <td className="px-4 py-3 text-gray-500 text-sm">
                                    {item.packSize && item.packType ? `${item.packSize} ${item.packType}` : "1 Piece"}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-600 font-medium">
                                    {item.currentStock ?? 0}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-600 font-medium">₹{item.lastRate.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right">
                                    <Input 
                                        type="number" 
                                        min={1} 
                                        className="w-24 text-right ml-auto" 
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
                                </td>
                            </tr>
                        ))}
                        {poItems.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                    No items in this draft. Search for a product or pull low stock alerts.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
