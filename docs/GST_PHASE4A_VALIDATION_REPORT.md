# GST Phase 4A: Validation Report

## Testing Methodology
The validation for Phase 4A (GST Period Locking) focuses on ensuring that the transaction guard operates reliably across all data entry points, and that the snapshots capture accurate representation of the finalized reports without breaking subsequent workflows.

## Validation Scenarios

### 1. Model Level Constraints
- **Scenario:** Attempting to create a new `SaleInvoice` where the `invoice_date` falls into a locked GST period.
  - **Result:** `ValidationError` is successfully raised by `check_gst_lock_for_instance`.
- **Scenario:** Attempting to edit an existing `PurchaseInvoice` within a locked period.
  - **Result:** `ValidationError` prevents the `.save()` operation.
- **Scenario:** Attempting to delete a `SalesReturn` associated with a locked period.
  - **Result:** `check_gst_lock` intercepts the `.delete()` operation and raises a `ValidationError`.
- **Scenario:** Creating a transaction outside of a locked period.
  - **Result:** Successful. The `check_gst_lock` utility successfully queries the `GstReportPeriod` table and finds no matching locked period.

### 2. API Level Validations
- **Scenario:** Triggering a Lock action via `/api/v1/reports/gst/lock/`.
  - **Result:** Successful. A new `GstReportPeriod` is created with status `locked`. The `generate_gstr1_report` or `generate_gstr3b_report` function is correctly executed to form the snapshot payload. A new `GstReportSnapshot` and `GstReportRevision` are persisted in the database.
- **Scenario:** Retrieving a report for a locked period.
  - **Result:** Successful. The `/api/v1/reports/gst/gstr1/` endpoint detects the `locked` status, ignores real-time data calculations, and directly returns the payload from the latest `GstReportSnapshot`.
- **Scenario:** Triggering an Unlock action via `/api/v1/reports/gst/unlock/`.
  - **Result:** Successful. The period state is updated to `corrected` and a new `GstReportRevision` captures the reason provided by the user.

### 3. UI/UX Verification
- **Scenario:** User views the GSTR-1 or GSTR-3B tab for a locked period.
  - **Result:** A visual badge "Locked Snapshot" is prominently displayed next to the title. The "Lock & Snapshot" button transforms into an "Unlock for Corrections" action. Export buttons are explicitly labeled as "Export JSON/CSV" rather than "Draft".
- **Scenario:** User unlocks a period.
  - **Result:** The user is prompted for a reason. Upon submission, the UI refreshes and a "Corrected Draft" badge is displayed. Further transactions can now be recorded for that period.

## Conclusion
The implementation of the transaction guards and snapshot mechanics meets all criteria outlined for Phase 4A. The architectural constraint ensures strict data immutability for compliance without hindering active, day-to-day operations outside of locked periods.
