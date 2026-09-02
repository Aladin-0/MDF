# Gap Analysis - GST Daily Validation

This document outlines the gaps between the current implementation and a CA-ready state across various facets of the GST module.

## 1. Security & Cross-Outlet Isolation Gaps
- **High Risk**: `apps/reports/dashboard_views.py` has `authentication_classes = []` and forces data retrieval for `Outlet.objects.first()`. Unauthenticated users can view sensitive data.
- **Medium Risk**: Exporters (`gstr1_excel`, `reconciliation_excel`, `ca_working_paper`) use a fallback to `Outlet.objects.first()` if the logged-in user has no outlet. This violates strict multi-tenant isolation.
- **Medium Risk**: `DeferredITCEntry` aggregations lack `.filter(outlet=request.user.outlet)`, mingling deferred credits across all entities.
- **Low Risk**: Sandbox provider logs raw response JSON strings when access tokens are missing, risking PII exposure.

## 2. GSTR-2B Provider & Safety Gaps
- **Critical Gap**: `ENABLE_GST_SANDBOX_LIVE_MODE` is only evaluated at the view level (`is_sandbox_allowed`). Celery workers (`sync_gstr2b_job`) invoking `SandboxGstProvider` bypass this and can hit live endpoints accidentally if the environment variable is set to `live`.
- **API Initialization**: Missing API keys/secrets only emit warnings, rather than causing a hard initialization failure.
- **Outdated Tests**: Several sandbox tests still assert against the deprecated `GST_ENV` rather than the new explicit modes.

## 3. Transaction Rules & Calculation Gaps
- **Purchase Return Traceability**: Debit Notes (Purchase Returns) lack the `original_invoice_id` in their snapshot JSON payload. This breaks CDNR linkages in GSTR reports.
- **Nil-Rated / Exempt Classification**: Pharmacy sales of 0% GST items are improperly classified as zero-rated (Exports/SEZ) instead of nil-rated/exempt because the `is_exempt` check is absent from sale snapshots.

## 4. Test Suite Gaps
- The test suite has 17 failures and 51 errors. A massive portion of these relate to the object-level isolation fixes we need to implement (tests expecting 401s getting 200s, or vice versa, due to the mocked `Outlet.objects.first()`).
- Tests for template integrity are failing, indicating a mismatch between the stored GSTR-3B template and its manifest hash.

## 5. Automation & Evidence Collection Gaps
- We have the specifications for the 7-day test scenarios (`DAILY_SCENARIO_MATRIX.md`), but the Django management command/fixtures to actually populate this isolated, deterministic data are missing.
- We lack the automated `QA_EXECUTION_REPORT` pipeline to snapshot reports, generate evidence manifests, and store them immutably.
