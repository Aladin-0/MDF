'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, Loader2, TrendingUp, ShoppingCart, Search, Package, Building2, User, Calendar, IndianRupee, Hash, RefreshCw, FileText, Pill, CreditCard, Activity, Syringe, HeartPulse, Stethoscope } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOutletId } from '@/hooks/useOutletId';
import { reportsApi } from '@/lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleRecord {
  date: string; invoiceNo: string; customerName: string; customerPhone: string;
  doctorName: string; productName: string; batchNo: string;
  qty: number; amount: number; scheduleType: string; scheduleLabel: string;
  // Detail fields
  paymentMode?: string; grandTotal?: number; discountAmount?: number; cgst?: number; sgst?: number; billedBy?: string;
  customerAddress?: string; bloodGroup?: string;
  composition?: string; packSize?: string; saleMode?: string; expiryDate?: string; mrp?: number; saleRate?: number; discountPct?: number; gstRate?: number; qtyStrips?: number; qtyLoose?: number;
  rxPatientName?: string; rxPatientAge?: number; rxPatientAddress?: string; rxDoctorName?: string; rxDoctorRegNo?: string; rxPrescriptionNo?: string;
  customerState?: string; customerDob?: string; allergies?: string[]; chronicConditions?: string[];
  doctorPhone?: string; doctorRegNo?: string; doctorDegree?: string; doctorSpecialty?: string; doctorHospital?: string; doctorAddress?: string;
}

interface PurchaseRecord {
  date: string; invoiceNo: string; supplierName: string; supplierPhone: string;
  supplierGstin: string; supplierCity: string; productName: string; batchNo: string;
  expiryDate: string; qty: number; actualQty: number; purchaseRate: number;
  amount: number; scheduleType: string; scheduleLabel: string;
}

interface SummaryEntry {
  scheduleType: string; label: string; invoices: number; qty: number; amount: number;
}

interface ScheduleData {
  scheduleType: string;
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  saleSummary: SummaryEntry[];
  purchaseSummary: SummaryEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEDULE_OPTIONS = [
  { value: 'ALL',       label: 'All Drugs (Every Schedule)' },
  { value: 'OTC',       label: 'OTC / General' },
  { value: 'H1',        label: 'Schedule H1 (Narcotic-like)' },
  { value: 'H',         label: 'Schedule H' },
  { value: 'X',         label: 'Schedule X' },
  { value: 'C',         label: 'Schedule C (Biological)' },
  { value: 'G',         label: 'Schedule G' },
  { value: 'Narcotic',  label: 'Narcotic (NDPS)' },
  { value: 'Ayurvedic', label: 'Ayurvedic / Herbal' },
  { value: 'Surgical',  label: 'Surgical / Device' },
  { value: 'Cosmetic',  label: 'Cosmetic' },
  { value: 'Veterinary',label: 'Veterinary' },
];

const QUICK_RANGES = [
  { label: 'All Time',     from: '',           to: '' },
  { label: 'This Month',   from: 'this_month', to: 'this_month' },
  { label: 'Last 3 Months',from: '3m',         to: '3m' },
  { label: 'This Year',    from: 'this_year',  to: 'this_year' },
  { label: 'Custom',       from: 'custom',     to: 'custom' },
];

const BADGE_COLORS: Record<string, string> = {
  H1: 'bg-red-100 text-red-700 border-red-200',
  H: 'bg-orange-100 text-orange-700 border-orange-200',
  X: 'bg-purple-100 text-purple-700 border-purple-200',
  C: 'bg-blue-100 text-blue-700 border-blue-200',
  G: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Narcotic: 'bg-rose-100 text-rose-800 border-rose-200',
  Ayurvedic: 'bg-green-100 text-green-700 border-green-200',
  Surgical: 'bg-sky-100 text-sky-700 border-sky-200',
  Cosmetic: 'bg-pink-100 text-pink-700 border-pink-200',
  Veterinary: 'bg-teal-100 text-teal-700 border-teal-200',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}
function yearStart() {
  const d = new Date(); d.setMonth(0, 1);
  return d.toISOString().split('T')[0];
}
function nMonthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().split('T')[0];
}

