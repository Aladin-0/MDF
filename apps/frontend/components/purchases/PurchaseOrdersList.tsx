'use client';

import { useState } from 'react';
import { usePurchaseOrders, useDistributors } from '@/hooks/usePurchases';
import { useDebounce } from '@/hooks/useDebounce';
import { ClipboardList, Clock, CheckCircle2, AlertCircle, Plus, Search, XCircle, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { NewPurchaseOrderModal } from './NewPurchaseOrderModal';
import { useRouter } from 'next/navigation';

export function PurchaseOrdersList() {
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);
    
    // Filter State
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [distributorId, setDistributorId] = useState('ALL');
    const [distributorOpen, setDistributorOpen] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    const { data: distributors } = useDistributors();
    
    const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
    const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';

    const { data: purchaseOrders, isLoading } = usePurchaseOrders({
        search: debouncedSearch,
        distributorId,
        startDate,
        endDate
    });
    
    const hasFilters = search !== '' || distributorId !== 'ALL' || startDate !== '' || endDate !== '';

    if (isLoading) {
        return (
            <div className="space-y-4 mt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    if (!isLoading && (!purchaseOrders || purchaseOrders.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-200 mt-4">
                <ClipboardList className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">Purchase Orders</h3>
                <p className="text-slate-500 mt-1 max-w-md">
                    Generated purchase orders will appear here. You can generate them from the Reorder Planning report.
                </p>
                {hasFilters ? (
                    <Button 
                        variant="outline" 
                        className="mt-6 text-indigo-600 border-indigo-200"
                        onClick={() => {
                            setSearch('');
                            setDistributorId('ALL');
                            setDateRange(undefined);
                        }}
                    >
                        <XCircle className="w-4 h-4 mr-2" />
                        Clear Filters
                    </Button>
                ) : (
                    <Button onClick={() => setDrawerOpen(true)} className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        New PO
                    </Button>
                )}
                <NewPurchaseOrderModal open={drawerOpen} onOpenChange={setDrawerOpen} />
            </div>
        );
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SAVED': return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200"><Clock className="w-3 h-3 mr-1" /> Saved</Badge>;
            case 'SENT': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200"><Clock className="w-3 h-3 mr-1" /> Sent</Badge>;
            case 'PARTIAL': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200"><AlertCircle className="w-3 h-3 mr-1" /> Partial</Badge>;
            case 'COMPLETED': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
            default: return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{status}</Badge>;
        }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input 
                        placeholder="Search by PO Number..." 
                        className="pl-9 bg-white w-full" 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                
                <Popover open={distributorOpen} onOpenChange={setDistributorOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={distributorOpen}
                            className="w-full md:w-[250px] justify-between bg-white font-normal"
                        >
                            {distributorId === 'ALL'
                                ? "All Distributors"
                                : distributors?.find((d: any) => d.id === distributorId)?.name || "Select Distributor..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0">
                        <Command>
                            <CommandInput placeholder="Search distributor..." />
                            <CommandList>
                                <CommandEmpty>No distributor found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem
                                        value="ALL"
                                        onSelect={() => {
                                            setDistributorId('ALL');
                                            setDistributorOpen(false);
                                        }}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", distributorId === 'ALL' ? "opacity-100" : "opacity-0")} />
                                        All Distributors
                                    </CommandItem>
                                    {distributors?.map((d: any) => (
                                        <CommandItem
                                            key={d.id}
                                            value={d.name}
                                            onSelect={() => {
                                                setDistributorId(d.id);
                                                setDistributorOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    distributorId === d.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {d.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <div className="w-full md:w-auto">
                    <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                </div>

                <Button onClick={() => setDrawerOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap w-full md:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    New PO
                </Button>
                
                <NewPurchaseOrderModal open={drawerOpen} onOpenChange={setDrawerOpen} />
            </div>

            <div className="rounded-md border bg-white overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-semibold text-slate-700">PO Number</TableHead>
                            <TableHead className="font-semibold text-slate-700">Date</TableHead>
                            <TableHead className="font-semibold text-slate-700">Distributor</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-right">Amount</TableHead>
                            <TableHead className="font-semibold text-slate-700 w-[140px]">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {purchaseOrders?.map((po: any) => (
                            <TableRow 
                                key={po.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50/50"
                                onClick={() => router.push(`/dashboard/purchases/orders/${po.id}`)}
                            >
                                <TableCell className="font-medium text-indigo-600">
                                    {po.poNumber}
                                </TableCell>
                                <TableCell className="text-slate-600">
                                    {format(new Date(po.orderDate), 'dd MMM yyyy')}
                                </TableCell>
                                <TableCell className="text-slate-700 font-medium">
                                    {po.distributorName}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-slate-700">
                                    ₹{po.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell>
                                    {getStatusBadge(po.status)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
