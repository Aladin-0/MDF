# GSTR Report Validation Audit

## 1. GSTR-1 Generation and Validation

### **Data Preparation & Handling (`GSTR1Builder`)**
*   **B2B / B2C Handling:** Supplies are correctly classified into `B2B`, `B2CL` (Large), and `B2CS` (Small). The separation handles intra/inter-state flags and applies accurate original classifications to determine B2C tier.
*   **Credit/Debit Notes:** Sales returns are effectively bifurcated into `CDNR` (Registered) and `CDNUR` (Unregistered). B2CS returns are accurately omitted from `CDNUR` as per GST filing requirements. Notes report positive financial values with the appropriate type flag (e.g., `C`).
*   **HSN Summary:** HSN details are comprehensively segregated by `B2B` vs. `B2C` using fallback logic based on `is_b2b` and `original_supply_classification`. Aggregation cleanly operates on `(hsn_code, uqc, rate)`.
*   **Date Formatting:** Dates are standardized using `format_gst_date`, accommodating multiple date string styles and converting reliably to the `DD-Mon-YYYY` format required by the offline GST templates.
*   **Tax Totals:** Computations are cleanly aggregated using strict floating-point math across iterations, scaling precisely into `txval`, `iamt`, `camt`, `samt`, and `csamt`.

### **Preflight Validation (`ExporterPreflightValidator`)**
*   Robust structural checks enforce required fields (e.g., GSTINs, Note Numbers).
*   Date strings strictly match the `dd-MMM-yyyy` layout.
*   Zero/negative value rules explicitly prevent negative totals (except when technically permitted).
*   Prohibits standard dummy HSN codes like '888888'.

## 2. GSTR-1 Excel Export & Byte-Safe OOXML approach
The byte-safe OOXML insertion engine is fully operational. `GSTR1ExcelExportView` bypasses typical `openpyxl` `workbook.save()` calls. Instead, it relies on `OOXMLInjector(template_path)`, leveraging a byte-level `io.BytesIO()` extraction to prevent macro corruption within the `.xlsm` & `.xlsx` utilities.

## 3. GSTR-3B Draft Calculations & ITC Reconciliation Logic
*   **Draft Calculations (`GSTR3BBuilder`):** The logic aggregates Outward supplies (Tables 3.1 & 3.2), applying the respective B2B, B2C, RCM, or Exempt flags accurately. Zero-rated supplies and intra/interstate POS values distribute properly.
*   **ITC Reconciliation:** ITC Availability (Table 4A) explicitly loops over `ITCReconciliationResult` entities featuring `match_status='MATCHED'`. ITC figures are fully reconciled with GSTR-2B ingestion data.
*   **Deferred & Reversal ITCs:** Fully integrates deferred entries from previous periods via `DeferredITCEntry`. Captures statutory ITC reversals referencing `StockAdjustment` (17(5)) and `Rule37Adjustment` (non-payment reversed credits).

## 4. GSTR-3B Official Template Inspection
*   **Status:** The official GSTR-3B template (`GSTR3B_Excel_Utility_V5.6.xlsm`) **exists** in the repository.
*   **Location:** Found physically at `apps/backend/resources/gst_templates/GSTR3B_Excel_Utility_V5.6.xlsm`.
*   **Note:** Since the genuine offline template is actively present, we can securely use it for mapping outputs using the `OOXMLInjector`. There is no need to manually fabricate an exporter layout.
