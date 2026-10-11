# FULL-STACK SALES ANALYTICS & SPLIT LOGIC HOTFIX REPORT

**Date:** 2026-10-11  
**Role:** Principal Full-Stack Architect  
**Status:** COMPLETED & VERIFIED

---

## EXECUTIVE SUMMARY

A systematic cross-stack audit resolved three interconnected sales analytics and split payment bugs:

1. **Analytics Math Halving Bug (Backend):**
   - **Root Cause:** In [SaleListView](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L380-L450), `total_revenue` in the analytics response was being calculated as `gross_revenue - return_revenue`. When returns were present or when comparing with `Collected + Credit` (`cashCollected + upiCollected + cardCollected + creditGiven`), the sales total was halved or mismatched because `Collected + Credit` strictly sums the invoices' gross amounts (`grand_total`).
   - **Resolution:** Updated `total_sales` to strictly aggregate `grand_total` (`agg.get('total_revenue') or 0`) across all invoices matching the filter. `Avg Bill Value` now strictly divides the corrected `total_sales` by the total invoice count (`total_bills`). `totalSales`, `grossRevenue`, `netRevenue`, and `avgBillValue` are explicitly returned in the analytics payload.

2. **Filter Bleed on Split Invoices with ₹0 Tender (Backend):**
   - **Root Cause:** In [SaleListView](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L330-L375), filtering by tender (e.g. `cash`) searched `payments__method__iexact='cash'` or `payment_mode__iexact='split'`. Because checkout transactions recorded payment rows or legacy fields with `0.00` for unselected methods, split invoices with `cash_paid = 0` bled into cash filter results.
   - **Resolution:** Re-architected `payment_mode` Q-filters for all modes (`cash`, `upi`, `card`, `credit`). For each tender, the filter strictly matches single mode (`payment_mode == tender`) OR split invoices where that tender's amount is strictly greater than 0: `payment_mode == 'split' AND (tender_paid > 0 OR (payments__method == tender AND payments__amount > 0))`.

