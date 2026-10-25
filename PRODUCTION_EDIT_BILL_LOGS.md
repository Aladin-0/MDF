# PRODUCTION EDIT BILL LOGS AUDIT

**Target Container:** `mediflow_backend` (Image: `mediflow-backend`, Container ID: `d816be6077ab`)  
**Host IP:** `72.61.246.159`  
**Timestamp of Extraction:** 2026-10-25 13:30:00+05:30  

---

## 1. Raw Docker Logs

### A. All Bill Modification (`/revise/`) Requests Recorded on Live Container
```log
172.19.0.4 - - [25/Oct/2026:02:47:59 +0530] "POST /api/v1/sales/93a336e1-9b2d-449d-908b-473f3e8bcfcb/revise/ HTTP/1.1" 200 1178 "https://manavatapharma.in/billing" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:04:52 +0530] "POST /api/v1/sales/9ae2c690-4527-43bd-bcfc-3158e392c556/revise/ HTTP/1.1" 200 1176 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:07:28 +0530] "POST /api/v1/sales/ed4677a3-4603-4c78-b5b9-b382f14c4e1d/revise/ HTTP/1.1" 200 1141 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:26 +0530] "POST /api/v1/sales/90cf85fd-51d7-4bcf-8c78-37a8931aa3a3/revise/ HTTP/1.1" 200 1136 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
```

---

### B. Detailed Workflow Logs Around Invoice Modification `90cf85fd-51d7-4bcf-8c78-37a8931aa3a3` (INV-2026-001102)
```log
172.19.0.4 - - [25/Oct/2026:13:14:07 +0530] "GET /api/v1/sales/90cf85fd-51d7-4bcf-8c78-37a8931aa3a3/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 1149 "https://manavatapharma.in/dashboard/sales" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:09 +0530] "GET /api/v1/auth/me/ HTTP/1.1" 200 766 "https://manavatapharma.in/billing?edit=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:09 +0530] "GET /api/v1/sales/drafts/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 9350 "https://manavatapharma.in/billing?edit=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:10 +0530] "GET /api/v1/sales/90cf85fd-51d7-4bcf-8c78-37a8931aa3a3/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 1155 "https://manavatapharma.in/billing?edit=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:12 +0530] "POST /api/v1/sales/drafts/ HTTP/1.1" 201 424 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:15 +0530] "PUT /api/v1/sales/drafts/411c80a0-ee6b-4307-8ff9-f51333f7ecf4/ HTTP/1.1" 200 444 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:26 +0530] "POST /api/v1/sales/90cf85fd-51d7-4bcf-8c78-37a8931aa3a3/revise/ HTTP/1.1" 200 1136 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:27 +0530] "GET /api/v1/attendance/today/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 505 "https://manavatapharma.in/dashboard/sales?highlight=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:27 +0530] "GET /api/v1/auth/me/ HTTP/1.1" 200 753 "https://manavatapharma.in/dashboard/sales?highlight=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:27 +0530] "GET /api/v1/attendance/today/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 415 "https://manavatapharma.in/dashboard/sales?highlight=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:14:27 +0530] "GET /api/v1/sales/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67&page=1&pageSize=10&startDate=2026-10-25&endDate=2026-10-25&ordering=-invoice_date HTTP/1.1" 200 1798 "https://manavatapharma.in/dashboard/sales?highlight=90cf85fd-51d7-4bcf-8c78-37a8931aa3a3" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
```

---

