# Sandbox GST API Discovery

This document outlines the findings from the Sandbox GST API documentation and how it aligns with the MediFlow architecture.

## 1. What Sandbox can do for MediFlow
Sandbox acts as a Technical Service Provider (TSP) connected to Quicko GSP (GST Suvidha Provider). It abstracts the complexities of direct GSTN integration (like encryption, payload signing, and raw GSTN auth) into standard REST APIs.
For MediFlow, Sandbox can:
- Provide Public APIs to verify GSTINs and track return filing statuses.
- Provide Taxpayer APIs to pull ledgers, auto-drafted returns (GSTR-2B), and interact with the Invoice Management System (IMS).
- Provide File APIs to submit and file GSTR-1 and GSTR-3B directly to the government portal.

## 2. What should remain local in MediFlow
MediFlow should remain the authoritative source for the business's actual financial events.
- **Transactional Data**: Sale and Purchase Invoices must be drafted and stored locally first.
- **Report Generation**: The Phase 3B logic that calculates GSTR-1 and GSTR-3B should remain local. We will compare our local calculation to the portal, not blindly trust the portal.
- **Reconciliation Engine**: The logic that matches a local `PurchaseInvoice` to a fetched GSTR-2B record should be local, so users can see exactly why a mismatch occurred within the MediFlow UI.

## 3. What each next GST phase should depend on
- **Phase 4B (Reconciliation)**: Depends on Sandbox Platform Auth, Taxpayer Auth, and the GSTR-2B Analytics/Compliance fetch APIs.
- **Phase 4C (IMS)**: Depends on Phase 4B's fetched data, plus Sandbox IMS Write APIs (Accept/Reject actions).
- **Phase 5 (Filing)**: Depends on GSTR-1 and GSTR-3B Submission APIs.

## 4. Prerequisites for Sandbox Usage
- A registered Sandbox developer account.
- Sandbox `x-api-key` and `x-api-secret` generated from the Sandbox Console.
- Test GSTIN credentials (provided by the GSTN sandbox or Sandbox.co.in test environment) for development.

## 5. Auth Flow & Credential Storage Model
Sandbox uses a two-tier authentication system:
1. **Platform Authentication**: MediFlow backend calls `/authenticate` with `x-api-key` and `x-api-secret` in headers to receive an `access_token` valid for 24 hours. The token is passed as a raw string in the `authorization` header (no "Bearer" prefix).
2. **Taxpayer Authentication**: To access taxpayer-specific data (GSTR-2B, ledgers, filing), MediFlow must trigger an OTP flow for the specific GSTIN. The user enters the OTP, and Sandbox establishes a session with GSTN for that taxpayer.

**Storage Model needed**:
- `SandboxConfiguration` (Global/Tenant level): Stores `api_key` and `api_secret`.
- `GstTaxpayerSession` (Outlet/GSTIN level): Stores the active Taxpayer session token and expiry timestamp. **Every unique GSTIN requires separate Taxpayer authorization.**

## 6. Read-Only vs. Write/File Actions
- **Read-Only**: Public GSTIN search, fetching GSTR-2A/2B, fetching Cash/ITC Ledgers, checking Return Status.
- **Write Actions**: Saving GSTR-1/3B payloads, taking IMS actions (Accept/Reject/Pending).
- **File Actions**: EVC/DSC authorization to finalize a return.

## 7. Risks, Limits, and Unknowns
- **Token Expiry**: Platform tokens expire in 24 hours. Taxpayer sessions (with GSTN) typically expire much faster (e.g., 6 hours). MediFlow must gracefully handle 401s and prompt the user to re-authenticate via OTP.
- **Rate Limits**: MediFlow must implement exponential backoff to avoid hitting Sandbox rate limits.
- **Sandbox Test Data**: The Sandbox test environment might not perfectly simulate live GSTN lag times. MediFlow needs robust queuing for external API calls.
