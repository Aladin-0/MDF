# GST Phase 4B Integration Blueprint

This document defines the architectural plan for integrating Sandbox GST APIs into MediFlow for Phase 4B and beyond.

## 1. Recommended Next Phase Scope (Phase 4B)
**Scope**: GSTR-2B Fetch & Reconciliation (Read-Only Portal Integration).
We will build the auth infrastructure and fetch auto-drafted GSTR-2B data from the portal, then map it to our local `PurchaseInvoice` data to verify ITC claims. Filing workflows are strictly excluded from this phase.

## 2. Exact Sandbox Endpoints Likely Needed First
1. `POST /authenticate`: To get the 24-hour platform access token.
2. `POST /gst/compliance/taxpayer/auth/request-otp`: To trigger GSTIN OTP.
3. `POST /gst/compliance/taxpayer/auth/verify-otp`: To verify OTP and get the Taxpayer session.
4. `GET /gst/analytics/gstr-2b` (or equivalent compliance endpoint): To fetch the raw GSTR-2B JSON for a specific period.

## 3. Required Backend Services in MediFlow
- `SandboxAuthService`: Handles fetching and caching the platform `access_token`, and orchestrates the Taxpayer OTP flow.
- `GSTR2BFetchService`: Uses the active Taxpayer session to pull GSTR-2B JSON and stores it as an immutable snapshot (similar to how Phase 4A stores internal snapshots).
- `GSTR2BReconciliationService`: Compares the fetched GSTR-2B JSON against local `PurchaseInvoice` records to find matches, mismatches, and missing invoices.

## 4. Required Models/Tables for External Sync State
- `GstPortalCredential`: Stores the Sandbox API keys (encrypted).
- `GstTaxpayerAuth`: Stores the active session/token for a specific `Outlet` (GSTIN).
- `GSTR2BPortalSnapshot`: Stores the raw JSON payload retrieved from Sandbox for a given `GstReportPeriod`.
- `GstReconciliationMatch`: Links a local `PurchaseInvoice` to a GSTR-2B item block.
  - Fields: `purchase_invoice_id`, `gstr2b_snapshot_id`, `portal_invoice_number`, `status` (Matched, Mismatched, Portal Only, Local Only), `mismatch_details` (JSON).

## 5. How to Map Sandbox Data into Local Reconciliation
1. Fetch GSTR-2B B2B invoices.
2. Group portal invoices by Supplier GSTIN and Invoice Number.
3. Query local `PurchaseInvoice` records for the corresponding GST period, matching by `supplier.gstin` and `invoice_number`.
4. If a match is found, compare `taxable_amount`, `cgst_amount`, `sgst_amount`, and `igst_amount`.
5. Create a `GstReconciliationMatch` record reflecting the result. The UI will then render these matches, allowing the user to take corrective action on mismatches.

## 6. What Should Be Built Before Any Filing Workflow
Filing (GSTR-1/3B submission) is a destructive and legally binding action. Before building filing:
1. **Reconciliation (Phase 4B)**: The user must be able to trust that their local data aligns with the portal.
2. **IMS (Phase 4C)**: The user must be able to accept/reject portal invoices to finalize their GSTR-2B.
Only after these are robust should we implement portal filing.

## 7. IMS vs GSTR-2B Reconciliation Order
**GSTR-2B Reconciliation MUST come first.**
The Invoice Management System (IMS) is an active action taken *on* the data that appears in GSTR-2B/GSTR-2A. You cannot reliably execute IMS Accept/Reject workflows unless you have first reconciled the portal data against your local books to know *what* to accept or reject.
