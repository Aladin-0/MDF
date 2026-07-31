# GST Phase 4A: Locking, Snapshot, and Revision Report

## Overview
Phase 4A introduces strict immutability for GST reports in MediFlow. Once a GST period (e.g., GSTR-1 or GSTR-3B for a specific month) is finalized and exported, the system prevents any underlying transactional data (Sale Invoices, Purchase Invoices, and Returns) from being mutated if it falls within that period. This ensures that the generated GST reports represent a reliable, immutable source of truth for compliance purposes and sets a strong foundation for future reconciliation workflows in Phase 4B.

## Implementation Details

### Data Models (`apps/reports/models.py`)
Three new data models form the core of this phase:
1. **`GstReportPeriod`**: Tracks the status of a specific GST report type (`GSTR1` or `GSTR3B`) for a given Outlet/GST Registration within a defined period (`period_start` to `period_end`). Statuses include `draft`, `locked`, `exported`, and `corrected`.
2. **`GstReportSnapshot`**: Stores a static, JSON-serialized copy of the finalized GST report (`payload`) when a period transitions into a locked/exported state. Each snapshot holds a version number. If a period is unlocked and re-locked, a new versioned snapshot is created.
3. **`GstReportRevision`**: Maintains an immutable audit trail of state changes (e.g., `locked`, `unlocked_for_correction`). It records the user who performed the action, the timestamp, and an optional reason.

### Validation Layer (`apps/reports/utils.py` & Invoice Models)
A centralized validation utility (`check_gst_lock_for_instance` and `check_gst_lock`) is invoked in the `.save()` and `.delete()` methods of:
- `SaleInvoice`
- `SalesReturn`
- `PurchaseInvoice`
- `PurchaseReturn` (to be implemented in future phases as needed)

**Logic Flow:**
1. Determine the invoice date's GST period (from the 1st to the last day of the month).
2. Check if a `GstReportPeriod` exists for that outlet + period for either `GSTR1` or `GSTR3B` that has a status of `locked`, `exported`, or `corrected`.
3. If such a period exists, the system immediately raises a `ValidationError`, halting the save/delete operation.
4. Modifications are only permitted if no period exists, if the period is in `draft` mode, or if an authorized user explicitly unlocks the period.

### API Layer (`apps/reports/views.py`)
- **Report Generation (`GSTR1ReportView`, `GSTR3BReportView`)**: Modified to first check for an existing locked/exported period. If one exists, the endpoint fetches and returns the `payload` from the latest `GstReportSnapshot` instead of dynamically recalculating the report from `GSTTransactionSnapshot`.
- **Locking (`GSTLockReportView`)**: Creates/Updates a `GstReportPeriod` to `locked`, generates the report, saves it as a new `GstReportSnapshot`, and logs a `GstReportRevision`.
- **Unlocking (`GSTUnlockReportView`)**: Updates a `GstReportPeriod` to `corrected` and logs a `GstReportRevision` with a user-provided reason.

### Frontend Layer (`apps/frontend/components/reports/`)
- Integrated `useLockGSTReport` and `useUnlockGSTReport` hooks.
- Added visual badges to `GSTR1View` and `GSTR3BView` indicating the state of the report: **Draft (Live)**, **Locked Snapshot**, or **Corrected Draft**.
- Added dynamic buttons: "Lock & Snapshot" vs "Unlock for Corrections", and context-aware export buttons ("Draft JSON" vs "Export JSON").

## Conclusion
Phase 4A effectively bridges the gap between dynamic daily transactions and static monthly compliance, fulfilling the prerequisites for advancing to Phase 4B (GSTR-2B Reconciliation).
