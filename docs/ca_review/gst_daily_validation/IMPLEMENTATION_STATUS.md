# Implementation Status - GST Daily Validation

**Date**: 2026-08-21
**Phase**: 0 (Inspect and Baseline)

## Test Suite Execution
A full baseline run of the backend test suite (`apps.gst`, `apps.reports`, `apps.audit`, `apps.billing`, `apps.inventory`, `apps.purchases`, `apps.core`) resulted in:
- **Total Tests**: 369
- **Failures**: 17
- **Errors**: 51
- **Skipped**: 23

The current status reveals significant test breakages, particularly around authentication/permissions in `apps/audit` and `apps/reports`, and missing template integration in `apps/reports/tests/test_gst_template_integrity.py`.

## GSTR-1 and GSTR-3B Generation (Agent 5)
- **GSTR-1**: Handles HSN segregation correctly, B2B/B2C logic, and Credit/Debit Note handling (CDNR/CDNUR). The byte-safe `OOXMLInjector` is correctly in use, protecting macro-enabled templates.
- **GSTR-3B**: Draft logic integrates `ITCReconciliationResult`, `DeferredITCEntry`, `StockAdjustment`, and `Rule37Adjustment` correctly.
- **Template Status**: The official GSTR-3B utility template (`GSTR3B_Excel_Utility_V5.6.xlsm`) *exists* in the repository (`apps/backend/resources/gst_templates/`). No structural guessing is required.

## Transaction Rules & Calculations (Agent 2)
- **Calculations**: Intra/Inter-state distinction is solid. Decimal rounding prevents precision errors. Expired/Destroyed goods reverse ITC accurately, and Rule 37 180-day limits are correctly tracked.
- **Defects Identified**:
  - `is_exempt` is missing from Sale snapshots, misclassifying 0% GST items as zero-rated (Exports/SEZ).
  - Purchase Returns (Debit Notes) lack the `original_invoice_id` in their snapshot JSON payload, breaking CDNR linkage for GSTR reports.

## GSTR-2B Provider & Safety (Agent 6)
- **Safety**: `SANDBOX_PROVIDER_MODE` checks are implemented and tested against host mismatches and OTP limits. UI warning banners are active.
- **Defects Identified**:
  - `ENABLE_GST_SANDBOX_LIVE_MODE` is only checked in views (`is_sandbox_allowed`), leaving background tasks and management commands exposed if `SANDBOX_PROVIDER_MODE=live`.
  - Missing API credentials log warnings instead of failing fast.

## Security and Isolation (Agent 7)
- **Defects Identified**:
  - `apps/reports/dashboard_views.py` explicitly strips authentication (`authentication_classes = []`) and mocks access to `Outlet.objects.first()`. This exposes sensitive data unauthenticated.
  - Export views use a flawed `getattr(request.user, 'outlet', Outlet.objects.first())` fallback, risking cross-outlet leakage.
  - Sandbox logs leak the raw JSON response payload (potentially containing secrets) on token errors.
  - Queries for `DeferredITCEntry` in the dashboard and builders lack outlet filtering completely.

## Canonical Data & Scenarios (Agents 3 & 4)
- **Canonical Reports defined**: `REPORT_DATA_CONTRACT.md`
- **Evidence Packages defined**: `EVIDENCE_PACKAGE_SPEC.md`
- **Daily Scenarios matrix defined**: `DAILY_SCENARIO_MATRIX.md` and `EXPECTED_RESULTS.md`
