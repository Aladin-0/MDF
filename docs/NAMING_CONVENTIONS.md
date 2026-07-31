# Naming Conventions

## QUANTITY FIELD NAMING CONVENTION

- **State models** (`Batch`, `SaleItem`, and any future "current stock/line" models) use plain quantity field names:
  - `qty_strips`
  - `qty_loose`
  - `qty_measured`
  - `measured_unit`

- **Transaction/event models** (`SalesReturnItem`, and any future return, adjustment, or movement models) prefix quantity fields with the action they represent:
  - `qty_returned_strips`
  - `qty_returned_loose`
  - `qty_returned_measured`

- This mirrors the `qty_returned_strips` / `qty_returned_loose` pattern established in Phase 2 and extends it consistently to measured products in Phase 5.

- Any future quantity-related model changes **must** follow this same state-vs-transaction naming rule unless explicitly redesigned and approved.
