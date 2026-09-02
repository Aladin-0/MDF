# Phase 2B Discovery and Design: GSTR-2B Retrieval and Reconciliation

## 1. Summary
This document outlines the architectural design for securely retrieving, storing, and reconciling GSTR-2B inward supply data from the Sandbox GST provider. It defines the exact provider API contract, the proposed data models for immutable and auditable imports, a safe retrieval workflow, robust reconciliation rules, and a secure UI/API contract that prevents secret leakage or destructive operations.

## 2. Current State Assessment
- **Authentication**: A secure Sandbox Taxpayer session has been verified (active for `SEED-Mumbai Outlet`, Masked GSTIN `27***ZX`, expiring in ~30 days).
- **Existing Models**: 
  - `GSTR2BData` is currently a simple table storing normalized document fields and a `raw_data` JSON field. It lacks strict immutability, cryptographic hashing, and batch/import-run grouping.
  - `ITCReconciliationRun` and `ITCReconciliationResult` exist but require updates to support the new auditable import workflow and strict match states.
- **Provider Code**: `SandboxGstProvider.fetch_gstr2b` currently uses an older endpoint abstraction (`/gst/compliance/gstr2b`). This must be updated to align with the official documented endpoint.

## 3. Sandbox GSTR-2B API Contract
Based on the official Sandbox documentation (`https://developer.sandbox.co.in/llms.txt`) and OpenAPI specs:
- **Endpoint**: `GET /gst/compliance/tax-payer/gstrs/gstr-2b/{year}/{month}`
- **Headers Required**: 
  - `authorization`: Taxpayer Access Token
  - `x-api-key`: Sandbox API Key
  - `x-api-version`: `1.0.0`
- **Path Parameters**: `{year}` (e.g., 2024), `{month}` (e.g., 10)
- **Query Parameters**: `file_number` (optional, for paginated large files when status code is 3)
- **Behavior**: Synchronous retrieval. 
- **Response Schema**: Returns a standard JSON with HTTP 200 containing:
  - `status_cd`: Status code (e.g., "1" for Success)
  - `data.chksum`: SHA-256 hash provided by the provider
  - `data.data.docdata`: Grouped list of B2B, B2BA, CDN, CDNA, and ISD documents, grouped by supplier GSTIN.
  - Returns `RET2B1023` if GSTR-2B is not available.

## 4. Proposed Data Model (Import & Normalization)
We propose separating the *Import Run* from the *Normalized Data* to guarantee idempotency and auditability.

**1. `GSTR2BImportJob` (New Model)**
- `id`: UUID (Primary Key)
- `outlet`: ForeignKey
- `gstin`: String (Validated against Outlet)
- `return_period`: String (MMYYYY)
- `provider`: String ("Sandbox")
- `retrieval_timestamp`: DateTime
- `session_reference_id`: UUID/String (Reference to `GstTaxpayerAuth` ID, **never** storing the token)
- `provider_correlation_id`: String (from response header or body)
- `payload_sha256`: String (Hash of the raw response payload)
- `raw_payload`: Encrypted JSONField (Stored securely, access-controlled)
- `status`: Enum (COMPLETED, FAILED, PAGINATION_PENDING)
- `record_count`: Integer

**2. `GSTR2BData` (Updated Model)**
- `import_job`: ForeignKey to `GSTR2BImportJob`
- `supplier_gstin`, `supplier_name`
- `document_type`: Enum (B2B, CDN, ISD, etc.)
- `document_number`, `document_date`
- `original_document_reference` (for amendments)
- `taxable_value`, `igst`, `cgst`, `sgst`, `cess`
- `itc_availability_status`: Enum (Y/N)
- `itc_ineligible_reason`: String
- `ims_status`: String (Accepted, Rejected, Pending)
- *Constraint*: Unique together (`import_job`, `supplier_gstin`, `document_type`, `document_number`)

**Data Retention**: Raw JSON payloads will be retained for 7 years for compliance and audit but excluded from standard Django admin and API views unless explicitly requested via an audited endpoint.

## 5. Retrieval Workflow Design
1. **User Request**: UI POSTs to `/api/v1/gst/sandbox/gstr2b/sync/` with `period`. 
2. **Validation (Backend)**:
   - Verifies the user has GST permissions for the active outlet.
   - Confirms `is_sandbox_allowed` passes.
   - Validates the Taxpayer Session is ACTIVE and matches the Outlet GSTIN.
   - Ensures no identical active sync job is currently running (DB Lock/Cache).
