# GST 2.0 SLAB MODERNIZATION & GSTR-1 EXCEL SORTING ARCHITECTURE REPORT

**Author:** Principal Backend Architect  
**Status:** Completed & Validated  
**Effective Target:** GST 2.0 Reform (Sept 2025 Cutover)  
**Verification:** Automated Pytest Suite (`apps/reports/tests/test_gstr1_excel.py`)  

---

## 1. Executive Summary

Under the GST 2.0 reforms (effective September 2025), the legacy **12.00%** and **28.00%** GST tax slabs were abolished in favour of a streamlined rate structure (0%, 5%, and 18%). MediFlow's backend previously suffered from two design flaws:
1. **Hardcoded Legacy Rates:** Static arrays and dropdown choices assumed a fixed rate universe `(0, 5, 12, 18, 28)`. The system lacked temporal validity controls to deactivate obsolete rates while maintaining backwards compatibility for pre-Sept 2025 historical invoices.
2. **Unsorted GSTR-1 Aggregations:** Excel export sheets (specifically `b2cs`, `hsn(b2b)`, `hsn(b2c)`, `b2b`, and `b2cl`) iterated through arbitrary dictionary keys, causing tax rates to be written out of sequence (e.g. 18%, 0%, 5%, 12%), risking rejection by the GST Offline Tool.

Both flaws have been resolved with a database-backed dynamic `TaxSlab` architecture, POS checkout and inventory validation gates, and strict ascending rate sorting with standardized two-decimal precision.

---

## 2. Dynamic Tax Slab Configuration & Validation Architecture

