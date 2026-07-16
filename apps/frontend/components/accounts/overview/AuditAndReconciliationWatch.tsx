'use client';

import { useDashboardAuditAlerts } from '@/hooks/useAccounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, FileWarning, AlertTriangle } from 'lucide-react';

export function AuditAndReconciliationWatch() {
    const { data, isLoading } = useDashboardAuditAlerts();

    if (isLoading) {
        return <Skeleton className="h-64 w-full" />;
    }

    const {
        salesModified = 0,
        purchasesModified = 0,
        returnsModified = 0,
        vouchersModified = 0,
        highRiskEdits = 0,
        missingReasonCode = 0,
        orphanedSaleReturns = 0,
        orphanedPurchaseReturns = 0,
    } = data || {};

    const totalModified = salesModified + purchasesModified + returnsModified + vouchersModified;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-slate-700" />
                    Audit & Revision Watch
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Revisions Summary */}
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                            <FileWarning className="h-5 w-5 text-slate-600" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-semibold">Today's Revisions</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {totalModified} documents modified today
                            </p>
                            {totalModified > 0 && (
                                <div className="mt-2 flex gap-2 text-[11px] font-medium">
                                    {salesModified > 0 && <span className="px-2 py-0.5 bg-slate-100 rounded">Sales: {salesModified}</span>}
                                    {purchasesModified > 0 && <span className="px-2 py-0.5 bg-slate-100 rounded">Purchases: {purchasesModified}</span>}
                                    {vouchersModified > 0 && <span className="px-2 py-0.5 bg-slate-100 rounded">Vouchers: {vouchersModified}</span>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* High Risk Alerts */}
                    {(highRiskEdits > 0 || missingReasonCode > 0) && (
                        <div className="flex items-start gap-3 mt-4 pt-4 border-t">
                            <div className="p-2 bg-red-50 rounded-lg">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-red-700">Audit Flags</p>
                                <ul className="mt-1 space-y-1 text-xs text-red-600">
                                    {highRiskEdits > 0 && <li>• {highRiskEdits} high-value edits (&gt; ₹5,000)</li>}
                                    {missingReasonCode > 0 && <li>• {missingReasonCode} edits missing reason codes</li>}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Reconciliation Exceptions */}
                    {(orphanedSaleReturns > 0 || orphanedPurchaseReturns > 0) && (
                        <div className="flex items-start gap-3 mt-4 pt-4 border-t">
                            <div className="p-2 bg-amber-50 rounded-lg">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-700">Reconciliation Exceptions</p>
                                <ul className="mt-1 space-y-1 text-xs text-amber-600">
                                    {orphanedSaleReturns > 0 && <li>• {orphanedSaleReturns} sale returns pending refund linking</li>}
                                    {orphanedPurchaseReturns > 0 && <li>• {orphanedPurchaseReturns} purchase returns pending adjustment</li>}
                                </ul>
                            </div>
                        </div>
                    )}

                    {totalModified === 0 && orphanedSaleReturns === 0 && orphanedPurchaseReturns === 0 && (
                        <p className="text-sm text-center text-muted-foreground mt-4 py-4">
                            No suspicious activity or mismatches detected.
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
