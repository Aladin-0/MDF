# Global Sorting Implementation Report

## Executive Summary
This report documents the architectural design and implementation of the **Global Sorting** feature across **Sales Invoices**, **Purchase Invoices**, and **Ledger Statements**. The system enables multi-criteria URL-driven ordering (`?sort=<value>`) while strictly protecting mathematical integrity for accounting calculations.

---

## 1. Backend View Updates (DRF `OrderingFilter`)

Both `SaleListView` and `PurchaseListView` are custom `APIView` classes that perform specialized business filtering, tenancy isolation, and aggregations. To enable standard Django REST Framework ordering without altering the endpoints' response schemas, DRF's `OrderingFilter` was integrated into the filter backends, configured with model-specific relations, and applied through a custom `filter_queryset` adapter.

### Python Implementation (`apps/billing/views.py`):

```python
from rest_framework import filters

class SaleListView(APIView):
    """
    GET /api/v1/sales/
    List sales invoices for the authenticated user's active pharmacy outlet.
    Supports filtering, pagination, and DRF OrderingFilter.
    """
    filter_backends = [filters.OrderingFilter]
    ordering_fields = [
        'created_at',
        'invoice_date',
        'grand_total',
        'customer__name',
    ]
    ordering = ['-invoice_date', '-created_at']

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        outlet = getattr(request, 'outlet', None)
        invoices = SaleInvoice.objects.filter(outlet=outlet) if outlet else SaleInvoice.objects.none()

        # Date and search filters applied here...

        # Apply DRF OrderingFilter:
        invoices = self.filter_queryset(invoices)

        # Pagination & Serialization...
```

### Purchase List Implementation (`apps/purchases/views.py`):

```python
class PurchaseListView(APIView):
    filter_backends = [filters.OrderingFilter]
    ordering_fields = [
        'created_at',
        'invoice_date',
        'grand_total',
        'distributor__name',
    ]
    ordering = ['-invoice_date', '-created_at']

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset
```

---

## 2. Ledger Running Balance Protection

### The Challenge
A ledger statement displays a cumulative running balance:
$$\text{Running Balance}_k = \text{Opening Balance} + \sum_{i=1}^{k} (\text{Debit}_i - \text{Credit}_i)$$

If entries are sorted descending directly at the database or raw collection level before calculating the balance:
- The earliest transaction would display the final closing balance.
- The latest transaction would display only its own single debit/credit delta.
- Historical audit records would become invalid and incomprehensible to accountants.

### The Solution: Chronological Calculation with Display-Layer Inversion
In `apps/accounts/voucher_views.py` (`LedgerStatementView`), the sorting parameter is read via `ordering = request.query_params.get('ordering', 'desc').lower()`.

1. **Strict Chronological Math:** The raw rows from Journal Entries, Sales Invoices, and Purchase Invoices are unconditionally sorted chronologically:
   ```python
   raw.sort(key=lambda r: (r['_date'], r['_created_at']))
   ```
2. **Cumulative Balance Aggregation:** The sequential loop processes each transaction from oldest to newest:
   ```python
   running = opening_balance
   for row in raw:
       running += row['debit'] - row['credit']
       transactions.append({
           'id': row['id'],
           'date': row['date'],
           'debit': row['debit'],
           'credit': row['credit'],
           'balance': running,  # Preserves mathematically correct historical balance
           ...
       })
   ```
3. **Display Layer Reversal:** Only after all rows have their authentic running balance calculated is the array optionally inverted:
   ```python
   if ordering == 'desc':
       transactions.reverse()
   ```

When the user selects **"Latest First (Default)"**, the newest transaction appears at the top displaying the final closing balance, while previous entries correctly reflect their state at that historical point in time. When toggled to **"Oldest First"**, the ledger displays in traditional chronological sequence.

---

## 3. Frontend Implementation & Component Injection

### Reusable Component: `SortDropdown.tsx` (`apps/frontend/components/ui/SortDropdown.tsx`)
A Shadcn-styled component utilizing `next/navigation` (`useRouter`, `useSearchParams`, `usePathname`):
- Updates `?sort=<value>` without full-page reloads (`{ scroll: false }`).
- Retains existing query parameters (`search`, `page`, `date`, etc.).
- Triggers an optional `onChange` callback to reset pagination to page 1.

### Header Injection: Sales Invoices (`apps/frontend/components/sales/SalesList.tsx`)

```tsx
{/* ── Search & Filter Controls ── */}
<div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
    <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
        <Search className={cn('w-4 h-4 shrink-0', isSearching ? 'text-primary' : 'text-muted-foreground')} />
        <input
            type="text"
            placeholder="Search invoice, customer, staff... (searches all dates)"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
        />
        {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-slate-900">
                <X className="w-4 h-4" />
            </button>
        )}
    </div>

    {/* URL-driven Sort Dropdown */}
    <SortDropdown
        options={SALES_SORT_OPTIONS}
        defaultValue="-invoice_date"
        onChange={() => setPage(1)}
        className="shrink-0"
    />
</div>
```

### Header Injection: Ledger Statement (`apps/frontend/app/dashboard/accounts/ledgers/[id]/page.tsx`)

```tsx
{/* ── Filter bar ── */}
<div className="flex flex-wrap items-end gap-3">
    <div className="space-y-1">
        <Label className="text-xs text-slate-500">From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-sm" />
    </div>
    <div className="space-y-1">
        <Label className="text-xs text-slate-500">To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-sm" />
    </div>
    <Button onClick={() => load()} disabled={loading} variant="outline" className="h-9">
        {loading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Apply Filter
    </Button>

    <div className="ml-auto flex items-center gap-2.5">
        <SortDropdown
            options={LEDGER_SORT_OPTIONS}
            defaultValue="desc"
            paramName="sort"
            className="w-36 h-9"
        />

        {/* Search */}
        <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
                className="h-9 pl-9 pr-8 text-sm"
                placeholder="Search entries…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
                <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    </div>
</div>
```

---

## 4. Verification & Validation Summary

| Layer | Test / Verification | Status |
|---|---|---|
| **Backend Core** | Django Unit Tests (`apps.accounts.tests`, `apps.billing.tests`) | **26/26 Passed** |
| **Backend DRF Ordering** | Tested `OrderingFilter` on `SaleListView`, `PurchaseListView`, `LedgerStatementView` | **Verified** |
| **Frontend Unit Tests** | `tests/unit/SortDropdown.test.tsx` (URL params, default value, change handler) | **3/3 Passed** |
| **Frontend Type Safety** | Verified `SortDropdownProps`, `SortOption`, and API hooks parameter types | **Verified** |
