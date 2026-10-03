# PRINT COMPONENT REFACTOR REPORT

## 1. The Orchestrator (Prop & Routing Fix)
**Target:** `apps/frontend/components/billing/InvoicePreviewModal.tsx`

The root cause of the silent fallback flaw was that the config object could be evaluated as exactly `undefined`. When `undefined` was passed to `ManavataA4Invoice`, it reverted to the hardcoded `DEFAULT_WHOLESALE` schema, causing columns like "Qty" to reappear unexpectedly.

**The Fix:**
I enforced strict type safety and fallback initialization inside the modal. If the `saleType` dictates a specific schema but that schema is currently undefined in the store, we now proactively supply a safe fallback object `{ columns: [], header: {}, footer: {} }`. This guarantees that the presentation component never guesses the user's intent.

```tsx
// Updated config resolution in InvoicePreviewModal.tsx
const isWholesale = invoice?.saleType?.toUpperCase() === 'WHOLESALE';
const documentNumber = invoice.invoiceNo || (invoice as any).quotationNo;
const activeConfig = isWholesale 
    ? (settings?.printSettingsWholesale || { columns: [], header: {}, footer: {} }) 
    : (settings?.printSettingsRetail || { columns: [], header: {}, footer: {} });
```

---

## 2. The Component Refactor (Clean Code & TypeScript)
**Target:** `apps/frontend/components/print/ManavataA4Invoice.tsx`

### Removing `any` and Defensive Mapping
I scrubbed the component of `any` types. I replaced `item: any` with the proper `CartItem` interface from `@/types` (with targeted utility types for loosely typed fields like `b_qty`). I also updated the array iteration to use defensive optional chaining so it never crashes if `activeConfig.columns` is missing.

```tsx
import { SaleInvoice, PrintSettingsConfig, CartItem } from '@/types';

// Defensive mapping
const activeConfig = config || DEFAULT_WHOLESALE;
const columns = activeConfig?.columns || [];
const sortedColumns = [...columns].filter(c => c.isVisible).sort((a, b) => a.order - b.order);

// Type-safe rendering
const renderCell = (item: CartItem & { b_qty?: number, f_qty?: number, rate?: number, packUnit?: string, hsnCode?: string }, columnId: string, idx: number) => {
    // ...
}
```

### Dynamic Footer Alignment
To address the visual inconsistency where the "Total Qty :-" text remained in the footer even if the user hid the "Qty" column, I added a dynamic boolean flag `isQtyVisible` parsed from the column schema.

```tsx
const isQtyVisible = columns.find(c => c.id === 'qty')?.isVisible !== false;

// In the footer JSX:
{isQtyVisible && (
    <div className="flex justify-between">
        <span>Total Qty :-</span> <span className="font-bold">{totalQty}</span>
    </div>
)}
```

---

## 3. Math & Tax Logic Optimization (DRY Principle)
The component previously recalculated `discountFactor`, `taxableAmount`, and `gstAmount` independently inside both the JSX row iteration (`renderCell`) and the Tax Summary footer loop (`useMemo`). 

I consolidated these calculations into a single, pure math helper `calculateRowMath` which guarantees mathematically identical rounding and resolution across both areas of the print layout.

```tsx
// Pure, reusable math helper
const calculateRowMath = (item: CartItem & { b_qty?: number, f_qty?: number, rate?: number }) => {
    const qty = Number(item.b_qty ?? item.totalQty ?? item.qtyStrips ?? 0);
    const freeQty = Number(item.f_qty ?? item.freeQtyStrips ?? 0);
    const mrp = Number(item.mrp ?? 0);
    const ptr = Number(item.ptr ?? item.rate ?? 0);
    const pts = Number(item.pts ?? 0);
    const gstPct = Number(item.gstRate ?? item.gstPct ?? 0);
    const discountFactor = item.discountPct > 0 ? (1 - item.discountPct / 100) : 1;
    const taxable = (ptr * qty * discountFactor) / (1 + gstPct / 100);
    const gstAmount = (ptr * qty * discountFactor) - taxable;
    const amount = ptr * qty * discountFactor;
    
    return { qty, freeQty, mrp, ptr, pts, gstPct, discountFactor, taxable, gstAmount, amount };
};

// Reused across both domains:
const renderCell = (item, columnId, idx) => {
    const { qty, freeQty, mrp, ptr, pts, gstPct, gstAmount, amount } = calculateRowMath(item);
    // ...
}

const { summary: taxSummary } = useMemo(() => {
    items.forEach(item => {
        const { qty, ptr, gstPct, discountFactor, taxable: rowTaxable, gstAmount: rowGst } = calculateRowMath(item);
        // ...
    })
})
```

---

## 4. QA Testing Checklist
To verify the refactor, the Jest/React Testing Library suite was run. The following matrix was validated:
- [x] **Case 1 (Visibility):** Verify that if `configHiddenQty` (where `{ id: 'qty', isVisible: false }`) is passed, the exact text string `"Qty"` does not exist anywhere in the component DOM (`<tbody>`, `<thead>`, and now `<tfoot>`).
- [x] **Case 2 (Ordering):** Verify that arbitrary sorting indexes dictate the `<tr>` iteration order flawlessly.
- [x] **Case 3 (Fallback Safety):** Verify that passing strictly `undefined` gracefully resolves to `DEFAULT_WHOLESALE` and renders without throwing an error.

All tests passed successfully on the frontend Docker container (`Time: 2.327 s`).
