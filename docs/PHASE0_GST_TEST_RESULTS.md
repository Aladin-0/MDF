# Phase 0 — GST Test Results

**Date:** 2026-07-17  
**Runner:** pytest 9.1.0, Django 5.0.3, Python 3.12.3, PostgreSQL  
**Suite:** `apps/accounts/tests/test_phase0_gst.py`  
**Final Result:** ✅ **6 / 6 PASSED**

---

## Test Matrix Results

| ID | Scenario | Status | Notes |
|----|----------|--------|-------|
| A1 | Intra-state Sale (12% GST → CGST 6% + SGST 6%) | ✅ PASSED | Journal lines correct |
| A2 | Inter-state Sale (12% GST → IGST 12%) | ✅ PASSED | Journal lines correct |
| B1 | Intra-state Purchase (12% GST → CGST Input 6% + SGST Input 6%) | ✅ PASSED | Journal lines correct |
| B2 | Inter-state Purchase (18% GST → IGST Input 18%) | ✅ PASSED | Journal lines correct |
| C1 | Intra-state Sales Return (reverse journal → contra entries) | ✅ PASSED | Reversal lines correct |
| C2 | Inter-state Purchase Return / Debit Note (18% IGST) | ✅ PASSED | **Bug found and fixed** |

---

## Bug Found and Fixed: C2 — `post_debit_note` IGST Path Missing

### Root Cause
`post_debit_note` always split GST into CGST Input + SGST Input halves, regardless of whether the purchase was interstate. For an inter-state purchase return the correct reversal is a **single credit to IGST Input** (the full amount).

### Evidence
```
# Before fix — C2 produced:
Lines were: ['DL Dist', 'Purchase Returns', 'CGST Input 9%', 'SGST Input 9%']
#                                            ^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^
#                                            WRONG: should be IGST Input 18%
```

### Fix Applied
`journal_service.py` `post_debit_note` (lines ~956–1002) — mirrored the exact same
interstate detection logic already present in `_build_purchase_gst_lines`:

1. Read `outlet.state` and `debit_note.distributor.state` (via FK or party_ledger).
2. Call `_is_interstate(distributor_state, outlet_state)`.
3. If **interstate** → credit `IGST Input {snapped_rate}%` for the full `gst_amount`.
4. If **intrastate** → split into CGST Input + SGST Input as before.

Pure accounting correction. No schema change, no migration, no side effects.

---

## Infrastructure Fixes (Test Harness Only)

| Issue | Fix Applied |
|-------|-------------|
| `SaleInvoice.clean()` ValidationError: `amount_paid ≠ cash_paid` | Added `cash_paid=<amount>` to all test invoices |
| `LedgerGroup.get_or_create()` — outlet_id NOT NULL | Added `outlet=outlet` to all LedgerGroup calls |
| `Ledger 'Purchase Account' not found` | Added explicit `get_or_create` for Purchase Account, Sales Account, Purchase Returns |
| `'float' has no attribute 'quantize'` in purchase GST lines | Wrapped all numeric invoice fields with `Decimal('...')` |
| `Staff.objects.create(username=...)` unexpected kwarg | Used correct fields: `phone=`, `name=`, `outlet=` |
| Rate-specific GST Input/Payable ledgers missing | Added explicit `get_or_create` for CGST/SGST/IGST ledgers in fixture |

---

## Confirmed Stable Behaviours

- CGST/SGST split for intra-state sales and purchases — ✅
- IGST only for inter-state sales and purchases — ✅
- Sales Return reversal (via `reverse_journal`) creates correct contra entries — ✅
- Purchase Return (Debit Note) interstate IGST credit — ✅ (after fix)
- Outlet isolation: all ledgers, journal entries, GST lines scoped to outlet — ✅
- Double-entry balance enforced before writing — ✅

---

## Phase 0 Conclusion

**The floor is stable.** One substantive bug (`post_debit_note` ignoring interstate for IGST)
has been found and fixed, verified by the full test suite.

**Safe to proceed to Phase 1:** schema immutability fixes (`SaleItem.hsn_code` snapshot,
`SalesReturnItem` tax breakdown fields).
