# Pharmacy Feedback & UX Execution Report

**Date:** October 11, 2026  
**Role:** Principal Full-Stack Architect  
**Scope:** POS Search Dropdowns Keyboard Accessibility, Sales Returns Reactive Math & Payment Toggles, Purchase Order LPP Estimation & Branding, Invoice Print Batch Word-Wrapping  

---

## 1. System Audit & Discovery Results

### 1.1 Keyboard Accessibility (Search Dropdowns)
* **Components Identified:**
  * **Customer Search:** Located in [BillingHeaderStrip.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/BillingHeaderStrip.tsx#L98-L128) using [LedgerPicker.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/LedgerPicker.tsx) (configured with `defaultGroupName="Sundry Debtors"`). A dedicated exported wrapper [CustomerSearch.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/CustomerSearch.tsx) has also been provided.
  * **Doctor Search:** Located in [DoctorPicker.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/DoctorPicker.tsx) (rendered in [BillingHeaderStrip.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/BillingHeaderStrip.tsx#L160-L175)), with a matching wrapper at [DoctorSearch.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/DoctorSearch.tsx).
* **UI Library:** Both use custom Tailwind-styled native HTML5 `<input>` elements (via `@/components/ui/input`) paired with custom absolute-positioned `<div>` dropdown containers.
* **Initial Event Listener State:** Neither component supported `ArrowDown` or `ArrowUp` keyboard traversal, nor did they track an active index. Pressing `Enter` simply hardcoded selection of `items[0]`.

### 1.2 Sales Return Workspace State
* **Component Identified:** Located at [apps/frontend/app/dashboard/accounts/sale-returns/new/page.tsx](file:///home/asta/coding/MDF/apps/frontend/app/dashboard/accounts/sale-returns/new/page.tsx) and [SaleReturnEditModal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/accounts/SaleReturnEditModal.tsx).
* **Calculation Assessment:** Total return amount was previously reliant on summing pre-calculated row properties (`items.reduce((s, i) => s + i.total, 0)`), which could lag behind real-time input events or load in stale states.
* **Payment Mode Toggles:** The workspace had only two options (`'cash'` and `'adjust'`), omitting standard pharma payment refund modes like `upi` and `credit_note`.

### 1.3 PO Estimations & Export Branding
* **PO Suggestion API:** Located in [apps/backend/apps/purchases/views.py](file:///home/asta/coding/MDF/apps/backend/apps/purchases/views.py#L1336-L1470) (`PurchaseOrderSuggestionsView`). It previously resolved `Batch.objects...ptr` and fell back to `mrp * 0.8` (or arbitrary margin multiplier); it did not query historical purchase invoices (`PurchaseItem`) for true Last Purchase Price (LPP).
* **Export Utilities:** Located in [PurchaseOrderExcelExportView](file:///home/asta/coding/MDF/apps/backend/apps/purchases/views.py#L1725) (`openpyxl`) and [PurchaseOrderPdfExportView](file:///home/asta/coding/MDF/apps/backend/apps/purchases/views.py#L1817) (`reportlab`). Company/tenant identification is directly accessible via `po.outlet.name` or `po.outlet.organization.name`.

### 1.4 Invoice Print Layout
* **Components Identified:** [ManavataA4Invoice.tsx](file:///home/asta/coding/MDF/apps/frontend/components/print/ManavataA4Invoice.tsx) (A4 format) and [InvoiceThermal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/InvoiceThermal.tsx) (Thermal format).
* **Table Layout & Batch Column:** Tables use fixed layout (`tableLayout: 'fixed'` / `table-fixed`). Neither component had CSS word-wrapping constraints on the Batch column `<th>` or `<td>`, causing lengthy batch identifiers (e.g. `BATCH-2026-EXP9999`) to push adjacent numeric columns off page boundaries.

---

## 2. The Keydown Logic (Keyboard A11y Injection)

Both [DoctorPicker.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/DoctorPicker.tsx) and [LedgerPicker.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/LedgerPicker.tsx) now maintain a `highlightedIndex` state and respond to `ArrowDown`, `ArrowUp`, `Enter`, and `Escape`:

```tsx
const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

// Sync default highlighted index when filtered items update
useEffect(() => {
    if (items.length > 0) {
        setHighlightedIndex(0);
    } else {
        setHighlightedIndex(-1);
    }
}, [items]);

const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
            setIsOpen(true);
        } else if (items.length > 0) {
            setHighlightedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
        }
        return;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (isOpen && items.length > 0) {
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
        }
        return;
    }

    if (e.key === 'Enter') {
        if (isOpen && items.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            const targetIdx = (highlightedIndex >= 0 && highlightedIndex < items.length)
                ? highlightedIndex
                : 0;
            handleSelect(items[targetIdx]);
        }
        return;
    }

    if (e.key === 'Escape') {
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        return;
    }
};
```

### Visual Feedback
Items render with conditional active styling:
```tsx
className={cn(
    "px-3 py-2 cursor-pointer rounded flex flex-col group transition-colors",
    isHighlighted 
        ? "bg-purple-100 ring-1 ring-purple-300" // (or bg-blue-100 for CustomerSearch)
        : "hover:bg-purple-50"
)}
```

---

## 3. Sales Return State & Toggles

In [apps/frontend/app/dashboard/accounts/sale-returns/new/page.tsx](file:///home/asta/coding/MDF/apps/frontend/app/dashboard/accounts/sale-returns/new/page.tsx):

### 3.1 Dynamic Reactive Total Math
```tsx
const totalAmount = useMemo(() => {
    return items.reduce((total, item) => {
        const qs = parseFloat(item.qtyStrips) || 0;
        const ql = parseFloat(item.qtyLoose) || 0;
        const r = parseFloat(item.rate) || 0;
        const ps = item.packSize || 1;
        const totalFractionalStrips = qs + (ql / ps);
        const returnQty = (item as any).return_qty !== undefined 
            ? (parseFloat((item as any).return_qty) || 0) 
            : totalFractionalStrips;
        return total + (returnQty * r);
    }, 0);
}, [items]);
```

### 3.2 Payment Toggles with `type="button"`
```tsx
<div className="space-y-1.5">
    <Label>Refund Mode</Label>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
            { value: 'cash', label: 'Cash' },
            { value: 'upi', label: 'UPI' },
            { value: 'credit_note', label: 'Credit Note' },
            { value: 'adjust', label: 'Adjust Outstanding' },
        ].map((m) => (
            <button
                key={m.value}
                type="button"
                onClick={() => setRefundMode(m.value as any)}
                className={cn(
                    'rounded-md border py-2 text-sm font-medium transition-colors text-center',
                    refundMode === m.value
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                )}
            >
                {m.label}
            </button>
        ))}
    </div>
</div>
```

---

## 4. The PO Backend Fix & Export Branding

### 4.1 Last Purchase Price (LPP) Query in `PurchaseOrderSuggestionsView`
Located in [apps/backend/apps/purchases/views.py](file:///home/asta/coding/MDF/apps/backend/apps/purchases/views.py#L1385-L1465):

```python
# Subquery latest PurchaseItem for this outlet & product
last_lpp_sq = PurchaseItem.objects.filter(
    invoice__outlet_id=outlet_id,
    master_product_id=OuterRef('pk')
).order_by('-invoice__invoice_date', '-invoice__created_at').values('purchase_rate')[:1]

# Annotated fields
products = products.annotate(
    ...
    last_purchase_rate=Subquery(last_lpp_sq, output_field=FloatField()),
    estimated_ptr=Coalesce(Subquery(
        Batch.objects.filter(outlet_id=outlet_id, product_id=OuterRef('pk')).order_by('-created_at').values('ptr')[:1]
    ), 0.0, output_field=FloatField()),
    batch_purchase_rate=Coalesce(Subquery(
        Batch.objects.filter(outlet_id=outlet_id, product_id=OuterRef('pk')).order_by('-created_at').values('purchase_rate')[:1]
    ), 0.0, output_field=FloatField())
)

for p in low_stock_products:
    # Priority: Latest PurchaseItem.purchase_rate -> Batch.purchase_rate -> Batch.ptr -> Catalog MRP
    lpp = float(p.last_purchase_rate) if p.last_purchase_rate is not None and float(p.last_purchase_rate) > 0 else float(p.batch_purchase_rate or 0.0)
    if lpp <= 0.0:
        lpp = float(p.estimated_ptr) if p.estimated_ptr is not None and float(p.estimated_ptr) > 0 else 0.0
    if lpp <= 0.0:
        lpp = float(p.mrp) if p.mrp else 0.0
```

### 4.2 Editable Est. Rate Input (Frontend Workspaces)
In [PODetailWorkspace.tsx](file:///home/asta/coding/MDF/apps/frontend/components/purchases/PODetailWorkspace.tsx#L185-L203) and [PODetailView.tsx](file:///home/asta/coding/MDF/apps/frontend/components/purchases/PODetailView.tsx#L365-L382):
```tsx
<TableCell className="text-right">
    <Input 
        type="number" 
        step="0.01"
        min={0} 
        className="w-24 text-right ml-auto h-8 bg-white" 
        value={item.lastRate} 
        onChange={(e) => {
            const newRate = parseFloat(e.target.value) || 0;
            setPoItems(prev => {
                const next = [...prev];
                next[i].lastRate = newRate;
                return next;
            });
        }} 
    />
</TableCell>
```

### 4.3 Export Branding Injection
In [PurchaseOrderExcelExportView](file:///home/asta/coding/MDF/apps/backend/apps/purchases/views.py#L1730-L1770) (`openpyxl`):
```python
po = PurchaseOrder.objects.select_related('outlet', 'outlet__organization', 'distributor').prefetch_related('items', 'items__product').get(id=pk, outlet_id=outlet_id)
company_name = (getattr(po.outlet, 'name', '') or (po.outlet.organization.name if hasattr(po.outlet, 'organization') and po.outlet.organization else "MediFlow Pharmacy")).strip()

ws.merge_cells('A1:F1')
company_cell = ws['A1']
company_cell.value = company_name.upper()
company_cell.font = Font(bold=True, size=16, color="1E293B")
company_cell.alignment = Alignment(horizontal='center')
```

In [PurchaseOrderPdfExportView](file:///home/asta/coding/MDF/apps/backend/apps/purchases/views.py#L1825-L1860) (`reportlab`):
```python
elements.append(Paragraph(f"<font size=18 color='#1E293B'><b>{company_name}</b></font>", ParagraphStyle(name='CompanyBrand', parent=styles['Normal'], alignment=1)))
elements.append(Spacer(1, 6))
```

---

## 5. The Print CSS (Word-Wrapping Fix)

To prevent long batch codes from overflowing table boundaries, the following Tailwind utility combination was applied across [ManavataA4Invoice.tsx](file:///home/asta/coding/MDF/apps/frontend/components/print/ManavataA4Invoice.tsx) and [InvoiceThermal.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/InvoiceThermal.tsx):

### Classes Applied:
```css
break-words whitespace-normal max-w-[80px]
```

### Code Implementation:
```tsx
// Inside cell renderer:
case 'batch': 
    return <span className="break-words whitespace-normal max-w-[80px] inline-block">{item.batchNo || item.batch}</span>;

// On <th>:
<th key={col.id} className={cn("py-1", col.id === 'batch' && "break-words whitespace-normal max-w-[80px]")}>

// On <td>:
<td key={col.id} className={cn("py-1 align-top", col.id === 'batch' && "break-words whitespace-normal max-w-[80px]")}>
```

---

## 6. Verification & Test Summary

| Test Suite | Result | Details |
| :--- | :--- | :--- |
| `DoctorPicker.test.tsx` | **PASS (3/3)** | ArrowDown, ArrowUp wrap-around, Enter selection, Escape close |
| `CustomerSearch.test.tsx` | **PASS (3/3)** | ArrowDown, ArrowUp wrap-around, Enter selection, Escape close |
| `ManavataA4Invoice.test.tsx` | **PASS (1/1)** | Batch `th` & `td` word-wrapping classes verified |
| `InvoiceThermal.test.tsx` | **PASS (2/2)** | Thermal print rendering intact without overflow |
| Django Backend Check | **PASS (0 errors)** | `python manage.py check` reports clean configuration |
| Purchase Orders Tests (`test_purchase_orders.py`) | **PASS (3/3)** | Verified LPP suggestion from `PurchaseItem`, dynamic Excel & PDF company branding |
