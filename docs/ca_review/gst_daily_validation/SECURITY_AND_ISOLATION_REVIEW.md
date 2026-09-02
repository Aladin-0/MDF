# Security and Outlet-Isolation Audit Report
**Date:** 2026-08-21
**Auditor:** Agent 7 (Security and Outlet-Isolation Agent)
**Scope:** GST Endpoints, Export History, Sandbox Endpoints, Import Endpoints, Celery Jobs, and Reconciliation Services.

## Executive Summary
A comprehensive security review of the MediFlow GST and reports module revealed **Critical** vulnerabilities related to broken object-level authorization (BOLA/IDOR), authentication bypass, and potential data leakage in logging. Multi-tenant data isolation is severely compromised across several endpoints.

## 1. Complete Authentication Bypass & Object-Level Authorization Failure (Critical)
**Affected Files:** `apps/backend/apps/reports/dashboard_views.py`

**Vulnerability:** 
The MVP implementation of the GST dashboard endpoints completely disables authentication and explicitly hardcodes data retrieval for the first outlet in the database.

```python
class GSTReconciliationView(APIView):
    authentication_classes = []
    permission_classes = []
    # ...

def get_current_outlet(request):
    # Mocking for MVP
    return Outlet.objects.first()
```
**Impact:** 
ANY unauthenticated external actor can query the dashboard, reconciliation, and export endpoints and extract all GST transaction data, B2B invoices, CDNR, and HSN summaries belonging to the first organization's outlet.

## 2. Insecure Fallback in Export Endpoints (High)
**Affected Files:** 
- `apps/backend/apps/reports/exports/gstr1_excel.py`
- `apps/backend/apps/reports/exports/gstr3b_excel.py`
- `apps/backend/apps/reports/exports/ca_working_paper.py`
- `apps/backend/apps/reports/exports/reconciliation_excel.py`

**Vulnerability:**
While these endpoints correctly enforce `IsAuthenticated`, their outlet resolution method utilizes `getattr` with an insecure fallback:
```python
def get_current_outlet(self, request):
    return getattr(request.user, 'outlet', Outlet.objects.first())
```
**Impact:**
If an authenticated user lacks an associated `outlet` (e.g., a system admin, a newly provisioned staff member, or due to a missing relation causing the attribute to evaluate to `None`), the system falls back to `Outlet.objects.first()`. This leaks the first outlet's entire GST export (Excel and PDF) to users who shouldn't have access to it, violating strict multi-tenant boundaries.

## 3. Potential PII and Session Leakage in Logs (Medium)
**Affected Files:** `apps/backend/apps/gst/provider/sandbox.py`

**Vulnerability:**
In the `verify_taxpayer_otp` method, if the Sandbox GST API returns a successful status code but fails to include an `access_token`, the system logs the entire raw JSON response:
```python
logger.warning(f"Sandbox Verify OTP success but no access_token returned. Full resp: {res_json}")
```
**Impact:**
The `res_json` payload from GSTN/Sandbox providers can include sensitive metadata, taxpayer details, embedded tokens, or PAN data. Logging raw third-party authentication payloads unconditionally can lead to credential or PII leakage in application logs.

## 4. Analysis of Sandbox Views and Celery Jobs (Pass)
**Affected Files:** 
- `apps/backend/apps/gst/views.py`
- `apps/backend/apps/gst/tasks.py`

**Observation:**
The sandbox views (`SandboxStatusView`, `SandboxRequestOTPView`, `SandboxVerifyOTPView`, `GSTR2BSyncView`) correctly use `get_user_outlet(request)` without insecure fallbacks. They properly enforce `IsAuthenticated` and perform adequate checks:
```python
outlet = get_user_outlet(request)
if not outlet:
    return Response({"error": "No assigned outlet."}, status=403)
```
The Celery task (`sync_gstr2b_job`) filters and creates records explicitly bound to the `job.outlet`, avoiding cross-outlet data mixing during asynchronous import.

## 5. Regression Tests for Cross-Outlet Access
**Status:** **Missing**
There are no dedicated test cases in the test suite (`test_sandbox_views.py`, `test_dashboard_services.py`, etc.) asserting that:
1. `User A` (Outlet A) receives a `403/404` when attempting to access `User B`'s (Outlet B) export histories.
2. `User A` cannot submit a period sync job for an `outlet_id` they do not own.

**Recommendation:** 
Implement regression tests utilizing Django REST Framework's `APIClient` to authenticate as two different outlet staff users, strictly verifying that BOLA (IDOR) attempts result in a `403 Forbidden` or `404 Not Found`.

## Remediation Plan
1. **Remove Bypasses:** Delete `authentication_classes = []` and `permission_classes = []` from all views in `dashboard_views.py`.
2. **Fix Outlet Resolution:** Rewrite `get_current_outlet` across all export files and dashboard views to STRICTLY return `request.user.outlet` and raise a `403/404` if it is null/missing. **Never fallback to `Outlet.objects.first()`**.
3. **Sanitize Logs:** Extract only the specific error code or safe message from `res_json` in `sandbox.py` instead of dumping the full dictionary to the logger.
4. **Implement Tests:** Add cross-tenant test cases to the CI/CD pipeline immediately.
