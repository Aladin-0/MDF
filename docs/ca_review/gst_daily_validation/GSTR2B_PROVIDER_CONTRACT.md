# GSTR-2B Provider Contract

This document formalizes the data ingestion contract between the MediFlow backend (acting as an ASP/GSP consumer) and the GST Sandbox Provider for the GSTR-2B API.

## Provider Boundary

The boundary is established in `apps/gst/provider/sandbox.py`. It is responsible for orchestrating the HTTP requests to the Sandbox Provider. 

- **Live Mode Constraint**: MediFlow explicitly prevents fetching live data when the `ENABLE_GST_SANDBOX_LIVE_MODE` setting is False. For local development and Phase 2B, this is strictly enforced as a Sandbox-only interaction.
- **Data Preservation**: The raw JSON payload returned by the provider is immutably stored in the `GSTR2BData.raw_data` field. The backend guarantees that once a snapshot is complete, it will not be overwritten.
- **Security**: Outlet isolation is rigorously enforced using row-level constraints. Only the authorized `Outlet` that initiated the sync process has access to its GSTR-2B data. OTP and session secrets are encrypted in transit and never exposed via standard log files or external API outputs.

## Normalizer and Data Mapping

The normalization layer resides at `apps/reports/normalizers.py` and maps provider fields into the `GSTR2BData` canonical model.

### Pagination and Idempotency
- **Completeness**: If a response features pagination (`status_cd` = "3" or `fc` > page), the Celery job fetches all subsequent pages. Missing or incomplete pages transition the job into an `INCOMPLETE` state.
- **Idempotency**: Requests that yield the exact same underlying payload hash map to `NO_CHANGE`, preventing duplicate records.
- **Duplicate Detection**: If a pagination loop retrieves the same page hash, the loop safely breaks to prevent an infinite cycle.

### Date Handling
The original source of Truth for dates relies on the following mappings as provided by the Sandbox environment:
- **B2B**: `idt` (or `dt` fallback if explicitly provided instead of `idt` by the provider contract).
- **Credit/Debit Notes (CDN)**: `ntdt`.
- **ISD**: `docdt`.
- **Amendments (B2BA, CDNA)**: Original invoice dates (`oidt` or `ontdt`) are captured into `original_document_reference`.

The system forcefully rejects missing or fundamentally malformed dates, declining to create placeholder dates.

### Monetary Normalization
Monetary fields (such as `txval`, `igst`, `cgst`, `sgst`, `cess`) are extracted and transformed using Python's `Decimal` type to eliminate precision loss caused by JavaScript floating-point arithmetic. Depending on the Sandbox provider's specific mock flavor, values are calculated from either the header level or aggregated from line items (`itms` array).

## API Contract (Response)
For subsequent read-operations from the Frontend Next.js client, monetary values are serialized globally via DRF's `COERCE_DECIMAL_TO_STRING` setting as strings (e.g. `"125.00"`) to ensure the client preserves decimal integrity natively.
