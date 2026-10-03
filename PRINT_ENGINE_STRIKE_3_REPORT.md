# PRINT ENGINE CUSTOMIZATION (STRIKE 3 - THE DYNAMIC ENGINE)

## 1. The Template Router Integration
In `InvoicePreviewModal.tsx`, we have successfully integrated the `useOutletSettings` hook to fetch the store settings. We intelligently extract the appropriate configuration based on the invoice's sale type (Retail vs. Wholesale) and pass it explicitly into the print components.

```tsx
const isWholesale = invoice?.saleType?.toUpperCase() === 'WHOLESALE';
const activeConfig = isWholesale ? settings?.printSettingsWholesale : settings?.printSettingsRetail;

// ... Inside the render tree ...
{isWholesale ? (
    <ManavataA4Invoice invoice={invoice} config={activeConfig} />
) : isThermal ? (
    <InvoiceThermal ref={printRef} invoice={invoice} config={activeConfig} />
) : ( ... )}
```

## 2. Dynamic Component Overhaul

### The `renderCell` Resolver Logic
Both `ManavataA4Invoice` and `InvoiceThermal` components now define a `renderCell` resolver. This switch-statement bridges the gap between dynamic JSON configurations and the actual item data:

```tsx
const renderCell = (item: any, columnId: string, idx: number) => {
    const qty = Number(item.b_qty ?? item.totalQty ?? item.qtyStrips ?? 0);
    const mrp = Number(item.mrp ?? 0);
    const ptr = Number(item.ptr ?? item.rate ?? 0);
    const pts = Number(item.pts ?? 0);
    const gstPct = Number(item.gstRate ?? item.gstPct ?? 0);
    const discountFactor = item.discountPct > 0 ? (1 - item.discountPct / 100) : 1;
    const taxable = (ptr * qty * discountFactor) / (1 + gstPct / 100);
    const gstAmount = (ptr * qty * discountFactor) - taxable;
    const amount = ptr * qty * discountFactor;

    switch (columnId) {
        case 'sn': return idx + 1;
        case 'productName': return <div className="text-left font-bold uppercase">{item.name}</div>;
        case 'batch': return item.batchNo;
        case 'mrp': return <div className="text-right">{fmtAmt(mrp)}</div>;
        case 'ptr': return <div className="text-right">{fmtAmt(ptr)}</div>;
        case 'pts': return <div className="text-right">{fmtAmt(pts || ptr)}</div>;
        case 'qty': return <div className="font-bold">{qty}</div>;
        case 'hsn': return item.hsnCode || '3004';
        case 'amount': return <div className="text-right font-bold">{fmtAmt(amount)}</div>;
        case 'mfg': return abbrevMfg(item.manufacturer);
        // ... additional specific field mappings ...
        default: return '—';
    }
};
```

### Dynamic JSX Mapping
The hardcoded `<thead>` and `<tbody>` sections in both print files have been completely eliminated. They now gracefully map over `sortedColumns`, which automatically resolves ordering and visibility rules configured via the settings UI:

```tsx
<table className="w-full text-[10px] border-collapse text-center">
    <thead className="border-b border-black text-[9px] font-bold">
        <tr>
            {sortedColumns.map((col, idx) => (
                <th key={col.id} className="..." style={{ width: col.width }}>
                    {col.label}
                </th>
            ))}
        </tr>
    </thead>
    <tbody>
        {items.map((item, i) => (
            <tr key={i} className="border-b border-gray-200">
                {sortedColumns.map((col, idx) => (
                    <td key={col.id} className="...">
                        {renderCell(item, col.id, i)}
                    </td>
                ))}
            </tr>
        ))}
    </tbody>
</table>
```

## 3. Header & Footer Hydration
The header and footer text are now dynamically populated via `activeConfig.header` and `activeConfig.footer`.
- Toggles for `showLogo`, `showDrugLicense`, and `showGstin` now control visibility.
- Hardcoded shop names were substituted with `{activeConfig.header.customText || outlet?.name}`.
- Bank details and Terms & Conditions render dynamically in the footer.

## 4. Confirmation
**Confirmed:** The hardcoded tables and hardcoded boolean flags have been completely purged from `ManavataA4Invoice.tsx` and `InvoiceThermal.tsx`. Both components are now fully data-driven layout engines relying explicitly on the customized JSON payloads.
