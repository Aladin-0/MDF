# GSTR-1 Review Pack: MediFlow

## Context
MediFlow is a pharmacy ERP system that handles purchases, inventory, sales, and returns. As part of the GST compliance module, we generate outward supply (GSTR-1) data from transaction records. 

**Scope So Far (Phases A1–A4)**:
* **B2B & B2CS/B2CL Identification**: Categorizing sales based on customer registration and interstate supply status.
* **Returns & Traceability (CDNR/CDNUR)**: Mapping sales returns back to original invoices.
* **Pre-flight Validation & Export Control**: Injecting rules-based validation into the JSON payload (e.g., HSN format checks, mandatory field checks) and blocking export if blocking errors are present.
* **Manual Override Tracking**: Support for "standalone" returns (without an original invoice) with strict permission checks (admin/manager only) and an `ActivityEvent` audit log.

**Important Note**:
This JSON is a **draft working paper**, strictly for your review. MediFlow is intentionally built with a "no-direct-filing" boundary. The generated JSON will ultimately be passed to a GSP (GST Suvidha Provider) or the Offline Utility tool for actual portal filing. 

## Logic Mapping Summary
* **B2B**: Sales invoices with `is_b2b=True` (customer has GSTIN), excluding any sales returns.
* **B2CS/B2CL**: Sales invoices with `is_b2b=False`. Unregistered intra-state goes to B2CS; unregistered inter-state goes to B2CL (if value > ₹2.5 Lakhs, else B2CS).
* **CDNR**: Sales returns where the original invoice was `is_b2b=True`. These are grouped by customer GSTIN, with an explicit original-invoice linkage.
* **CDNUR**: Sales returns where the original invoice was `is_b2b=False`. The type (B2CL vs B2CS) is derived from the original invoice's classification.
* **Manual Override (Standalone Returns)**: Returns created without a linked original invoice. 
  * Requires Manager/Admin role.
  * Strongly audited via `ActivityEvent` (actor, reason, timestamp).
  * Flagged in the `_metadata` payload with a `PROC-002` INFO note.
* **Validation Payload (`_metadata`)**:
  * Includes `blocking_errors`, `validation_warnings`, and `info`. 
  * `is_valid_for_export`: Boolean flag indicating if the JSON is fully compliant. If `false`, export is blocked.

## Questions for CA

1. **Separation of Returns:** Is the separation of returns into explicit CDNR/CDNUR records (instead of netting them out as negative amounts in B2B/B2CS) acceptable and compliant with current guidelines?
2. **Unregistered Returns:** Is the B2CL vs B2CS logic for unregistered returns (based purely on the original invoice's value and place of supply) acceptable?
3. **Traceability:** Are the traceability fields provided on credit/debit notes sufficient for audit, or do you need any additional invoice-level tracking?
4. **Manual Override:** Is the manual-override flow (which is permission-gated, formally audited in an event log, and flagged in the JSON metadata) reasonable from a compliance and auditor standpoint?
5. **Data Red Flags:** Are there any red flags in the provided sample data (e.g., HSN length, rounding logic, decimal accuracy) that would likely cause issues on the GST portal or during a future audit?

## Changes after CA Review (v2)

Following the initial CA review, the following critical changes have been implemented:

1. **B2CS Netting:** Sales returns for B2CS (unregistered, intra-state, or unregistered inter-state ≤ ₹2.5L) are now netted within the `b2cs` array (Table 7) rather than being incorrectly routed to `cdnur`. The system allows for negative net `txval`/tax in `b2cs` if returns exceed sales for a given rate/POS bucket.
2. **CDNUR Restrictions:** The `cdnur` array is now strictly restricted to `B2CL` sales returns.
3. **Place of Supply (POS) Logic:** `pos` is explicitly saved on snapshots and dynamically evaluated against the `supplier_state_code`. A new blocking pre-flight validation rule (**POS-001**) ensures that `sply_ty` (INTRA/INTER) and tax heads (IGST vs CGST/SGST) strictly align with the `pos` vs `supplier_state` comparison.
4. **HSN Summary Corrections:** The tax rate (`rt`) field is now populated in all HSN summary rows. Dummy HSNs (e.g., `00000000`) are actively filtered and generate a blocking error (**HSN-001d**). 
5. **HSN Length Enforcement:** Introduced configurable turnover-based rules (**HSN-001e**) that enforce a minimum 6-digit HSN length for turnovers > ₹5 Crore (4 digits otherwise).
6. **B2CL Threshold:** As per Notification No. 12/2024 (Central Tax), the B2CL threshold for inter-state unregistered supplies is ₹1,00,000 (effective 01-Aug-2024). MediFlow uses this updated threshold for all periods from August 2024 onwards.
