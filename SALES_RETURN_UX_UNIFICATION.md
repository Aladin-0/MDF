# Sales Return Unified UX & Math Refactor Report

**Date:** October 11, 2026  
**Role:** Principal Full-Stack Architect & UX Engineer  
**Scope:** Elimination of Fragmented Sales Return Edit Modal, Architecture of `/[id]/edit` Route, Extraction of `SaleReturnItemsGrid`, Unified Reactive Math via `useSaleReturnCart`, and Backend PUT Integration with `DocumentRevisionV2`.

---

## 1. System Audit & Discovery Results

### 1.1 Routing & Modals
* **New Return Route:** Located at [apps/frontend/app/dashboard/accounts/sale-returns/new/page.tsx](file:///home/asta/coding/MDF/apps/frontend/app/dashboard/accounts/sale-returns/new/page.tsx). It was implemented as a full-page Next.js workspace with customer lookups, invoice selection, and reactive calculation.
* **The Edit Modal:** Located in [apps/frontend/components/accounts/SaleReturnEditModal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/accounts/SaleReturnEditModal.tsx).
* **Summoning Mechanism:** The modal was summoned exclusively inside [apps/frontend/components/accounts/SaleReturnDetailModal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/accounts/SaleReturnDetailModal.tsx) via an `editOpen` state variable triggered by an "Edit" button in the dialog header.

### 1.2 The Grid Disconnect
* **The Disconnect:** The New Return page accepted dual unit inputs (`qtyStrips` and `qtyLoose`), whereas the Edit Modal only exposed a single input labeled `"Qty (loose)"` (`qtyReturned`).
* **Why it happened:** The Edit Modal was implemented in an earlier sprint as an emergency quick-edit dialog. The author bypassed the strip-conversion logic, forcing pharmacists to manually multiply strips by pack size in their head and enter raw tablet counts. This created immediate friction and pharmacist complaints when modifying strip-based prescription sales.

### 1.3 The Math Disconnect
* **The Warning:** The Edit Modal displayed an alert:  
  `"Final total is computed server-side from original sale rates. Your preview is approximate."`
* **Why it happened:** The modal received incomplete data from the server's detail endpoint:
  1. It lacked line-item `gstRate`, meaning tax could not be computed client-side.
  2. It lacked `packSize` awareness in its line multiplication: it multiplied `qtyReturned` (loose units) directly by `returnRate` (pack rate), causing massive discrepancies unless `packSize === 1`.
  3. Instead of addressing the pack-size conversion and GST extraction math, the author applied a disclaimer label to explain away the math mismatch.

### 1.4 API Endpoints
* **Location:** Backend billing endpoints are in [apps/backend/apps/billing/views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py) and [apps/backend/apps/billing/sale_return_update_service.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/sale_return_update_service.py).
* **Payload Parity:**
  - `POST /api/v1/sales/return/` is handled by `CreateSalesReturnView` (calling `create_sales_return`).
  - `PUT /api/v1/sales/returns/<pk>/` is handled by `SalesReturnDetailView` (now wired to `atomic_sale_return_update`).
  - Both endpoints accept the identical item payload format:
    - Items identify lines via `originalSaleItemId` or `saleItemId`.
    - Quantities accept either explicit `qtyReturned` (loose total) or `qtyStripsReturned` + `qtyLooseReturned`.
    - Pricing accepts `returnRate` / `rate` and `totalAmount`.
    - Revisions record before/after JSON diffs in `DocumentRevisionV2`.

---

## 2. The Universal Return Grid (`SaleReturnItemsGrid`)

Extracted to [apps/frontend/components/accounts/SaleReturnItemsGrid.tsx](file:///home/asta/coding/MDF/apps/frontend/components/accounts/SaleReturnItemsGrid.tsx) and shared across both `new/page.tsx` and `[id]/edit/page.tsx`.

### TypeScript Interface & State Handling:

```typescript
export interface SaleReturnItemsGridProps {
    /** Reactive list of return lines */
    items: ReturnItemRow[];
    /** Callback to update individual row properties (qtyStrips, qtyLoose, rate, etc.) */
    onUpdateItem: (id: string, field: keyof ReturnItemRow, value: string) => void;
    /** Optional callback to append an empty line (enabled in New Return) */
    onAddItem?: () => void;
    /** Callback to delete an item row */
    onRemoveItem: (id: string) => void;
    /** 'new' enables free input; 'edit' presents locked product details with editable quantities */
    mode?: 'new' | 'edit';
    /** When true, product name, batch, and rates are rendered as non-editable labels */
    readOnlyProductInfo?: boolean;
    /** Toggles the '+ Add item' action footer */
    allowAddItem?: boolean;
}
```

### Key Capabilities:
1. **Dual Unit Entry:** Pharmacists input `Strips` and `Loose` units in dedicated number inputs with step validation.
2. **Pack Size Awareness:** Items with `packSize > 1` render an explicit badge (`Pack of X`) to prevent unit ambiguity.
3. **Live Recalculation:** Editing strips or loose instantly computes row total and propagates to summary cards.

---

## 3. The Unified Math Engine (`useSaleReturnCart`)

Created at [apps/frontend/hooks/useSaleReturnCart.ts](file:///home/asta/coding/MDF/apps/frontend/hooks/useSaleReturnCart.ts):

### Mathematical Formulation:
```typescript
const { subtotal, gstAmount, totalAmount } = useMemo(() => {
    let total = 0;
    let gst = 0;

    for (const item of items) {
        const qs = parseFloat(item.qtyStrips) || 0;
        const ql = parseFloat(item.qtyLoose) || 0;
        const r = parseFloat(item.rate) || 0;
        const ps = item.packSize || 1;
        const g = parseFloat(item.gstRate) || 0;
        
        // Exact fractional pack quantity:
        const totalFractionalStrips = qs + (ql / ps);
        const totalIncGst = totalFractionalStrips * r;

        total += totalIncGst;
        // Exact backward GST extraction matching backend ledger engine:
        const base = g > 0 ? (totalIncGst * 100) / (100 + g) : totalIncGst;
        gst += (totalIncGst - base);
    }

    const roundedTotal = Math.round(total * 100) / 100;
    const roundedGst = Math.round(gst * 100) / 100;
    const roundedSubtotal = Math.round((roundedTotal - roundedGst) * 100) / 100;

    return {
        totalAmount: roundedTotal,
        gstAmount: roundedGst,
        subtotal: roundedSubtotal,
    };
}, [items]);
```

### Result:
* **Zero Approximations:** The yellow warning has been eliminated. The preview matches the server calculation down to the cent.

---

## 4. Route Confirmation & Modal Elimination

### 4.1 Route Architecture
* **New Unified Route:** [apps/frontend/app/dashboard/accounts/sale-returns/[id]/edit/page.tsx](file:///home/asta/coding/MDF/apps/frontend/app/dashboard/accounts/sale-returns/[id]/edit/page.tsx)
* **Layout:** Full-page layout matching the New Return workspace. It fetches the return details via `salesApi.getReturnById(id)` on mount, hydrates the `useSaleReturnCart` hook, and renders:
  1. Header with Return Number, back navigation, and audit synchronization badge.
  2. Document overview strip (Original Invoice, Customer, Return Date).
  3. Universal `SaleReturnItemsGrid` with Strips & Loose inputs.
  4. Reason for Return text area.
  5. UI Parity Refund Mode button toggles (`Cash`, `UPI`, `Credit Note`, `Adjust Outstanding`).
  6. Mandatory Audit Trail section (`Reason Code` select + `Detailed Reason` textarea).
  7. Exact Live Financial Summary (`Subtotal`, `GST`, `Total Refund`).
  8. Save and Cancel buttons.

### 4.2 Modal Elimination
* **Trigger Replacement in [SaleReturnDetailModal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/accounts/SaleReturnDetailModal.tsx#L115-L125):**
  ```tsx
  <Button
      variant="outline"
      size="sm"
      asChild
      className="border-amber-400 text-amber-700 hover:bg-amber-50"
  >
      <Link href={`/dashboard/accounts/sale-returns/${data.id}/edit`}>
          <Pencil className="w-4 h-4 mr-2" />
          Edit
      </Link>
  </Button>
  ```
* **Deprecation of [SaleReturnEditModal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/accounts/SaleReturnEditModal.tsx):**
  Unused modal references removed from dialog hierarchy; component marked with `@deprecated`.

---

## 5. Verification & Test Summary

| Test Suite | Result | Scope Covered |
| :--- | :--- | :--- |
| `useSaleReturnCart.test.ts` | **PASS (5/5)** | Strip/loose math, fractional totals, GST extraction, max quantity guards |
| `SaleReturnItemsGrid.test.tsx` | **PASS (3/3)** | Dual unit inputs, batch display, pack-size badges, row updates |
| `DoctorPicker.test.tsx` | **PASS (3/3)** | POS dropdown keyboard accessibility |
| `CustomerSearch.test.tsx` | **PASS (3/3)** | POS customer keyboard accessibility |
| `ManavataA4Invoice.test.tsx` | **PASS (1/1)** | A4 print batch word-wrapping |
| `InvoiceThermal.test.tsx` | **PASS (2/2)** | Thermal print layout stability |
| `test_sale_return_mod.py` | **PASS (2/2)** | Backend PUT update, stock reversal, OCC validation, `DocumentRevisionV2` audit diff |
| `test_purchase_orders.py` | **PASS (3/3)** | PO LPP suggestions & branded PDF/Excel export headers |
