'use client';

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CustomerStatCards from '@/components/customers/CustomerStatCards';
import CustomerFiltersBar from '@/components/customers/CustomerFiltersBar';
import CustomerTable from '@/components/customers/CustomerTable';
import CustomerGrid from '@/components/customers/CustomerGrid';
import CustomerForm from '@/components/customers/CustomerForm';
import RefillAlertsBanner from '@/components/customers/RefillAlertsBanner';
import { useCustomerSummary } from '@/hooks/useCustomers';
import { useDebounce } from '@/hooks/useDebounce';
import { Customer, CustomerFull, CustomerFilters } from '@/types';

const SEARCH_DELAY_MS = 300;

export default function CustomersPage() {
    // ── filter state ──────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'chronic' | 'outstanding'>('all');
    const [sortBy, setSortBy] = useState('name');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [refillExpanded, setRefillExpanded] = useState(false);

    // ── form sheet state ──────────────────────────────────────────────────────
    const [formOpen, setFormOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

    // ── counts for filter bar: one small request (it was three full lists of customers) ──
    const { data: summary } = useCustomerSummary();

    // the box shows every key at once; the list is asked for only once typing pauses (it was one request per key)
    const settledSearch = useDebounce(searchQuery.trim(), SEARCH_DELAY_MS);

    // ── build filters object ──────────────────────────────────────────────────
    const filters: CustomerFilters = {
        search: settledSearch || undefined,
        isChronic: activeFilter === 'chronic' ? true : undefined,
        hasOutstanding: activeFilter === 'outstanding' ? true : undefined,
        sortBy: sortBy as CustomerFilters['sortBy'],
    };

    // ── handlers ──────────────────────────────────────────────────────────────
    const handleAddCustomer = useCallback(() => {
        setEditingCustomer(null);
        setFormOpen(true);
    }, []);

    const handleEditCustomer = useCallback((customer: CustomerFull) => {
        setEditingCustomer(customer as Customer);
        setFormOpen(true);
    }, []);

    const handleFormClose = useCallback(() => {
        setFormOpen(false);
        setEditingCustomer(null);
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage patient profiles and purchase history
                    </p>
                </div>
                <Button onClick={handleAddCustomer} className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Customer
                </Button>
            </div>

            {/* Refill alerts banner */}
            <RefillAlertsBanner isExpanded={refillExpanded} onToggle={() => setRefillExpanded((v) => !v)} />

            {/* Stat cards */}
            <CustomerStatCards
                onFilterChronic={() => setActiveFilter('chronic')}
                onFilterOutstanding={() => setActiveFilter('outstanding')}
            />

            {/* Filters */}
            <CustomerFiltersBar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                sortBy={sortBy}
                onSortChange={setSortBy}
                totalCount={summary?.totalCustomers}
                chronicCount={summary?.chronicCount}
                outstandingCount={summary?.withDuesCount}
            />

            {/* List / Grid */}
            {viewMode === 'list' ? (
                <CustomerTable filters={filters} onEdit={handleEditCustomer} />
            ) : (
                <CustomerGrid filters={filters} onEdit={handleEditCustomer} />
            )}

            {/* Add / Edit form sheet */}
            <CustomerForm
                open={formOpen}
                onClose={handleFormClose}
                customer={editingCustomer}
            />
        </div>
    );
}
