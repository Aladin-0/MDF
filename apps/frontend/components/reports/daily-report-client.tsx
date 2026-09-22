"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { Download, TrendingUp, IndianRupee, FileText, Package, Briefcase, Calculator } from "lucide-react";
import { PartnerSettingsModal } from "./partner-settings-modal";
import { FixedExpensesModal } from "./fixed-expenses-modal";
import { DateRangePicker } from "@/components/reports/DateRangePicker";
import { getDefaultDateRange } from "@/hooks/useReports";
import { DateRangeFilter } from "@/types";

export function DailyReportClient() {
  const { user } = useAuthStore();
  const [dateRange, setDateRange] = useState<DateRangeFilter>(getDefaultDateRange);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingCash, setSavingCash] = useState(false);

  // Cash Form State
  const [cashState, setCashState] = useState({
    notes2000: 0, notes500: 0, notes200: 0, notes100: 0, notes50: 0, notes20: 0, notes10: 0,
    cartonSale: 0, pettyCashExp: 0, sideCash: 0, nextDayOpening: 0
  });

  const fetchData = async () => {
    if (!user?.outletId || !dateRange.from) return;
    setLoading(true);
    try {
      const res = await api.get(`/reports/daily-snapshot/?outletId=${user.outletId}&startDate=${dateRange.from}&endDate=${dateRange.to}`);
      setData(res.data);
      if (res.data.cashState) {
        setCashState(res.data.cashState);
      }
    } catch (err) {
      toast.error("Failed to fetch report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange, user?.outletId]);

  const handleDownload = async () => {
    if (!user?.outletId || !dateRange.from) return;
    setDownloading(true);
    try {
      const res = await api.get(`/reports/daily-snapshot/export/?outletId=${user.outletId}&startDate=${dateRange.from}&endDate=${dateRange.to}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Daily_Report_${dateRange.from}_${dateRange.to}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Report downloaded successfully!");
    } catch (err) {
      toast.error("Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  const handleCashChange = (field: string, value: string) => {
    setCashState(prev => ({ ...prev, [field]: Number(value) || 0 }));
  };

  const saveCashState = async () => {
    if (!user?.outletId) return;
    setSavingCash(true);
    try {
      await api.post(`/reports/daily-snapshot/cash/`, {
        outletId: user.outletId,
        date: dateRange.from,
        ...cashState
      });
      toast.success("Cash details saved!");
      fetchData(); // refresh to calc extra/short
    } catch (err) {
      toast.error("Failed to save cash details");
    } finally {
      setSavingCash(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  };

  const actualCashCalc = (cashState.notes2000 * 2000) + (cashState.notes500 * 500) + (cashState.notes200 * 200) + 
                         (cashState.notes100 * 100) + (cashState.notes50 * 50) + (cashState.notes20 * 20) + (cashState.notes10 * 10);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Financial Snapshot</h1>
          <p className="text-muted-foreground text-sm">Comprehensive End-of-Day Till Reconciliation.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <PartnerSettingsModal onUpdate={fetchData} />
          {data?.fixedExpenses && <FixedExpensesModal initialData={data.fixedExpenses} onUpdate={fetchData} />}
          <Button onClick={handleDownload} disabled={downloading} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="w-4 h-4 mr-2" />
            {downloading ? "Exporting..." : "Export Excel"}
          </Button>
        </div>
      </div>

      {!data && loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-medium text-green-800">Gross Profit</p>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div className="text-2xl font-bold text-green-900">{formatCurrency(data.financials.grossProfit)}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-medium text-red-800">Fixed Exp (Per Day)</p>
                  <IndianRupee className="h-4 w-4 text-red-600" />
                </div>
                <div className="text-2xl font-bold text-red-900">{formatCurrency(data.fixedExpenses.perDay)}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-bold text-blue-900">NET PROFIT</p>
                  <Briefcase className="h-4 w-4 text-blue-700" />
                </div>
                <div className="text-3xl font-extrabold text-blue-900">{formatCurrency(data.financials.netProfit)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-medium text-muted-foreground">Current Stock</p>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">{formatCurrency(data.financials.stockValue)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1: Financial & Cumulative */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3 border-b bg-gray-50/50">
                  <CardTitle className="text-lg">Cumulative Totals</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex justify-between pb-2 border-b">
                    <span className="text-gray-600">Total Purchase Upto Date</span>
                    <span className="font-bold">{formatCurrency(data.financials.cumulativePurchase)}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b">
                    <span className="text-gray-600">Total Sale Upto Date</span>
                    <span className="font-bold">{formatCurrency(data.financials.saleUpto)}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b">
                    <span className="text-gray-600">Period Gross Sales</span>
                    <span className="font-semibold">{formatCurrency(data.financials.totalSales)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200">
                <CardHeader className="bg-blue-50/50 pb-3 border-b">
                  <CardTitle className="text-blue-900 text-lg">Partner Net Profit Splits</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {data.partners.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-white border rounded shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.percentage}%</p>
                        </div>
                      </div>
                      <span className="font-bold text-blue-700">{formatCurrency(p.shareAmount)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Column 2: Sales Breakdown & Cash Required */}
            <Card className="bg-gray-50 border-gray-200 lg:col-span-1">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2"><Calculator className="w-5 h-5"/> Reconciliation Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between pb-1 text-gray-500">
                  <span>Gross Sales</span>
                  <span>{formatCurrency(data.financials.totalSales)}</span>
                </div>
                <div className="flex justify-between pb-1 border-b">
                  <span>(-) SALE RETURN</span>
                  <span className="text-red-500">-{formatCurrency(data.salesBreakdown.saleReturn)}</span>
                </div>
                <div className="flex justify-between py-1 bg-red-50 px-2 rounded mt-1 font-medium">
                  <span>(-) CREDIT SALE</span>
                  <span className="text-red-600">-{formatCurrency(data.salesBreakdown.creditSale)}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span>(-) PHONEPAY</span>
                  <span className="text-red-500">-{formatCurrency(data.salesBreakdown.phonePay)}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span>(-) CARD</span>
                  <span className="text-red-500">-{formatCurrency(data.salesBreakdown.card)}</span>
                </div>
                <div className="flex justify-between py-1 bg-red-50 px-2 rounded font-medium">
                  <span>(-) EXPENSES</span>
                  <span className="text-red-600">-{formatCurrency(data.salesBreakdown.expenses)}</span>
                </div>
                
                <div className="h-4" /> {/* Spacer */}
                
                <div className="flex justify-between py-1 bg-green-50 px-2 rounded font-medium">
                  <span>(+) CUSTOMER JAMA</span>
                  <span className="text-green-600">+{formatCurrency(data.salesBreakdown.customerJama)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b pt-1">
                  <span>(+) CARTON SALE</span>
                  <span className="text-green-500">+{formatCurrency(data.salesBreakdown.cartonSale)}</span>
                </div>

                <div className="flex justify-between py-3 bg-yellow-100 px-3 rounded mt-4 font-bold text-lg border border-yellow-300">
                  <span>CASH REQUIRED</span>
                  <span>{formatCurrency(data.salesBreakdown.cashRequired)}</span>
                </div>
                
                {data.isSingleDay && (
                  <>
                    <div className="flex justify-between py-3 bg-yellow-100 px-3 rounded mt-2 font-bold text-lg border border-yellow-300">
                      <span>ACTUAL CASH</span>
                      <span>{formatCurrency(data.salesBreakdown.actualCash)}</span>
                    </div>
                    
                    <div className={`flex justify-between py-3 px-3 rounded mt-2 font-bold text-lg text-white ${data.salesBreakdown.extraShort >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                      <span>{data.salesBreakdown.extraShort >= 0 ? '(+ EXTRA)' : '(- SHORT)'}</span>
                      <span>{formatCurrency(data.salesBreakdown.extraShort)}</span>
                    </div>
                  </>
                )}

              </CardContent>
            </Card>

            {/* Column 3: Cash Denominations */}
            {data.isSingleDay && (
              <Card className="border-yellow-200 bg-yellow-50/30 lg:col-span-1">
                <CardHeader className="pb-3 border-b bg-yellow-100/50">
                  <CardTitle className="text-lg text-yellow-900">Cash Denominations</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  
                  {[2000, 500, 200, 100, 50, 20, 10].map((denom) => (
                    <div key={denom} className="flex items-center gap-3">
                      <span className="w-16 font-bold text-gray-700">₹{denom}</span>
                      <span className="text-gray-400">x</span>
                      <Input 
                        type="number" 
                        className="w-20 text-center" 
                        value={(cashState as any)[`notes${denom}`] || ''} 
                        onChange={(e) => handleCashChange(`notes${denom}`, e.target.value)}
                      />
                      <span className="text-gray-400">=</span>
                      <span className="flex-1 text-right font-medium">{formatCurrency(denom * ((cashState as any)[`notes${denom}`] || 0))}</span>
                    </div>
                  ))}
                  
                  <div className="pt-2 border-t flex justify-between items-center font-bold text-lg">
                    <span>TOTAL CASH</span>
                    <span>{formatCurrency(actualCashCalc)}</span>
                  </div>

                  <div className="pt-4 space-y-3">

                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-600">Side Cash</span>
                      <Input 
                        type="number" 
                        className="w-32 text-right bg-white" 
                        value={cashState.sideCash || ''} 
                        onChange={(e) => handleCashChange('sideCash', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-600">Next Day Opening</span>
                      <Input 
                        type="number" 
                        className="w-32 text-right bg-white" 
                        value={cashState.nextDayOpening || ''} 
                        onChange={(e) => handleCashChange('nextDayOpening', e.target.value)}
                      />
                    </div>

                  </div>

                  <Button onClick={saveCashState} disabled={savingCash} className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold">
                    {savingCash ? "Saving..." : "Save & Calculate"}
                  </Button>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      ) : null}
    </div>
  );
}
