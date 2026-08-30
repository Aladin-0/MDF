import { formatCurrency } from '@/lib/gst';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function KPIRibbon({ data }: { data: any }) {
    if (!data) return null;

    const gstr1 = data.gstr1 || {};
    const gstr3b = data.gstr3b || {};
    const mom = data.mom_delta || {};

    const formatPct = (pct: number) => {
        if (!pct) return <Minus className="w-4 h-4 text-slate-400" />;
        if (pct > 0) return <span className="flex items-center text-green-600"><TrendingUp className="w-3 h-3 mr-1" /> {pct.toFixed(1)}%</span>;
        return <span className="flex items-center text-amber-600"><TrendingDown className="w-3 h-3 mr-1" /> {Math.abs(pct).toFixed(1)}%</span>;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="text-sm font-medium text-slate-500 mb-1">Total Sales (B2B + B2C)</div>
                <div className="text-2xl font-bold text-slate-900">
                    {formatCurrency((gstr1.b2b_total || 0) + (gstr1.b2cs_total || 0) + (gstr1.b2cl_total || 0))}
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-sm font-medium text-slate-500 mb-1">Outward Tax Liability</div>
                        <div className="text-2xl font-bold text-slate-900">
                            {formatCurrency(gstr3b.outward_tax?.total || 0)}
                        </div>
                    </div>
                    <div className="text-sm bg-slate-50 px-2 py-1 rounded">
                        {formatPct(mom.outward_tax_change_pct)}
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-sm font-medium text-slate-500 mb-1">Eligible ITC (Claimed)</div>
                        <div className="text-2xl font-bold text-slate-900 text-green-600">
                            {formatCurrency(gstr3b.net_itc?.total || 0)}
                        </div>
                    </div>
                    <div className="text-sm bg-slate-50 px-2 py-1 rounded">
                        {formatPct(mom.net_itc_change_pct)}
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="text-sm font-medium text-slate-500 mb-1">Net Cash Payable</div>
                <div className={cn("text-2xl font-bold", (gstr3b.cash_payable?.total || 0) > 0 ? "text-amber-600" : "text-slate-900")}>
                    {formatCurrency(gstr3b.cash_payable?.total || 0)}
                </div>
            </div>
        </div>
    );
}
