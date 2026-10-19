# GSTR-1 Excel Export Engine Hotfix Report

**Author:** Principal Backend Architect  
**Date:** October 14, 2026  
**Status:** Completed & Verified  

---

## Executive Summary

During data audit and compliance review of the generated GSTR-1 Offline Tool Excel file (`GSTR1_Excel_Workbook_Template_V2.2.xlsx`), two critical backend bugs were identified and remediated:
1. **Broken B2B Summary (`b2b,sez,de` worksheet):** The summary cells at Row 3 (`No. of Recipients`, `No. of Invoices`, `Total Invoice Value`, `Total Taxable Value`, `Total Cess`) remained hardcoded to `0` or formula-stale because the export service did not inject the aggregated values into the pre-allocated template summary row.
2. **Empty Table 13 (`docs` worksheet):** The `docs` worksheet contained only template headers and lacked invoice sequence data rows (`Sr. No. From`, `Sr. No. To`, `Total Number`, `Cancelled`) for Outward Invoices and Credit/Debit Notes.

Both issues have been resolved directly in [`apps/backend/apps/reports/exports/gstr1_excel.py`](file:///home/asta/coding/MDF/apps/backend/apps/reports/exports/gstr1_excel.py) and validated with preflight schema updates in [`apps/backend/apps/reports/validators.py`](file:///home/asta/coding/MDF/apps/backend/apps/reports/validators.py) and automated pytest test suites.

---

## 1. The B2B Summary Aggregation Fix

### Root Cause
In the government GSTR-1 Excel template (`V2.2`):
- **Row 1:** Sheet Title
- **Row 2:** Summary Header Labels (`A2: No. of Recipients`, `C2: No. of Invoices`, `E2: Total Invoice Value`, `L2: Total Taxable Value`, `M2: Total Cess`)
- **Row 3:** Pre-allocated Summary Value Cells (`A3: 0`, `C3: 0`, `E3: 0`, `L3: 0`, `M3: 0`)
- **Row 4:** Column Header Labels (`GSTIN/UIN of Recipient`, `Receiver Name`, `Invoice Number`, ...)
- **Row 5+:** Line Item Data Rows

The previous export implementation populated line item data starting at row 5 but never injected aggregated values into Row 3. As a result, Excel viewers reading cached XML values displayed `0` for all summary metrics.

### Implementation Snippet
The engine now tracks unique recipient GSTINs, unique invoice numbers, and sums of invoice values, taxable values, and cess. After the data row loop completes, it constructs a Row 3 instruction targeting the exact columns (`1, 3, 5, 12, 13`), ensuring cell values match the exact sum of rows below:

```python
# ---------------------------------------------------------
# Extract from apps/backend/apps/reports/exports/gstr1_excel.py
# ---------------------------------------------------------

# Aggregation variables
unique_recipients = set()
unique_invoices = set()
total_invoice_val = Decimal('0.00')
total_taxable_val = Decimal('0.00')
total_cess_val = Decimal('0.00')

for inv_group in b2b_list:
    ctin = inv_group.get('ctin', '')
    if ctin:
        unique_recipients.add(ctin)
    
    for inv in inv_group.get('inv', []):
        inum = inv.get('inum', '')
        if inum:
            unique_invoices.add(inum)
        val = Decimal(str(inv.get('val', 0)))
        total_invoice_val += val
        
        for itm in inv.get('itms', []):
            det = itm.get('itm_det', {})
            txval = Decimal(str(det.get('txval', 0)))
            csamt = Decimal(str(det.get('csamt', 0)))
            total_taxable_val += txval
            total_cess_val += csamt

            rows.append({
                1: ctin,
                2: inv.get('cname', ''),
                3: inum,
                4: inv.get('idt', ''),
                5: val,
                6: inv.get('pos', ''),
                7: inv.get('rchrg', 'N'),
                8: inv.get('inv_typ', 'R'),
                9: '',
                10: '',
                11: Decimal(str(det.get('rt', 0))),
                12: txval,
                13: csamt if csamt > 0 else ''
            })

# Inject summary row 3 (A3, C3, E3, L3, M3) to overwrite template defaults:
# Column 1 (A3): No. of Recipients
# Column 3 (C3): No. of Invoices
# Column 5 (E3): Total Invoice Value
# Column 12 (L3): Total Taxable Value
# Column 13 (M3): Total Cess
summary_row = {
    1: len(unique_recipients),
    3: len(unique_invoices),
    5: round(total_invoice_val, 2),
    12: round(total_taxable_val, 2),
    13: round(total_cess_val, 2),
}

data_map['b2b,sez,de'] = [
    {"start_row": 3, "rows": [summary_row]},
    {"start_row": 5, "rows": rows}
]
```

---

## 2. Table 13 (Documents Issued) Fix

### Root Cause
The `docs` sheet is defined as:
- **Row 1:** Title
- **Row 2:** Labels (`D2: Total Number`, `E2: Total Cancelled`)
- **Row 3:** Pre-allocated Summary Value Cells (`D3, E3`)
- **Row 4:** Headers (`Nature of Document`, `Sr. No. From`, `Sr. No. To`, `Total Number`, `Cancelled`)
- **Row 5+:** Sequence Entries

The export engine was generating the sheet metadata but completely lacked the query and mapping for Table 13.

### Implementation Snippet
The engine now queries `SaleInvoice` and `SalesReturn` models over the filtered date range (with a fallback to `GSTTransactionSnapshot` for offline/seeded tenants) and aggregates:
- `Sr. No. From` (min invoice/return number)
- `Sr. No. To` (max invoice/return number)
- `Total Number` (count of documents issued)
- `Cancelled` (count of cancelled documents)

It then populates Row 3 with the total document counts and Row 5+ with nature-wise sequence rows:

```python
# ---------------------------------------------------------
# Extract from apps/backend/apps/reports/exports/gstr1_excel.py
# ---------------------------------------------------------

from apps.billing.models import SaleInvoice, SalesReturn

# Filter SaleInvoice queryset
invoices_qs = SaleInvoice.objects.filter(
    outlet=outlet,
    is_return=False,
    invoice_date__gte=start_date,
    invoice_date__lte=end_date
)

# Outward supply invoices sequence
inv_count = invoices_qs.count()
cancelled_invoices = invoices_qs.filter(is_cancelled=True).count()

docs_rows = []
total_docs_count = 0
total_cancelled_count = 0

if inv_count > 0:
    first_inv = invoices_qs.order_by('invoice_no').first()
    last_inv = invoices_qs.order_by('invoice_no').last()
    inv_num_from = first_inv.invoice_no or str(first_inv.id)
    inv_num_to = last_inv.invoice_no or str(last_inv.id)
    
    docs_rows.append({
        1: 'Invoices for outward supply',
        2: inv_num_from,
        3: inv_num_to,
        4: inv_count,
        5: cancelled_invoices
    })
    total_docs_count += inv_count
    total_cancelled_count += cancelled_invoices

# Credit Note / Returns sequence
returns_qs = SalesReturn.objects.filter(
    outlet=outlet,
    return_date__gte=start_date,
    return_date__lte=end_date
)
ret_count = returns_qs.count()
cancelled_returns = returns_qs.filter(is_cancelled=True).count() if hasattr(SalesReturn, 'is_cancelled') else 0

if ret_count > 0:
    first_ret = returns_qs.order_by('return_no').first()
    last_ret = returns_qs.order_by('return_no').last()
    ret_num_from = first_ret.return_no or str(first_ret.id)
    ret_num_to = last_ret.return_no or str(last_ret.id)
    
    docs_rows.append({
        1: 'Credit Note',
        2: ret_num_from,
        3: ret_num_to,
        4: ret_count,
        5: cancelled_returns
    })
    total_docs_count += ret_count
    total_cancelled_count += cancelled_returns

# Inject into docs sheet (Row 3 for totals, Row 5+ for document sequences)
docs_summary_row = {
    4: total_docs_count,
    5: total_cancelled_count
}

data_map['docs'] = [
    {"start_row": 3, "rows": [docs_summary_row]},
    {"start_row": 5, "rows": docs_rows}
]
```

---

## 3. Preflight Validator Adaptation

In [`apps/backend/apps/reports/validators.py`](file:///home/asta/coding/MDF/apps/backend/apps/reports/validators.py), the `ExporterPreflightValidator._validate_row` was adapted so summary rows (`row_idx < 5`) are excluded from line-item column schema checks (avoiding false-positive errors such as recipient count flagged as an invalid GSTIN):

```python
# Skip pre-allocated summary rows (e.g. row 3)
if row_idx < 5:
    return
```

Additionally, `docs` sheet column schema was added:
```python
'docs': {
    1: {'name': 'nature', 'required': True, 'type': 'str'},
    2: {'name': 'sr_from', 'required': True, 'type': 'str'},
    3: {'name': 'sr_to', 'required': True, 'type': 'str'},
    4: {'name': 'total_num', 'required': True, 'type': 'numeric'},
    5: {'name': 'cancelled', 'required': False, 'type': 'numeric'}
}
```

---

## 4. Verification and Audit Results

### 1. Actual Export Run Inspection (`102026`)
Running the export against live store data produced the following validated output:

```
--- b2b,sez,de ROW 3 (Summary): ---
A3 (No. of Recipients)   : 1
C3 (No. of Invoices)     : 24
E3 (Total Invoice Value) : 1248585.69
L3 (Total Taxable Value) : 1226299.97
M3 (Total Cess)          : 0.00

--- docs ROW 3 (Summary): ---
D3 (Total Number)        : 61
E3 (Total Cancelled)     : 0

--- docs DATA ROWS (Table 13): ---
Row 5: ['Invoices for outward supply', 'INV-2026-001683', 'INV-2026-001723', 59, 0]
Row 6: ['Credit Note',                 'RTN-2026-000004', 'RTN-2026-000005',  2, 0]
```

### 2. Automated Test Suite
- `apps/reports/tests/test_gstr1_excel.py::test_gstr1_excel_b2b_summary_and_docs_table13`: **PASSED**
- `apps/gst/tests/test_gstr1_invoices_view.py`: **PASSED (2/2)**
- Response code: **200 OK**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- OOXML package integrity and XML syntax verified with zero workbook corruption warnings.
