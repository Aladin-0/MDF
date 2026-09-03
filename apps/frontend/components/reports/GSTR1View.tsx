'use client';

import React, { useState, useEffect } from 'react';
import { useGSTR1Report, useLockGSTReport, useUnlockGSTReport } from '@/hooks/useReports';
import { Lock, Unlock, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

import { DateRangeFilter } from '@/types';
import { exportGSTR1_JSON, exportGSTR1_CSV } from '@/lib/reportExport';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { gstApi } from '@/lib/apiClient';
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

interface GSTR1ViewProps {
    dateRange: DateRangeFilter;
}

export function GSTR1View({ dateRange }: GSTR1ViewProps) {
    const { outlet } = useAuthStore();
    const { data, isLoading, error } = useGSTR1Report(dateRange);
    const lockMutation = useLockGSTReport();
    const unlockMutation = useUnlockGSTReport();

    const [warnings, setWarnings] = useState<any[]>([]);
    const [isValidating, setIsValidating] = useState<boolean>(false);

    useEffect(() => {
        if (!dateRange.from) return;
        
        const dateObj = new Date(dateRange.from);
        if (isNaN(dateObj.getTime())) return;
        
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getFullYear();
        const mmyyyy = `${mm}${yyyy}`;
        
        const fetchWarnings = async () => {
            setIsValidating(true);
            try {
                const res = await gstApi.validateGSTR1(mmyyyy);
                if (res.warnings) {
                    setWarnings(res.warnings);
                }
            } catch (err) {
                console.error("Failed to fetch GSTR-1 warnings", err);
                setWarnings([]);
            } finally {
                setIsValidating(false);
            }
        };
        fetchWarnings();
    }, [dateRange.from]);

    const handleLock = () => {
        if (!outlet) return;
        lockMutation.mutate({
            outletId: outlet.id,
            payload: { reportType: 'GSTR1', from: dateRange.from, to: dateRange.to }
        });
    };

    const handleUnlock = () => {
        if (!outlet) return;
        const reason = prompt('Enter reason for unlocking this period:');
        if (!reason) return;
        unlockMutation.mutate({
            outletId: outlet.id,
            payload: { reportType: 'GSTR1', from: dateRange.from, to: dateRange.to, reason }
        });
    };


    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 mr-2 animate-spin" /> Loading GSTR-1...</div>;
    }

    if (error) {
        return <div className="h-64 flex items-center justify-center text-red-500">Failed to load GSTR-1 data.</div>;
    }

    if (!data) return null;

    const b2b = data.b2b_invoices || [];
    const b2c = data.b2c_summary || [];
    const cdnr = data.cdnr || [];
    const hsn = data.hsn_summary || [];

    const totalB2bTaxable = b2b.reduce((sum: number, r: any) => sum + (r.total_taxable_value || 0), 0);
    const totalB2cTaxable = b2c.reduce((sum: number, r: any) => sum + (r.total_taxable_value || 0), 0);
    const totalCdnrTaxable = cdnr.reduce((sum: number, r: any) => sum + (r.total_taxable_value || 0), 0);
    const totalHsnTaxable = hsn.reduce((sum: number, r: any) => sum + (r.total_taxable_value || 0), 0);

    return (
        <div className="space-y-6 mt-6">
            
            {warnings && warnings.length > 0 && (
                <Alert className="mb-6 bg-amber-50 border-amber-200 text-amber-800 shadow-sm rounded-md animate-in fade-in slide-in-from-top-2 duration-300">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="font-semibold text-amber-900">
                        Export Warning for {new Date(dateRange.from).toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </AlertTitle>
                    <AlertDescription>
                        <p className="text-sm mb-3 mt-1">
                            The following invoices have missing data and will be exported with default values (0% or 0000). Please manually correct your Excel file before filing.
                        </p>
                        <ul className="text-xs list-disc list-inside space-y-1 text-amber-700 bg-amber-100/50 p-2 rounded max-h-32 overflow-y-auto">
                            {warnings.slice(0, 5).map((w, idx) => (
                                <li key={idx}>
                                    <span className="font-medium">{w.invoice_no}</span>: {w.issue}
                                </li>
                            ))}
                            {warnings.length > 5 && (
                                <li className="list-none mt-1 ml-1">
                                    <span className="font-medium">...and {warnings.length - 5} more issues.</span>
                                </li>
                            )}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">GSTR-1 Details</h2>
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
                    
                    <Button variant="outline" size="sm" onClick={() => exportGSTR1_JSON(data, outlet, dateRange)} disabled={isValidating}>
                        {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {data.meta?.status === 'locked' ? 'Export JSON' : 'Draft JSON'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportGSTR1_CSV(data, outlet, dateRange)} disabled={isValidating}>
                        {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {data.meta?.status === 'locked' ? 'Export CSV' : 'Draft CSV'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">B2B Taxable Value</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalB2bTaxable)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">B2C Taxable Value</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalB2cTaxable)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">CDNR Adjustment</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalCdnrTaxable)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">HSN Total</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalHsnTaxable)}</p></CardContent>
                </Card>
            </div>

            <div className="space-y-8">
                <div>
                    <h3 className="text-lg font-semibold mb-3">B2B Invoices</h3>
                    {b2b.length === 0 ? <p className="text-sm text-muted-foreground">No B2B invoices found.</p> : (
                        <div className="border rounded-md overflow-hidden bg-white">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>GSTIN</TableHead>
                                        <TableHead>Doc No</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Taxable</TableHead>
                                        <TableHead className="text-right">IGST</TableHead>
                                        <TableHead className="text-right">CGST</TableHead>
                                        <TableHead className="text-right">SGST</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {b2b.map((row: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.party_gstin}</TableCell>
                                            <TableCell>{row.document_number}</TableCell>
                                            <TableCell>{row.transaction_date}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_taxable_value)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_igst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_cgst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_sgst)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-3">B2C Summary</h3>
                    {b2c.length === 0 ? <p className="text-sm text-muted-foreground">No B2C transactions found.</p> : (
                        <div className="border rounded-md overflow-hidden bg-white">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Place of Supply</TableHead>
                                        <TableHead>Rate (%)</TableHead>
                                        <TableHead className="text-right">Taxable</TableHead>
                                        <TableHead className="text-right">IGST</TableHead>
                                        <TableHead className="text-right">CGST</TableHead>
                                        <TableHead className="text-right">SGST</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {b2c.map((row: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.party_state}</TableCell>
                                            <TableCell>{row.gst_rate}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_taxable_value)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_igst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_cgst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_sgst)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-3">CDNR Summary</h3>
                    {cdnr.length === 0 ? <p className="text-sm text-muted-foreground">No Credit/Debit notes found.</p> : (
                        <div className="border rounded-md overflow-hidden bg-white">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>GSTIN</TableHead>
                                        <TableHead>Doc No</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Taxable</TableHead>
                                        <TableHead className="text-right">IGST</TableHead>
                                        <TableHead className="text-right">CGST</TableHead>
                                        <TableHead className="text-right">SGST</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {cdnr.map((row: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.party_gstin}</TableCell>
                                            <TableCell>{row.document_number}</TableCell>
                                            <TableCell>{row.transaction_date}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_taxable_value)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_igst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_cgst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_sgst)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-3">HSN Summary</h3>
                    {hsn.length === 0 ? <p className="text-sm text-muted-foreground">No HSN data found.</p> : (
                        <div className="border rounded-md overflow-hidden bg-white">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>HSN Code</TableHead>
                                        <TableHead>Rate (%)</TableHead>
                                        <TableHead className="text-right">Taxable</TableHead>
                                        <TableHead className="text-right">IGST</TableHead>
                                        <TableHead className="text-right">CGST</TableHead>
                                        <TableHead className="text-right">SGST</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {hsn.map((row: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.hsn_code}</TableCell>
                                            <TableCell>{row.gst_rate}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_taxable_value)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_igst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_cgst)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.total_sgst)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