function resolveRange(preset: string): { from: string; to: string } {
  switch (preset) {
    case 'this_month': return { from: monthStart(), to: today() };
    case '3m':         return { from: nMonthsAgo(3), to: today() };
    case 'this_year':  return { from: yearStart(), to: today() };
    default:           return { from: '', to: '' }; // all time
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function ScheduleBadge({ type }: { type: string }) {
  const cls = BADGE_COLORS[type] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>{type || '—'}</span>;
}

function EmptyState({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
      <Icon className="w-10 h-10 opacity-30" />
      <p className="font-medium text-slate-500">{title}</p>
      <p className="text-sm">Try adjusting the schedule type or date range</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScheduleReportTab() {
  const outletId = useOutletId();

  // Own date state — defaults to ALL TIME so historical data shows immediately
  const [preset, setPreset]             = useState<string>('all');  // 'all' | 'this_month' | '3m' | 'this_year' | 'custom'
  const [customFrom, setCustomFrom]     = useState<string>('');
  const [customTo, setCustomTo]         = useState<string>(today());
  const [scheduleFilter, setScheduleFilter] = useState<string>('ALL');
  const [mode, setMode]                 = useState<'sales' | 'purchases'>('sales');
  const [search, setSearch]             = useState<string>('');
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

  const [data, setData]       = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError]     = useState<string>('');

  // Compute actual from/to from preset
  const { from: resolvedFrom, to: resolvedTo } = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    if (preset === 'all') return { from: '', to: '' };
    return resolveRange(preset);
  }, [preset, customFrom, customTo]);

  // Fetch whenever outlet, schedule, or date changes
  useEffect(() => {
    if (!outletId) return;
    let cancelled = false;

    async function fetchReport() {
      setLoading(true);
      setError('');
      setData(null);

      try {
        const params: Record<string, string> = {};
        if (scheduleFilter !== 'ALL') params.schedule_type = scheduleFilter;
        if (resolvedFrom) params.from = resolvedFrom;
        if (resolvedTo)   params.to   = resolvedTo;

        const json = await reportsApi.getScheduleReport(outletId, {
          schedule_type: scheduleFilter === 'ALL' ? '' : scheduleFilter,
          from: resolvedFrom,
          to: resolvedTo,
        });

        // reportsApi.getScheduleReport returns the full json body
        const payload = json?.data ?? json ?? {};

        const safe: ScheduleData = {
          scheduleType:    payload?.scheduleType    ?? scheduleFilter,
          sales:           Array.isArray(payload?.sales)           ? payload.sales           : [],
          purchases:       Array.isArray(payload?.purchases)       ? payload.purchases       : [],
          saleSummary:     Array.isArray(payload?.saleSummary)     ? payload.saleSummary     : [],
          purchaseSummary: Array.isArray(payload?.purchaseSummary) ? payload.purchaseSummary : [],
        };

        if (!cancelled) setData(safe);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReport();
    return () => { cancelled = true; };
  }, [outletId, scheduleFilter, resolvedFrom, resolvedTo]);

  // Client-side search filter
  const filteredSales = useMemo<SaleRecord[]>(() => {
    const rows = data?.sales ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(s =>
      (s.productName ?? '').toLowerCase().includes(q) ||
      (s.customerName ?? '').toLowerCase().includes(q) ||
      (s.invoiceNo ?? '').toLowerCase().includes(q) ||
      (s.doctorName ?? '').toLowerCase().includes(q) ||
      (s.scheduleType ?? '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const filteredPurchases = useMemo<PurchaseRecord[]>(() => {
    const rows = data?.purchases ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(p =>
      (p.productName ?? '').toLowerCase().includes(q) ||
      (p.supplierName ?? '').toLowerCase().includes(q) ||
      (p.invoiceNo ?? '').toLowerCase().includes(q) ||
      (p.scheduleType ?? '').toLowerCase().includes(q) ||
      (p.supplierCity ?? '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalSales     = filteredSales.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalPurchases = filteredPurchases.reduce((s, r) => s + (r.amount ?? 0), 0);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header + toggle */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-white" />
            </span>
            Schedule Drugs Register
          </h2>
          <p className="text-sm text-slate-500 mt-1">Regulatory compliance register — all historical records</p>
        </div>

        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => { setMode('sales'); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'sales' ? 'bg-white shadow text-emerald-700 border border-emerald-100' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Sales Dispensations
          </button>
          <button
            onClick={() => { setMode('purchases'); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'purchases' ? 'bg-white shadow text-blue-700 border border-blue-100' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Procurement Records
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Schedule type */}
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <Package className="w-4 h-4" />
            Schedule:
          </div>
          <Select value={scheduleFilter} onValueChange={v => { setScheduleFilter(v); setSearch(''); }}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Quick date presets */}
          <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-slate-50">
            {[
              { key: 'all',        label: 'All Time' },
              { key: 'this_month', label: 'This Month' },
              { key: '3m',         label: 'Last 3M' },
              { key: 'this_year',  label: 'This Year' },
              { key: 'custom',     label: 'Custom' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  preset === p.key
                    ? 'bg-white shadow text-slate-800 border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder={mode === 'sales' ? 'Search product, customer, invoice…' : 'Search product, supplier, city…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex items-center gap-3 pt-1">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="date"
              value={customTo}
              max={today()}
              onChange={e => setCustomTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        )}

        {/* Active filter summary */}
        <p className="text-xs text-slate-400">
          {preset === 'all'
            ? '📅 Showing all historical records (no date filter)'
            : `📅 ${resolvedFrom ? fmtDate(resolvedFrom) : '—'} → ${resolvedTo ? fmtDate(resolvedTo) : '—'}`}
          {scheduleFilter !== 'ALL' && ` · 💊 ${scheduleFilter} only`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading report</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
          <p className="text-sm text-slate-500">Fetching all schedule drug records…</p>
        </div>
      )}

      {/* Content */}
      {!loading && data && (
        <>
          {/* Summary cards */}
          {mode === 'sales' && (data.saleSummary ?? []).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(data.saleSummary ?? []).map((s, i) => (
                <div key={`ss-${i}`} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="mb-1.5"><ScheduleBadge type={s.scheduleType ?? ''} /></div>
                  <p className="text-xs text-slate-400">{s.label ?? s.scheduleType}</p>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{fmt(s.amount ?? 0)}</p>
                  <p className="text-xs text-slate-400">{s.invoices ?? 0} bills · {s.qty ?? 0} units</p>
                </div>
              ))}
            </div>
          )}

          {mode === 'purchases' && (data.purchaseSummary ?? []).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(data.purchaseSummary ?? []).map((s, i) => (
                <div key={`ps-${i}`} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="mb-1.5"><ScheduleBadge type={s.scheduleType ?? ''} /></div>
                  <p className="text-xs text-slate-400">{s.label ?? s.scheduleType}</p>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{fmt(s.amount ?? 0)}</p>
                  <p className="text-xs text-slate-400">{s.invoices ?? 0} GRNs · {s.qty ?? 0} units</p>
                </div>
              ))}
            </div>
          )}

          {/* Sales table */}
          {mode === 'sales' && (
            <>
            <Card className="border-emerald-100">
              <CardHeader className="pb-3 border-b border-emerald-50 bg-gradient-to-r from-emerald-50 to-white rounded-t-xl">
                <CardTitle className="text-emerald-800 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Sales Dispensations
                </CardTitle>
                <CardDescription>
                  {filteredSales.length} records · Total:{' '}
                  <span className="font-semibold text-emerald-700">{fmt(totalSales)}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredSales.length === 0 ? (
                  <EmptyState icon={TrendingUp} title="No sales records found" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead><Calendar className="w-3 h-3 inline mr-1" />Date</TableHead>
                          <TableHead><Hash className="w-3 h-3 inline mr-1" />Invoice</TableHead>
                          <TableHead>Schedule</TableHead>
                          <TableHead><Package className="w-3 h-3 inline mr-1" />Product</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead><User className="w-3 h-3 inline mr-1" />Patient</TableHead>
                          <TableHead>Doctor</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right"><IndianRupee className="w-3 h-3 inline" />Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales.map((s, i) => (
                          <TableRow 
                            key={`sale-${i}`} 
                            className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                            onClick={() => setSelectedSale(s)}
                          >
                            <TableCell className="text-sm text-slate-600 whitespace-nowrap">{fmtDate(s.date)}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{s.invoiceNo ?? '—'}</TableCell>
                            <TableCell><ScheduleBadge type={s.scheduleType ?? ''} /></TableCell>
                            <TableCell className="font-medium text-slate-800 max-w-[180px]">
                              <span className="block truncate">{s.productName ?? '—'}</span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{s.batchNo ?? '—'}</TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{s.customerName ?? '—'}</p>
                              {s.customerPhone && <p className="text-xs text-slate-400">{s.customerPhone}</p>}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">{s.doctorName ?? '—'}</TableCell>
                            <TableCell className="text-right font-bold">{s.qty ?? 0}</TableCell>
                            <TableCell className="text-right font-semibold text-emerald-700">{fmt(s.amount ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sale Details Dialog */}
            <Dialog open={!!selectedSale} onOpenChange={(open) => !open && setSelectedSale(null)}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    Dispensation Record Details
                  </DialogTitle>
                  <DialogDescription>
                    Complete regulatory & billing information for {selectedSale?.invoiceNo}
                  </DialogDescription>
                </DialogHeader>

                {selectedSale && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                    
                    {/* Prescription & Regulatory Info (Crucial for H/H1/X) */}
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-rose-500" /> Regulatory / Prescription
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Schedule Class</span>
                            <ScheduleBadge type={selectedSale.scheduleType ?? ''} />
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Prescription No.</span>
                            <span className="font-mono text-slate-800">{selectedSale.rxPrescriptionNo || '—'}</span>
                          </div>
                          
                          {/* Doctor Detailed Info */}
                          <div className="flex flex-col mt-3 pt-3 border-t border-slate-200/60">
                            <span className="text-slate-500 mb-1 flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5"/> Prescribing Doctor</span>
                            <span className="font-medium text-slate-800">
                              {selectedSale.rxDoctorName || selectedSale.doctorName || 'Self / Unknown'}
                              {selectedSale.doctorDegree ? ` (${selectedSale.doctorDegree})` : ''}
                            </span>
                            
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-2 text-xs">
                              <div><span className="text-slate-400 block">Reg No.</span> <span className="font-mono text-slate-700">{selectedSale.rxDoctorRegNo || selectedSale.doctorRegNo || '—'}</span></div>
                              <div><span className="text-slate-400 block">Phone</span> <span className="text-slate-700">{selectedSale.doctorPhone || '—'}</span></div>
                              <div><span className="text-slate-400 block">Specialty</span> <span className="text-slate-700">{selectedSale.doctorSpecialty || '—'}</span></div>
                              <div><span className="text-slate-400 block">Hospital</span> <span className="text-slate-700 truncate" title={selectedSale.doctorHospital}>{selectedSale.doctorHospital || '—'}</span></div>
                              <div className="col-span-2"><span className="text-slate-400 block">Address</span> <span className="text-slate-700">{selectedSale.doctorAddress || '—'}</span></div>
                            </div>
                          </div>

                          {/* Rx Patient Info */}
                          <div className="flex flex-col mt-3 pt-3 border-t border-slate-200/60">
                            <span className="text-slate-500 mb-1">Rx Patient Log</span>
                            <span className="font-medium text-slate-800">
                              {selectedSale.rxPatientName || selectedSale.customerName || '—'} 
                              {selectedSale.rxPatientAge ? ` (${selectedSale.rxPatientAge} yrs)` : ''}
                            </span>
                            <span className="text-slate-500 text-xs mt-0.5">{selectedSale.rxPatientAddress || selectedSale.customerAddress || 'No address logged'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Customer / Billing Info */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-500" /> Billed To / Patient Profile
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Name</span>
                            <span className="font-medium text-slate-800">{selectedSale.customerName || 'Walk-in'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Phone</span>
                            <span className="text-slate-800">{selectedSale.customerPhone || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Address</span>
                            <span className="text-slate-800 text-right max-w-[180px] truncate" title={selectedSale.customerAddress}>{selectedSale.customerAddress || '—'}</span>
                          </div>
                          {selectedSale.customerState && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">State</span>
                              <span className="text-slate-800">{selectedSale.customerState}</span>
                            </div>
                          )}
                          <div className="flex justify-between mt-2 pt-2 border-t border-slate-200/60">
                            <span className="text-slate-500">DOB</span>
                            <span className="text-slate-800">{selectedSale.customerDob ? fmtDate(selectedSale.customerDob) : '—'}</span>
                          </div>
                          {selectedSale.bloodGroup && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Blood Group</span>
                              <span className="text-rose-600 font-medium">{selectedSale.bloodGroup}</span>
                            </div>
                          )}
                          {(selectedSale.allergies?.length ?? 0) > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60">
                              <span className="text-slate-500 text-xs block mb-1">Allergies</span>
                              <div className="flex flex-wrap gap-1">
                                {selectedSale.allergies?.map((a: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] rounded border border-red-100">{a}</span>)}
                              </div>
                            </div>
                          )}
                          {(selectedSale.chronicConditions?.length ?? 0) > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60">
                              <span className="text-slate-500 text-xs block mb-1">Chronic Conditions</span>
                              <div className="flex flex-wrap gap-1">
                                {selectedSale.chronicConditions?.map((c: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded border border-amber-100">{c}</span>)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Product & Financials */}
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                          <Pill className="w-4 h-4 text-emerald-500" /> Dispensed Product
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="block font-medium text-slate-800 text-base">{selectedSale.productName}</span>
                            <span className="block text-slate-500 text-xs mt-0.5">{selectedSale.composition || 'No composition info'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-200/60">
                            <div>
                              <span className="block text-slate-500 text-xs mb-0.5">Batch No</span>
                              <span className="font-mono text-slate-800">{selectedSale.batchNo || '—'}</span>
                            </div>
                            <div>
                              <span className="block text-slate-500 text-xs mb-0.5">Expiry Date</span>
                              <span className="font-mono text-slate-800">{fmtDate(selectedSale.expiryDate || '')}</span>
                            </div>
                            <div>
                              <span className="block text-slate-500 text-xs mb-0.5">Pack Size</span>
                              <span className="text-slate-800">{selectedSale.packSize || '—'}</span>
                            </div>
                            <div>
                              <span className="block text-slate-500 text-xs mb-0.5">Quantity</span>
                              <span className="font-bold text-slate-800">{selectedSale.qtyStrips} Strip(s) {selectedSale.qtyLoose ? `+ ${selectedSale.qtyLoose} Loose` : ''}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-indigo-500" /> Financials
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">MRP / Rate</span>
                            <span className="text-slate-800">{fmt(selectedSale.mrp || 0)} / {fmt(selectedSale.saleRate || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Discount Applied</span>
                            <span className="text-emerald-600 font-medium">{selectedSale.discountPct}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">GST Rate</span>
                            <span className="text-slate-800">{selectedSale.gstRate}%</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-slate-200/60 mt-2 font-bold text-base">
                            <span className="text-slate-800">Total Charged</span>
                            <span className="text-emerald-700">{fmt(selectedSale.amount || 0)}</span>
                          </div>
                          <div className="flex justify-between mt-1 text-xs">
                            <span className="text-slate-400">Payment Mode</span>
                            <span className="text-slate-500 uppercase font-medium">{selectedSale.paymentMode || '—'}</span>
                          </div>
                          <div className="flex justify-between mt-1 text-xs">
                            <span className="text-slate-400">Billed By</span>
                            <span className="text-slate-500">{selectedSale.billedBy || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </DialogContent>
            </Dialog>
            </>
          )}

          {/* Purchases table */}
          {mode === 'purchases' && (
            <Card className="border-blue-100">
              <CardHeader className="pb-3 border-b border-blue-50 bg-gradient-to-r from-blue-50 to-white rounded-t-xl">
                <CardTitle className="text-blue-800 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> Procurement Records
                </CardTitle>
                <CardDescription>
                  {filteredPurchases.length} records · Total:{' '}
                  <span className="font-semibold text-blue-700">{fmt(totalPurchases)}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredPurchases.length === 0 ? (
                  <EmptyState icon={ShoppingCart} title="No procurement records found" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead><Calendar className="w-3 h-3 inline mr-1" />Date</TableHead>
                          <TableHead><Hash className="w-3 h-3 inline mr-1" />Invoice</TableHead>
                          <TableHead>Schedule</TableHead>
                          <TableHead><Package className="w-3 h-3 inline mr-1" />Product</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead><Building2 className="w-3 h-3 inline mr-1" />Supplier</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right"><IndianRupee className="w-3 h-3 inline" />Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchases.map((p, i) => (
                          <TableRow key={`pur-${i}`} className="hover:bg-blue-50/40 transition-colors">
                            <TableCell className="text-sm text-slate-600 whitespace-nowrap">{fmtDate(p.date)}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{p.invoiceNo ?? '—'}</TableCell>
                            <TableCell><ScheduleBadge type={p.scheduleType ?? ''} /></TableCell>
                            <TableCell className="font-medium text-slate-800 max-w-[180px]">
                              <span className="block truncate">{p.productName ?? '—'}</span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{p.batchNo ?? '—'}</TableCell>
                            <TableCell className="text-sm text-slate-500 whitespace-nowrap">{fmtDate(p.expiryDate)}</TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{p.supplierName ?? '—'}</p>
                              {p.supplierCity && <p className="text-xs text-slate-400">{p.supplierCity}</p>}
                              {p.supplierGstin && <p className="text-xs font-mono text-slate-400">{p.supplierGstin}</p>}
                            </TableCell>
                            <TableCell className="text-right font-bold">{p.actualQty ?? 0}</TableCell>
                            <TableCell className="text-right text-sm text-slate-600">₹{(p.purchaseRate ?? 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold text-blue-700">{fmt(p.amount ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