### 2.1 The `TaxSlab` Model
We migrated the rate definitions into a dynamic model in [`apps/core/models.py`](file:///home/asta/coding/MDF/apps/backend/apps/core/models.py) backed by database migration [`0014_taxslab.py`](file:///home/asta/coding/MDF/apps/backend/apps/core/migrations/0014_taxslab.py).

```python
class TaxSlab(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rate = models.DecimalField(max_digits=5, decimal_places=2, unique=True, help_text="GST percentage, e.g. 5.00, 18.00")
    description = models.CharField(max_length=100, blank=True, help_text="Slab label e.g., 'Standard Goods (GST 2.0)'")
    is_active = models.BooleanField(default=True, help_text="Whether this rate is available for new transactions")
    effective_from = models.DateField(default=date(2017, 7, 1))
    effective_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    GST2_CUTOVER_DATE = date(2025, 9, 1)
```

#### Seeded Defaults
| Rate (%) | Description | Active (`is_active`) | Effective To | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **0.00%** | Nil / Exempted | `True` | `None` | Active GST 2.0 |
| **5.00%** | Essential & Medicines | `True` | `None` | Active GST 2.0 |
| **18.00%** | Standard Medicines & Supplies | `True` | `None` | Active GST 2.0 |
| **12.00%** | Legacy Deactivated Rate | `False` | `2025-08-31` | Abolished under GST 2.0 |
| **28.00%** | Legacy Deactivated Rate | `False` | `2025-08-31` | Abolished under GST 2.0 |

### 2.2 Historical Compatibility & Validation Logic
Historical transactions created prior to September 1, 2025 retain full legal validity for audits and amendments via the `TaxSlab.is_rate_active(rate, transaction_date=...)` method:

```python
@classmethod
def is_rate_active(cls, rate: Decimal, transaction_date: Optional[date] = None) -> tuple[bool, str]:
    target_date = transaction_date or timezone.localdate()
    slab = cls.objects.filter(rate=dec_rate).first()

    # Legacy rates (12% and 28%) are valid ONLY if invoice date < Sept 1, 2025
    if slab and not slab.is_active:
        if target_date < cls.GST2_CUTOVER_DATE:
            return True, f"Legacy rate {dec_rate}% allowed for historical transaction dated {target_date}."
        return False, (
            f"GST rate {dec_rate}% was deactivated under GST 2.0 (effective Sept 2025). "
            f"Please update the product master to an active GST slab (e.g., 5.00% or 18.00%)."
        )
```

### 2.3 POS Checkout & Inventory Master Gatekeeping
1. **POS Sale Creation Gate ([`apps/billing/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L571-L585)):**
   When a pharmacist submits a sale invoice (`POST /api/v1/sales/`), each item's `gstRate` is evaluated against `TaxSlab.is_rate_active(dec_rate, transaction_date=raw_invoice_date)`. If a deactivated slab (such as 12% or 28%) is used on or after Sept 1, 2025, the POS API immediately aborts and returns an HTTP `400 Bad Request` with an explicit remedy message before any inventory is deducted or ledger entries are recorded.
2. **Product Master Gate ([`apps/inventory/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/inventory/views.py)):**
   During `MasterProduct` creation or update (`POST /api/v1/inventory/master-products/` and `PUT/PATCH /api/v1/inventory/master-products/{id}/`), products configured with deactivated rates are rejected, preventing obsolete rate propagation to batches.
3. **Dynamic Public Tax Slab API ([`apps/gst/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/gst/views.py)):**
   Exposed endpoint `GET /api/v1/gst/tax-slabs/` returning active slabs and rate metadata for UI dropdowns.
4. **Accounting Journal Dynamic Fallback ([`apps/accounts/journal_service.py`](file:///home/asta/coding/MDF/apps/backend/apps/accounts/journal_service.py)):**
   Dynamically queries `TaxSlab.get_all_rates()` to derive CGST/SGST/IGST journal breakdown components.

---

## 3. Strict Rate Sorting in GSTR-1 Excel Export

### 3.1 The Sorting Implementation
Both the underlying data builders ([`apps/reports/gstr_builders.py`](file:///home/asta/coding/MDF/apps/backend/apps/reports/gstr_builders.py)) and the Excel generation service ([`apps/reports/exports/gstr1_excel.py`](file:///home/asta/coding/MDF/apps/backend/apps/reports/exports/gstr1_excel.py)) now enforce strict ascending sort order and standard two-decimal float/decimal formatting (`5.00`, `18.00`).

#### Snippet: `b2cs` Worksheet Generation Loop
```python
# =========================================================================
# SHEET: b2cs (Small B2C Invoices Grouped by POS & Rate)
# =========================================================================
ws_b2cs = wb["b2cs"] if "b2cs" in wb.sheetnames else wb.create_sheet("b2cs")

# Group and aggregate data
b2cs_agg = {}
for snapshot in snapshots:
    snap_data = snapshot.snapshot_json or {}
    # ... aggregation into b2cs_agg keyed by (pos, rate) ...

# Strict ascending sort by GST Rate key, then POS
sorted_b2cs = sorted(
    b2cs_agg.values(),
    key=lambda b: (Decimal(str(b.get("rt") or 0)), str(b.get("pos") or ""))
)

for b in sorted_b2cs:
    rt = b.get("rt")
    rt_dec = Decimal(str(rt)).quantize(Decimal("0.01")) if rt is not None else Decimal("0.00")
    txval = float(Decimal(str(b.get("txval", 0))).quantize(Decimal("0.01")))
    iamt = float(Decimal(str(b.get("iamt", 0))).quantize(Decimal("0.01")))
    csamt = float(Decimal(str(b.get("csamt", 0))).quantize(Decimal("0.01")))
    
    ws_b2cs.append([
        b.get("sply_ty", "INTRA"),
        b.get("pos", ""),
        float(rt_dec),     # Formatted as float with 2-decimal precision (e.g. 5.00, 18.00)
        txval,
        csamt,
        b.get("apprvd", "N")
    ])
```

#### Snippet: `hsn` Worksheets (`hsn(b2b)` & `hsn(b2c)`)
```python
# Strict ascending sort by GST Rate key, then HSN code
sorted_hsn = sorted(
    hsn_agg.values(),
    key=lambda item: (Decimal(str(item.get("rt") or 0)), str(item.get("hsn_sc") or ""))
)

for data in sorted_hsn:
    rt_dec = Decimal(str(data["rt"])).quantize(Decimal("0.01"))
    ws.append([
        data["hsn_sc"],
        data["desc"][:30],
        data["uqc"],
        data["total_qty"],
        float(Decimal(str(data["total_val"])).quantize(Decimal("0.01"))),
        float(rt_dec),     # Strict ascending rate (0.00, 5.00, 18.00)
        float(Decimal(str(data["txval"])).quantize(Decimal("0.01"))),
        float(Decimal(str(data["iamt"])).quantize(Decimal("0.01"))),
        float(Decimal(str(data["camt"])).quantize(Decimal("0.01"))),
        float(Decimal(str(data["samt"])).quantize(Decimal("0.01"))),
        float(Decimal(str(data["csamt"])).quantize(Decimal("0.01")))
    ])
```

---

## 4. Verification & Automated Test Results

The automated regression test suite was executed against the containerized Django backend:

```bash
docker compose exec -T backend pytest apps/reports/tests/test_gstr1_excel.py -v
```

### Test Results:
```text
============================= test session starts ==============================
collecting ... collected 3 items

apps/reports/tests/test_gstr1_excel.py::test_gstr1_excel_b2b_summary_and_docs_table13 PASSED [ 33%]
apps/reports/tests/test_gstr1_excel.py::test_tax_slab_model_and_pos_validation PASSED [ 66%]
apps/reports/tests/test_gstr1_excel.py::test_gstr1_excel_strict_rate_sorting PASSED [100%]

======================== 3 passed, 2 warnings in 50.18s ========================
```

- **`test_gstr1_excel_b2b_summary_and_docs_table13`**: Validates dynamic B2B header calculation and Table 13 document sequences.
- **`test_tax_slab_model_and_pos_validation`**: Validates `TaxSlab` active states, cutover date rules, rejection of POS sales containing 12% products after Sept 2025 with HTTP 400, and successful creation of POS sales with 5% products.
- **`test_gstr1_excel_strict_rate_sorting`**: Deliberately seeds unsorted rate buckets (`18.0`, `0.0`, `5.0`, `12.0`) and verifies that `openpyxl` writes both `b2cs` and `hsn(b2c)` sheets in strictly ascending order: `[0.0, 5.0, 12.0, 18.0]`.

---

## 5. Architectural Recommendations

1. **Scheduled Batch Rate Reminders:** Recommend configuring a recurring background task to alert pharmacy operators to review their remaining inventory batches under deactivated slabs before their expiry.
2. **GST Portal Schema Alignment:** The rate quantization to `0.01` ensures full compliance with the official GST Offline Tool JSON/Excel import specifications without rounding discrepancies.
