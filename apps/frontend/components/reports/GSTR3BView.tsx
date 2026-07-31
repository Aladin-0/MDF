'use client';

import React from 'react';
import { useGSTR3BReport, useLockGSTReport, useUnlockGSTReport } from '@/hooks/useReports';
import { Lock, Unlock, ShieldCheck, ShieldAlert } from 'lucide-react';

import { DateRangeFilter } from '@/types';
import { exportGSTR3B_JSON, exportGSTR3B_CSV } from '@/lib/reportExport';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { Loader2 } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GSTR3BViewProps {
    dateRange: DateRangeFilter;
}

export function GSTR3BView({ dateRange }: GSTR3BViewProps) {
    const { outlet } = useAuthStore();
    const { data, isLoading, error } = useGSTR3BReport(dateRange);
    const lockMutation = useLockGSTReport();
    const unlockMutation = useUnlockGSTReport();

    const handleLock = () => {
        if (!outlet) return;
        lockMutation.mutate({
            outletId: outlet.id,
            payload: { reportType: 'GSTR3B', from: dateRange.from, to: dateRange.to }
        });
    };

    const handleUnlock = () => {
        if (!outlet) return;
        const reason = prompt('Enter reason for unlocking this period:');
        if (!reason) return;
        unlockMutation.mutate({
            outletId: outlet.id,
            payload: { reportType: 'GSTR3B', from: dateRange.from, to: dateRange.to, reason }
        });
    };


    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 mr-2 animate-spin" /> Loading GSTR-3B...</div>;
    }

    if (error) {
        return <div className="h-64 flex items-center justify-center text-red-500">Failed to load GSTR-3B data.</div>;
    }

    if (!data) return null;

    const outwardTaxable = data.outward_supplies?.taxable || {};
    const outwardNil = data.outward_supplies?.nil_exempt || {};
    const itc = data.eligible_itc?.all_other_itc || {};
    const net = data.net_payable || {};

    const totalOutwardTaxable = (outwardTaxable.total_taxable_value || 0) + (outwardTaxable.total_cgst || 0) + (outwardTaxable.total_sgst || 0) + (outwardTaxable.total_igst || 0);
    const totalItc = (itc.total_cgst || 0) + (itc.total_sgst || 0) + (itc.total_igst || 0);
    const totalNetPayable = (net.total_cgst || 0) + (net.total_sgst || 0) + (net.total_igst || 0);

    return (
        <div className="space-y-6 mt-6">
            

            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">GSTR-3B Details</h2>
                    {data.meta?.status === 'locked' && (
                        <span className="flex items-center text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Locked Snapshot
                        </span>
                    )}
                    {data.meta?.status === 'corrected' && (
                        <span className="flex items-center text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded">
                            <ShieldAlert className="w-3 h-3 mr-1" /> Corrected Draft
                        </span>
                    )}
                    {(data.meta?.status === 'draft' || !data.meta?.status) && (
                        <span className="flex items-center text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded">
                            Draft (Live)
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {data.meta?.status === 'locked' || data.meta?.status === 'exported' ? (
                        <Button variant="outline" size="sm" onClick={handleUnlock} disabled={unlockMutation.isPending} className="text-red-600 border-red-200 hover:bg-red-50">
                            <Unlock className="w-4 h-4 mr-2" /> Unlock for Corrections
                        </Button>
                    ) : (
                        <Button variant="default" size="sm" onClick={handleLock} disabled={lockMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <Lock className="w-4 h-4 mr-2" /> Lock & Snapshot
                        </Button>
                    )}

                    <Button variant="outline" size="sm" onClick={() => exportGSTR3B_JSON(data, outlet, dateRange)}>
                        <Download className="w-4 h-4 mr-2" /> {data.meta?.status === 'locked' ? 'Export JSON' : 'Draft JSON'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportGSTR3B_CSV(data, outlet, dateRange)}>
                        <Download className="w-4 h-4 mr-2" /> {data.meta?.status === 'locked' ? 'Export CSV' : 'Draft CSV'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Outward Taxable</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(outwardTaxable.total_taxable_value || 0)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Nil/Exempt Outward</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(outwardNil.total_taxable_value || 0)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Eligible ITC</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalItc)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Net Payable</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalNetPayable)}</p></CardContent>
                </Card>
            </div>

            <div className="space-y-8">
                <div>
                    <h3 className="text-lg font-semibold mb-3">3.1 Details of Outward Supplies</h3>
                    <div className="border rounded-md overflow-hidden bg-white">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Nature of Supplies</TableHead>
                                    <TableHead className="text-right">Total Taxable</TableHead>
                                    <TableHead className="text-right">Integrated Tax</TableHead>
                                    <TableHead className="text-right">Central Tax</TableHead>
                                    <TableHead className="text-right">State/UT Tax</TableHead>
                                    <TableHead className="text-right">Cess</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(outwardTaxable.total_taxable_value || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(outwardTaxable.total_igst || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(outwardTaxable.total_cgst || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(outwardTaxable.total_sgst || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(outwardTaxable.total_cess || 0)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>(c) Other outward supplies (Nil rated, exempted)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(outwardNil.total_taxable_value || 0)}</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-3">4. Eligible ITC</h3>
                    <div className="border rounded-md overflow-hidden bg-white">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Details</TableHead>
                                    <TableHead className="text-right">Integrated Tax</TableHead>
                                    <TableHead className="text-right">Central Tax</TableHead>
                                    <TableHead className="text-right">State/UT Tax</TableHead>
                                    <TableHead className="text-right">Cess</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>(A) (5) All other ITC</TableCell>
                                    <TableCell className="text-right">{formatCurrency(itc.total_igst || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(itc.total_cgst || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(itc.total_sgst || 0)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(itc.total_cess || 0)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-3">Net Tax Payable</h3>
                    <div className="border rounded-md overflow-hidden bg-white">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Tax Head</TableHead>
                                    <TableHead className="text-right">Amount Payable</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>Integrated Tax (IGST)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(net.total_igst || 0)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>Central Tax (CGST)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(net.total_cgst || 0)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>State/UT Tax (SGST)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(net.total_sgst || 0)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>Cess</TableCell>
                                    <TableCell className="text-right">{formatCurrency(net.total_cess || 0)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </div>
    );
}
