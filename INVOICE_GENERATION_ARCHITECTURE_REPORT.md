# INVOICE GENERATION ARCHITECTURE REPORT

## 1. HIGH-LEVEL DATA FLOW

The MediFlow checkout lifecycle is a highly coordinated flow between the Zustand frontend state machine, the Django REST framework, and background compliance integrations.

1. **Cart Assembly (Frontend)**: The user scans products. The POS frontend manages the `activeDraft` in Zustand. If `F3` is pressed, the state shifts to `WHOLESALE`.
2. **Validation Gates (Frontend)**: Upon clicking checkout (or pressing `F8`), `useCheckout.ts` and `RightBillingRail.tsx` evaluate blockers: ensuring sufficient tender for cash bills, validating Credit Limits for wholesale, and enforcing Schedule H constraints.
3. **Payload Construction**: `utils/payloadBuilders.ts` maps the Zustand draft into the final JSON payload, calculating strict `isInterstate` flags by comparing Customer and Outlet State Codes.
4. **API Submission**: The frontend POSTs to `/api/v1/sales/`.
5. **Atomic Execution (Backend)**: `SaleCreateView` opens an `transaction.atomic()` block. It sequentially generates the invoice number, deducts batch stock (FEFO), recalculates and overrides client-provided GST logic, and writes double-entry ledger postings.
6. **E-Invoice Trigger**: Outside the atomic lock, `process_pending_irn()` connects to the Sandbox API.
7. **Print Rendering**: The response is saved back to Zustand. `InvoicePreviewModal` intercepts the `isWholesale` flag to trigger the `ManavataA4Invoice` render instead of the Thermal receipt, injecting compliance tokens.

---

## 2. SCHEMA & FIELD MAPPING

The database strictly separates the generic sale data from compliance/wholesale attributes inside the `SaleInvoice` model (`apps/backend/apps/billing/models.py`).

### Generic / Core Fields
- `invoice_no`, `invoice_date`, `outlet`, `customer`, `doctor`, `billed_by`
- `subtotal`, `discount_amount`, `taxable_amount`, `grand_total`, `round_off`
- **Payment Tenders**: `cash_paid`, `upi_paid`, `card_paid`, `credit_given` (allowing complex multi-split payments).

### Retail vs Wholesale Distinction
The model defines explicit choices via `sale_type` (`RETAIL` or `WHOLESALE`) and `billing_basis` (`MRP`, `PTR`, `PTS`).

**Wholesale / B2B Specific Fields**:
- **Compliance Tracking**: `irn`, `irn_status` (`PENDING`, `GENERATED`, `FAILED`), `qr_code`, `ack_no`, `ack_date`.
- **Logistics**: `eway_bill_no`, `transporter_id`, `vehicle_no`.
- **Taxation Routing**: `place_of_supply`, `is_interstate`.

### Foreign Key Dependencies
- `SaleInvoice` -> `Customer` (for demographic data), `Doctor` (for Schedule H).
- `SaleItem` -> `Batch` (critical for FEFO tracking; strips/loose deduction).
- `Customer` -> `Ledger` (Via UUID mappings in `CustomerSerializer` to post accounting entries).

---

## 3. API & TRANSACTION PIPELINE

The endpoint `POST /api/v1/sales/` enforces strict consistency via the `transaction.atomic()` block. If any step fails, the entire database state reverts.

1. **Pre-flight & Overrides**: The API accepts a `partyLedgerId`. It safely fetches or auto-creates a B2B Customer profile to prevent data orphanism. It also validates `extraDiscountPct` against the `Staff`'s `max_discount` allowance.
2. **Schedule H Audit**: Before stock logic, `schedule_h_validate` ensures H/H1/X drugs have valid Doctor and Patient parameters.
3. **Invoice Creation**: `SaleInvoice` is instantiated with placeholder GST values.
4. **Stock Deduction & Item Creation**: 
   - Uses `fefo_batch_select` for stock resolution.
   - Validates `UnitIntegrityError` (prevents selling fractional/loose boxes).
   - Validates `Landing Cost` (prevents selling below cost margins).
   - Writes the `SaleItem`.
   - Posts a `SALE_OUT` entry to the `StockLedger`.