3. **Execution**:
   - Backend calls the official `GET /gst/compliance/tax-payer/gstrs/gstr-2b/{year}/{month}` endpoint using `SandboxGstProvider`.
   - Computes SHA-256 hash of the response.
4. **Persistence**:
   - If a previous `GSTR2BImportJob` exists for the same period with the **exact same hash**, skip normalization (idempotent) and mark as `Stale/No Change`.
   - Otherwise, create a new `GSTR2BImportJob`.
   - Iterate through `docdata` and bulk create `GSTR2BData` records linked to the new job.
5. **Completion**:
   - Update `GSTR2BImportJob` status.
   - Return job ID and record count to UI. (Reconciliation is NOT automatically triggered).

## 6. Reconciliation Rules Design
Reconciliation runs as a separate user-triggered job.

**Match Criteria:**
- **Exact Match**: `Supplier GSTIN` + `Document Number` (normalized: ignoring special chars/case) + `Document Date` + `Total Tax Amounts` (within ±₹1 tolerance).
- **Probable Match (Value Mismatch)**: GSTIN + Doc Number + Date match, but tax values differ beyond tolerance.
- **Probable Match (Date Mismatch)**: GSTIN + Doc Number + Tax match, but date differs (e.g., booked in next month).

**Match Statuses:**
- `MATCHED`: Exact match found.
- `MATCHED_WITH_TOLERANCE`: Matched within the configured fractional rupee tolerance.
- `MISMATCH_VALUE`: Tax or taxable value discrepancy.
- `MISMATCH_DATE`: Cross-period timing difference.
- `MISSING_IN_2B`: Exists in purchase register, not in GSTR-2B.
- `MISSING_IN_PR`: Exists in GSTR-2B, missing in purchase register.
- `DEFERRED_ITC` / `INELIGIBLE_ITC`: Mapped based on Rule 37 logic or GSTR-2B flags.

*CRITICAL REQUIREMENT*: Reconciliation output is purely advisory (read-only mapping). It will **never** automatically post journals or alter tax ledgers.

## 7. UI/API Design Contract

**API Endpoints:**
- `POST /api/v1/gst/sandbox/gstr2b/sync/`: Triggers retrieval.
  - *Payload*: `{"period": "MMYYYY"}`
  - *Response*: `{"job_id": "uuid", "status": "COMPLETED", "records_imported": 15}`
- `GET /api/v1/gst/sandbox/gstr2b/status/?period=MMYYYY`: Returns the latest import status.
  - *Response*: `{"last_sync": "ISO8601", "status": "Retrieved", "records": 15, "hash": "..."}`
- `POST /api/v1/gst/sandbox/reconciliation/run/`: Triggers matching against PR.
- All endpoints protected by strict Sandbox/Outlet isolation guards. No secrets exposed.

**UI Flow:**
1. Period selector enables "Sync GSTR-2B" button.
2. Clicking Sync triggers a confirmation modal: *"Retrieve GSTR-2B for Oct 2024 and 27***L2ZX from SANDBOX?"*
3. Displays loading state -> Success state displaying data freshness and record count.
4. Reveals the "Run Reconciliation" button only after a successful sync.

## 8. Test and Acceptance Plan
1. **Environment/Auth Tests**: Assert that triggering sync without an active Taxpayer Session, or as the Test Outlet, yields 403 Forbidden.
2. **Provider Mock Tests**: Mock `requests.get` to return a sample `docdata` payload. Verify `GSTR2BImportJob` and `GSTR2BData` records are created perfectly.
3. **Idempotency Tests**: Run the sync twice with the same mock response. Assert that duplicate `GSTR2BData` records are NOT created and the second run returns `Stale/No Change`.
4. **Reconciliation Tests**: Create mock Purchase records. Assert Exact Match, Value Mismatch, and Missing states accurately.
5. **Security Tests**: Assert that the API responses never leak the raw provider access tokens, and the database raw payload is encrypted/hashed.

## 9. Final Decision Request
The discovery phase is complete and the architecture safely adheres to all isolation and security rules. 

**Status**: `READY_FOR_IMPLEMENTATION`
Please provide your explicit approval to proceed with Phase 2B implementation.
