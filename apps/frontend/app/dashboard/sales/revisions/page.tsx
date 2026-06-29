'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { History, Eye, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export default function RevisionHistoryPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [revisions, setRevisions] = useState<any[]>([]);
    const outlet = useAuthStore(s => s.user?.outlet);

    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        if (!outlet) return;
        
        // Fetch report summary
        api.get('/sales/revisions/report/', { params: { outletId: outlet.id } })
            .then(res => {
                setStats(res.data.summary);
            })
            .catch(err => console.error(err));
            
        // Fetch actual revisions
        // The API returns paginated results now
        api.get('/revisions/', { params: { outletId: outlet.id, pageSize: 50 } })
            .then(res => {
                setRevisions(res.data.results || res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [outlet]);

    const handleExport = () => {
        if (!outlet) return;
        window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/revisions/?outletId=${outlet.id}&export=csv`, '_blank');
    };

    const getRevisionTypeBadge = (type: string) => {
        const typeMap: Record<string, { label: string, color: string }> = {
            'commercial_correction': { label: 'Commercial Correction', color: 'bg-blue-100 text-blue-800' },
            'paid_bill_correction': { label: 'Paid Correction', color: 'bg-indigo-100 text-indigo-800' },
            'cancel_and_reissue': { label: 'Cancel & Reissue', color: 'bg-purple-100 text-purple-800' },
            'return_aware_correction': { label: 'Return-Aware Correction', color: 'bg-orange-100 text-orange-800' },
            'direct_revise': { label: 'Direct Revise', color: 'bg-emerald-100 text-emerald-800' },
        };
        const config = typeMap[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
        return <Badge className={config.color} variant="secondary">{config.label}</Badge>;
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <History className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Revision History</h1>
                        <p className="text-muted-foreground mt-1 text-lg">Audit trail of all invoice modifications</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExport}>
                        Export CSV
                    </Button>
                </div>
            </div>

            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Modified Today</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.modifiedToday}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revisions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalModified}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Cancel & Reissue</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.cancelAndReissue}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Return-Linked</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.returnLinked}</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card className="border-0 shadow-lg ring-1 ring-black/5 bg-white/50 backdrop-blur-xl">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-gray-50/50">
                            <TableRow>
                                <TableHead className="w-[180px]">Date</TableHead>
                                <TableHead>Revision No</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Original Invoice</TableHead>
                                <TableHead>Resulting Invoice</TableHead>
                                <TableHead>Modified By</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8">
                                        <div className="animate-pulse space-y-4">
                                            <div className="h-4 bg-gray-200 rounded w-1/4 mx-auto"></div>
                                            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : revisions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No revision history found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                revisions.map((rev) => (
                                    <TableRow key={rev.id} className="group hover:bg-gray-50/50 transition-colors">
                                        <TableCell className="font-medium">
                                            {format(new Date(rev.created_at), 'dd MMM yyyy, hh:mm a')}
                                        </TableCell>
                                        <TableCell>{rev.revision_number}</TableCell>
                                        <TableCell>{getRevisionTypeBadge(rev.revision_type)}</TableCell>
                                        <TableCell>
                                            <Button variant="link" className="p-0 h-auto" onClick={() => router.push(`/dashboard/sales/revisions/${rev.original_invoice.id}`)}>
                                                {rev.original_invoice.invoice_no}
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            {rev.resulting_invoice_id ? (
                                                <Button variant="link" className="p-0 h-auto" onClick={() => router.push(`/dashboard/sales/revisions/${rev.resulting_invoice_id}`)}>
                                                    View New Invoice <ArrowRight className="h-3 w-3 ml-1" />
                                                </Button>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell>{rev.modified_by ? rev.modified_by.name : 'System'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => router.push(`/dashboard/sales/revisions/${rev.original_invoice.id}`)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