5. **Server-Side Tax Re-Derivation**: The backend completely distrusts frontend GST math. It recalculates `item_taxable`, `item_cgst`, `item_sgst`, and `item_igst` directly from the `item.rate` and exact `is_interstate` flag, mitigating client spoofing. It then cascades these true totals up to the `SaleInvoice`.
6. **Accounting Postings**: 
   - `CreditTransaction` is appended if `credit_given > 0`.
   - Customer `total_purchases` increments.
   - Append-only `LedgerEntry` statements are posted for the customer ledger (debited by grand total, immediately credited if cash/upi paid).
   - `post_sale_invoice()` fires for General Ledger updates.
7. **E-Invoice Trigger**: The `transaction.atomic()` block CLOSES. Only then does the script evaluate `if sale_invoice.irn_status == 'PENDING':`. It triggers `process_pending_irn()` synchronously but catches `SandboxIntegrationError`. If the Sandbox API crashes, the invoice remains saved but flagged as `FAILED`, decoupled from the core database commit.

---

## 4. FRONTEND POS STATE MACHINE

The React frontend utilizes Zustand (`useBillingStore`) as a finite state machine.

### Mode Switching
The UI tracks `saleType` ('RETAIL' | 'WHOLESALE') on the `activeDraft`. Global hotkeys explicitly hook into this:
- `F2` intercepts and runs `setSaleType(activeDraftId, 'RETAIL')`.
- `F3` intercepts and runs `setSaleType(activeDraftId, 'WHOLESALE')`.

### Validation Gates (`useCheckout.ts` & `RightBillingRail.tsx`)
Checkout execution (`F8`) is blocked if any of these invariants are true:
1. `isTenderInvalid`: In cash-mode, the inputted `cashReceived` is less than `grandTotal`.
2. `isCreditInvalid`: In credit-mode, there is no selected `customer`.
3. `isScheduleHValid`: Evaluates to false if Schedule H drugs exist in the cart but the UI is missing Patient Name/Address or Doctor Reg No.
4. `isCreditBlocked`: For wholesale credit drafts, if `customer.outstanding + grandTotal > customer.creditLimit`, the UI flashes red and permanently disables the F8 submission trigger.

### Payload Construction
`utils/payloadBuilders.ts` packages the JSON. It determines `isInterstate` proactively to split `cgstAmount/sgstAmount` vs `igstAmount` for the UI preview. It injects logistics parameters (`transporterId`, `vehicleNo`) specifically gathered during wholesale mode.

---

## 5. PRINT ENGINE & OUTPUT MAPPER

The `/components/billing/InvoicePreviewModal.tsx` acts as a router for print outputs.

### Template Routing
- If `isWholesale` is true (the backend returned `saleType: 'WHOLESALE'`), the system abandons the thermal rendering and mounts the specialized `<ManavataA4Invoice />` component.
- Otherwise, it evaluates user settings (`isThermal`) to mount `<InvoiceThermal />`.

### Compliance Injection
In `ManavataA4Invoice.tsx`:
- The backend `qr_code` text (Signed QR Code from NIC Sandbox) is passed directly into a `<QRCodeSVG />` element, rendering an authentic 2D barcode at the top right of the A4 header.
- The `irn` (64-character hash) is printed in `8px` font directly beneath the QR code.
- If `eway_bill_no` exists, it maps into the header block underneath the Date/Due Date lines.

---

## 6. TECHNICAL DEBT & RISKS

Based on the architectural audit, the following risks should be addressed:

1. **Denormalized Pricing in Sales Items**: `SaleItem` tracks `rate`, `sale_rate`, and `mrp`, but lacks explicit database columns for `PTR` and `PTS`. The frontend `ManavataA4Invoice.tsx` attempts to read `item.ptr` which is dynamically mapped. If PTR analytics are required later, the schema must formalize these attributes.
2. **E-Invoice Sync Bottleneck**: The `process_pending_irn()` API call occurs synchronously right before the `Response()` is returned. While decoupled from the DB transaction, a slow NIC Sandbox response will cause the checkout button to hang (loading state) for the cashier. It should be refactored to fire asynchronously via Celery or Redis Queues.
3. **IGST State Deduction Logic**: The server-side re-derivation (Line 724 of `views.py`) contains a `TODO` to properly use Outlet state vs Customer state for IGST calculation. The current logic uses simple string `.lower()` matching on state strings, which is prone to spelling errors. It must rely on strictly standardized 2-digit `state_code` integers.
4. **Stock Float Math**: Fractional arithmetic in `post_stock_ledger_entry` (`loose_to_deduct / pack_size`) is handled natively in Python `Decimal`. If `pack_size` is ever 0 or `None`, it could trigger a zero-division error if the fallback logic is bypassed.
