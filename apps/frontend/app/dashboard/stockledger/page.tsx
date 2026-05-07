"use client";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletId } from '@/hooks/useOutletId';
import { Search, Calendar as Cal, ArrowUpRight, ArrowDownRight, RefreshCw, FileText, Filter, X, ChevronRight, Package } from 'lucide-react';
import { format } from 'date-fns';

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
  id: string; batch_id: string; product_id: string;
  txn_date: string; txn_type: string; txn_type_label: string;
  voucher_type: string; voucher_number: string; party_name: string;
  product_name: string; batch_number: string; expiry_date: string | null;
  qty_in: number; qty_out: number; rate: number;
  value_in: number; value_out: number;
  running_qty: number; running_value: number; created_at: string;
}

interface BatchSummary {
  batch_id: string; batch_number: string; product_name: string;
  expiry_date: string | null;
  qty_in: number; qty_out: number; qty_remaining: number;
  value_in: number; value_out: number; value_remaining: number;
  entry_count: number;
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
  const [search, setSearch] = useState('');
  const [txnFilter, setTxnFilter] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchSearch, setBatchSearch] = useState('');
  const [summary, setSummary] = useState({ total_in: 0, total_out: 0, total_value_in: 0, total_value_out: 0 });
  const [totalRecords, setTotalRecords] = useState(0);

  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return format(d, 'yyyy-MM-dd'); });
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const fetchLedger = useCallback(async () => {
    if (!outletId) return;
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ outletId, startDate, endDate, pageSize: '1000' });
      const res = await fetch(`${API_URL}/inventory/stockledger/?${p}`, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Error ${res.status}`);
      const data = await res.json();
      setEntries(data.data ?? []);
      setSummary(data.summary ?? {});
      setTotalRecords(data.pagination?.totalRecords ?? 0);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [outletId, startDate, endDate]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  // Build batch summaries from entries
  const batchMap = useMemo(() => {
    const m = new Map<string, BatchSummary>();
    for (const e of entries) {
      if (!e.batch_id) continue;
      if (!m.has(e.batch_id)) {
        m.set(e.batch_id, {
          batch_id: e.batch_id, batch_number: e.batch_number,
          product_name: e.product_name, expiry_date: e.expiry_date,
          qty_in: 0, qty_out: 0, qty_remaining: 0,
          value_in: 0, value_out: 0, value_remaining: 0, entry_count: 0,
        });
      }
      const b = m.get(e.batch_id)!;
      b.qty_in += e.qty_in; b.qty_out += e.qty_out;
      b.value_in += e.value_in; b.value_out += e.value_out;
      b.entry_count += 1;
      b.qty_remaining = b.qty_in - b.qty_out;
      b.value_remaining = b.value_in - b.value_out;
    }
    return m;
  }, [entries]);

  const batches = useMemo(() => {
    return Array.from(batchMap.values())
      .filter(b => !batchSearch || b.batch_number.toLowerCase().includes(batchSearch.toLowerCase()) || b.product_name.toLowerCase().includes(batchSearch.toLowerCase()))
      .sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [batchMap, batchSearch]);

  const selectedBatch = selectedBatchId ? batchMap.get(selectedBatchId) : null;

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const s = search.toLowerCase();
      const matchSearch = !s || [e.product_name, e.batch_number, e.voucher_number, e.party_name].some(v => v?.toLowerCase().includes(s));
      const matchType = !txnFilter || e.txn_type === txnFilter;
      const matchBatch = !selectedBatchId || e.batch_id === selectedBatchId;
      return matchSearch && matchType && matchBatch;
    });
  }, [entries, search, txnFilter, selectedBatchId]);

  const netValue = filtered.reduce((s, e) => s + e.value_in - e.value_out, 0);

  return (
    <div className="flex h-full w-full" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* ── Left: Batch Panel ── */}
      <aside className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-base">
            <Package className="w-5 h-5 text-indigo-500" /> Batches
            <span className="ml-auto text-sm bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full">{batches.length}</span>
          </h2>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={batchSearch} onChange={e => setBatchSearch(e.target.value)}
              placeholder="Search batch or product…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>
        </div>

        {/* All batches option */}
        <div className="overflow-y-auto flex-1">
          <button
            onClick={() => setSelectedBatchId(null)}
            className={`w-full text-left px-5 py-4 border-b border-slate-100 transition-colors ${!selectedBatchId ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50'}`}
          >
            <div className="text-sm font-semibold text-slate-700">All Batches</div>
            <div className="text-xs text-slate-400 mt-1">{totalRecords} total entries</div>
          </button>

          {batches.map(b => {
            const isSelected = selectedBatchId === b.batch_id;
            const lowStock = b.qty_remaining <= 2;
            return (
              <button
                key={b.batch_id}
                onClick={() => setSelectedBatchId(isSelected ? null : b.batch_id)}
                className={`w-full text-left px-5 py-4 border-b border-slate-100 transition-colors ${isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800 truncate">{b.product_name}</span>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-indigo-500' : 'text-slate-300'}`} />
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1">{b.batch_number}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs font-bold ${b.qty_remaining > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {b.qty_remaining.toFixed(1)} left
                  </span>
                  {lowStock && b.qty_remaining > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Low</span>
                  )}
                  {b.qty_remaining <= 0 && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Out</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Right: Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
        {/* Header */}
        <div className="px-8 py-5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {selectedBatch ? (
                  <span className="flex items-center gap-2">
                    <button onClick={() => setSelectedBatchId(null)} className="text-slate-400 hover:text-slate-700 text-base font-normal">Stock Ledger</button>
                    <ChevronRight className="w-5 h-5 text-slate-300" />
                    <span className="text-indigo-700">{selectedBatch.product_name}</span>
                    <span className="text-slate-400 font-mono text-base">#{selectedBatch.batch_number}</span>
                  </span>
                ) : 'Stock Ledger'}
              </h1>
              <p className="text-slate-500 text-sm mt-1">Append-only audit trail — every batch movement tracked.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 text-base shadow-sm">
                <Cal className="w-4 h-4 text-slate-400" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent outline-none text-slate-700 text-sm" />
                <span className="text-slate-300">—</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent outline-none text-slate-700 text-sm" />
              </div>
              <button onClick={fetchLedger} disabled={loading} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-60">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Batch detail panel */}
        {selectedBatch && (
          <div className="mx-8 mt-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 shrink-0">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-800">Batch Summary</h2>
              {selectedBatch.expiry_date && (
                <span className="text-sm text-slate-400">Expires: <strong className="text-amber-600">{format(new Date(selectedBatch.expiry_date), 'MMM yyyy')}</strong></span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Qty Purchased', value: `${selectedBatch.qty_in.toFixed(2)} strips`, sub: fmt(selectedBatch.value_in), color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: 'Qty Sold', value: `${selectedBatch.qty_out.toFixed(2)} strips`, sub: fmt(selectedBatch.value_out), color: 'text-rose-700', bg: 'bg-rose-50' },
                { label: 'Qty Remaining', value: `${selectedBatch.qty_remaining.toFixed(2)} strips`, sub: fmt(selectedBatch.value_remaining), color: selectedBatch.qty_remaining > 0 ? 'text-indigo-700' : 'text-red-600', bg: selectedBatch.qty_remaining > 0 ? 'bg-indigo-50' : 'bg-red-50' },
                { label: 'Transactions', value: `${selectedBatch.entry_count}`, sub: 'ledger entries', color: 'text-slate-700', bg: 'bg-slate-100' },
              ].map(({ label, value, sub, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-5`}>
                  <div className="text-sm text-slate-500 mb-1.5">{label}</div>
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-sm text-slate-400 mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {/* Mini progress bar */}
            <div className="mt-5">
              <div className="flex justify-between text-sm text-slate-500 mb-1.5">
                <span>Stock consumed</span>
                <span>{selectedBatch.qty_in > 0 ? ((selectedBatch.qty_out / selectedBatch.qty_in) * 100).toFixed(1) : 0}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-400 to-rose-500 rounded-full transition-all"
                  style={{ width: `${selectedBatch.qty_in > 0 ? Math.min(100, (selectedBatch.qty_out / selectedBatch.qty_in) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Summary cards (when no batch selected) */}
        {!selectedBatch && (
          <div className="px-8 pt-5 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            {[
              { label: 'Total Qty In', value: summary.total_in?.toFixed(2) ?? '0', sub: fmt(summary.total_value_in ?? 0), Icon: ArrowUpRight, bg: 'bg-emerald-100', ic: 'text-emerald-600' },
              { label: 'Total Qty Out', value: summary.total_out?.toFixed(2) ?? '0', sub: fmt(summary.total_value_out ?? 0), Icon: ArrowDownRight, bg: 'bg-rose-100', ic: 'text-rose-600' },
              { label: 'Entries', value: String(filtered.length), sub: `${totalRecords} total`, Icon: FileText, bg: 'bg-indigo-100', ic: 'text-indigo-600' },
              { label: 'Net Value', value: fmt(netValue), sub: 'stock value', Icon: () => <span className="text-base font-bold">₹</span>, bg: 'bg-violet-100', ic: 'text-violet-600' },
            ].map(({ label, value, sub, Icon, bg, ic }) => (
              <div key={label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center ${ic} shrink-0`}><Icon className="w-5 h-5" /></div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5 uppercase tracking-wide font-medium">{label}</div>
                  <div className="text-xl font-bold text-slate-900">{value}</div>
                  <div className="text-sm text-slate-400 mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="mx-8 mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-5 py-4 text-base shrink-0">{error}</div>}

        {/* Table */}
        <div className="flex-1 flex flex-col overflow-hidden mx-8 mt-5 mb-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-4 shrink-0 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search product, batch, voucher, party…"
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-slate-400" />
              <select value={txnFilter} onChange={e => setTxnFilter(e.target.value)}
                className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                {[['', 'All Types'], ['PURCHASE_IN', 'Purchase In'], ['SALE_OUT', 'Sale Out'], ['SALE_RETURN', 'Sale Return'], ['PURCHASE_RETURN', 'Purchase Return'], ['ADJUSTMENT_IN', 'Adjustment In'], ['ADJUSTMENT_OUT', 'Adjustment Out'], ['OPENING', 'Opening']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {(search || txnFilter) && (
                <button onClick={() => { setSearch(''); setTxnFilter(''); }} className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <span className="ml-auto text-sm text-slate-400 font-medium">{filtered.length} entries</span>
          </div>

          {/* Table scroll area */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold sticky top-0 z-10 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Voucher</th>
                  <th className="px-5 py-4">Party</th>
                  <th className="px-5 py-4">Product / Batch</th>
                  <th className="px-5 py-4 text-right">Qty In</th>
                  <th className="px-5 py-4 text-right">Qty Out</th>
                  <th className="px-5 py-4 text-right">Rate</th>
                  <th className="px-5 py-4 text-right">Running Bal.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={9} className="py-20 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-400" />
                    <p className="text-base">Loading…</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="py-20 text-center">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-400 text-base">No entries found.</p>
                  </td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-700">{format(new Date(e.txn_date), 'dd MMM yy')}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{format(new Date(e.created_at), 'HH:mm')}</div>
                    </td>
                    <td className="px-5 py-3.5"><Badge type={e.txn_type} label={e.txn_type_label || e.txn_type} /></td>
                    <td className="px-5 py-3.5">
                      <div className="text-indigo-600 font-medium group-hover:text-indigo-700">{e.voucher_number || '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{e.voucher_type}</div>
                    </td>
                    <td className="px-5 py-3.5 max-w-[150px]">
                      <span className="truncate block text-slate-600" title={e.party_name}>{e.party_name || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={e.product_name}>{e.product_name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {e.batch_number}
                        {e.expiry_date && <span className="ml-2 text-amber-600 font-medium">Exp {format(new Date(e.expiry_date), 'MMM yy')}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {e.qty_in > 0 ? (
                        <div>
                          <span className="font-bold text-emerald-700">+{e.qty_in.toFixed(2)}</span>
                          <div className="text-xs text-slate-400 mt-0.5">₹{e.value_in.toFixed(2)}</div>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {e.qty_out > 0 ? (
                        <div>
                          <span className="font-bold text-rose-700">−{e.qty_out.toFixed(2)}</span>
                          <div className="text-xs text-slate-400 mt-0.5">₹{e.value_out.toFixed(2)}</div>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-500 font-medium">₹{e.rate.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="font-bold text-slate-800 text-base">{e.running_qty.toFixed(2)}<span className="font-normal text-slate-400 text-xs ml-1">strips</span></div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">₹{e.running_value.toFixed(2)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="shrink-0 border-t border-slate-200 px-5 py-3 bg-slate-50 flex justify-between items-center text-sm text-slate-600">
              <span className="font-medium">{filtered.length} entries visible</span>
              <div className="flex gap-6">
                <span>In: <strong className="text-emerald-700">{fmt(filtered.reduce((s, e) => s + e.value_in, 0))}</strong></span>
                <span>Out: <strong className="text-rose-700">{fmt(filtered.reduce((s, e) => s + e.value_out, 0))}</strong></span>
                <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-md">Net: <strong className="text-indigo-800">{fmt(netValue)}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
