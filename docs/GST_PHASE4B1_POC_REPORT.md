# GST Phase 4B.1: Sandbox POC Report

## Overview
Phase 4B.1 establishes a secure, read-only proof of concept for integrating MediFlow with the GST Sandbox environment. This lays the groundwork for full GSTR-2B reconciliation and IMS compliance in subsequent phases.

## What Was Implemented

1. **Secure Credential Management**
   - Added the `cryptography` package to encrypt API secrets at rest.
   - Created `GstPortalCredential` model which handles symmetric encryption (Fernet) transparently via Django properties.
   - Separated credentials by `TEST` and `PROD` environments to prevent accidental leakage or overlap.

2. **Sandbox Authentication Service (`SandboxAuthService`)**
   - Integrated with `/authenticate` for Platform Tokens. Platform tokens are aggressively cached (23 hours) to prevent redundant network calls and rate limiting.
   - Integrated with `/gst/compliance/tax-payer/otp` and `/gst/compliance/tax-payer/otp/verify` for Taxpayer authentication flows.
   - Created `GstTaxpayerAuth` model to manage session state (`PENDING_OTP`, `AUTHENTICATED`, `EXPIRED`) and persist the required Sandbox timestamps (`token_expiry`, `session_expiry`).

3. **Sandbox Data Fetching (`SandboxFetchService`)**
   - Integrated with `/gst/compliance/tax-payer/gstrs/gstr-2b/{year}/{month}` for read-only GSTR-2B document fetching.
   - Created `GSTR2BPortalSnapshot` model to immutably store the raw JSON payload downloaded from Sandbox, ensuring traceability.

4. **POC API Endpoints**
   - Built unauthenticated-view testing routes for the front-end to trigger Sandbox flows (admin/reports restricted):
     - `POST /api/v1/reports/sandbox/otp/request/`
     - `POST /api/v1/reports/sandbox/otp/verify/`
     - `GET /api/v1/reports/sandbox/gstr2b/fetch/`

## Constraints & Security Adherence
- **Local Authority:** MediFlow remains the local authority. No local transactional data is modified by Sandbox integration. 
- **Read-Only Scope:** The current capabilities only fetch GSTR-2B documents. No write operations or filing actions were implemented.
- **Environment Targeting:** Requests correctly route based on the credentials used (Test/Prod).

## Next Steps (Phase 4B.2)
- Provide a UI workflow for entering API keys and initiating the OTP flow.
- Process the fetched `GSTR2BPortalSnapshot` payload into a structured internal object for mapping against MediFlow's purchase invoices (GSTR-2A/2B Reconciliation).
