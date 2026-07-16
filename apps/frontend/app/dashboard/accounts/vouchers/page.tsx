'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useOutletId } from '@/hooks/useOutletId';
import { VoucherDetailModal } from '@/components/accounts/VoucherDetailModal';
import { voucherApi } from '@/lib/apiClient';
import { 
    FileText, Search, Plus, Filter, FilePlus, ChevronRight, RefreshCw, XCircle, 
    CheckCircle, List, ArrowLeft, MoreVertical, Edit, History as HistoryIcon, Clock, Receipt, CreditCard
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const INR = (n: number) =>
    '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_COLORS: Record<string, string> = {
    receipt: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    payment: 'bg-blue-100 text-blue-700 border-blue-200',
    contra: 'bg-amber-100 text-amber-700 border-amber-200',
    journal: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_BADGE: Record<string, React.ReactNode> = {
    posted: <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50"><CheckCircle className="w-3 h-3" /> Posted</span>,
    reversed: <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/50"><RefreshCw className="w-3 h-3" /> Reversed</span>,
    cancelled: <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/50"><XCircle className="w-3 h-3" /> Cancelled</span>,
    draft: <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/50">Draft</span>
};

export default function VoucherListPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const outletId = useOutletId();
    
    // Filters state
    const [search, setSearch] = useState(searchParams?.get('search') || '');
    const [type, setType] = useState(searchParams?.get('type') || '');
    const [status, setStatus] = useState(searchParams?.get('status') || '');
    const [partyId, setPartyId] = useState(searchParams?.get('party') || '');
    
    // Slide-over state
    const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Fetch list
    const { data: vouchers, isLoading } = useQuery({
        queryKey: ['vouchers-register', outletId],
        queryFn: async () => {
            if (!outletId) return [];
            return await voucherApi.getVouchers(outletId, '');
        },
        enabled: !!outletId,
    });

    // Determine primary party (simplistic approach: first non-cash/bank ledger)
    const getPartyName = (lines: any[]) => {
        if (!lines || lines.length === 0) return '—';
        const partyLine = lines.find(l => !l.ledgerName.toLowerCase().includes('cash') && !l.ledgerName.toLowerCase().includes('bank'));
        return partyLine ? partyLine.ledgerName : lines[0].ledgerName;
    };

    // Filtered data
    const filteredVouchers = useMemo(() => {
        let filtered = vouchers || [];
        if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter((v: any) => 
                v.voucherNo?.toLowerCase().includes(q) || 
                v.narration?.toLowerCase().includes(q)
            );
        }
        if (type && type !== 'all') {
            filtered = filtered.filter((v: any) => v.voucherType === type);
        }
        if (status && status !== 'all') {
            filtered = filtered.filter((v: any) => v.status === status);
        }
        if (partyId) {
            // Check if any line has this ledger ID
            filtered = filtered.filter((v: any) => v.lines?.some((l: any) => l.ledgerId === partyId));
        }
        return filtered;
    }, [vouchers, search, type, status, partyId]);

    // Handle view details
    const handleViewDetails = (id: string) => {
        setSelectedVoucherId(id);
        setSheetOpen(true);
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                        <List className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">All Vouchers Register</h1>
                        <p className="text-sm text-slate-500 mt-1">Centralized view of all accounting entries</p>
                    </div>
                </div>
                <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
                    <Link href="/dashboard/accounts/voucher-entry">
                        <Plus className="w-4 h-4 mr-2" />
                        New Voucher
                    </Link>
                </Button>
            </div>

            {/* Desktop Filters */}
            <div className="hidden md:flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
                <div className="flex-1 min-w-[250px] relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                        type="text"
                        placeholder="Search voucher number or narration..."
                        className="pl-9 h-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="w-[180px]">
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="receipt">Receipt</SelectItem>
                            <SelectItem value="payment">Payment</SelectItem>
                            <SelectItem value="journal">Journal</SelectItem>
                            <SelectItem value="contra">Contra</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-[180px]">
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="posted">Posted</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="reversed">Reversed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {(search || type || status || partyId) && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setType(''); setStatus(''); setPartyId(''); }} className="text-slate-500 h-9">
                        Clear Filters
                    </Button>
                )}
            </div>

            {/* Mobile Filters via Sheet */}
            <div className="md:hidden">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" className="w-full h-10"><Filter className="w-4 h-4 mr-2" /> Filter Vouchers</Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-2xl">
                        <SheetHeader>
                            <SheetTitle>Filters</SheetTitle>
                        </SheetHeader>
                        <div className="space-y-4 py-4">
                            <Input
                                placeholder="Search voucher..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="receipt">Receipt</SelectItem>
                                    <SelectItem value="payment">Payment</SelectItem>
                                    <SelectItem value="journal">Journal</SelectItem>
                                    <SelectItem value="contra">Contra</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="posted">Posted</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Data View */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mb-3 text-indigo-500" />
                    Loading register...
                </div>
            ) : filteredVouchers.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200/60 p-12 text-center shadow-sm">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                        <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-1">No vouchers found</h3>
                    <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                        There are no matching vouchers for the selected filters.
                    </p>
                </div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-200/60 text-slate-500 font-semibold tracking-wide uppercase text-[10px]">
                                    <th className="p-4 whitespace-nowrap">Date</th>
                                    <th className="p-4 whitespace-nowrap">Voucher No</th>
                                    <th className="p-4 whitespace-nowrap">Type</th>
                                    <th className="p-4">Party / Primary Ledger</th>
                                    <th className="p-4 hidden lg:table-cell w-1/3">Narration</th>
                                    <th className="p-4 whitespace-nowrap text-right">Amount</th>
                                    <th className="p-4 whitespace-nowrap text-center">Status</th>
                                    <th className="p-4 whitespace-nowrap w-16 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredVouchers.map((voucher: any) => (
                                    <tr 
                                        key={voucher.id} 
                                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                        onClick={() => handleViewDetails(voucher.id)}
                                    >
                                        <td className="p-4 text-slate-600 font-medium whitespace-nowrap">
                                            {format(new Date(voucher.date), 'dd MMM yyyy')}
                                        </td>
                                        <td className="p-4 font-mono font-medium text-indigo-600">
                                            {voucher.voucherNo}
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex px-2 py-0.5 text-[11px] font-bold rounded uppercase tracking-wider border ${TYPE_COLORS[voucher.voucherType] || 'bg-slate-100 text-slate-600'}`}>
                                                {voucher.voucherType}
                                            </span>
                                        </td>
                                        <td className="p-4 font-medium text-slate-800 line-clamp-1 break-all mt-3 mb-1" title={getPartyName(voucher.lines)}>
                                            {getPartyName(voucher.lines)}
                                        </td>
                                        <td className="p-4 hidden lg:table-cell text-slate-500 text-xs italic line-clamp-1" title={voucher.narration}>
                                            {voucher.narration ? `"${voucher.narration}"` : '—'}
                                        </td>
                                        <td className="p-4 font-bold text-slate-900 text-right font-mono">
                                            {INR(voucher.totalAmount)}
                                        </td>
                                        <td className="p-4 text-center">
                                            {STATUS_BADGE[voucher.status] || STATUS_BADGE['draft']}
                                        </td>
                                        <td className="p-4 text-center">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-indigo-600" onClick={(e) => { e.stopPropagation(); handleViewDetails(voucher.id); }}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {filteredVouchers.map((voucher: any) => (
                            <Card key={voucher.id} className="cursor-pointer hover:border-indigo-200 transition-colors shadow-sm" onClick={() => handleViewDetails(voucher.id)}>
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider border mb-1.5 ${TYPE_COLORS[voucher.voucherType] || 'bg-slate-100 text-slate-600'}`}>
                                                {voucher.voucherType}
                                            </span>
                                            <p className="font-mono font-bold text-indigo-600 text-sm">{voucher.voucherNo}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-slate-900">{INR(voucher.totalAmount)}</p>
                                            <p className="text-xs text-slate-500">{format(new Date(voucher.date), 'dd MMM yyyy')}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm">
                                        <p className="font-medium text-slate-800">{getPartyName(voucher.lines)}</p>
                                        {voucher.narration && <p className="text-slate-500 text-xs italic mt-0.5 line-clamp-1">&ldquo;{voucher.narration}&rdquo;</p>}
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                        {STATUS_BADGE[voucher.status] || STATUS_BADGE['draft']}
                                        <span className="text-indigo-600 text-xs font-medium flex items-center">
                                            View Details <ChevronRight className="h-3 w-3 ml-0.5" />
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            )}

            {/* Slide-over Panel for Voucher Details */}
            <VoucherDetailModal 
                voucherId={selectedVoucherId || ''} 
                open={sheetOpen} 
                onOpenChange={setSheetOpen} 
            />
        </div>
    );
}

// ─── End ──────────────────────────────────────────────────────────────────────
