# Payment Method Filter Implementation Report

## 1. Overview
We have designed, planned, and implemented a multi-faceted **Payment Method Filter** for the Sales Invoices page (`/dashboard/sales`).

Pharmacists, cashiers, and accountants can now instantly filter bills by:
- **All Payments** (Default)
- **💵 Cash** (Filters bills with cash payment or cash tender)
- **📱 UPI** (Filters bills with UPI payment)
- **💳 Card** (Filters bills with card payment)
- **🏷️ Credit** (Filters bills with credit given)
- **🔀 Split** (Filters multi-tender split bills)
- **🏛️ Bank Transfer** (Filters bank transfers)
- **📝 Cheque** (Filters cheque payments)

---

## 2. Core Architectural Features

### 1. Dual Control Surface (Toolbar + Interactive Breakdown Cards)
- **Toolbar Dropdown:** Positioned between the Search bar and Sort dropdown, allowing direct selection of any payment mode.
- **Interactive Breakdown Cards:** Clicking any of the 4 cards in the *Payment Mode Breakdown* section (**Cash**, **UPI**, **Card**, **Credit**) instantly toggles that filter on the table! Clicking an active card clears the filter back to "All".
- **Active Filter Indicator:** An active filter chip appears with a quick "✕" button to clear the filter.

### 2. URL-Driven State Sync
- Reads and updates `?paymentMode=<mode>` using Next.js `useRouter`, `useSearchParams`, and `usePathname` with `{ scroll: false }`.
- Preserves existing search, date range, and sort query parameters across state updates.

### 3. Split Payment Subtext in Table
- For bills marked with the `SPLIT` badge, the table dynamically displays the exact constituent tenders below the badge (e.g. `Cash + UPI`), giving accountants immediate insight into how the bill was settled.

---

## 3. Backend Implementation (`SaleListView` in `apps/backend/apps/billing/views.py`)

The endpoint accepts `?paymentMode=<value>` or `?payment_mode=<value>`:

```python
# ── Optional payment mode filter ─────────────────────────────────────
payment_mode_param = request.query_params.get('paymentMode') or request.query_params.get('payment_mode')
if payment_mode_param and payment_mode_param.strip().lower() not in ['all', '']:
    pm = payment_mode_param.strip().lower()
    from django.db.models import Q
    if pm == 'cash':
        invoices = invoices.filter(
            Q(payment_mode__iexact='cash') | Q(cash_paid__gt=0) | Q(payments__method__iexact='cash')
        ).distinct()
    elif pm == 'upi':
        invoices = invoices.filter(
            Q(payment_mode__iexact='upi') | Q(upi_paid__gt=0) | Q(payments__method__iexact='upi')
        ).distinct()
    elif pm == 'card':
        invoices = invoices.filter(
            Q(payment_mode__iexact='card') | Q(card_paid__gt=0) | Q(payments__method__iexact='card')
        ).distinct()
    elif pm == 'credit':
        invoices = invoices.filter(
            Q(payment_mode__iexact='credit') | Q(credit_given__gt=0) | Q(payments__method__iexact='credit')
        ).distinct()
    elif pm == 'split':
        invoices = invoices.filter(payment_mode__iexact='split')
    else:
        invoices = invoices.filter(
            Q(payment_mode__iexact=pm) | Q(payments__method__iexact=pm)
        ).distinct()
```

---

## 4. Test Verification

1. **Backend Tests (`test_sales_payment_filter.py` & `test_sales_omni_search.py`):**
   - Pure cash and split cash matching -> **Passed**
   - Pure UPI and split UPI matching -> **Passed**
   - Split mode isolation -> **Passed**
   - Credit mode isolation -> **Passed**
   - Full 13/13 test suite -> **Passed**.
2. **Frontend Tests:**
   - 22/22 unit tests passing cleanly.
