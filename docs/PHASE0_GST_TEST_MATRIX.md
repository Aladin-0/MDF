# Phase 0 GST Test Matrix

This matrix defines the minimal correctness tests for the current GST engine.

## Scenario A1: Intra-state Sale (12% GST)
* **Setup**: 
  * Outlet in 'Maharashtra'.
  * Customer in 'Maharashtra'.
  * Sale Invoice with a 12% GST item. Taxable: 100, CGST: 6, SGST: 6, Total: 112.
* **Trigger**: Create SaleInvoice and post it via `journal_service.post_sale_invoice`.
* **Verifications**:
  * `cgst_amount` and `sgst_amount` are populated on `SaleInvoice`.
  * `JournalEntry` contains credit lines for `CGST Payable 6%` (Amount: 6) and `SGST Payable 6%` (Amount: 6).

## Scenario A2: Inter-state Sale (12% GST)
* **Setup**: 
  * Outlet in 'Maharashtra'.
  * Customer in 'Gujarat'.
  * Sale Invoice with a 12% GST item. Taxable: 100, IGST: 12, Total: 112.
* **Trigger**: Create SaleInvoice and post it.
* **Verifications**:
  * `igst_amount` is populated on `SaleInvoice`.
  * `JournalEntry` contains a credit line for `IGST Payable 12%` (Amount: 12).
  * No CGST/SGST lines are posted.

## Scenario B1: Intra-state Purchase (18% GST)
* **Setup**: 
  * Outlet in 'Maharashtra'.
  * Distributor in 'Maharashtra'.
  * Purchase Invoice with 18% GST item. Taxable: 100, GST Amount: 18. Total: 118.
* **Trigger**: Create PurchaseInvoice and post it via `journal_service.post_purchase_invoice`.
* **Verifications**:
  * `JournalEntry` contains debit lines for `CGST Input 9%` (Amount: 9) and `SGST Input 9%` (Amount: 9).

## Scenario B2: Inter-state Purchase (18% GST)
* **Setup**: 
  * Outlet in 'Maharashtra'.
  * Distributor in 'Delhi'.
  * Purchase Invoice with 18% GST item. Taxable: 100, GST Amount: 18. Total: 118.
* **Trigger**: Create PurchaseInvoice and post it.
* **Verifications**:
  * `JournalEntry` contains a debit line for `IGST Input 18%` (Amount: 18).
  * No CGST/SGST lines are posted.

## Scenario C1: Sales Return for Intra-state Sale
* **Setup**: 
  * Create a SaleInvoice as in Scenario A1.
  * Create a CreditNote linked to this SaleInvoice via `CreditNoteService`.
* **Trigger**: `reverse_journal` is called automatically.
* **Verifications**:
  * A new `JournalEntry` is created with `source_type='RETURN'`.
  * It debits `CGST Payable 6%` and `SGST Payable 6%` (reversing the original credit liability).
  * *Note: Currently reverses the full sale amount, verifying this behavior as baseline.*

## Scenario C2: Purchase Return (Debit Note) for Inter-state Purchase
* **Setup**: 
  * Create a PurchaseInvoice as in Scenario B2.
  * Create a DebitNote linked to this PurchaseInvoice. Taxable: 50, GST: 9, Total: 59.
* **Trigger**: Post DebitNote via `journal_service.post_debit_note`.
* **Verifications**:
  * `JournalEntry` contains a credit line for `IGST Input 18%` (Amount: 9) - reversing the input tax asset.
