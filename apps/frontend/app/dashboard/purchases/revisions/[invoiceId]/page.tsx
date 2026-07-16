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

export default function RevisionDetailPage({ params }: { params: { invoiceId: string } }) {
    const router = useRouter();
    const { invoiceId } = params;
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const outlet = useAuthStore(s => s.user?.outlet);

    useEffect(() => {
        if (!outlet) return;
        api.get(`/audit/revisions/purchase/${invoiceId}/`, { params: { outletId: outlet.id } })
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load revision details.');
                setLoading(false);
            });
    }, [invoiceId, outlet]);

    if (loading) return <div className="p-8 text-center animate-pulse">Loading history...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!data) return null;

    const { record: invoice, revisions } = data;

    return (
        <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button variant="ghost" onClick={() => router.back()} className="mb-2 hover:bg-gray-100">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" />
                        Invoice History: {invoice.invoiceNo}
                    </h1>
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> Created: {format(new Date(invoice.createdAt), 'dd MMM yyyy, hh:mm a')}</span>
                        <span className="flex items-center gap-1"><User className="h-4 w-4" /> By: {invoice.createdBy}</span>
                    </div>
                </div>
                {invoice.isCancelled && (
                    <Badge variant="destructive" className="px-4 py-2 text-sm">
                        CANCELLED on {format(new Date(invoice.cancelledAt), 'dd MMM yyyy')}
                    </Badge>
                )}
            </div>

            <div className="relative border-l-2 border-gray-200 ml-4 pl-8 py-4 space-y-12">
                {revisions.length === 0 ? (
                    <div className="text-gray-500 italic">No revisions found for this invoice.</div>
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
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Action Type</h4>
                                                <p className="text-gray-900 font-medium">{rev.revision_type.replace(/_/g, ' ').toUpperCase()}</p>
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reason</h4>
                                                <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md text-sm border border-yellow-100 flex gap-2">
                                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                                    <div>
                                                        <strong>{rev.reason_code}</strong>: {rev.reason_text}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-gray-50 rounded-lg p-4 border space-y-3">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Financial Impact</h4>
                                            
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600">Old Total</span>
                                                <span className="font-mono">₹{rev.old_snapshot_json?.financial?.grand_total || '0.00'}</span>
                                            </div>
                                            
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600">New Total</span>
                                                <span className="font-mono">₹{rev.new_snapshot_json?.financial?.grand_total || '0.00'}</span>
                                            </div>
                                            
                                            <Separator />
                                            
                                            <div className="flex justify-between items-center font-medium">
                                                <span>Difference</span>
                                                <span className={
                                                    (parseFloat(rev.new_snapshot_json?.financial?.grand_total || '0') - parseFloat(rev.old_snapshot_json?.financial?.grand_total || '0')) > 0
                                                        ? 'text-red-600'
                                                        : (parseFloat(rev.new_snapshot_json?.financial?.grand_total || '0') - parseFloat(rev.old_snapshot_json?.financial?.grand_total || '0')) < 0
                                                            ? 'text-green-600'
                                                            : 'text-gray-600'
                                                }>
                                                    {((parseFloat(rev.new_snapshot_json?.financial?.grand_total || '0') - parseFloat(rev.old_snapshot_json?.financial?.grand_total || '0')) > 0 ? '+' : '')}
                                                    ₹{(parseFloat(rev.new_snapshot_json?.financial?.grand_total || '0') - parseFloat(rev.old_snapshot_json?.financial?.grand_total || '0')).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Items Modified */}
                                    {rev.diff_summary_json?.items_modified && rev.diff_summary_json.items_modified.length > 0 && (
                                        <div className="space-y-2 mt-4">
                                            <h5 className="text-sm font-medium text-amber-700">Items Modified</h5>
                                            <div className="bg-amber-50/50 border border-amber-100 rounded-md overflow-hidden divide-y divide-amber-100">
                                                {rev.diff_summary_json.items_modified.map((mod: any, i: number) => (
                                                    <div key={i} className="p-3 text-sm">
                                                        <div className="font-medium text-amber-900 mb-2">{mod.name || 'Unknown Product'} (Batch: {mod.batch_no || 'N/A'})</div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                                                            {Object.entries(mod.changes).map(([field, vals]: [string, any]) => (
                                                                <div key={field} className="flex flex-col bg-white p-2 rounded border border-amber-100/50">
                                                                    <span className="text-xs text-amber-700/70 font-medium uppercase tracking-wider mb-1">{field.replace(/_/g, ' ')}</span>
                                                                    <div className="flex items-center gap-2 text-xs font-mono">
                                                                        <span className="text-gray-500 line-through bg-gray-50 px-1 rounded">{vals.old}</span>
                                                                        <ArrowRight className="h-3 w-3 text-amber-400" />
                                                                        <span className="text-amber-700 bg-amber-100/50 px-1 rounded font-medium">{vals.new}</span>
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
                                        <div className="space-y-2 mt-4">
                                            <h5 className="text-sm font-medium text-green-700">Items Added</h5>
                                            <div className="bg-green-50/50 border border-green-100 rounded-md overflow-hidden divide-y divide-green-100">
                                                {rev.diff_summary_json.items_added.map((item: any, i: number) => (
                                                    <div key={i} className="p-3 text-sm flex justify-between items-center text-green-800">
                                                        <span>{item.custom_product_name || 'Product'} (Batch: {item.batch_no || 'N/A'})</span>
                                                        <span className="font-mono text-xs">Qty: {item.qty} | Amt: ₹{item.total_amount}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Items Removed */}
                                    {rev.diff_summary_json?.items_removed && rev.diff_summary_json.items_removed.length > 0 && (
                                        <div className="space-y-2 mt-4">
                                            <h5 className="text-sm font-medium text-red-700">Items Removed</h5>
                                            <div className="bg-red-50/50 border border-red-100 rounded-md overflow-hidden divide-y divide-red-100">
                                                {rev.diff_summary_json.items_removed.map((item: any, i: number) => (
                                                    <div key={i} className="p-3 text-sm flex justify-between items-center text-red-800">
                                                        <span>{item.custom_product_name || 'Product'} (Batch: {item.batch_no || 'N/A'})</span>
                                                        <span className="font-mono text-xs line-through">Qty: {item.qty} | Amt: ₹{item.total_amount}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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
                        Original Invoice Created
                    </div>
                </div>
            </div>
        </div>
    );
}
