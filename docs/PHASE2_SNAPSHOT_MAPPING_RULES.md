# Phase 2: GST Transaction Snapshot Mapping Rules

This document defines exactly how source models map to the `gst_transaction_snapshot` rows.

## 1. General Principles
- **Append-Only**: Snapshot rows are never modified. For corrections, a new snapshot with reversed polarity is expected (though deferred in this phase for simplicity).
- **Isolation**: Every row belongs to exactly one `outlet`. The `outlet_gstin` is captured at the time of creation.
- **Polarity**:
  - `sale`: Positive `taxable_value` and taxes.
  - `sales_return`: Negative `taxable_value` and taxes.
  - `purchase`: Positive `taxable_value` and taxes.
- **Source Traceability**: The identity of the snapshot row maps strictly to the **Item** level model (`SaleItem`, `SalesReturnItem`, `PurchaseItem`). Parent invoice references are stored as `parent_document_id`.

## 2. SaleItem to Snapshot Mapping
- **Trigger**: Called via centralized service (`atomic_sale_save` / `atomic_sale_update`).
- **Rules**:
  - `transaction_type`: `sale`
  - `source_model`: `'SaleItem'`
  - `source_id`: `SaleItem.id`
  - `parent_document_id`: `SaleInvoice.id`
  - `document_number`: `SaleInvoice.invoice_no`
  - `transaction_date`: `SaleInvoice.invoice_date`
  - **Party Details**: 
    - Derived from `SaleInvoice.customer`.
    - If customer exists: `party_gstin` = `Customer.gstin`, `party_state` = `Customer.state`.
    - If customer is null (B2C cash): `party_gstin` = null, `party_state` = `Outlet.state`.
    - `b2b_b2c`: `b2b` if `party_gstin` exists, otherwise `b2c`.
  - **Taxes**:
    - `hsn_code`: `SaleItem.hsn_code`
    - `gst_rate`: `SaleItem.gst_rate`
    - `taxable_value`: `SaleItem.taxable_amount`
    - `gst_amount`: `SaleItem.gst_amount`
    - **Split**: If `SaleInvoice.igst_amount > 0` or (`party_state` != `Outlet.state`), map `gst_amount` entirely to `igst_amount`. Otherwise, divide `gst_amount` by 2 and map to `cgst_amount` and `sgst_amount`.

## 3. SalesReturnItem to Snapshot Mapping
- **Trigger**: Called via centralized service (`create_sales_return` / `update_sales_return`).
- **Rules**:
  - `transaction_type`: `sales_return`
  - `source_model`: `'SalesReturnItem'`
  - `source_id`: `SalesReturnItem.id`
  - `parent_document_id`: `SalesReturn.id`
  - `document_number`: `SalesReturn.return_no`
  - `transaction_date`: `SalesReturn.return_date`
  - **Party Details**:
    - Inherited directly from `SalesReturn.original_sale.customer`.
    - Logic identical to `sale`.
  - **Taxes (Sign Convention and Split Inheritance)**:
    - `hsn_code`: `SalesReturnItem.hsn_code`
    - `gst_rate`: `SalesReturnItem.gst_rate`
    - `taxable_value`: `-1 * SalesReturnItem.taxable_amount` (Strictly Negative)
    - `gst_amount`: `-1 * SalesReturnItem.gst_amount` (Strictly Negative)
    - **Split Inheritance**: Return items must inherit the exact tax split basis from the original sale. If the original `SaleInvoice` had `igst_amount > 0`, the return must allocate the negative `gst_amount` entirely to `igst_amount`. Otherwise, divide it symmetrically into negative `cgst_amount` and `sgst_amount`.

## 4. PurchaseItem to Snapshot Mapping
- **Trigger**: Called via centralized service (`atomic_purchase_save` / `atomic_purchase_update`).
- **Rules**:
  - `transaction_type`: `purchase`
  - `source_model`: `'PurchaseItem'`
  - `source_id`: `PurchaseItem.id`
  - `parent_document_id`: `PurchaseInvoice.id`
  - `document_number`: `PurchaseInvoice.invoice_no`
  - `transaction_date`: `PurchaseInvoice.invoice_date`
  - **Party Details**:
    - Derived from `PurchaseInvoice.distributor`.
    - `party_gstin` = `Distributor.gstin`
    - `party_state` = `Distributor.state`
    - `b2b_b2c`: `b2b` if `party_gstin` exists, else `b2c`.
  - **Taxes**:
    - `hsn_code`: `PurchaseItem.hsn_code`
    - `gst_rate`: `PurchaseItem.gst_rate`
    - `taxable_value`: `PurchaseItem.taxable_amount`
    - `gst_amount`: `PurchaseItem.gst_amount`
    - `cess_amount`: `PurchaseItem.cess_amount`
    - **Split**: If `Distributor.state` != `Outlet.state`, map `gst_amount` to `igst_amount`. Otherwise, divide `gst_amount` by 2 into `cgst_amount` and `sgst_amount`.

## 5. Exclusions / Deferrals
- **PurchaseReturn / DebitNote / CreditNote**: These models currently do not exist in the codebase. Deferred to Phase 3 or later.
- **Reverse Charge Mechanism (RCM)**: Not reliably tracked at the invoice level right now. Default to False/Null.
