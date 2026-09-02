# GST Daily Validation - Report Data Contract

## 1. Overview
This document defines the canonical normalized data representations for the MediFlow GST Daily Validation system. By standardizing the format of sales, purchases, returns, payments, and ITC, we ensure that reports (such as GSTR-1, GSTR-3B) and daily evidence packages are generated from a single, reliable source of truth.

## 2. Canonical Data Models

### 2.1 Canonical Invoice (Sales & Purchases)
Serves as the normalized format for both `SaleInvoice` and `PurchaseInvoice`.

```json
{
  "document_id": "string",
  "document_number": "string",
  "document_date": "YYYY-MM-DD",
  "transaction_type": "SALE | PURCHASE",
  "party": {
    "name": "string",
    "gstin": "string (optional)",
    "state_code": "string"
  },
  "is_b2b": "boolean",
  "is_rcm": "boolean",
  "status": "ACTIVE | CANCELLED",
  "totals": {
    "taxable_value": "decimal",
    "cgst_amount": "decimal",
    "sgst_amount": "decimal",
    "igst_amount": "decimal",
    "cess_amount": "decimal",
    "total_invoice_value": "decimal"
  },
  "items": [
    {
      "item_id": "string",
      "hsn_code": "string",
      "description": "string",
      "quantity": "decimal",
      "uom": "string",
      "taxable_value": "decimal",
      "gst_rate": "decimal",
      "tax_amounts": {
        "cgst": "decimal",
        "sgst": "decimal",
        "igst": "decimal",
        "cess": "decimal"
      }
    }
  ]
}
```

### 2.2 Canonical Credit/Debit Note (Returns)
Normalizes `SalesReturn` and purchase adjustments.

```json
{
  "note_id": "string",
  "note_number": "string",
  "note_date": "YYYY-MM-DD",
  "original_document_number": "string",
  "original_document_date": "YYYY-MM-DD",
  "note_type": "CREDIT_NOTE | DEBIT_NOTE",
  "party_gstin": "string (optional)",
  "reason": "string",
  "differential_totals": {
    "taxable_value": "decimal",
    "cgst_amount": "decimal",
    "sgst_amount": "decimal",
    "igst_amount": "decimal"
  }
}
```

### 2.3 Canonical Tax Summary
Used for computing rolling tax liability (pre-GSTR-3B).

```json
{
  "period": "YYYY-MM",
  "outward_supplies": {
    "taxable_value": "decimal",
    "cgst": "decimal",
    "sgst": "decimal",
    "igst": "decimal"
  },
  "inward_supplies_rcm": {
    "taxable_value": "decimal",
    "cgst": "decimal",
    "sgst": "decimal",
    "igst": "decimal"
  },
  "total_tax_liability": {
    "cgst": "decimal",
    "sgst": "decimal",
    "igst": "decimal"
  },
  "total_itc_available": {
    "cgst": "decimal",
    "sgst": "decimal",
    "igst": "decimal"
  }
}
```

### 2.4 Canonical Payment
Normalizes receipts, payments, and ledger entries for cash flow and offset tracking.

```json
{
  "payment_id": "string",
  "payment_date": "YYYY-MM-DD",
  "type": "RECEIPT | PAYMENT",
  "party_name": "string",
  "amount": "decimal",
  "payment_mode": "CASH | BANK | UPI | CARD",
  "linked_documents": ["string (invoice_numbers)"]
}
```

### 2.5 Canonical ITC (Input Tax Credit)
Normalizes the state of ITC for a given inward supply document.

```json
{
  "document_number": "string",
  "itc_status": "ELIGIBLE | INELIGIBLE | DEFERRED | REVERSED",
  "reconciliation_status": "MATCHED | PARTIALLY_MATCHED | MISMATCHED | MISSING_IN_GSTR2B",
  "claimed_amounts": {
    "cgst": "decimal",
    "sgst": "decimal",
    "igst": "decimal"
  },
  "rule_37_applicable": "boolean"
}
```

## 3. Auditing Guidelines
- **Immutability:** Once a canonical record is generated for a closed period (e.g., end of day), it must not change. Any modifications to historical data must flow through the Credit/Debit Note representations.
- **Traceability:** Every canonical record must retain the primary key (`document_id`, `item_id`) of the origin table in the database to allow auditing back to the raw row.
- **Accuracy:** The summation of `items[].taxable_value` and `items[].tax_amounts` MUST exactly match the `totals` block in the invoice representation.
