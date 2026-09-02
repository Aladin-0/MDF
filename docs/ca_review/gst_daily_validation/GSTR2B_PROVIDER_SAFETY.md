# GSTR-2B Provider Safety Audit

**Date:** 2026-08-21
**Auditor Agent:** AGENT 6 (GSTR-2B provider safety agent)

## 1. Provider Mode Configuration Audit
The `SandboxGstProvider` (`apps/backend/apps/gst/provider/sandbox.py`) successfully implements strict configuration parameters for initialization:
- `SANDBOX_PROVIDER_MODE` enforces either 'test' or 'live'.
- Strict validation maps the provider mode to the appropriate `SANDBOX_BASE_URL` (`https://test-api.sandbox.co.in` vs `https://api.sandbox.co.in`). Host mismatch raises a `ValueError`.
- Key prefix mismatches (`live_` prefix in `test` mode, or vice versa) raise a `ValueError`.

## 2. UI Warning Verification
- **Status:** Verified.
- **Location:** `apps/frontend/app/gst/sandbox/page.tsx`
- **Details:** The frontend correctly renders a red banner with the text `LIVE GST PROVIDER — LOCAL DEVELOPMENT APP` when the `provider_mode` is `'live'`.

## 3. Test Coverage Verification
Tests were audited across `test_sandbox_provider_config.py`, `test_sandbox_views.py`, and `test_taxpayer_auth.py`. 
- **Invalid Mode:** Covered by `test_invalid_mode` (`ValueError` raised).
- **Host Mismatch:** Covered by `test_test_mode_with_live_host` and `test_live_mode_with_test_host`.
- **Missing Credentials:** Partially covered. Missing `SANDBOX_BASE_URL` fails closed (`test_missing_base_url_fails_closed`). However, missing API key/secret only logs a warning during initialization.
- **OTP Secrecy:** Covered by `test_verify_otp_success` in `test_sandbox_views.py`, asserting that the actual OTP is not returned in the JSON response.
- **Cooldown:** Covered by `test_request_gst_otp_rate_limit` in `test_taxpayer_auth.py`, checking that requesting an OTP within 60 seconds returns a `429 TaxpayerAuthError`.

## 4. Identified Safety Gaps

### CRITICAL: `ENABLE_GST_SANDBOX_LIVE_MODE` Bypass in Background Tasks
- **Issue:** The `ENABLE_GST_SANDBOX_LIVE_MODE` check is currently only enforced in the view layer (`is_sandbox_allowed` in `apps/backend/apps/gst/views.py`). The `SandboxGstProvider` initialization (`__init__`) only checks `SANDBOX_PROVIDER_MODE`.
- **Risk:** Any background task (e.g., `sync_gstr2b_job` in `apps/backend/apps/gst/tasks.py`), CLI command, or background service that invokes `get_active_provider()` will completely bypass the `ENABLE_GST_SANDBOX_LIVE_MODE` safety check. If the environment is set to `SANDBOX_PROVIDER_MODE=live` without the explicit live mode boolean enabled, the provider will still successfully initialize and make live API requests.
- **Recommendation:** Move the `ENABLE_GST_SANDBOX_LIVE_MODE` check directly into the `SandboxGstProvider.__init__` method to enforce it globally.

### WARNING: Outdated Test Fixtures 
- **Issue:** Multiple tests in `test_sandbox_views.py` and `test_sandbox_provider.py` still inject the deprecated `GST_ENV` environment variable and rely on checking `.env` attributes on the provider class (which was removed in favor of `.provider_mode`).
- **Risk:** Tests may yield false positives or fail to run altogether, obscuring regression in provider configuration.

### MINOR: Missing API Key/Secret Initialization Failure
- **Issue:** If `api_key` or `api_secret` are missing from both environment variables and DB (`SandboxConfiguration`), `SandboxGstProvider` only logs a warning and proceeds.
- **Risk:** Initialization will not fail fast. The failure will only happen upon executing a request (`SandboxAuthError: network error` or authentication rejection).
