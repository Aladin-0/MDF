'use client';

import { GSTPeriodSelector } from './GSTPeriodSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, FileText, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export function GSTDashboard() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">GST Returns Overview</h1>
                <p className="text-sm text-slate-500">Manage your GSTR-1, GSTR-3B, and GSTR-2B reconciliations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                            GSTR-1
                        </CardTitle>
                        <CardDescription>Review B2B, B2C, HSN summaries and generate the official Offline Tool Excel.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/gst/gstr1">
                            <Button className="w-full">Manage GSTR-1</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-green-600" />
                            GSTR-3B
                        </CardTitle>
                        <CardDescription>Review outward tax, ITC, and generate the official Offline Utility .xlsm.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/gst/gstr3b">
                            <Button className="w-full">Manage GSTR-3B</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            GSTR-2A Early Warning
                        </CardTitle>
                        <CardDescription>Compare live GSTR-2A sandbox data against your Purchase Records.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/gst/gstr2a">
                            <Button className="w-full">Manage GSTR-2A</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-purple-600" />
                            GSTR-2B Reconciliation
                        </CardTitle>
                        <CardDescription>Sync portal data, reconcile ITC, and generate your internal Audit Report.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/gst/reconciliation">
                            <Button variant="outline" className="w-full">Reconcile ITC</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-orange-600" />
                            GST Sandbox
                        </CardTitle>
                        <CardDescription>Configure sandbox credentials and authenticate via OTP.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/gst/sandbox">
                            <Button variant="outline" className="w-full">Sandbox Settings</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
