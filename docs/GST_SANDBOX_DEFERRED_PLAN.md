# GST Sandbox Deferred Plan

## Status
**PAUSED / DEFERRED** - Sandbox integration and Taxpayer GSTR-2A/2B features are deferred to prioritize the core MediFlow local-first functionality.

## What is Kept (Foundation)
The following infrastructure is safely kept in the codebase to avoid wasted effort, as it has no side-effects on local GST reporting:
1. **`GstPortalCredential`**: Environment-aware (TEST/PROD) model holding `api_key` and encrypted `api_secret`.
2. **`GstTaxpayerAuth`**: DB scaffold meant for tracking taxpayer sessions.
3. **`GSTR2BPortalSnapshot`**: DB scaffold meant for immutably storing fetched Sandbox JSON documents.
4. **`SandboxAuthService` & `SandboxFetchService`**: Basic backend service logic (in `apps/backend/apps/reports/services/`) remains as a starting point. Platform authentication logic is functional, and taxpayer logic is modeled but not exposed.

## What is Disabled or Removed
1. **API Endpoints**: All POC REST endpoints (`/api/v1/reports/sandbox/otp/...` and `/fetch/`) have been **removed** from `urls.py` and `views.py`. This guarantees no incomplete features leak into the frontend or get hit accidentally.
2. **Frontend UI**: No UI flows exist or will be added to ask for OTPs or GST usernames right now.

## Explicitly Deferred Features
- **GSTR-2A / GSTR-2B Fetching**: Local GST engines do not need external reconciliation immediately.
- **IMS (Invoice Management System)**: Accept/Reject workflows are delayed.
- **GST Portal Filing / EVC / DSC**: Filing workflows are indefinitely delayed until reconciliation tools are fully mature.

## Future Restart Point
When Sandbox integration resumes, development should pick up at:
- **Validating Platform Auth with real credentials.**
- **Re-wiring Taxpayer endpoints safely into the UI.**
- **Fetching the first real GSTR-2B document into `GSTR2BPortalSnapshot`.**

## Prerequisites for Restarting
- Active GST Sandbox API Keys (TEST environment).
- A valid Sandbox Taxpayer GSTIN and Username to generate OTPs against.
- Complete understanding of how GSTR-2B JSON maps to the local MediFlow Purchase Invoice schema for reconciliation.
