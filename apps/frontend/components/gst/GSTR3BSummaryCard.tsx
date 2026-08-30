import { formatCurrency } from '@/lib/gst';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function GSTR3BSummaryCard({ data }: { data: any }) {
    if (!data) return null;

    const renderTaxRow = (label: string, taxData: any) => {
        if (!taxData) return null;
        return (
            <div className="py-3 border-b border-slate-100 last:border-0">
                <div className="text-sm font-medium text-slate-700 mb-2">{label}</div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded flex flex-col">
                        <span className="text-slate-500 mb-1">IGST</span>
                        <span className="font-semibold">{formatCurrency(taxData.igst || 0)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded flex flex-col">
                        <span className="text-slate-500 mb-1">CGST</span>
                        <span className="font-semibold">{formatCurrency(taxData.cgst || 0)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded flex flex-col">
                        <span className="text-slate-500 mb-1">SGST</span>
                        <span className="font-semibold">{formatCurrency(taxData.sgst || 0)}</span>
                    </div>
                    <div className="bg-slate-100 p-2 rounded flex flex-col border border-slate-200">
                        <span className="text-slate-700 font-medium mb-1">Total</span>
                        <span className="font-bold">{formatCurrency(taxData.total || 0)}</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Card>
            <CardHeader className="bg-slate-50 border-b pb-4">
                <CardTitle className="text-lg font-bold text-slate-800">GSTR-3B Summary</CardTitle>
                <p className="text-xs text-slate-500">Liability, ITC & Payment</p>
            </CardHeader>
            <CardContent className="pt-2">
                {renderTaxRow('3.1 Outward Taxable Supplies (Liability)', data.outward_tax)}
                {renderTaxRow('4(A) Eligible ITC (Claimed)', data.net_itc)}
                
                <div className="mt-4 pt-4 border-t-2 border-slate-200">
                    <div className="text-sm font-bold text-slate-800 mb-2">Net Cash Payable</div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="bg-amber-50 p-2 rounded flex flex-col border border-amber-100">
                            <span className="text-amber-700 mb-1">IGST</span>
                            <span className="font-bold text-amber-900">{formatCurrency(data.cash_payable?.igst || 0)}</span>
                        </div>
                        <div className="bg-amber-50 p-2 rounded flex flex-col border border-amber-100">
                            <span className="text-amber-700 mb-1">CGST</span>
                            <span className="font-bold text-amber-900">{formatCurrency(data.cash_payable?.cgst || 0)}</span>
                        </div>
                        <div className="bg-amber-50 p-2 rounded flex flex-col border border-amber-100">
                            <span className="text-amber-700 mb-1">SGST</span>
                            <span className="font-bold text-amber-900">{formatCurrency(data.cash_payable?.sgst || 0)}</span>
                        </div>
                        <div className="bg-amber-100 p-2 rounded flex flex-col border border-amber-200">
                            <span className="text-amber-800 font-bold mb-1">Total</span>
                            <span className="font-black text-amber-900 text-sm">{formatCurrency(data.cash_payable?.total || 0)}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
