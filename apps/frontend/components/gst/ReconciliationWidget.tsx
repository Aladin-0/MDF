import { formatCurrency } from '@/lib/gst';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, CheckCircle, Clock } from 'lucide-react';

export function ReconciliationWidget({ data }: { data: any }) {
    if (!data) return null;

    return (
        <Card className="h-full">
            <CardHeader className="bg-slate-50 border-b pb-4 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-bold text-slate-800">ITC Reconciliation & 2B Matches</CardTitle>
                    <p className="text-xs text-slate-500">GSTR-2B vs Purchase Register</p>
                </div>
                {data.status === 'COMPLETED' ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Reconciled</Badge>
                ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>
                )}
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-2xl font-bold text-slate-800">{data.stats?.total_invoices || 0}</div>
                        <div className="text-xs font-medium text-slate-500 mt-1">Total Invoices</div>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                        <div className="text-2xl font-bold text-green-700">{data.stats?.matched || 0}</div>
                        <div className="text-xs font-medium text-green-600 mt-1 flex justify-center items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Matched
                        </div>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <div className="text-2xl font-bold text-amber-700">{data.stats?.mismatched || 0}</div>
                        <div className="text-xs font-medium text-amber-600 mt-1 flex justify-center items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> Mismatched
                        </div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="text-2xl font-bold text-blue-700">{data.stats?.missing_in_2b || 0}</div>
                        <div className="text-xs font-medium text-blue-600 mt-1 flex justify-center items-center gap-1">
                            <Clock className="w-3 h-3" /> Missing in 2B
                        </div>
                    </div>
                </div>

                {data.deferred_itc && (
                    <div className="mt-6">
                        <h4 className="text-sm font-bold text-slate-800 mb-3 border-b pb-2">Deferred ITC Lifecycle</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-600">Newly Deferred (This Period)</span>
                                <span className="font-semibold text-slate-900">{formatCurrency(data.deferred_itc.newly_deferred || 0)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-600">Claimed (Now in 2B)</span>
                                <span className="font-semibold text-green-600">+{formatCurrency(data.deferred_itc.claimed_this_period || 0)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                                <span className="font-bold text-slate-800">Total Deferred Balance Carried Forward</span>
                                <span className="font-bold text-slate-900">{formatCurrency(data.deferred_itc.total_deferred_balance || 0)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
