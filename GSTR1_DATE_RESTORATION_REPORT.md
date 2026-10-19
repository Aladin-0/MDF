# GSTR-1 DATE PICKER RESTORATION REPORT

**Executive Summary:**
The custom Date Range Picker on the GSTR-1 Management screen was successfully audited, restored, and aligned with both the frontend month pills and backend query filters. The system now enforces a synchronized state architecture where the Date Range (`fromDate`, `toDate`) serves as the single source of truth for dashboard data fetching, while preserving bi-directional synchronization with the Month Pills and official GST offline export requirements.

---

## 1. THE AUDIT RESULT

### Git History Discovery
Through deep git log inspection across commits touching `apps/frontend/app/gst/gstr1/page.tsx`, `apps/frontend/components/gst/ReportFilterRibbon.tsx`, and `apps/backend/apps/gst/views.py`:

- **Commit `7d7875d` ("Fix GST snapshot timezone bug, sync script, and sales list items count"):**
  - Updated `GSTR1InvoicesView` to shift from a URL-based period (`GET /gst/periods/<fp>/gstr1-invoices/`) to query parameters (`start` and `end`).
  - `apps/frontend/app/gst/gstr1/page.tsx` was wired to accept `(start: string, end: string)` in `loadDashboardData`.
- **Commit `ca4889b` ("feat(gst): update GST period selector, add ITC status column in reconciliation, and improve excel export"):**
  - In `apps/frontend/components/gst/ReportFilterRibbon.tsx`, manual date range inputs (`<input type="date">` for `fromDate` and `toDate`) were completely removed and replaced with `<GSTPeriodSelector />` (Month Pills).
  - In `apps/frontend/app/gst/gstr1/page.tsx`, `handleSearch` was updated to accept `period: string`, with commented-out notes:
    ```tsx
    // Convert period MMYYYY to start/end dates for the backend if getSummary expects dates
    // Actually, let's see what loadDashboardData expects.
    // It expects start and end strings. But GST backend now uses period.
    // Let's pass the first and last day of the month as strings just in case...
    ```
  - This refactor removed user control over custom date ranges and broke the synchronization between calendar dates and the month pills.

### Component Sourcing
- The shared date picker component was located at `apps/frontend/components/ui/date-range-picker.tsx` (exporting `DatePickerWithRange` using Shadcn `Popover`, `Calendar`, and `react-day-picker`).
- We hardened `components/ui/date-range-picker.tsx` by exporting the alias `export const DateRangePicker = DatePickerWithRange;` and adding `buttonClassName` with compact toolbar styling (`h-8 text-xs sm:text-sm`).
- We injected this component into `ReportFilterRibbon.tsx` directly between the Month Pills (`<GSTPeriodSelector />`) and the Report Type dropdown.

---

## 2. STATE LOGIC & SYNCHRONIZATION

### Single Source of Truth (`fromDate`, `toDate`)
In `apps/frontend/app/gst/gstr1/page.tsx`, the primary state is `dateRange: DateRange | undefined`. All API queries derive from `fromDate` and `toDate`.

```tsx
// Single Source of Truth
const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
});

const fromDate = useMemo(() => {
    return dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
}, [dateRange?.from]);

const toDate = useMemo(() => {
    return dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
}, [dateRange?.to]);
```

### Month Pill Click Handler
When a user clicks a Month Pill (e.g., "Sep 2026" representing `"092026"`), the handler programmatically sets the Date Range state to the exact start and end of that calendar month:

```tsx
const handleSelectMonthPill = useCallback((period: string) => {
    if (!period || period.length !== 6) return;
    const month = parseInt(period.substring(0, 2), 10) - 1; // 0-indexed month
    const year = parseInt(period.substring(2, 6), 10);
    if (!isNaN(month) && !isNaN(year)) {
        const from = new Date(year, month, 1);       // e.g., Sept 1, 2026
        const to = new Date(year, month + 1, 0);     // e.g., Sept 30, 2026
        setDateRange({ from, to });
        setSelectedPeriod(period);
    }
}, [setSelectedPeriod]);
```

### Custom Date Range & Visual Un-highlighting
When the user picks custom dates via the calendar popover (e.g., Sept 10 to Sept 20), `activePeriod` detects whether the selected range matches a full single calendar month:

```tsx
const activePeriod = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;
    const from = dateRange.from;
    const to = dateRange.to;

    // Must start on the 1st of the month
    if (from.getDate() !== 1) return null;

    // Must end on the last day of the same month and year
    const lastDayOfMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    if (
        from.getFullYear() === to.getFullYear() &&
        from.getMonth() === to.getMonth() &&
        to.getDate() === lastDayOfMonth
    ) {
        const mm = String(from.getMonth() + 1).padStart(2, '0');
        const yyyy = from.getFullYear();
        return `${mm}${yyyy}`;
    }

    // Custom date range: un-highlight all month pills
    return null;
}, [dateRange]);
```

In `GSTPeriodSelector.tsx`:
```tsx
const isSelected = Boolean(activePeriod && periodValue === activePeriod);
```
If `activePeriod` is `null`, `isSelected` evaluates to `false` across all pills, visually un-highlighting them to communicate custom state.

---

## 3. BACKEND VERIFICATION & QUERYSET FILTERING

### Safe Query Parameter Extraction
In `apps/backend/apps/gst/views.py` (`GSTR1InvoicesView`), parameters are extracted safely with multi-variant fallbacks:

```python
start_date = (
    request.query_params.get('start_date') or 
    request.query_params.get('start') or 
    request.query_params.get('from')
)
end_date = (
    request.query_params.get('end_date') or 
    request.query_params.get('end') or 
    request.query_params.get('to')
)
```

### Underlying `SaleInvoice` Queryset Filtering
The underlying `SaleInvoice` queryset is filtered directly using `invoice_date__gte` and `invoice_date__lte`:

```python
filter_kwargs = {
    'outlet': outlet,
    'is_return': False,
}
if start_date:
    start_val = start_date if (' ' in str(start_date) or 'T' in str(start_date)) else f"{start_date} 00:00:00"
    filter_kwargs['invoice_date__gte'] = start_val
if end_date:
    end_val = end_date if (' ' in str(end_date) or 'T' in str(end_date)) else f"{end_date} 23:59:59"
    filter_kwargs['invoice_date__lte'] = end_val

sale_invoices = SaleInvoice.objects.filter(**filter_kwargs).select_related('customer').order_by('-invoice_date', 'invoice_no')
```

### GST Totals Calculation
Totals (`taxable_value`, `igst`, `cgst`, `sgst`, `total`) are calculated directly from the filtered invoices, respecting `report_type` (`b2b` vs `b2c`) and `tax_filter` (`with_gst` vs `without_gst`). If no direct `SaleInvoice` objects exist (e.g. mock test environments), the view automatically falls back to `GSTTransactionSnapshot` filtering (`document_date__gte`, `document_date__lte`).

### Test Suite Verification
A dedicated automated test suite was created in `apps/backend/apps/gst/tests/test_gstr1_invoices_view.py`:
- `test_gstr1_invoices_view_date_filtering_and_totals`: **PASSED [100%]**
  - Confirms date range isolation (invoices within Sept 1-30 returned; Aug and Oct excluded)
  - Confirms math accuracy: `taxable_value = 1000.0`, `cgst = 60.0`, `sgst = 60.0`, `total = 1120.0`
  - Confirms B2B/B2C segregation and `with_gst` tax filters
- `test_gstr1_invoices_view_snapshot_fallback`: **PASSED [100%]**
  - Confirms seamless fallback behavior for sandbox snapshots
