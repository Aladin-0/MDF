# Phase 2: GST Transaction Snapshot Source Map

## Overview
This document identifies the verified source models and fields in the MediFlow codebase that will feed the append-only `gst_transaction_snapshot` engine.

## Source Models

### 1. SaleItem (app: `billing`)
- **Transaction Type**: `sale`
- **Polarity**: Positive (+)
- **Source Linkage**: `source_model` = `'SaleItem'`, `source_id` = `SaleItem.id`, `parent_document_id` = `SaleInvoice.id`
- **Fields via SaleItem**:
  - `hsn_code` -> `hsn_code` (Immutable from Phase 1)
  - `gst_rate` -> `gst_rate`
  - `taxable_amount` -> `taxable_value`
  - `gst_amount` -> `gst_amount` (Split determined by parent invoice)
- **Fields via Parent SaleInvoice**:
  - `invoice_no` -> `document_number`
  - `invoice_date` -> `transaction_date`
  - `outlet` -> `outlet`
  - `customer` -> Determines `party_gstin` and `party_state`. If missing, treated as B2C intra-state.
  - `igst_amount` -> Determines if the transaction is inter-state (if `igst_amount > 0`).

### 2. SalesReturnItem (app: `billing`)
- **Transaction Type**: `sales_return`
- **Polarity**: Negative (-)
- **Source Linkage**: `source_model` = `'SalesReturnItem'`, `source_id` = `SalesReturnItem.id`, `parent_document_id` = `SalesReturn.id`
- **Fields via SalesReturnItem**:
  - `hsn_code` -> `hsn_code` (Immutable from Phase 1)
  - `gst_rate` -> `gst_rate` (Immutable from Phase 1)
  - `taxable_amount` -> `taxable_value` (Stored as negative)
  - `gst_amount` -> `gst_amount` (Stored as negative)
- **Fields via Parent SalesReturn**:
  - `return_no` -> `document_number`
  - `return_date` -> `transaction_date`
  - `outlet` -> `outlet`
  - `original_sale` -> Inherits `party_gstin` and `party_state` from the original sale's customer.

### 3. PurchaseItem (app: `purchases`)
- **Transaction Type**: `purchase`
- **Polarity**: Positive (+) for ITC/Tax paid.
- **Source Linkage**: `source_model` = `'PurchaseItem'`, `source_id` = `PurchaseItem.id`, `parent_document_id` = `PurchaseInvoice.id`
- **Fields via PurchaseItem**:
  - `hsn_code` -> `hsn_code`
  - `gst_rate` -> `gst_rate`
  - `cess_amount` -> `cess_amount`
  - `taxable_amount` -> `taxable_value`
  - `gst_amount` -> `gst_amount` (Split based on parent's distributor state)
- **Fields via Parent PurchaseInvoice**:
  - `invoice_no` -> `document_number`
  - `invoice_date` -> `transaction_date`
  - `outlet` -> `outlet`
  - `distributor` -> Determines `party_gstin` and `party_state`.

*(Note: `PurchaseReturn` / `CreditNote` / `DebitNote` do not currently exist in the models and are deferred.)*

### 4. Reference Models (for derivation)
- **Outlet** (`core.Outlet`): `gstin` -> `outlet_gstin`, `state` for POS checks.
- **Customer** (`accounts.Customer`): `gstin` -> `party_gstin`, `state` -> `party_state`.
- **Distributor** (`purchases.Distributor`): `gstin` -> `party_gstin`, `state` -> `party_state`.

## Target Model Placement
The `GSTTransactionSnapshot` model will be placed in `apps/reports/models.py`. The codebase already has an `apps/reports` directory responsible for generating GST reports, making it the appropriate architectural domain for a unified tax reporting model rather than cluttering `billing`.
