# Manual GST Offline Tool Test Protocol

This directory contains the final test artifacts for validating the newly implemented GSTR-1 V2.2 formatting and HSN segregation against the official GST Returns Offline Tool.

## 1. Test Workbooks Overview

**`GSTR1_Clean_092026.xlsx`**
* **Type:** Clean / Basic Sample
* **GSTIN:** 27AADCB2230M1Z2
* **Return Period:** 092026 (September 2026)

**`GSTR1_Advanced_102026.xlsx`**
* **Type:** Advanced / Edge Case Sample
* **GSTIN:** 27AADCB2230M1Z2
* **Return Period:** 102026 (October 2026)

## 2. Expected Metrics & Totals

After importing the files into the GST Offline Tool, the dashboard should display the exact row counts and totals below. Pay special attention to the row counts for HSN (they are now correctly segregated into two sheets).

| Metric | Clean (092026) | Advanced (102026) |
|---|---|---|
| **B2B Rows** | 1 | 1 |
| **B2CS Rows** | 0 | 1 |
| **B2CL Rows** | 0 | 1 |
| **CDNR Rows** | 0 | 1 |
| **CDNUR Rows** | 0 | 0 |
| **HSN B2B Rows** | 1 | 1 |
| **HSN B2C Rows** | 0 | 2 |
| **Net Taxable Value (₹)** | 1,000.00 | 3,05,500.00 |
| **Total IGST (₹)** | 0.00 | 54,000.00 |
| **Total CGST (₹)** | 90.00 | 277.50 |
| **Total SGST (₹)** | 90.00 | 277.50 |

*(Note: Advanced B2CS row is fully netted internally, resolving both the initial ₹2000 sale and ₹500 return natively without generating a CDNUR row, as per correct offline tool specs).*

## 3. Short Import Steps

1. Launch the **GST Offline Tool** (`v3.2.4` or newer).
2. Click **NEW** under "Upload new invoice/other data for return".
3. Enter **GSTIN**: `27AADCB2230M1Z2`, Financial Year: `2026-2027`.
4. Select the correct **Tax Period** (September for Clean, October for Advanced) and hit **PROCEED**.
5. Select **IMPORT FILES** and choose **IMPORT EXCEL**.
6. Select the respective `.xlsx` file from this folder.
7. Click **YES** to proceed with the import.
8. Verify that the **Summary** dashboard matches the expected totals listed above.
9. Click **GENERATE FILE** and wait for the "JSON generated successfully" message.

---

## 4. Test Results Log
*To be filled out by the QA Tester / Authorized Representative.*

### Test 1: Clean Sample (092026)
* **Import Result:** [ ] Success / [ ] Failure 
* **Validation Result (Row Counts & Totals Matched?):** [ ] Yes / [ ] No
* **Generated JSON Result:** [ ] Success / [ ] Failure
* **Screenshots / Error Messages (if any):** 
* **Tester Name & Date:** 

### Test 2: Advanced Sample (102026)
* **Import Result:** [ ] Success / [ ] Failure 
* **Validation Result (Row Counts & Totals Matched?):** [ ] Yes / [ ] No
* **Generated JSON Result:** [ ] Success / [ ] Failure
* **Screenshots / Error Messages (if any):** 
* **Tester Name & Date:** 

---
**Note:** GST Offline Tool compatibility for Phase C Extension will NOT be declared complete until both tests pass with a "JSON generated successfully" state.
