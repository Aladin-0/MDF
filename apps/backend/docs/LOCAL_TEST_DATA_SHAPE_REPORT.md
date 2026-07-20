# Local Test Data Shape Report

Based on the actual Django models in MediFlow, here are the core required fields for generating a realistic and safe dataset.

## Master Data Entities

### 1. `core.Organization`
- **Required**: `name` (CharField)
- **Role**: Base tenant for all outlets.

### 2. `core.Outlet`
- **Required**: `organization` (FK), `name`, `address`, `city`, `state`, `state_code`, `pincode`, `phone`
- **Critical for GST**: `state`, `state_code`, `gstin`. These must look realistic as they determine intra/inter-state logic for sales and purchases.

### 3. `accounts.Customer`
- **Required**: `outlet` (FK), `name`, `phone`, B2B specific (`gstin`, `state`, `address`).
- **Dangerous Hidden Assumptions**: Without `gstin` and `state`, it's a B2C customer. If `state` doesn't match the outlet's state, it could incorrectly trigger inter-state logic if a GSTIN is provided. We must ensure `state` is accurately populated to match GSTIN logic.

### 4. `purchases.Distributor`
- **Required**: `outlet` (FK), `name`, `phone`, `address`, `city`, `state`, `credit_days`, `balance_type`, `is_active`.
- **Critical for GST**: `gstin`, `state` must be valid to determine IGST vs CGST/SGST on purchase invoices.

### 5. `inventory.MasterProduct`
- **Required**: `name`, `composition`, `manufacturer`, `category`, `drug_type`, `schedule_type`, `gst_rate` (Decimal), `pack_size`, `pack_unit`, `pack_type`, `mrp`, `default_sale_rate`, `min_qty`, `reorder_qty`.
- **Critical for GST**: `hsn_code`, `gst_rate`. Must have variety (0%, 5%, 12%, 18%).

### 6. `inventory.Batch`
- **Required**: `outlet` (FK), `product` (FK), `batch_no`, `expiry_date` (Date), `mrp`, `purchase_rate`, `sale_rate`, `pack_size`, `pack_unit`, `pack_type`, `qty_strips`, `qty_loose`, `is_active`, `is_opening_stock`.
- **Dangerous Hidden Assumptions**: `qty_strips` and `qty_loose` dictate sellable stock. A product without batches or stock will fail during the billing flow since sales require batch selection.

## Transactional Data Entities

### 7. `purchases.PurchaseInvoice`
- **Required**: `outlet`, `distributor`, `invoice_no`, `invoice_date`, `purchase_type`, `godown`, amounts (`subtotal`, `discount_amount`, `taxable_amount`, `gst_amount`, `cess_amount`, `freight`, `round_off`, `grand_total`, `amount_paid`, `outstanding`).
- **Dependencies**: Modifies batch stock upon creation via purchase service.

### 8. `billing.SaleInvoice`
- **Required**: `outlet`, `invoice_no`, `invoice_date` (DateTimeField), amounts (`subtotal`, `discount_amount`, `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `cgst`, `sgst`, `igst`, `grand_total`, `amount_paid`, `amount_due`), payment split (`payment_mode`, `cash_paid`, `upi_paid`, `card_paid`, `credit_given`).
- **Dangerous Hidden Assumptions**: `amount_paid` MUST equal `cash_paid + upi_paid + card_paid + credit_given` otherwise a `ValidationError` triggers. We saw this in `test_phase3_reports.py`.

### 9. `billing.SaleItem`
- **Required**: `invoice`, `batch`, `product_name`, `pack_size`, `pack_unit`, `schedule_type`, `batch_no`, `expiry_date`, rates (`mrp`, `sale_rate`, `rate`), `qty_strips`, `qty_loose`, `qty_returned`, `sale_mode`, `discount_pct`, `gst_rate`, `taxable_amount`, `gst_amount`, `total_amount`.
- **Critical for Immutability (Phase 1)**: `hsn_code` must be frozen on the item correctly.

### 10. `billing.SalesReturn` & `billing.SalesReturnItem`
- **Required**: Must accurately point to `original_sale` and `original_sale_item`. Items must have valid `qty_returned` and explicitly track `taxable_amount` and `gst_amount` appropriately signed for snapshot reporting.
