# GST Sandbox Resume Checklist

When MediFlow development dictates that Sandbox Taxpayer integration should resume, use this exact checklist to systematically rebuild and connect the features.

## 1. Verify Platform Auth
- [ ] Acquire real Sandbox API `client_id` (api_key) and `client_secret` (api_secret).
- [ ] Inject credentials into `GstPortalCredential` (environment: `TEST`).
- [ ] Run a test script to trigger `SandboxAuthService.get_platform_token()` and verify `200 OK`.

## 2. Add Taxpayer OTP Flow
- [ ] Re-expose `/sandbox/otp/request` and `/sandbox/otp/verify` API endpoints in `views.py`.
- [ ] Build a frontend UI modal inside the GST Reports screen that prompts for the Taxpayer Username and subsequently requests the OTP.
- [ ] Test the full OTP lifecycle and verify `GstTaxpayerAuth` correctly saves `token_expiry`.

## 3. Add GSTR-2B Fetch + Portal Snapshot
- [ ] Re-expose `/sandbox/gstr2b/fetch` API endpoint.
- [ ] Add a "Fetch GSTR-2B from Portal" button in the frontend (enabled only when Taxpayer is Authenticated).
- [ ] Verify that the `GSTR2BPortalSnapshot` table is correctly populated with the raw JSON array of B2B/CDNR invoices.

## 4. Add Reconciliation Engine
- [ ] Create a translation layer that maps the `GSTR2BPortalSnapshot` JSON into the MediFlow `PurchaseInvoice` matching schema.
- [ ] Build the GSTR-2B reconciliation UI that highlights Missing, Matched, and Mismatched invoices.

## 5. Add IMS Actions
- [ ] Implement Sandbox endpoints to Accept, Reject, or hold Pending status for invoices in the Invoice Management System (IMS).
- [ ] Sync these statuses back into MediFlow's local models.

## 6. Add Filing (Post-Reconciliation)
- *Do not attempt this until steps 1-5 are completely stable in production.*
- [ ] Implement GSTR-1 and GSTR-3B save-to-portal logic.
- [ ] Implement File via EVC/DSC workflows.