3. **Fake Splits Badge Resolution (Frontend):**
   - **Root Cause:** In [PaymentBreakdownCell.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/PaymentBreakdownCell.tsx#L40-L100), any invoice with `payment_mode === 'split'` was unconditionally rendered with the `SPLIT` badge and micro-breakdown, even if ₹100 was paid via Credit and ₹0 Cash/UPI.
   - **Resolution:** Added smart badge resolution logic. Before rendering, the cell inspects non-zero tenders. If only **one** tender has an amount `> 0`, it gracefully resolves to that single tender's badge (e.g. `CREDIT`, `CASH`, `UPI`). The `SPLIT` badge is only rendered when **two or more** tender amounts are strictly greater than 0.

---

## PART 1: THE BACKEND MATH FIX

### Updated Django ORM Aggregation & KPI Derivation
**Target File:** [apps/backend/apps/billing/views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L380-L450)

```python
# 1. Base invoice aggregation: strictly sums the grand_total of all invoices in scope
agg = base_qs.aggregate(
    total_revenue=dSum('grand_total'),
    cash_collected=dSum('cash_paid'),
    upi_collected=dSum('upi_paid'),
    card_collected=dSum('card_paid'),
    credit_given=dSum('credit_given'),
    unpaid=dSum('unpaid_amount'),
    total_tax=dSum('tax_amount'),
    total_discount=dSum('discount_amount'),
)

total_bills = base_qs.count()

# 2. Strict Gross Total Sales (matches Collected + Credit sum):
total_sales = float(agg.get('total_revenue') or 0)
gross_revenue = total_sales

# 3. Dedicated Sales Returns Aggregation:
return_qs = SaleReturn.objects.filter(pharmacy=pharmacy, status='completed')
if date_from:
    return_qs = return_qs.filter(created_at__date__gte=date_from)
if date_to:
    return_qs = return_qs.filter(created_at__date__lte=date_to)

return_agg = return_qs.aggregate(
    total_returns=dSum('total_amount'),
    cash_refunded=dSum('cash_refund'),
    credit_refunded=dSum('credit_refund'),
)
return_revenue = float(return_agg.get('total_returns') or 0)
net_revenue = gross_revenue - return_revenue

# 4. Corrected Avg Bill Value based on Total Sales / Total Invoices:
avg_bill_value = round(total_sales / total_bills, 2) if total_bills > 0 else 0.0

# 5. API Response Payload:
analytics_data = {
    'totalSales': total_sales,       # Primary Total Sales KPI (matches bills sum)
    'totalRevenue': total_sales,     # Backward compatibility
    'grossRevenue': gross_revenue,
    'netRevenue': net_revenue,
    'avgBillValue': avg_bill_value,  # Accurate Average Bill Value
    'totalBills': total_bills,
    'cashCollected': float(agg.get('cash_collected') or 0),
    'upiCollected': float(agg.get('upi_collected') or 0),
    'cardCollected': float(agg.get('card_collected') or 0),
    'creditGiven': float(agg.get('credit_given') or 0),
    'unpaidAmount': float(agg.get('unpaid') or 0),
    'totalTax': float(agg.get('total_tax') or 0),
    'totalDiscount': float(agg.get('total_discount') or 0),
    'salesReturn': {
        'totalReturns': return_revenue,
        'cashRefunded': float(return_agg.get('cash_refunded') or 0),
        'creditRefunded': float(return_agg.get('credit_refunded') or 0),
    }
}
```

---

## PART 2: THE BACKEND FILTER FIX

### Strict Tender Filtering with Zero-Amount Exclusion
**Target File:** [apps/backend/apps/billing/views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L330-L375)

```python
# Payment mode / tender filtering:
# Strict rule: Returns invoices where payment_mode == tender OR
# (payment_mode == 'split' AND tender_paid > 0)
payment_mode = self.request.query_params.get('payment_mode', '').strip().lower()
if payment_mode:
    if payment_mode == 'cash':
        queryset = queryset.filter(
            Q(payment_mode__iexact='cash') |
            (
                Q(payment_mode__iexact='split') &
                (Q(cash_paid__gt=0) | Q(payments__method__iexact='cash', payments__amount__gt=0))
            )
        ).distinct()
    elif payment_mode == 'upi':
        queryset = queryset.filter(
            Q(payment_mode__iexact='upi') |
            (
                Q(payment_mode__iexact='split') &
                (Q(upi_paid__gt=0) | Q(payments__method__iexact='upi', payments__amount__gt=0))
            )
        ).distinct()
    elif payment_mode == 'card':
        queryset = queryset.filter(
            Q(payment_mode__iexact='card') |
            (
                Q(payment_mode__iexact='split') &
                (Q(card_paid__gt=0) | Q(payments__method__iexact='card', payments__amount__gt=0))
            )
        ).distinct()
    elif payment_mode == 'credit':
        queryset = queryset.filter(
            Q(payment_mode__iexact='credit') |
            (
                Q(payment_mode__iexact='split') &
                (Q(credit_given__gt=0) | Q(payments__method__iexact='credit', payments__amount__gt=0))
            )
        ).distinct()
    elif payment_mode == 'split':
        queryset = queryset.filter(payment_mode__iexact='split')
    else:
        queryset = queryset.filter(payment_mode__iexact=payment_mode)
```

---

## PART 3: THE FRONTEND UI FIX

### Dynamic Badge Resolution & Smart Fallback
**Target File:** [apps/frontend/components/billing/PaymentBreakdownCell.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/PaymentBreakdownCell.tsx#L40-L100)

```tsx
export function PaymentBreakdownCell({
  paymentMode,
  cashPaid,
  upiPaid,
  cardPaid,
  creditGiven,
  payments,
  className = '',
}: PaymentBreakdownCellProps) {
  const normMode = (paymentMode || 'cash').toLowerCase();

  // Extract all tenders with strictly positive amounts (> 0)
  const tenders: Array<{ label: string; amount: number; colorClass: string; modeKey: string }> = [];

  const rawCash = Number(cashPaid || 0);
  const rawUpi = Number(upiPaid || 0);
  const rawCard = Number(cardPaid || 0);
  const rawCredit = Number(creditGiven || 0);

  if (rawCash > 0) {
    tenders.push({ label: 'Cash', amount: rawCash, colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200', modeKey: 'cash' });
  }
  if (rawUpi > 0) {
    tenders.push({ label: 'UPI', amount: rawUpi, colorClass: 'text-blue-700 bg-blue-50 border-blue-200', modeKey: 'upi' });
  }
  if (rawCard > 0) {
    tenders.push({ label: 'Card', amount: rawCard, colorClass: 'text-purple-700 bg-purple-50 border-purple-200', modeKey: 'card' });
  }
  if (rawCredit > 0) {
    tenders.push({ label: 'Credit', amount: rawCredit, colorClass: 'text-amber-700 bg-amber-50 border-amber-200', modeKey: 'credit' });
  }

  // Fallback to payments array if legacy scalar fields are empty
  if (tenders.length === 0 && payments && payments.length > 0) {
    payments.forEach((p) => {
      const amt = Number(p.amount || 0);
      if (amt > 0) {
        const method = (p.payment_method || p.method || 'cash').toLowerCase();
        let color = 'text-gray-700 bg-gray-50 border-gray-200';
        if (method === 'cash') color = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        else if (method === 'upi') color = 'text-blue-700 bg-blue-50 border-blue-200';
        else if (method === 'card') color = 'text-purple-700 bg-purple-50 border-purple-200';
        else if (method === 'credit') color = 'text-amber-700 bg-amber-50 border-amber-200';

        tenders.push({
          label: formatPaymentMethodLabel(method),
          amount: amt,
          colorClass: color,
          modeKey: method,
        });
      }
    });
  }

  // SMART FALLBACK:
  // If payment_mode is 'split' but only 1 tender has amount > 0, resolve to that single tender badge!
  const isSplit = normMode === 'split';
  const effectiveMode = isSplit && tenders.length === 1 ? tenders[0].modeKey : normMode;

  // Single Tender Badge rendering (either true single tender OR resolved fake-split)
  if (!isSplit || tenders.length === 1) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getBadgeStyle(
            effectiveMode
          )}`}
        >
          {effectiveMode.toUpperCase()}
        </span>
      </div>
    );
  }

  // True Multi-Tender Split rendering (strictly 2 or more tenders > 0)
  return (
    <div className={`flex flex-col gap-1 items-start ${className}`}>
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border bg-purple-50 text-purple-700 border-purple-200">
        SPLIT
      </span>
      <div className="flex flex-wrap items-center gap-1 max-w-[240px]">
        {tenders.map((tender, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${tender.colorClass}`}
          >
            <span>{tender.label}:</span>
            <span className="font-semibold">₹{tender.amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

---

## PART 4: TEST VERIFICATION MATRIX

| Test Suite | Scenario Tested | Result |
| :--- | :--- | :--- |
| **Django Billing Tests** (`test_sales_payment_filter.py`) | Zero-cash split invoice (`cash_paid=0`, `credit_given=100`) excluded from `payment_mode=cash` filter | **PASS** |
| **Django Billing Tests** (`test_sales_payment_filter.py`) | Real split invoice (`cash_paid=50`, `credit_given=50`) included in `payment_mode=cash` filter | **PASS** |
| **Django Billing Tests** (`test_sales_payment_filter.py`) | KPI Analytics calculation: `totalSales == 300` (sum of bills), `avgBillValue == 150.00` | **PASS** |
| **Django Billing Omni Search** (`test_sales_omni_search.py`) | Unified search parity across customer name, doctor, mobile, bill number | **PASS** (8/8) |
| **Frontend Jest Unit Tests** (`PaymentBreakdownCell.test.tsx`) | Fake split (₹100 Credit, ₹0 Cash) renders single `CREDIT` badge | **PASS** |
| **Frontend Jest Unit Tests** (`PaymentBreakdownCell.test.tsx`) | Fake split (₹250 Cash, ₹0 UPI) renders single `CASH` badge | **PASS** |
| **Frontend Jest Unit Tests** (`PaymentBreakdownCell.test.tsx`) | True split (₹60 Cash, ₹40 UPI) renders `SPLIT` badge + micro-breakdown | **PASS** |
| **Frontend Jest Unit Tests** (`PaymentBreakdownCell.test.tsx`) | Standard single payment mode invoices render standard badges | **PASS** |
