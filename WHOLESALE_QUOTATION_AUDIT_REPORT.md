# WHOLESALE QUOTATION AUDIT REPORT

## 1. CURRENT STATE
The MediFlow platform currently handles Quotations entirely separate from Sales Invoices to prevent stock deductions and accounting impact.
- **Backend Storage:** Quotations are stored in standalone `billing_quotation` and `billing_quotationitem` tables. They do not share the `SaleInvoice` model.
- **Sandbox/IRN Security:** Because Quotations are processed by `quotation_views.py` rather than `SaleCreateView`, they inherently bypass `process_pending_irn` and all E-Invoice/E-Way Bill sandbox generation systems.
- **Frontend State:** The POS grid already supports a dual-state where a user can toggle Wholesale Mode (`F3`) and Quotation Mode (`documentMode: 'quotation'`) simultaneously. The frontend `buildSalePayload` successfully bundles wholesale details (like `transporterId`, `vehicleNo`, and `rate` calculated from PTR/PTS).

## 2. GAPS IDENTIFIED

### Database & Backend API Limitations
- **Model Schema Gap:** The `Quotation` model lacks all Wholesale B2B tracking fields (`sale_type`, `billing_basis`, `transporter_id`, `vehicle_no`, `place_of_supply`, `is_interstate`). 
- **Item Schema Gap:** The `QuotationItem` model lacks B2B pricing and wholesale packaging fields (`ptr`, `pts`, `free_qty_strips`, `free_qty_loose`, `hsn_code`).
- **Destructive API Override:** The `QuotationListCreateView` API currently forcefully looks up the `Batch` and maps `item['mrp']` and `item['sale_rate']` directly from the inventory. It completely drops and ignores the wholesale `rate` and `ptr` passed by the frontend. This forces all quotations back to Retail MRP logic upon saving.

### Frontend POS Limitations
- **E-Way Bill Validations:** The frontend correctly omits forced E-Way Bill distance checks during checkout because `useCheckout.ts` relies on the backend validation, which Quotations bypass. However, the UI does capture Transporter ID.

### Print Engine Limitations
- **Template Sharing:** The system relies on `ManavataA4Invoice.tsx` for A4 wholesale printing.
- **Incorrect Document Titling:** The A4 template hardcodes the title as **"GST INVOICE"** and **"Original for Buyer"**. It does not check if the document is a Quotation.
- **Data Masking:** It successfully hides the QR Code, IRN, and E-Way Bill sections only by coincidence (because these fields are natively `null` on Quotation payloads), but the headers remain legally incorrect for estimates.

## 3. UPGRADE BLUEPRINT

We will need to modify the following components in the upcoming implementation phase:

### Phase 1: Database Migration (`apps/backend/apps/billing/models.py`)
1. Add Wholesale fields to `Quotation`: `sale_type`, `billing_basis`, `place_of_supply`, `is_interstate`, `transporter_id`, `vehicle_no`.
2. Add Wholesale fields to `QuotationItem`: `ptr`, `pts`, `free_qty_strips`, `free_qty_loose`, `hsn_code`.
3. Generate and apply Django makemigrations.

### Phase 2: Backend API Upgrade (`apps/backend/apps/billing/quotation_views.py` & `serializers.py`)
1. Update `QuotationSerializer` and `QuotationItemSerializer` to accept the new wholesale fields.
2. Refactor the `create` and `update` logic in `QuotationListCreateView` to:
   - Persist B2B fields (transporter details, sale_type).
   - Stop forcefully overriding the item `rate` with `batch.mrp`. Allow `ptr` and `pts` to be saved if provided in the payload.
   - Map `freeQtyStrips` and `freeQtyLoose` to the QuotationItem.

### Phase 3: Print Template Refactoring (`apps/frontend/components/print/ManavataA4Invoice.tsx`)
1. Update `ManavataA4Invoice.tsx` to detect if the document is a quotation (e.g., checking for the presence of `invoice.quotationNo` or passing down a `documentMode` flag).
2. Conditionally render **"QUOTATION / ESTIMATE"** instead of **"GST INVOICE"**.
3. Conditionally hide the **"Original for Buyer"** label if the document is a Quotation.
