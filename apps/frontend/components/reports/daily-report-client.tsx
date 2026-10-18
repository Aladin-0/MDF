"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { 
  Download, TrendingUp, IndianRupee, Package, Briefcase, 
  Calculator, ChevronDown, ChevronUp, ExternalLink, Save, 
  Check, AlertCircle, ShoppingBag, Receipt, CreditCard, 
  Smartphone, Banknote, ArrowDownRight, ArrowUpRight, Minus, Plus
} from "lucide-react";
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

  // Expanded breakdown sections
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Cash Form State
  const [openingCashInput, setOpeningCashInput] = useState<string>('');
  const [cashState, setCashState] = useState({
    notes2000: 0, notes500: 0, notes200: 0, notes100: 0, notes50: 0, notes20: 0, notes10: 0,
    openingCash: 0, cartonSale: 0, pettyCashExp: 0, sideCash: 0, nextDayOpening: 0
  });

  const toggleRow = (key: string) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchData = async () => {
    if (!user?.outletId || !dateRange.from) return;
    setLoading(true);
    try {
      const res = await api.get(`/reports/daily-snapshot/?outletId=${user.outletId}&startDate=${dateRange.from}&endDate=${dateRange.to}`);
      setData(res.data);
      if (res.data.cashState) {
        const opening = res.data.cashState.openingCash !== undefined 
          ? res.data.cashState.openingCash 
          : (res.data.salesBreakdown?.openingCash || 0);
        setCashState({
          ...res.data.cashState,
          openingCash: opening
        });
        setOpeningCashInput(opening ? String(opening) : '0');
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
    const num = value === '' ? 0 : Number(value);
    setCashState(prev => ({ ...prev, [field]: num }));
  };

  const handleOpeningCashChange = (val: string) => {
    setOpeningCashInput(val);
    const num = val === '' ? 0 : parseFloat(val) || 0;
    setCashState(prev => ({ ...prev, openingCash: num }));
  };

  const saveOpeningCashOnly = async () => {
    if (!user?.outletId || !dateRange.from) return;
    setSavingCash(true);
    try {
      const num = openingCashInput === '' ? 0 : parseFloat(openingCashInput) || 0;
      await api.post(`/reports/daily-snapshot/cash/`, {
        outletId: user.outletId,
        date: dateRange.from,
        openingCash: num
      });
      toast.success("Opening Cash Balance saved!");
      fetchData();
    } catch (err) {
      toast.error("Failed to save opening cash");
    } finally {
      setSavingCash(false);
    }
  };

  const saveCashState = async () => {
    if (!user?.outletId) return;
    setSavingCash(true);
    const targetDate = data?.isSingleDay ? dateRange.from : (dateRange.to || dateRange.from);
    try {
      await api.post(`/reports/daily-snapshot/cash/`, {
        outletId: user.outletId,
        date: targetDate,
        ...cashState
      });
      toast.success("Cash count details saved successfully!");
      fetchData(); // refresh to recalculate
    } catch (err) {
      toast.error("Failed to save cash details");
    } finally {
      setSavingCash(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  };

  const actualCashCalc = (cashState.notes500 * 500) + 
                         (cashState.notes2000 * 2000) + 
                         (cashState.notes200 * 200) + 
                         (cashState.notes100 * 100) + 
                         (cashState.notes50 * 50) + 
                         (cashState.notes20 * 20) + 
                         (cashState.notes10 * 10) +
                         (Number(cashState.sideCash) || 0);

  // Dynamic Cash Required based on current entered opening cash
  const currentOpening = Number(cashState.openingCash) || 0;
  const initialOpening = Number(data?.salesBreakdown?.openingCash) || 0;
  const dynamicCashRequired = data ? (data.salesBreakdown.cashRequired - initialOpening + currentOpening) : 0;
  const dynamicExtraShort = actualCashCalc - dynamicCashRequired;

  const details = data?.salesBreakdown?.details || {};

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Daily Financial Snapshot</h1>
          <p className="text-muted-foreground text-sm">Comprehensive End-of-Day Till Reconciliation & Audit.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <PartnerSettingsModal onUpdate={fetchData} />
          {data?.fixedExpenses && <FixedExpensesModal initialData={data.fixedExpenses} onUpdate={fetchData} />}
          <Button onClick={handleDownload} disabled={downloading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
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
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-semibold text-green-800">Gross Profit</p>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div className="text-2xl font-bold text-green-900">{formatCurrency(data.financials.grossProfit)}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-semibold text-red-800">Fixed Exp (Per Day)</p>
                  <IndianRupee className="h-4 w-4 text-red-600" />
                </div>
                <div className="text-2xl font-bold text-red-900">{formatCurrency(data.fixedExpenses.perDay)}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-bold text-blue-900">NET PROFIT</p>
                  <Briefcase className="h-4 w-4 text-blue-700" />
                </div>
                <div className="text-3xl font-extrabold text-blue-900">{formatCurrency(data.financials.netProfit)}</div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-semibold text-muted-foreground">Current Stock</p>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(data.financials.stockValue)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
            {/* Left 7 Columns: Reconciliation Breakdown & Details */}
            <div className="xl:col-span-7 space-y-4">
              <Card className="bg-white border-gray-200 shadow-sm overflow-hidden">
                <CardHeader className="pb-3 border-b bg-gray-50/70">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2 text-gray-900">
                        <Calculator className="w-5 h-5 text-indigo-600"/> 
                        Reconciliation Breakdown
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Click on any line item to view itemized records and drill down to transactions.
                      </p>
                    </div>
                    {data.isSingleDay && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-300">
                        Single Day Till
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-2.5">
                  
                  {/* 1. Opening Cash (Drawer from Yesterday) */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900 uppercase tracking-wider">Drawer</span>
                        <span className="font-bold text-gray-900 text-sm">Opening Cash Balance</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Auto-fetched from yesterday's balance or enter/edit manually
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">₹</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={openingCashInput}
                          onChange={(e) => handleOpeningCashChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveOpeningCashOnly();
                          }}
                          className="w-36 pl-7 text-right font-bold text-base bg-white border-amber-300 focus-visible:ring-amber-500 h-9"
                          placeholder="0.00"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={saveOpeningCashOnly}
                        disabled={savingCash}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs h-9 px-3"
                        title="Save opening balance"
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {savingCash ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>

                  {/* 2. Gross Sales */}
                  <BreakdownRow
                    id="grossSales"
                    label="Gross Sales"
                    operator="+"
                    operatorColor="text-slate-600 bg-slate-100"
                    amount={data.financials.totalSales}
                    items={details.grossSales}
                    isExpanded={!!expandedRows['grossSales']}
                    onToggle={() => toggleRow('grossSales')}
                    type="sales"
                    formatCurrency={formatCurrency}
                  />

                  {/* 3. Sales Return */}
                  <BreakdownRow
                    id="saleReturn"
                    label="(-) Sale Return"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.saleReturn}
                    items={details.saleReturn}
                    isExpanded={!!expandedRows['saleReturn']}
                    onToggle={() => toggleRow('saleReturn')}
                    type="returns"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 4. Credit Sale */}
                  <BreakdownRow
                    id="creditSale"
                    label="(-) Credit Sale"
                    sublabel="(Credit portion only, including split bills)"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.creditSale}
                    items={details.creditSale}
                    isExpanded={!!expandedRows['creditSale']}
                    onToggle={() => toggleRow('creditSale')}
                    type="sales_portion"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 5. UPI / PhonePe */}
                  <BreakdownRow
                    id="upi"
                    label="(-) UPI / PhonePe"
                    sublabel="(Online payment portion)"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.upi}
                    items={details.upi}
                    isExpanded={!!expandedRows['upi']}
                    onToggle={() => toggleRow('upi')}
                    type="sales_portion"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 6. Cards */}
                  <BreakdownRow
                    id="card"
                    label="(-) Cards"
                    sublabel="(POS Card machine portion)"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.card}
                    items={details.card}
                    isExpanded={!!expandedRows['card']}
                    onToggle={() => toggleRow('card')}
                    type="sales_portion"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 7. Cash Expenses */}
                  <BreakdownRow
                    id="cashExpenses"
                    label="(-) Cash Expenses"
                    sublabel="(Cash paid for Direct & Indirect Expenses ledgers)"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.cashExpenses}
                    items={details.cashExpenses}
                    isExpanded={!!expandedRows['cashExpenses']}
                    onToggle={() => toggleRow('cashExpenses')}
                    type="vouchers"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 8. Cash Payments */}
                  <BreakdownRow
                    id="cashPayments"
                    label="(-) Cash Payments"
                    sublabel="(Cash paid to parties/creditors, excluding expenses & purchases)"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.cashPayments}
                    items={details.cashPayments}
                    isExpanded={!!expandedRows['cashPayments']}
                    onToggle={() => toggleRow('cashPayments')}
                    type="vouchers"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 9. Cash Purchases */}
                  <BreakdownRow
                    id="cashPurchases"
                    label="(-) Cash Purchases"
                    sublabel="(Purchases paid in cash today, not credit settlements)"
                    operator="-"
                    operatorColor="text-red-700 bg-red-100"
                    amount={data.salesBreakdown.cashPurchases}
                    items={details.cashPurchases}
                    isExpanded={!!expandedRows['cashPurchases']}
                    onToggle={() => toggleRow('cashPurchases')}
                    type="purchases"
                    formatCurrency={formatCurrency}
                    textColor="text-red-600"
                  />

                  {/* 10. Cash Received */}
                  <BreakdownRow
                    id="cashReceived"
                    label="(+) Cash Received"
                    sublabel="(Cash receipts from debtors/creditors, excluding income)"
                    operator="+"
                    operatorColor="text-green-700 bg-green-100"
                    amount={data.salesBreakdown.cashReceived}
                    items={details.cashReceived}
                    isExpanded={!!expandedRows['cashReceived']}
                    onToggle={() => toggleRow('cashReceived')}
                    type="vouchers"
                    formatCurrency={formatCurrency}
                    textColor="text-green-700"
                  />

                  {/* 11. Cash Income */}
                  <BreakdownRow
                    id="cashIncome"
                    label="(+) Cash Income"
                    sublabel="(Cash receipts under Direct & Indirect Income ledgers)"
                    operator="+"
                    operatorColor="text-green-700 bg-green-100"
                    amount={data.salesBreakdown.cashIncome}
                    items={details.cashIncome}
                    isExpanded={!!expandedRows['cashIncome']}
                    onToggle={() => toggleRow('cashIncome')}
                    type="vouchers"
                    formatCurrency={formatCurrency}
                    textColor="text-green-700"
                  />

                  {/* Separator / Totals */}
                  <div className="pt-3 border-t-2 border-dashed border-gray-300 space-y-2.5">
                    
                    {/* CASH REQUIRED */}
                    <div className="flex justify-between items-center py-3 bg-gradient-to-r from-amber-100 via-amber-200 to-amber-100 px-4 rounded-xl border border-amber-300 shadow-sm">
                      <div>
                        <span className="font-extrabold text-amber-950 text-base tracking-wide flex items-center gap-1.5">
                          <Banknote className="w-5 h-5 text-amber-800" />
                          CASH REQUIRED
                        </span>
                        <p className="text-xs text-amber-800">Required physical cash in drawer end of day</p>
                      </div>
                      <span className="font-extrabold text-amber-950 text-xl">
                        {formatCurrency(dynamicCashRequired)}
                      </span>
                    </div>

                    {/* ACTUAL CASH */}
                    <div className="flex justify-between items-center py-3 bg-amber-50 px-4 rounded-xl border border-amber-200 shadow-xs">
                      <div>
                        <span className="font-bold text-amber-900 text-sm">ACTUAL CASH (Counted Notes + Side Cash)</span>
                        <p className="text-xs text-muted-foreground">Sum of physical cash denominations counted</p>
                      </div>
                      <span className="font-bold text-amber-900 text-lg">
                        {formatCurrency(actualCashCalc)}
                      </span>
                    </div>
                    
                    {/* (+EXTRA) / (-SHORT) COMPARISON */}
                    <div className={`flex justify-between items-center py-3 px-4 rounded-xl font-bold shadow-sm transition-all duration-300 ${
                      dynamicExtraShort >= 0 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-rose-600 text-white'
                    }`}>
                      <div className="flex items-center gap-2">
                        {dynamicExtraShort >= 0 ? (
                          <ArrowUpRight className="w-5 h-5" />
                        ) : (
                          <ArrowDownRight className="w-5 h-5" />
                        )}
                        <div>
                          <span className="text-base tracking-wide uppercase">
                            {dynamicExtraShort >= 0 ? '(+ EXTRA) CASH SURPLUS' : '(- SHORT) CASH DEFICIT'}
                          </span>
                          <p className="text-xs text-white/80 font-normal">Difference: Actual Counted Cash - Required Cash</p>
                        </div>
                      </div>
                      <span className="text-xl font-extrabold">
                        {dynamicExtraShort >= 0 ? `+${formatCurrency(dynamicExtraShort)}` : formatCurrency(dynamicExtraShort)}
                      </span>
                    </div>

                  </div>

                </CardContent>
              </Card>
            </div>

            {/* Right 5 Columns: Cash Denominations & Cumulative / Partner Splits */}
            <div className="xl:col-span-5 space-y-6">
              
              {/* Cash Denominations (Available in all views) */}
              <Card className="border-amber-200 bg-amber-50/20 shadow-sm">
                <CardHeader className="pb-3 border-b bg-amber-100/60 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-amber-950 font-bold flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-amber-800" />
                      Cash Denominations (Drawer Count)
                    </CardTitle>
                    <p className="text-xs text-amber-800/80">Enter physical note count in cash drawer</p>
                  </div>
                  <Badge variant="outline" className="bg-amber-200/60 border-amber-400 text-amber-900 font-bold">
                    {formatCurrency(actualCashCalc)}
                  </Badge>
                </CardHeader>
                
                <CardContent className="pt-4 space-y-2.5">
                  {[2000, 500, 200, 100, 50, 20, 10].map((denom) => (
                    <div key={denom} className="flex items-center gap-2 text-sm bg-white p-1.5 px-3 rounded-lg border border-gray-100 hover:border-amber-200 transition-colors">
                      <span className="w-14 font-bold text-gray-700">₹{denom}</span>
                      <span className="text-gray-400">×</span>
                      <Input 
                        type="number" 
                        min="0"
                        className="w-20 h-8 text-center font-semibold bg-gray-50 border-gray-300 focus-visible:ring-amber-500" 
                        value={(cashState as any)[`notes${denom}`] || ''} 
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleCashChange(`notes${denom}`, e.target.value)}
                        placeholder="0"
                      />
                      <span className="text-gray-400">=</span>
                      <span className="flex-1 text-right font-medium text-gray-900">
                        {formatCurrency(denom * ((cashState as any)[`notes${denom}`] || 0))}
                      </span>
                    </div>
                  ))}
                  
                  <div className="pt-2 border-t flex justify-between items-center font-bold text-base px-1">
                    <span className="text-gray-700">TOTAL COUNTED NOTES</span>
                    <span className="text-amber-900">
                      {formatCurrency(
                        (cashState.notes500 * 500) + 
                        (cashState.notes2000 * 2000) + 
                        (cashState.notes200 * 200) + 
                        (cashState.notes100 * 100) + 
                        (cashState.notes50 * 50) + 
                        (cashState.notes20 * 20) + 
                        (cashState.notes10 * 10)
                      )}
                    </span>
                  </div>

                  <div className="pt-3 border-t space-y-2">
                    <div className="flex items-center justify-between text-sm bg-white p-2 rounded-lg border border-gray-100">
                      <span className="font-medium text-gray-700">Side Cash (Coins / Loose Cash)</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">₹</span>
                        <Input 
                          type="number" 
                          step="0.01"
                          className="w-32 h-8 pl-6 text-right bg-gray-50 border-gray-300 font-semibold" 
                          value={cashState.sideCash || ''} 
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleCashChange('sideCash', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    
                    {/* Live Comparison Summary Box */}
                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1.5 shadow-xs">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Required Cash:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(dynamicCashRequired)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Actual Counted Cash:</span>
                        <span className="font-bold text-amber-900">{formatCurrency(actualCashCalc)}</span>
                      </div>
                      <div className={`flex justify-between items-center pt-1.5 border-t border-amber-200 text-sm font-extrabold ${
                        dynamicExtraShort >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        <span className="flex items-center gap-1">
                          {dynamicExtraShort >= 0 ? (
                            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-rose-600" />
                          )}
                          {dynamicExtraShort >= 0 ? '(+ EXTRA) SURPLUS' : '(- SHORT) DEFICIT'}
                        </span>
                        <span>
                          {dynamicExtraShort >= 0 ? `+${formatCurrency(dynamicExtraShort)}` : formatCurrency(dynamicExtraShort)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm bg-white p-2 rounded-lg border border-gray-100">
                      <span className="font-medium text-gray-700">Next Day Opening Target</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">₹</span>
                        <Input 
                          type="number" 
                          step="0.01"
                          className="w-32 h-8 pl-6 text-right bg-gray-50 border-gray-300 font-semibold" 
                          value={cashState.nextDayOpening || ''} 
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleCashChange('nextDayOpening', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={saveCashState} 
                    disabled={savingCash} 
                    className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm h-10"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {savingCash ? "Saving..." : "Save Cash Count"}
                  </Button>
                </CardContent>
              </Card>

              {/* Cumulative Totals */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-gray-50/70">
                  <CardTitle className="text-base text-gray-900 font-bold">Cumulative Totals</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3 text-sm">
                  <div className="flex justify-between pb-2 border-b">
                    <span className="text-gray-600">Total Purchase Upto Date</span>
                    <span className="font-bold text-gray-900">{formatCurrency(data.financials.cumulativePurchase)}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b">
                    <span className="text-gray-600">Total Sale Upto Date</span>
                    <span className="font-bold text-gray-900">{formatCurrency(data.financials.saleUpto)}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b">
                    <span className="text-gray-600">Period Gross Sales</span>
                    <span className="font-bold text-gray-900">{formatCurrency(data.financials.totalSales)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>First Bill: <strong className="text-gray-700">{data.bills?.first || 'N/A'}</strong></span>
                    <span>Last Bill: <strong className="text-gray-700">{data.bills?.last || 'N/A'}</strong></span>
                  </div>
                </CardContent>
              </Card>

              {/* Partner Profit Splits */}
              <Card className="border-blue-200 shadow-sm">
                <CardHeader className="bg-blue-50/50 pb-3 border-b">
                  <CardTitle className="text-blue-900 text-base font-bold">Partner Net Profit Splits</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {data.partners && data.partners.length > 0 ? (
                    data.partners.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-white border rounded-lg shadow-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {p.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-500">{p.percentage}% profit share</p>
                          </div>
                        </div>
                        <span className="font-bold text-blue-700 text-sm">{formatCurrency(p.shareAmount)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No partner splits configured.</p>
                  )}
                </CardContent>
              </Card>

            </div>

          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Interactive Breakdown Row Component with Expandable Drill-Down ──
interface BreakdownRowProps {
  id: string;
  label: string;
  sublabel?: string;
  operator: string;
  operatorColor: string;
  amount: number;
  items?: any[];
  isExpanded: boolean;
  onToggle: () => void;
  type: 'sales' | 'sales_portion' | 'returns' | 'purchases' | 'vouchers';
  formatCurrency: (amount: number) => string;
  textColor?: string;
}

function BreakdownRow({
  id,
  label,
  sublabel,
  operator,
  operatorColor,
  amount,
  items = [],
  isExpanded,
  onToggle,
  type,
  formatCurrency,
  textColor = 'text-gray-800'
}: BreakdownRowProps) {
  const itemCount = items.length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden transition-all bg-white shadow-2xs">
      {/* Row Header - Clickable to Expand */}
      <div 
        onClick={onToggle}
        className={`flex items-center justify-between p-2.5 px-3 cursor-pointer select-none transition-colors ${
          isExpanded ? 'bg-slate-50' : 'hover:bg-gray-50/80'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${operatorColor}`}>
            {operator}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${textColor}`}>{label}</span>
              {itemCount > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.2 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
            {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`font-bold text-sm ${textColor}`}>
            {operator === '-' && amount > 0 ? `-${formatCurrency(amount)}` : formatCurrency(amount)}
          </span>
          <button 
            type="button" 
            className="text-gray-400 hover:text-gray-700 p-1 rounded-md"
            aria-label="Toggle details"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Drill-Down Details Table */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50/50 p-3 overflow-x-auto">
          {itemCount === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-gray-400" />
              No itemized records found for this entry.
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                  <th className="pb-2 pl-2">Ref / No</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Party / Ledger</th>
                  {type === 'sales' && <th className="pb-2">Mode</th>}
                  {type === 'vouchers' && <th className="pb-2">Narration</th>}
                  <th className="pb-2 text-right pr-2">Amount</th>
                  <th className="pb-2 text-center pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item: any, idx: number) => (
                  <tr key={item.id || idx} className="hover:bg-white transition-colors">
                    <td className="py-2 pl-2 font-semibold text-gray-800">
                      {item.no || 'N/A'}
                    </td>
                    <td className="py-2 text-gray-600 whitespace-nowrap">
                      {item.date || '-'}
                    </td>
                    <td className="py-2 text-gray-800">
                      <div>
                        <span className="font-medium">{item.customer || item.ledger || item.distributor || '-'}</span>
                        {item.group && (
                          <span className="block text-[10px] text-muted-foreground">{item.group}</span>
                        )}
                      </div>
                    </td>
                    
                    {type === 'sales' && (
                      <td className="py-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                          {item.paymentMode || 'Cash'}
                        </Badge>
                      </td>
                    )}

                    {type === 'vouchers' && (
                      <td className="py-2 text-gray-600 max-w-[200px] truncate" title={item.narration}>
                        {item.narration || '-'}
                      </td>
                    )}

                    <td className="py-2 text-right pr-2 font-bold text-gray-900 whitespace-nowrap">
                      {formatCurrency(item.amount || item.grandTotal)}
                      {item.totalVoucherAmount && item.totalVoucherAmount !== item.amount && (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          (cash of ₹{item.totalVoucherAmount})
                        </span>
                      )}
                    </td>

                    <td className="py-2 text-center pr-2">
                      {item.link ? (
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-400">Direct Till</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
