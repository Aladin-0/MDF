'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useOutletId } from '@/hooks/useOutletId';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, FileText, Clock, User, ArrowLeft, History } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface DocumentRevision {
    id: string;
    revisionNumber: number;
    createdAt: string;
    modifiedByName: string;
    reasonCode: string;
    reasonText: string;
    diffSummaryJson: string;
    revisionType?: string;
}

function DiffRow({ label, oldVal, newVal }: { label: string; oldVal: string; newVal: string }) {
    return (
        <div className="flex flex-col space-y-1">
            <span className="text-xs font-semibold text-gray-500">{label}</span>
            <div className="flex justify-between items-center text-sm bg-white border rounded p-2">
                <span className="text-red-600 line-through truncate max-w-[120px]">{oldVal}</span>
                <span className="text-emerald-700 font-medium truncate max-w-[120px]">{newVal}</span>
            </div>
        </div>
    );
}

export default function VoucherRevisionsPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const outletId = useOutletId();
    const [loading, setLoading] = useState(true);
    const [voucher, setVoucher] = useState<any>(null);
    const [revisions, setRevisions] = useState<DocumentRevision[]>([]);

    useEffect(() => {
        if (!outletId) return;
        api.get(`/audit/revisions/voucher/${params.id}/`, { params: { outletId } })
            .then(res => {
                console.log("Revisions API Response:", res.data);
                setVoucher(res.data.record);
                const mappedRevisions = res.data.revisions.map((r: any) => ({
                    id: r.id,
                    revisionNumber: r.revision_number,
                    createdAt: r.created_at,
                    modifiedByName: r.modified_by?.name || 'System',
                    reasonCode: r.reason_code,
                    reasonText: r.reason_text,
                    diffSummaryJson: r.diff_summary_json,
                    revisionType: r.revision_type
                }));
                setRevisions(mappedRevisions);
            })
            .catch((err) => {
                console.error("Revisions API Error:", err);
            })
            .finally(() => setLoading(false));
    }, [params.id, outletId]);

    if (loading) return <div className="p-8 text-center animate-pulse">Loading history...</div>;
    if (!voucher) return null;

    return (
        <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button variant="ghost" onClick={() => router.back()} className="mb-2 hover:bg-gray-100">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <History className="h-6 w-6 text-primary" />
                        Voucher History: {voucher.voucherNo}
                    </h1>
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> Created: {format(new Date(voucher.createdAt || new Date()), 'dd MMM yyyy, hh:mm a')}</span>
                        <span className="flex items-center gap-1"><User className="h-4 w-4" /> By: {voucher.createdBy || 'System'}</span>
                    </div>
                </div>
            </div>

            <div className="relative border-l-2 border-gray-200 ml-4 pl-8 py-4 space-y-12">
                {revisions.length === 0 ? (
                    <div className="text-gray-500 italic">No revisions found for this voucher.</div>
                ) : (
                    revisions.map((rev) => {
                        const diff = typeof rev.diffSummaryJson === 'string' ? JSON.parse(rev.diffSummaryJson || '{}') : (rev.diffSummaryJson || {});
                        
                        return (
                            <div key={rev.id} className="relative">
                                <div className="absolute -left-[41px] bg-white border-2 border-primary rounded-full p-1.5 shadow-sm">
                                    <Clock className="h-4 w-4 text-primary" />
                                </div>
                                
                                <Card className="border-0 shadow-lg ring-1 ring-black/5 overflow-hidden">
                                    <div className="bg-gray-50/80 px-6 py-4 border-b flex justify-between items-center">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <Badge className="bg-primary/10 text-primary hover:bg-primary/20">{rev.revisionNumber}</Badge>
                                                <span className="text-sm font-medium text-gray-600">{format(new Date(rev.createdAt), 'dd MMM yyyy, hh:mm a')}</span>
                                            </div>
                                        </div>
                                        <div className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                            <User className="h-4 w-4" /> {rev.modifiedByName}
                                        </div>
                                    </div>
                                    <CardContent className="p-6 space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div>
                                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Action Type</h4>
                                                    <p className="text-gray-900 font-medium">{(rev.revisionType || 'MODIFICATION').replace(/_/g, ' ').toUpperCase()}</p>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reason</h4>
                                                    <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md text-sm border border-yellow-100 flex gap-2">
                                                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                                        <div>
                                                            <strong>{rev.reasonCode}</strong>: {rev.reasonText}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-gray-50 rounded-lg p-4 border space-y-3">
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Changes</h4>
                                                
                                                {Object.keys(diff).length === 0 ? (
                                                    <span className="text-sm text-muted-foreground italic">No fields were changed in this revision.</span>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {diff.total_amount && (
                                                            <DiffRow label="Total Amount" oldVal={diff.total_amount.old} newVal={diff.total_amount.new} />
                                                        )}
                                                        {diff.date && (
                                                            <DiffRow label="Date" oldVal={diff.date.old} newVal={diff.date.new} />
                                                        )}
                                                        {diff.narration && (
                                                            <DiffRow label="Narration" oldVal={diff.narration.old} newVal={diff.narration.new} />
                                                        )}
                                                        {diff.ledgers && (
                                                            <DiffRow label="Ledgers" oldVal={diff.ledgers.old} newVal={diff.ledgers.new} />
                                                        )}
                                                        {diff.lines_count && (
                                                            <DiffRow label="Voucher Lines" oldVal={`${diff.lines_count.old} lines`} newVal={`${diff.lines_count.new} lines`} />
                                                        )}
                                                        {diff.bill_adjustments_count && (
                                                            <DiffRow label="Bill Adjustments" oldVal={`${diff.bill_adjustments_count.old} adjustments`} newVal={`${diff.bill_adjustments_count.new} adjustments`} />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        );
                    })
                )}
                
                {/* Original Creation Event marker */}
                <div className="relative">
                    <div className="absolute -left-[41px] bg-green-100 border-2 border-green-500 rounded-full p-1.5 shadow-sm">
                        <FileText className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="text-sm font-medium text-gray-500 pt-1">
                        Original Voucher Created
                    </div>
                </div>
            </div>
        </div>
    );
}