### C. Detailed Workflow Logs Around Invoice Modification `ed4677a3-4603-4c78-b5b9-b382f14c4e1d` (INV-2026-001153)
```log
172.19.0.4 - - [25/Oct/2026:13:06:08 +0530] "POST /api/v1/sales/drafts/ HTTP/1.1" 201 497 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:06:22 +0530] "GET /api/v1/products/search/?q=COFSILS%20DROPS%201&outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67&context=billing HTTP/1.1" 200 612 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:06:39 +0530] "PUT /api/v1/sales/drafts/d87e2618-6b57-440c-aa25-c84cf06087b3/ HTTP/1.1" 200 461 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:06:51 +0530] "PUT /api/v1/sales/drafts/d87e2618-6b57-440c-aa25-c84cf06087b3/ HTTP/1.1" 200 427 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:07:28 +0530] "POST /api/v1/sales/ed4677a3-4603-4c78-b5b9-b382f14c4e1d/revise/ HTTP/1.1" 200 1141 "https://manavatapharma.in/billing" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:07:29 +0530] "GET /api/v1/auth/me/ HTTP/1.1" 200 732 "https://manavatapharma.in/dashboard/sales?highlight=ed4677a3-4603-4c78-b5b9-b382f14c4e1d" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:07:29 +0530] "GET /api/v1/attendance/today/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 419 "https://manavatapharma.in/dashboard/sales?highlight=ed4677a3-4603-4c78-b5b9-b382f14c4e1d" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:07:29 +0530] "GET /api/v1/attendance/today/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 463 "https://manavatapharma.in/dashboard/sales?highlight=ed4677a3-4603-4c78-b5b9-b382f14c4e1d" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
172.19.0.4 - - [25/Oct/2026:13:07:29 +0530] "GET /api/v1/sales/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67&page=1&pageSize=10&startDate=2026-10-25&endDate=2026-10-25&ordering=-invoice_date HTTP/1.1" 200 1755 "https://manavatapharma.in/dashboard/sales?highlight=ed4677a3-4603-4c78-b5b9-b382f14c4e1d" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
```

---

### D. Exceptions / Tracebacks in Container (Audit of 500 Responses)
*Note: Full container grep for `Traceback` shows 5 occurrences, all belonging to sales return import errors from Oct 24, and none from the bill revision endpoint.*
```log
Error creating sales return: cannot import name 'Product' from 'apps.inventory.models' (/app/apps/inventory/models.py)
Traceback (most recent call last):
  File "/app/apps/billing/views.py", line 3815, in post
    sales_return = create_sales_return(request.data, outlet_id, created_by_id)
  File "/usr/local/lib/python3.10/contextlib.py", line 79, in inner
    return func(*args, **kwds)
  File "/app/apps/billing/payment_services.py", line 377, in create_sales_return
    from apps.inventory.models import Product
ImportError: cannot import name 'Product' from 'apps.inventory.models' (/app/apps/inventory/models.py)
172.19.0.4 - - [24/Oct/2026:21:55:30 +0530] "POST /api/v1/sales/return/ HTTP/1.1" 500 137 "https://manavatapharma.in/dashboard/accounts/sale-returns/new" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
```

---

## 2. Brief Analysis

### Which Endpoint Was Hit?
- **Endpoint:** `POST /api/v1/sales/<uuid>/revise/`  
  (Defined in `apps/backend/apps/billing/urls.py` as `SaleReviseView`, invoking `atomic_sale_update` from `apps/backend/apps/billing/sale_update_service.py`).
- **HTTP Status Code Returned:** **`HTTP 200 OK`** (with length 1136–1178 bytes).

### Did the Django Backend Throw an Error?
- **No exception or rollback occurred.** The backend did not throw `HTTP 400`, `HTTP 500`, or a `ValidationError`.
- All database operations in `atomic_sale_update` committed cleanly:
  1. Old journal entry was deleted and reversed.
  2. Inventory stock was restored and re-deducted.
  3. Invoice record was saved with new amounts.
  4. New `InvoicePayment` child records were created.
  5. New `JournalEntry` was successfully created and posted.

### Root Cause of the Discrepancy Observed on the Daily Sales Ledger:
- In production, when bills from yesterday (e.g. `INV-2026-001102` originally billed on **2026-10-24 20:59:00**) were edited today (2026-10-25), `atomic_sale_update` preserved the original `invoice_date` (`2026-10-24`).
- The new `JournalEntry` and `SaleInvoice` were posted with `date=2026-10-24`.
- Consequently:
  - If a daily ledger / cash report query looks at **today's (2026-10-25)** ledger or daily sales report (`/dashboard/daily/?date=2026-10-25` or `/reports/daily-snapshot/?startDate=2026-10-25`), it filters strictly on `invoice_date=2026-10-25`.
  - The revised amount is saved under `2026-10-24` ledger, meaning the modified amount never increments the `2026-10-25` sales ledger.
