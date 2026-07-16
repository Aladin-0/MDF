'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ArrowLeft, Clock, User, AlertCircle, FileText, IndianRupee, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export default function RevisionDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id: returnId } = params;
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const outlet = useAuthStore(s => s.user?.outlet);

    useEffect(() => {
        if (!outlet) return;
        api.get(`/audit/revisions/sale_return/${returnId}/`, { params: { outletId: outlet.id } })
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load revision details.');
                setLoading(false);
            });
    }, [returnId, outlet]);

    if (loading) return <div className="p-8 text-center animate-pulse">Loading history...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!data) return null;

    const { record: sales_return, revisions } = data;

    return (
        <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button variant="ghost" onClick={() => router.back()} className="mb-2 hover:bg-gray-100">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" />
                        Sale Return History: {sales_return.returnNo}
                    </h1>
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> Created: {format(new Date(sales_return.createdAt), 'dd MMM yyyy, hh:mm a')}</span>
                        <span className="flex items-center gap-1"><User className="h-4 w-4" /> By: {sales_return.createdBy}</span>
                    </div>
                </div>
            </div>

            <div className="relative border-l-2 border-gray-200 ml-4 pl-8 py-4 space-y-12">
                {revisions.length === 0 ? (
                    <div className="text-gray-500 italic">No revisions found for this return.</div>
                ) : (
                    revisions.map((rev: any, idx: number) => (
                        <div key={rev.id} className="relative">
                            <div className="absolute -left-[41px] bg-white border-2 border-primary rounded-full p-1.5 shadow-sm">
                                <Clock className="h-4 w-4 text-primary" />
                            </div>
                            
                            <Card className="border-0 shadow-lg ring-1 ring-black/5 overflow-hidden">
                                <div className="bg-gray-50/80 px-6 py-4 border-b flex justify-between items-center">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <Badge className="bg-primary/10 text-primary hover:bg-primary/20">{rev.revision_number}</Badge>
                                            <span className="text-sm font-medium text-gray-600">{format(new Date(rev.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                                        </div>
                                    </div>
                                    <div className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                        <User className="h-4 w-4" /> {rev.modified_by ? rev.modified_by.name : 'System'}
                                    </div>
                                </div>
                                <CardContent className="p-0">
                                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
                                        {/* Reason Block */}
                                        <div className="p-6 md:col-span-1 bg-gray-50/50">
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Reason for Change</h4>
                                            <div className="bg-white border rounded-md p-3 shadow-sm space-y-2">
                                                <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 font-mono text-xs">
                                                    {rev.reason_code}
                                                </Badge>
                                                <p className="text-sm text-gray-700 leading-relaxed">
                                                    {rev.reason_text || "No detailed explanation provided."}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Changes Block */}
                                        <div className="p-6 md:col-span-2 space-y-6">
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                <FileText className="h-4 w-4" /> Changes Made
                                            </h4>
                                            
                                            {/* Header Changes */}
                                            {rev.diff_summary_json?.header && Object.keys(rev.diff_summary_json.header).length > 0 && (
                                                <div className="space-y-2">
                                                    <h5 className="text-sm font-medium text-gray-700">General Information</h5>
                                                    <div className="bg-gray-50 border rounded-md overflow-hidden">
                                                        {Object.entries(rev.diff_summary_json.header).map(([field, vals]: any, i) => (
                                                            <div key={field} className={`p-3 flex items-center justify-between text-sm ${i !== 0 ? 'border-t' : ''}`}>
                                                                <span className="text-gray-500 capitalize">{field.replace(/_/g, ' ')}</span>
                                                                <div className="flex items-center gap-2 font-mono text-xs">
                                                                    <span className="text-gray-400 line-through truncate max-w-[150px]">{String(vals.old) || '-'}</span>
                                                                    <ArrowRight className="h-3 w-3 text-gray-400" />
                                                                    <span className="text-gray-900 font-medium truncate max-w-[150px]">{String(vals.new) || '-'}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Item Changes */}
                                            {rev.diff_summary_json?.items_modified && rev.diff_summary_json.items_modified.length > 0 && (
                                                <div className="space-y-2">
                                                    <h5 className="text-sm font-medium text-gray-700">Item Modifications</h5>
                                                    <div className="bg-gray-50 border rounded-md overflow-hidden divide-y">
                                                        {rev.diff_summary_json.items_modified.map((mod: any) => (
                                                            <div key={mod.id} className="p-3">
                                                                <div className="text-sm font-medium text-gray-900 mb-2">{mod.product_name}</div>
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    {Object.entries(mod.changes).map(([field, vals]: any) => (
                                                                        <div key={field} className="flex flex-col gap-1 text-xs">
                                                                            <span className="text-gray-500 capitalize">{field.replace(/_/g, ' ')}</span>
                                                                            <div className="flex items-center gap-2 font-mono">
                                                                                <span className="text-gray-400 line-through">{String(vals.old)}</span>
                                                                                <ArrowRight className="h-3 w-3 text-gray-400" />
                                                                                <span className="text-gray-900">{String(vals.new)}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Items Added */}
                                            {rev.diff_summary_json?.items_added && rev.diff_summary_json.items_added.length > 0 && (
                                                <div className="space-y-2">
                                                    <h5 className="text-sm font-medium text-green-700">Items Added</h5>
                                                    <div className="bg-green-50/50 border border-green-100 rounded-md overflow-hidden divide-y divide-green-100">
                                                        {rev.diff_summary_json.items_added.map((item: any) => (
                                                            <div key={item.id} className="p-3 text-sm flex justify-between items-center text-green-800">
                                                                <span>{item.product_name}</span>
                                                                <span className="font-mono text-xs">Qty: {item.qty_returned} | Amt: ₹{item.total_amount}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Items Removed */}
                                            {rev.diff_summary_json?.items_removed && rev.diff_summary_json.items_removed.length > 0 && (
                                                <div className="space-y-2">
                                                    <h5 className="text-sm font-medium text-red-700">Items Removed</h5>
                                                    <div className="bg-red-50/50 border border-red-100 rounded-md overflow-hidden divide-y divide-red-100">
                                                        {rev.diff_summary_json.items_removed.map((item: any) => (
                                                            <div key={item.id} className="p-3 text-sm flex justify-between items-center text-red-800">
                                                                <span>{item.product_name}</span>
                                                                <span className="font-mono text-xs line-through">Qty: {item.qty_returned} | Amt: ₹{item.total_amount}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Financial Impact */}
                                            <div className="mt-4 pt-4 border-t">
                                                <h5 className="text-sm font-medium text-gray-700 mb-3">Financial Impact</h5>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div className="bg-gray-50 border rounded-md p-3 text-center">
                                                        <div className="text-xs text-gray-500 mb-1">Old Total</div>
                                                        <div className="font-mono font-medium">₹{rev.old_snapshot_json?.total_amount || '0.00'}</div>
                                                    </div>
                                                    <div className="bg-gray-50 border rounded-md p-3 text-center">
                                                        <div className="text-xs text-gray-500 mb-1">New Total</div>
                                                        <div className="font-mono font-medium text-gray-900">₹{rev.new_snapshot_json?.total_amount || '0.00'}</div>
                                                    </div>
                                                    <div className={`border rounded-md p-3 text-center ${
                                                        (parseFloat(rev.new_snapshot_json?.total_amount || '0') - parseFloat(rev.old_snapshot_json?.total_amount || '0')) > 0 
                                                            ? 'bg-red-50 border-red-100 text-red-700'
                                                            : (parseFloat(rev.new_snapshot_json?.total_amount || '0') - parseFloat(rev.old_snapshot_json?.total_amount || '0')) < 0
                                                                ? 'bg-green-50 border-green-100 text-green-700'
                                                                : 'bg-gray-50 border-gray-200 text-gray-600'
                                                    }`}>
                                                        <div className="text-xs opacity-75 mb-1">Difference</div>
                                                        <div className="font-mono font-medium">
                                                            {((parseFloat(rev.new_snapshot_json?.total_amount || '0') - parseFloat(rev.old_snapshot_json?.total_amount || '0')) > 0 ? '+' : '')}
                                                            ₹{(parseFloat(rev.new_snapshot_json?.total_amount || '0') - parseFloat(rev.old_snapshot_json?.total_amount || '0')).toFixed(2)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ))
                )}
                
                {/* Original Creation Event marker */}
                <div className="relative">
                    <div className="absolute -left-[41px] bg-green-100 border-2 border-green-500 rounded-full p-1.5 shadow-sm">
                        <FileText className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="text-sm font-medium text-gray-500 pt-1">
                        Original Return Created
                    </div>
                </div>
            </div>
        </div>
    );
}
