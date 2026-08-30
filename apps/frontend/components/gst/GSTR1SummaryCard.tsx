import { formatCurrency } from '@/lib/gst';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function GSTR1SummaryCard({ data }: { data: any }) {
    if (!data) return null;

    return (
        <Card>
            <CardHeader className="bg-slate-50 border-b pb-4">
                <CardTitle className="text-lg font-bold text-slate-800">GSTR-1 Summary</CardTitle>
                <p className="text-xs text-slate-500">Outward Supplies & Tax Liability</p>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-medium text-slate-600">B2B Sales (Registered)</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(data.b2b_total || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-medium text-slate-600">B2C Small (Unregistered)</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(data.b2cs_total || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-medium text-slate-600">B2C Large (Unregistered Interstate &gt; 2.5L)</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(data.b2cl_total || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-medium text-slate-600">Credit/Debit Notes (Registered)</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(data.cdnr_total || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-medium text-slate-600">Credit/Debit Notes (Unregistered)</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(data.cdnur_total || 0)}</span>
                </div>
                
                <div className="pt-2 mt-2 bg-slate-50 rounded-md p-3 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Total HSN Summaries</span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm">{data.hsn_count || 0}</span>
                </div>
            </CardContent>
        </Card>
    );
}
