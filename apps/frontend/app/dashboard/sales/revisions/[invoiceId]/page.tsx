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
        api.get(`/audit/revisions/sale/${invoiceId}/`, { params: { outletId: outlet.id } })
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

                                    {rev.resulting_invoice_id && (
                                        <div className="mt-4 pt-4 border-t flex justify-between items-center bg-blue-50/50 p-4 rounded-lg">
                                            <span className="text-sm text-blue-800 font-medium flex items-center gap-2">
                                                <ArrowRight className="h-4 w-4" /> Replaced by new invoice
                                            </span>
                                            <Button size="sm" onClick={() => router.push(`/dashboard/sales/${rev.resulting_invoice_id}`)}>
                                                View Replacement Invoice
                                            </Button>
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
