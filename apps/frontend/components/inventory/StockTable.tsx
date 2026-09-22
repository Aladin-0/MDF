'use client'
import { formatQty } from '@/lib/utils';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStockPage } from '@/hooks/useInventory';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
    ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, 
    SortingState, useReactTable, getExpandedRowModel, ExpandedState
} from '@tanstack/react-table';
import { ProductSearchResult, Batch } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, PackageSearch, Eye, SlidersHorizontal, ChevronUp, ChevronDown, ChevronRight, Pencil, Loader2, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { useInventoryStore } from '@/store/inventoryStore';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { useDebounce } from '@/hooks/useDebounce';
import { productsApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';
import { MasterProduct } from '@/types';

export function StockTable({ onProductClick, onAdjustClick, onEditClick }: any) {
    const { filters, setFilter, clearFilters } = useInventoryFilters();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [quickEditCol, setQuickEditCol] = useState<string | null>('none');

    // ── Search ─────────────────────────────────────────────────────────────────
    // Keep local search state to avoid writing to the URL on every keystroke.
    const [searchTerm, setSearchTerm] = useState(filters.search || '');
    const debouncedSearch = useDebounce(searchTerm, 400);
    const prevDebounced = useRef(debouncedSearch);

    useEffect(() => {
        // Only call setFilter when the debounced value actually changed.
        if (prevDebounced.current !== debouncedSearch) {
            prevDebounced.current = debouncedSearch;
            setFilter('q', debouncedSearch);
        }
    }, [debouncedSearch, setFilter]);

    // ── Pagination via local state (Traditional) ───────────────
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const filtersKey = `${filters.search}|${filters.scheduleType}|${filters.lowStock}|${filters.expiringSoon}|${filters.sortBy}|${filters.sortOrder}`;
    const prevFiltersKey = useRef(filtersKey);
    
    if (prevFiltersKey.current !== filtersKey) {
        prevFiltersKey.current = filtersKey;
        if (page !== 1) setPage(1);
    }

    const { data: pageData, isLoading, isFetching } = useStockPage(filters, page, pageSize);

    const tableData = pageData?.data || [];
    const totalPages = pageData?.pagination?.totalPages || 1;
    const totalRecords = pageData?.pagination?.totalRecords || 0;

    const topRef = useRef<HTMLDivElement>(null);

    // Scroll to top of table when page changes
    useEffect(() => {
        if (topRef.current) {
            const y = topRef.current.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }, [page]);

    const { valuationMode } = useInventoryStore();

    // ── Sort ───────────────────────────────────────────────────────────────────
    // Store sort in local state; push to URL in ONE combined call to avoid double re-render.
    const [sorting, setSorting] = useState<SortingState>([{ 
         id: filters.sortBy || 'name', 
         desc: filters.sortOrder === 'desc' 
    }]);
    const [expanded, setExpanded] = useState<ExpandedState>({});

    const onSortingChange = useCallback((updater: any) => {
        setSorting(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (next.length > 0) {
                // Single router.replace call combining both sort params.
                const params = new URLSearchParams(window.location.search);
                params.set('sort', next[0].id);
                params.set('order', next[0].desc ? 'desc' : 'asc');
                window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
            }
            return next;
        });
    }, []);

    // ── Quick Edit optimistic update ───────────────────────────────────────────
    const colMap: Record<string, string> = {
        gstRate: 'GST Rate (%)',
        hsnCode: 'HSN Code',
        packType: 'Pack Type',
        packSize: 'Pack Size',
        packUnit: 'Unit Name',
        scheduleType: 'Schedule Type',
    };

    const handleQuickSave = useCallback(async (productId: string, field: string, val: any) => {
        await productsApi.update(productId, { [field]: val });
        // Optimistically update the current page cache in React Query
        queryClient.setQueriesData(
            { queryKey: ['inventory', 'stock'] },
            (oldData: any) => {
                if (!oldData?.data) return oldData;
                return { ...oldData, data: oldData.data.map((p: any) => p.id === productId ? { ...p, [field]: val } : p) };
            }
        );
    }, [queryClient]);

    // ── Columns ────────────────────────────────────────────────────────────────
    const columns: ColumnDef<ProductSearchResult>[] = [
        {
            id: 'expander',
            header: () => null,
            cell: ({ row }) => row.getCanExpand() ? (
                <button
                    onClick={row.getToggleExpandedHandler()}
                    style={{ cursor: 'pointer' }}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                >
                    {row.getIsExpanded() ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
            ) : null,
        },
        {
            accessorKey: 'name',
            header: ({ column }) => <SortableHeader column={column} title="Product" />,
            cell: ({ row }) => (
                <div 
                    className="flex-1 min-w-[200px] cursor-pointer" 
                    onClick={() => onProductClick(row.original)}
                >
                    <div className="text-sm font-medium text-slate-900">{row.original.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.original.composition}</div>
                    <div className="text-xs text-slate-400">{row.original.manufacturer}</div>
                </div>
            )
        },
        {
            accessorKey: 'scheduleType',
            header: ({ column }) => <SortableHeader column={column} title="Schedule" />,
            cell: ({ row }) => {
                const s = row.original.scheduleType;
                const colors: Record<string, string> = {
                    OTC:        'bg-green-50 text-green-700',
                    G:          'bg-blue-50 text-blue-700',
                    H:          'bg-amber-50 text-amber-700',
                    H1:         'bg-orange-50 text-orange-700',
                    X:          'bg-red-50 text-red-700',
                    C:          'bg-cyan-50 text-cyan-700',
                    Narcotic:   'bg-purple-50 text-purple-700',
                    Ayurvedic:  'bg-emerald-50 text-emerald-700',
                    Surgical:   'bg-slate-50 text-slate-700',
                    Cosmetic:   'bg-pink-50 text-pink-700',
                    Veterinary: 'bg-amber-50 text-amber-800',
                };
                return (
                    <div className="w-20 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${colors[s] || 'bg-slate-50 text-slate-700'}`}>
                            {s}
                        </span>
                    </div>
                );
            }
        },
        {
            id: 'stock',
            accessorFn: row => row.totalStock,
            header: ({ column }) => <SortableHeader column={column} title="Stock" />,
            cell: ({ row }) => {
                const p = row.original;
                const isEmpty = (p.totalStock || 0) === 0;
                const color = isEmpty || p.isLowStock ? "text-red-600 font-bold" : "text-slate-900";
                let displayText = p.stockDisplayText;
                if (!displayText) {
                    displayText = formatQty(
                        Math.floor(Math.round((p.totalStock || 0) * (p.packSize || 1)) / (p.packSize || 1)), 
                        Math.round((p.totalStock || 0) * (p.packSize || 1)) % (p.packSize || 1), 
                        p.packSize || 1,
                        p.packType || 'strip',
                        p.packUnit || 'tablet'
                    );
                }
                return (
                    <div className="w-40 text-right">
                        {isEmpty ? (
                            <div className={`text-sm ${color}`}>Out of stock</div>
                        ) : (
                            <div className={`text-sm font-medium ${color}`}>{displayText}</div>
                        )}
                    </div>
                );
            }
        },
        {
            id: 'batches',
            header: 'Batches',
            cell: ({ row }) => {
                const len = row.original.batches.length;
                return (
                    <div className="w-20 text-center">
                        <span className="bg-slate-50 border border-slate-200 text-slate-600 text-xs px-3 py-1 rounded-full">
                            {len} batch{len !== 1 ? 'es' : ''}
                        </span>
                    </div>
                );
            }
        },
        {
            id: 'expiry',
            accessorFn: row => row.nearestExpiry,
            header: ({ column }) => <SortableHeader column={column} title="Nearest Expiry" />,
            cell: ({ row }) => {
                 const exStr = row.original.nearestExpiry;
                 if (!exStr) return <span className="text-slate-400">N/A</span>;
                 const exDate = new Date(exStr);
                 const now = new Date();
                 const diffDays = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                 let style = "text-slate-600";
                 if (diffDays < 30) style = "bg-red-100 text-red-700 rounded px-2 py-0.5";
                 else if (diffDays <= 90) style = "bg-amber-100 text-amber-700 rounded px-2 py-0.5";
                 return (
                     <div className="w-32">
                         <span className={style}>{exDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric'})}</span>
                     </div>
                 );
            }
        },
        {
            id: 'valuation',
            header: ({ column }) => <SortableHeader column={column} title="Total Value" />,
            cell: ({ row }) => {
                const batches = row.original.batches || [];
                const packSize = row.original.packSize || 1;
                let totalVal = 0;
                batches.forEach((b: any) => {
                    const effectiveQty = b.qtyStrips + (b.qtyLoose / packSize);
                    let rate = b.purchaseRate;
                    if (valuationMode === 'LANDING') rate = b.landingRate || b.purchaseRate;
                    else if (valuationMode === 'MRP') rate = b.mrp;
                    totalVal += (effectiveQty * rate);
                });
                return (
                    <div className="w-24 text-right text-sm font-semibold text-slate-700">
                        {formatCurrency(totalVal)}
                    </div>
                );
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <div className="w-36 flex gap-1">
                     <Button variant="outline" size="sm" onClick={() => onProductClick(row.original)} title="View batches">
                         <Eye className="w-3 h-3" />
                     </Button>
                     <PermissionGate permission="manage_products">
                         <Button
                             variant="outline"
                             size="sm"
                             onClick={() => onEditClick?.(row.original)}
                             title="Edit product details"
                             className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                         >
                             <Pencil className="w-3 h-3" />
                         </Button>
                     </PermissionGate>
                     <PermissionGate permission="manage_staff">
                         <Button variant="outline" size="sm" onClick={() => {
                             if(row.original.batches.length > 0)
                                 onAdjustClick(row.original.batches[0])
                         }} title="Adjust stock">
                             <SlidersHorizontal className="w-3 h-3" />
                         </Button>
                     </PermissionGate>
                </div>
            )
        }
    ];

    if (quickEditCol && quickEditCol !== 'none') {
        columns.splice(2, 0, {
            id: 'quickEdit',
            accessorFn: (row: any) => row[quickEditCol],
            header: colMap[quickEditCol] || quickEditCol,
            cell: ({ row }) => (
                <InlineEditCell 
                    product={row.original} 
                    field={quickEditCol as keyof MasterProduct} 
                    onSave={async (val) => {
                        try {
                            await handleQuickSave(row.original.id, quickEditCol, val);
                            toast({ title: "Updated", description: `${colMap[quickEditCol]} updated successfully.` });
                        } catch (e: any) {
                            toast({ variant: 'destructive', title: "Error", description: e.detail || "Failed to update" });
                            throw e;
                        }
                    }} 
                />
            )
        });
    }

    const table = useReactTable({
        data: tableData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        onSortingChange,
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        onExpandedChange: setExpanded,
        getRowCanExpand: (row) => row.original.batches?.length > 0,
        state: { sorting, expanded }
    });

    const hasFilters = filters.search || (filters.scheduleType && filters.scheduleType !== 'all');

    return (
        <div className="space-y-4" ref={topRef}>
             <div className="flex gap-3 flex-wrap items-center">
                 <div className="relative w-full md:w-64">
                     <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                     <Input 
                         placeholder="Search medicine, salt, brand..." 
                         className="pl-9"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                     />
                 </div>
                 
                 <Select value={filters.scheduleType || 'all'} onValueChange={(v) => setFilter('schedule', v)}>
                      <SelectTrigger className="w-36">
                          <SelectValue placeholder="Schedule" />
                      </SelectTrigger>
                      <SelectContent>
                           <SelectItem value="all">All Types</SelectItem>
                           {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                               <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                           ))}
                      </SelectContent>
                 </Select>

                 <Select value={quickEditCol || 'none'} onValueChange={setQuickEditCol}>
                      <SelectTrigger className="w-40 bg-indigo-50 border-indigo-200 text-indigo-700 font-medium">
                          <SelectValue placeholder="Quick Edit" />
                      </SelectTrigger>
                      <SelectContent>
                           <SelectItem value="none">Quick Edit: Off</SelectItem>
                           <SelectItem value="gstRate">GST Rate (%)</SelectItem>
                           <SelectItem value="hsnCode">HSN Code</SelectItem>
                           <SelectItem value="scheduleType">Schedule Type</SelectItem>
                           <SelectItem value="packType">Pack Type</SelectItem>
                           <SelectItem value="packSize">Pack Size</SelectItem>
                           <SelectItem value="packUnit">Unit Name</SelectItem>
                      </SelectContent>
                 </Select>

                 {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); clearFilters(); }} className="text-sm text-muted-foreground hover:text-slate-900">
                          Clear filters x
                      </Button>
                 )}
             </div>

              <div className="bg-white border rounded-xl overflow-hidden">
                  <Table>
                      <TableHeader className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                           {table.getHeaderGroups().map(hg => (
                               <TableRow key={hg.id}>
                                   {hg.headers.map(h => (
                                       <TableHead key={h.id}>
                                           {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                                       </TableHead>
                                   ))}
                               </TableRow>
                           ))}
                      </TableHeader>
                      <TableBody>
                           {isLoading && page === 1 ? (
                                Array(8).fill(null).map((_, i) => (
                                    <TableRow key={i}>
                                         <TableCell colSpan={7}>
                                              <Skeleton className="h-8 w-full" />
                                         </TableCell>
                                    </TableRow>
                                ))
                           ) : table.getRowModel().rows.length > 0 ? (
                                table.getRowModel().rows.map(row => (
                                    <React.Fragment key={row.id}>
                                        <TableRow className="hover:bg-slate-50 transition-colors even:bg-slate-50/50">
                                            {row.getVisibleCells().map(cell => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                        {row.getIsExpanded() && (
                                            <TableRow>
                                                <TableCell colSpan={row.getVisibleCells().length} className="p-0 border-b-2 border-indigo-100">
                                                    <div className="bg-slate-50 p-4 shadow-inner border-l-4 border-indigo-500 inset-0">
                                                        <table className="w-full text-sm">
                                                            <thead className="text-left text-slate-500 font-semibold border-b border-slate-200">
                                                                <tr>
                                                                    <th className="pb-2">Batch No</th>
                                                                    <th className="pb-2">Qty (Strips / Loose)</th>
                                                                    <th className="pb-2">Expiry Date</th>
                                                                    <th className="pb-2">Landing Rate</th>
                                                                    <th className="pb-2">MRP</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {row.original.batches.map((batch: Batch) => (
                                                                    <tr key={batch.id || batch.batchNo} className="border-b border-slate-200/60 last:border-0 text-slate-700">
                                                                        <td className="py-2">{batch.batchNo}</td>
                                                                        <td className="py-2">{batch.qtyStrips} / {batch.qtyLoose}</td>
                                                                        <td className="py-2">{new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric'})}</td>
                                                                        <td className="py-2">{formatCurrency(batch.landingRate || batch.purchaseRate)}</td>
                                                                        <td className="py-2">{formatCurrency(batch.mrp)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                ))
                           ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-64 text-center">
                                         <div className="flex flex-col items-center justify-center text-slate-500">
                                             <PackageSearch className="w-16 h-16 text-slate-200 mb-4" />
                                             <p className="text-lg font-medium text-slate-900">No products found</p>
                                             <p className="text-sm">Try adjusting your search or filters</p>
                                             {hasFilters && (
                                                  <Button variant="outline" className="mt-4" onClick={() => { setSearchTerm(''); clearFilters(); }}>Clear filters</Button>
                                             )}
                                         </div>
                                    </TableCell>
                                </TableRow>
                           )}
                      </TableBody>
                  </Table>
              </div>
             
             {/* Pagination Footer */}
             {tableData.length > 0 && (
                 <div className="flex items-center justify-between px-4 py-4 border-t border-slate-200">
                     <div className="flex items-center text-sm text-slate-500">
                         Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalRecords)} of {totalRecords} entries
                     </div>
                     <div className="flex items-center space-x-4">
                         <div className="flex items-center space-x-2">
                             <span className="text-sm text-slate-500">Rows per page</span>
                             <Select 
                                 value={pageSize.toString()} 
                                 onValueChange={(val) => {
                                     setPageSize(Number(val));
                                     setPage(1);
                                 }}
                             >
                                 <SelectTrigger className="h-8 w-[70px]">
                                     <SelectValue placeholder="50" />
                                 </SelectTrigger>
                                 <SelectContent>
                                     <SelectItem value="50">50</SelectItem>
                                     <SelectItem value="100">100</SelectItem>
                                     <SelectItem value="250">250</SelectItem>
                                 </SelectContent>
                             </Select>
                         </div>
                         <div className="flex space-x-2">
                             <Button 
                                 variant="outline" 
                                 size="sm" 
                                 onClick={() => setPage(p => Math.max(1, p - 1))}
                                 disabled={page === 1 || isFetching}
                             >
                                 Previous
                             </Button>
                             <div className="flex items-center justify-center px-2 text-sm font-medium">
                                 Page {page} of {totalPages}
                             </div>
                             <Button 
                                 variant="outline" 
                                 size="sm" 
                                 onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                 disabled={page >= totalPages || isFetching}
                             >
                                 Next
                             </Button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
}

function SortableHeader({ column, title }: any) {
     return (
          <Button variant="ghost" className="-ml-4 h-8 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
               {title}
               {column.getIsSorted() === 'asc' ? <ChevronUp className="w-3 h-3 ml-2" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="w-3 h-3 ml-2" /> : null}
          </Button>
     );
}

function InlineEditCell({ product, field, onSave }: { product: any, field: keyof MasterProduct, onSave: (val: any) => Promise<void> }) {
    const propValue = product[field];
    const [value, setValue] = useState<any>(propValue ?? '');
    const [isSaving, setIsSaving] = useState(false);
    
    useEffect(() => {
        setValue(propValue ?? '');
    }, [propValue, field]);

    // saveValue receives the value directly — bypasses stale closure bug with setState
    const saveValue = async (val: any) => {
        let finalVal = val;
        if (field === 'gstRate' || field === 'packSize') {
            finalVal = Number(val);
            if (isNaN(finalVal)) return;
        }
        setIsSaving(true);
        try {
            await onSave(finalVal);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = () => saveValue(value);

    const isSelect = field === 'packType' || field === 'scheduleType' || field === 'packUnit';
    
    return (
        <div className="flex items-center gap-1 w-40 relative group">
            {isSelect ? (
                field === 'packType' ? (
                    <Select value={value as string} onValueChange={(v) => { setValue(v); saveValue(v); }}>
                        <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="strip">Strip</SelectItem>
                            <SelectItem value="bottle">Bottle</SelectItem>
                            <SelectItem value="tube">Tube</SelectItem>
                            <SelectItem value="box">Box</SelectItem>
                            <SelectItem value="piece">Piece</SelectItem>
                            <SelectItem value="pack">Pack</SelectItem>
                            <SelectItem value="vial">Vial</SelectItem>
                            <SelectItem value="ampoule">Ampoule</SelectItem>
                        </SelectContent>
                    </Select>
                ) : field === 'packUnit' ? (
                    <Select value={value as string} onValueChange={(v) => { setValue(v); saveValue(v); }}>
                        <SelectTrigger className="h-8 text-xs font-bold bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="tablet">Tablet</SelectItem>
                            <SelectItem value="capsule">Capsule</SelectItem>
                            <SelectItem value="piece">Piece</SelectItem>
                            <SelectItem value="ml">ml</SelectItem>
                            <SelectItem value="gm">gm</SelectItem>
                            <SelectItem value="mg">mg</SelectItem>
                            <SelectItem value="drop">Drop</SelectItem>
                            <SelectItem value="suppository">Suppository</SelectItem>
                            <SelectItem value="injection">Injection</SelectItem>
                            <SelectItem value="patch">Patch</SelectItem>
                            <SelectItem value="inhaler">Inhaler</SelectItem>
                            <SelectItem value="spray">Spray</SelectItem>
                        </SelectContent>
                    </Select>
                ) : (
                    <Select value={value as string} onValueChange={(v) => { setValue(v); saveValue(v); }}>
                        <SelectTrigger className="h-8 text-xs font-bold bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="OTC">OTC</SelectItem>
                            <SelectItem value="G">Schedule G</SelectItem>
                            <SelectItem value="H">Schedule H</SelectItem>
                            <SelectItem value="H1">Schedule H1</SelectItem>
                            <SelectItem value="X">Schedule X</SelectItem>
                            <SelectItem value="C">Schedule C</SelectItem>
                            <SelectItem value="Narcotic">Narcotic</SelectItem>
                            <SelectItem value="Ayurvedic">Ayurvedic</SelectItem>
                            <SelectItem value="Surgical">Surgical</SelectItem>
                            <SelectItem value="Cosmetic">Cosmetic</SelectItem>
                            <SelectItem value="Veterinary">Veterinary</SelectItem>
                        </SelectContent>
                    </Select>
                )
            ) : (
                <Input 
                    type={field === 'gstRate' || field === 'packSize' ? 'number' : 'text'}
                    className="h-8 text-xs px-2 bg-white font-bold"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
            )}
            {!isSelect && (
                <Button 
                    size="sm" 
                    variant="ghost" 
                    className={`h-8 w-8 p-0 shrink-0 ${String(value) !== String(product[field]) ? 'text-indigo-600 bg-indigo-50 opacity-100' : 'text-slate-300 opacity-0'} transition-opacity group-hover:opacity-100 focus-within:opacity-100`}
                    onClick={handleSave}
                    disabled={isSaving || String(value) === String(product[field])}
                    title="Save (or press Enter)"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
            )}
        </div>
    );
}
