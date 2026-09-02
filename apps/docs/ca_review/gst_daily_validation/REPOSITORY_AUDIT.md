# GST Repository Audit Report

**Date:** 2026-08-21
**Component:** MediFlow GST Module (Backend & Frontend)
**Auditor:** Agent 1 (Repository & GST Audit Agent)

## 1. Repository Structure & GST Footprint
The GST-related functionality is distributed across the following key areas in the monorepo:

### Backend (Django)
* **`apps/gst`**: Dedicated GST app containing Celery tasks (`tasks.py`), API views for sandbox configuration, sync, and OTP workflows (`views.py`), and provider abstractions (`provider/sandbox.py`).
* **`apps/reports`**: Contains the core GST logic including:
  * `gstr_builders.py`: Payload generators for GSTR-1 and GSTR-3B.
  * `gstr2b_service.py` & `gst_snapshot_service.py`: ITC reconciliation and transaction snapshot lifecycle.
  * `dashboard_views.py`: API endpoints powering the frontend GST Dashboard.
  * `models.py`: Defines `GSTTransactionSnapshot`, `GSTR2BData`, `ITCReconciliationResult`, `DeferredITCEntry`, and `GSTExportAudit`.

### Frontend (Next.js)
* **`app/gst/`**: Next.js app router pages for GSTR-1, GSTR-3B, sandbox integration, and history logs.
* **`components/gst/`**: Modular UI components (`GSTDashboard.tsx`, `ValidationPanel.tsx`, `ReconciliationWidget.tsx`, etc.).

---

## 2. Compliance with GST Constraints

### ✅ No Direct Filing Capability (PASS)
The system complies with the strict constraint against direct automated filing:
* `apps/gst/provider/sandbox.py` explicitly raises `NotImplementedError` for both `file_gstr1` and `file_gstr3b` methods.
* There are no endpoints in `apps/gst/views.py` that trigger a filing action to the GSTN portal. The system strictly acts as an advisory, reconciliation, and export tool.

### ❌ No Cross-Outlet Leakage (FAIL - SEVERE)
We identified severe vulnerabilities where data leaks across independent pharmacy outlets:
1. **MVP Mocking bypasses Authentication and Scoping (`apps/reports/dashboard_views.py`)**:
   The views `GSTPeriodsView`, `GSTSummaryView`, `GSTReconciliationView`, and `GSTExportView` explicitly strip security mechanisms (`authentication_classes = []`, `permission_classes = []`). Furthermore, the helper function `get_current_outlet` hardcodes `# Mocking for MVP` and indiscriminately returns `Outlet.objects.first()`. This completely breaks tenant isolation, allowing anyone to view the financial data of the first outlet.
2. **Deferred ITC Data Leakage in Dashboard (`apps/reports/dashboard_views.py`)**:
   When calculating the deferred and claimed ITC totals on the dashboard (lines 187, 189), the `DeferredITCEntry.objects.filter(...)` queries are executed globally without scoping by `outlet`. This aggregates deferred ITC amounts across all outlets in the database.
3. **Deferred ITC Leakage in Payload Generation (`apps/reports/gstr_builders.py`)**:
   Inside `GSTR3BBuilder` (line 498), the query for `claimed_deferred = DeferredITCEntry.objects.filter(...)` also misses outlet/GSTIN scoping (`purchase_invoice__outlet__gstin=self.gstin`). Consequently, one outlet's GSTR-3B payload will mistakenly include claimed ITC from independent outlets.

---

## 3. Incomplete, Duplicated, or Unsafe Code

* **Unsafe Authentication Override:** The dashboard views mentioned above are the most critical safety issue. By disabling standard Django Rest Framework authentication and manually forcing `Outlet.objects.first()`, the code is highly vulnerable and unfit for production.
* **Sandbox Implementation Limits:** The GSTR-2B data fetch in `apps/gst/tasks.py` stops at page 1 statically for the sandbox environment. If a future provider utilizes standard GSTN pagination with `status_cd = 3`, the loop will prematurely terminate and miss subsequent pages.
* **Idempotency checks (Safe):** The Celery job `sync_gstr2b_job` correctly implements an idempotency check by calculating a SHA256 payload checksum. If a retrieved GSTR-2B payload matches the previously stored checksum, it skips reprocessing and flags the job as `NO_CHANGE`.

## 4. Conclusion & Recommendations
The repository implements a robust structure for data transformation and reconciliation. However, the **MVP mocking in the dashboard views and missing queryset filters on the `DeferredITCEntry` model** represent critical architectural leaks that violate multi-tenancy rules and strict GST isolation constraints.

**Immediate Action Items:**
1. Restore standard `IsAuthenticated` permission classes to all views in `dashboard_views.py`.
2. Rewrite `get_current_outlet(request)` to fetch the user's explicitly linked outlet, removing the fallback to `Outlet.objects.first()`.
3. Patch `DeferredITCEntry` queries across `dashboard_views.py` and `gstr_builders.py` to enforce outlet-level filtering (e.g., via traversing `purchase_invoice__outlet`).
