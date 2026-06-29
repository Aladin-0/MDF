"use client";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletId } from '@/hooks/useOutletId';
import { Search, Calendar as Cal, ArrowUpRight, ArrowDownRight, RefreshCw, FileText, Filter, X, ChevronRight, Package, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { formatDecimalQty } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

function getToken() {
  if (typeof document === 'undefined') return null;
  const r = document.cookie.split('; ').find(x => x.startsWith('access_token='));
  return r ? r.substring('access_token='.length) : null;
}

function authHeaders(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

interface LedgerEntry {
  id: string;
  batch_id: string;
  product_id: string;
  txn_date: string;
  txn_type: string;
  txn_type_label: string;
  voucher_type: string;
  voucher_number: string;
  party_name: string;
  product_name: string;
  batch_number: string;
  expiry_date: string | null;
  qty_in: number;
  qty_out: number;
  rate: number;
  pack_size: number;
  value_in: number;
  value_out: number;
  running_qty: number;
  running_value: number;
  created_at: string;
}

interface BatchSummaryItem {
  batch_id: string;
  batch_number: string;
  product_name: string;
  qty_remaining: number;
  pack_size: number;
  expiry_date: string | null;
}

const COLORS: Record<string, { pill: string; dot: string }> = {
  PURCHASE_IN:     { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  SALE_OUT:        { pill: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500' },
  SALE_RETURN:     { pill: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500' },
  PURCHASE_RETURN: { pill: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500' },
  ADJUSTMENT_IN:   { pill: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500' },
  ADJUSTMENT_OUT:  { pill: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500' },
  OPENING:         { pill: 'bg-slate-100 text-slate-600 border-slate-200',      dot: 'bg-slate-400' },
};

function Badge({ type, label }: { type: string; label: string }) {
  const c = COLORS[type] ?? COLORS.OPENING;
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${c.pill}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function StockLedgerPage() {
  const outletId = useOutletId();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sidebar Batches State
  const [batches, setBatches] = useState<BatchSummaryItem[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');

  // Filtering & Pagination State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [txnFilter, setTxnFilter] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return format(d, 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const [summary, setSummary] = useState({
    total_in: 0,
    total_out: 0,
    total_value_in: 0,
    total_value_out: 0,
  });

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedBatchId, txnFilter, debouncedSearch, startDate, endDate]);

  // Fetch all batches for sidebar
  const fetchBatches = useCallback(async () => {
    if (!outletId) return;
    setBatchesLoading(true);
    try {
      const res = await fetch(`${API_URL}/inventory/stockledger/batches/?outletId=${outletId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch active batch summaries");
      const data = await res.json();
      setBatches(data ?? []);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setBatchesLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Fetch paginated stock ledger entries
  const fetchLedger = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams({
        outletId,
        startDate,
        endDate,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (selectedBatchId) p.append('batchId', selectedBatchId);
      if (txnFilter) p.append('txnType', txnFilter);
      if (debouncedSearch) p.append('search', debouncedSearch);

      const res = await fetch(`${API_URL}/inventory/stockledger/?${p}`, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Error ${res.status}`);
      const data = await res.json();
      setEntries(data.data ?? []);
      setSummary(data.summary ?? { total_in: 0, total_out: 0, total_value_in: 0, total_value_out: 0 });
      setTotalRecords(data.pagination?.totalRecords ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [outletId, startDate, endDate, page, pageSize, selectedBatchId, txnFilter, debouncedSearch]);

  const handleExport = useCallback(async () => {
    if (!outletId) return;
    try {
      const p = new URLSearchParams({
        outletId,
        startDate,
        endDate,
        export_format: 'xlsx'
      });
      if (selectedBatchId) p.append('batchId', selectedBatchId);
      if (txnFilter) p.append('txnType', txnFilter);
      if (debouncedSearch) p.append('search', debouncedSearch);

      const res = await fetch(`${API_URL}/inventory/stockledger/?${p}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock_ledger_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
      // fallback alert if needed
      alert("Failed to export: " + e.message);
    }
  }, [outletId, startDate, endDate, selectedBatchId, txnFilter, debouncedSearch]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Client-side batch filtering based on search
  const filteredBatches = useMemo(() => {
    const s = batchSearch.toLowerCase();
    return batches.filter(b =>
      !s ||
      b.batch_number.toLowerCase().includes(s) ||
      b.product_name.toLowerCase().includes(s)
    );
  }, [batches, batchSearch]);

  // Find info about the currently selected batch
  const selectedBatchInfo = useMemo(() => {
    return batches.find(b => b.batch_id === selectedBatchId);
  }, [batches, selectedBatchId]);

  const netValue = summary.total_value_in - summary.total_value_out;

  return (
    <div className="flex h-full w-full bg-slate-50/30" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* ── Left: Batch Panel ── */}
      <aside className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col shadow-sm">
        <div className="p-5 border-b border-slate-100 bg-slate-50/40">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-base">
            <Package className="w-5 h-5 text-indigo-600" /> Batches
            <span className="ml-auto text-sm bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-bold">
              {batches.length}
            </span>
          </h2>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={batchSearch}
              onChange={e => setBatchSearch(e.target.value)}
              placeholder="Search batch or product…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
            />
          </div>
        </div>

        {/* Batch Selection List */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
          <button
            onClick={() => setSelectedBatchId(null)}
            className={`w-full text-left px-5 py-4 border-l-4 transition-all ${
              !selectedBatchId
                ? 'bg-indigo-50/50 border-l-indigo-600'
                : 'hover:bg-slate-50/60 border-l-transparent'
            }`}
          >
            <div className="text-sm font-semibold text-slate-800">All Batches</div>
            <div className="text-xs text-slate-400 mt-1">Show combined movements across all products</div>
          </button>

          {batchesLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500" />
              <p className="text-sm font-medium">Loading batches...</p>
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="py-20 text-center">
              <Inbox className="w-8 h-8 mx-auto mb-2.5 text-slate-300" />
              <p className="text-slate-400 text-sm">No batches found</p>
            </div>
          ) : (
            filteredBatches.map(b => {
              const isSelected = selectedBatchId === b.batch_id;
              const lowStock = b.qty_remaining <= 2;
              return (
                <button
                  key={b.batch_id}
                  onClick={() => setSelectedBatchId(isSelected ? null : b.batch_id)}
                  className={`w-full text-left px-5 py-4 border-l-4 transition-all ${
                    isSelected
                      ? 'bg-indigo-50/50 border-l-indigo-600 font-semibold'
                      : 'hover:bg-slate-50/60 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-slate-800 font-medium line-clamp-2 leading-tight">
                      {b.product_name}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${
                        isSelected ? 'rotate-90 text-indigo-600' : 'text-slate-300'
                      }`}
                    />
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1 bg-slate-100 inline-block px-1.5 py-0.5 rounded">
                    {b.batch_number}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-xs font-semibold ${b.qty_remaining > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {formatDecimalQty(b.qty_remaining, b.pack_size)} left
                    </span>
                    {b.qty_remaining <= 0 ? (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Out</span>
                    ) : lowStock ? (
                      <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Low</span>
                    ) : (
                      <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">In Stock</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Right: Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {selectedBatchInfo ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedBatchId(null)}
                      className="text-slate-400 hover:text-slate-700 font-normal transition-colors"
                    >
                      Stock Ledger
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-300" />
                    <span className="text-indigo-600">{selectedBatchInfo.product_name}</span>
                    <span className="text-slate-400 font-mono text-base font-medium">
                      ({selectedBatchInfo.batch_number})
                    </span>
                  </span>
                ) : (
                  'Stock Ledger'
                )}
              </h1>
              <p className="text-slate-500 text-sm mt-1">Real-time append-only transaction registry.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500">
                <Cal className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent outline-none text-slate-700 text-sm font-medium"
                />
                <span className="text-slate-300 font-medium">—</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent outline-none text-slate-700 text-sm font-medium"
                />
              </div>
              <button
                onClick={handleExport}
                className="p-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors shadow-sm flex items-center gap-2 font-medium"
                title="Export to Excel"
              >
                <FileText className="w-5 h-5" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={fetchLedger}
                disabled={loading}
                className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-60 shadow-sm"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Summary Card Details */}
        <div className="px-8 pt-6 pb-2 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              {
                label: 'Stock Received (In)',
                value: selectedBatchInfo
                  ? formatDecimalQty(summary.total_in, selectedBatchInfo.pack_size)
                  : summary.total_in.toLocaleString() + ' Entries',
                sub: fmt(summary.total_value_in),
                color: 'text-emerald-700',
                bg: 'bg-emerald-50/50 border-emerald-100',
                icon: <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              },
              {
                label: 'Stock Dispensed (Out)',
                value: selectedBatchInfo
                  ? formatDecimalQty(summary.total_out, selectedBatchInfo.pack_size)
                  : summary.total_out.toLocaleString() + ' Entries',
                sub: fmt(summary.total_value_out),
                color: 'text-rose-700',
                bg: 'bg-rose-50/50 border-rose-100',
                icon: <ArrowDownRight className="w-4 h-4 text-rose-600" />
              },
              {
                label: selectedBatchInfo ? 'Stock Remaining' : 'Net Activity Ledger',
                value: selectedBatchInfo
                  ? formatDecimalQty(summary.total_in - summary.total_out, selectedBatchInfo.pack_size)
                  : `${totalRecords} Transactions`,
                sub: fmt(netValue),
                color: netValue >= 0 ? 'text-indigo-700' : 'text-red-700',
                bg: 'bg-indigo-50/40 border-indigo-100',
                icon: <span className="text-xs font-bold text-indigo-600">₹</span>
              },
              {
                label: 'Reporting Period',
                value: format(new Date(startDate), 'dd MMM') + ' - ' + format(new Date(endDate), 'dd MMM yy'),
                sub: 'Date Range Applied',
                color: 'text-slate-700',
                bg: 'bg-slate-50 border-slate-200/60',
                icon: <Cal className="w-4 h-4 text-slate-500" />
              }
            ].map(({ label, value, sub, color, bg, icon }) => (
              <div key={label} className={`border rounded-2xl p-5 bg-white shadow-sm flex flex-col justify-between ${bg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                  <div className="w-7 h-7 rounded-full bg-white border flex items-center justify-center shadow-sm shrink-0">
                    {icon}
                  </div>
                </div>
                <div className="mt-3.5">
                  <div className={`text-xl font-bold tracking-tight ${color}`}>{value}</div>
                  <div className="text-xs text-slate-400 font-medium mt-1">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Bar for consumed stock when single batch selected */}
          {selectedBatchInfo && summary.total_in > 0 && (
            <div className="mt-5 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between text-xs font-semibold text-slate-500 mb-2">
                <span>Batch Stock Consumed</span>
                <span>{((summary.total_out / summary.total_in) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (summary.total_out / summary.total_in) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-8 mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-5 py-4 text-sm font-medium shrink-0">
            {error}
          </div>
        )}

        {/* ── Table & Toolbar ── */}
        <div className="flex-1 flex flex-col overflow-hidden mx-8 mt-4 mb-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/40 flex flex-wrap gap-4 shrink-0 items-center justify-between">
            <div className="relative flex-1 min-w-[280px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product, batch, invoice number, party..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={txnFilter}
                onChange={e => setTxnFilter(e.target.value)}
                className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-600 shadow-sm"
              >
                {[
                  ['', 'All Transaction Types'],
                  ['PURCHASE_IN', 'Purchase In'],
                  ['SALE_OUT', 'Sale Out'],
                  ['SALE_RETURN', 'Sale Return'],
                  ['PURCHASE_RETURN', 'Purchase Return'],
                  ['ADJUSTMENT_IN', 'Adjustment In'],
                  ['ADJUSTMENT_OUT', 'Adjustment Out'],
                  ['OPENING', 'Opening Stock']
                ].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {(search || txnFilter) && (
                <button
                  onClick={() => { setSearch(''); setTxnFilter(''); }}
                  className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Table Viewport */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-400 text-[11px] uppercase tracking-wider font-bold sticky top-0 z-10 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  <th className="px-6 py-4">Transaction Date</th>
                  <th className="px-6 py-4">Txn Type</th>
                  <th className="px-6 py-4">Voucher / Invoice</th>
                  <th className="px-6 py-4">Party Details</th>
                  <th className="px-6 py-4">Product & Batch</th>
                  <th className="px-6 py-4 text-right">Stock In</th>
                  <th className="px-6 py-4 text-right">Stock Out</th>
                  <th className="px-6 py-4 text-right">Billing Rate</th>
                  <th className="px-6 py-4 text-right">Running Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-24 text-center text-slate-400">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-500" />
                      <p className="text-base font-semibold text-slate-700">Fetching records...</p>
                      <p className="text-xs text-slate-400 mt-1">Retrieving database audits</p>
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-24 text-center">
                      <FileText className="w-12 h-12 mx-auto mb-3.5 text-slate-300" />
                      <p className="text-slate-500 font-semibold text-base">No ledger rows matched</p>
                      <p className="text-xs text-slate-400 mt-1">Try adjusting the filter criteria or date range</p>
                    </td>
                  </tr>
                ) : (
                  entries.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-700">{format(new Date(e.txn_date), 'dd MMM yyyy')}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{format(new Date(e.created_at), 'HH:mm')}</div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge type={e.txn_type} label={e.txn_type_label || e.txn_type} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-indigo-600 font-semibold group-hover:text-indigo-700 transition-colors">
                          {e.voucher_number || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          {e.voucher_type || 'system'}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-[160px]">
                        <span className="truncate block text-slate-600 font-medium" title={e.party_name}>
                          {e.party_name || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800 truncate max-w-[220px]" title={e.product_name}>
                          {e.product_name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                          <span className="bg-slate-100 px-1 py-0.2 rounded text-[10px] font-bold text-slate-600">
                            {e.batch_number}
                          </span>
                          {e.expiry_date && (
                            <span className="text-amber-600 font-semibold text-[10px]">
                              Exp {format(new Date(e.expiry_date), 'MMM yy')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {e.qty_in > 0 ? (
                          <div>
                            <span className="font-bold text-emerald-600">+{formatDecimalQty(e.qty_in, e.pack_size)}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">₹{e.value_in.toFixed(2)}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {e.qty_out > 0 ? (
                          <div>
                            <span className="font-bold text-rose-600">−{formatDecimalQty(e.qty_out, e.pack_size)}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">₹{e.value_out.toFixed(2)}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500 font-semibold">
                        ₹{e.rate.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-slate-800 whitespace-nowrap">
                          {formatDecimalQty(e.running_qty, e.pack_size)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                          ₹{e.running_value.toFixed(2)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginated Footer */}
          {!loading && entries.length > 0 && (
            <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500">
                Showing <span className="text-slate-800">{ (page - 1) * pageSize + 1 }</span> to{' '}
                <span className="text-slate-800">{ Math.min(page * pageSize, totalRecords) }</span> of{' '}
                <span className="text-slate-800">{ totalRecords }</span> entries
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  Prev
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => {
                    const pageNum = i + 1;
                    // Show first, last, and active surroundings to keep pagination neat
                    if (
                      totalPages > 6 &&
                      pageNum !== 1 &&
                      pageNum !== totalPages &&
                      Math.abs(pageNum - page) > 1
                    ) {
                      if (pageNum === 2 || pageNum === totalPages - 1) {
                        return <span key={pageNum} className="px-1 text-slate-400 text-xs">...</span>;
                      }
                      return null;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-7.5 h-7.5 rounded-lg text-xs font-bold transition-all ${
                          page === pageNum
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 shadow-sm'
                        }`}
                        style={{ width: '30px', height: '30px' }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
