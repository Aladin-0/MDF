# INVOICE TABLE UI/UX REDESIGN REPORT

**Target Component:** [`ManavataA4Invoice.tsx`](file:///home/asta/coding/MDF/apps/frontend/components/print/ManavataA4Invoice.tsx)  
**Reference Design:** [`invociedesign/pro_pharmacy_invoice.html`](file:///home/asta/coding/MDF/invociedesign/pro_pharmacy_invoice.html)  
**Scope:** Replaced horizontal spreadsheet borders with continuous vertical column lines, single-line item descriptions, 100% height container extension, and enlarged typography for enhanced print/screen legibility.

---

## 1. Executive Summary of Changes

The item table and surrounding sections inside `ManavataA4Invoice` have been redesigned:
- **Enlarged Typography:** Scaled font sizes across the invoice from cramped micro-text (7.2px–9.6px) to legible, balanced print sizes (11px–16px):
  - Table headers enlarged to `text-[0.72rem]` with `py-1 px-1.5` padding.
  - Product name enlarged to `text-[0.78rem]` with `text-[0.68rem]` metadata.
  - Table base font size increased to `0.85rem` (retail) and `0.78rem` (wholesale).
  - Store identity, customer details, GST summary, terms, and financial totals scaled proportionally.
- **Vertical Columns Only (No Horizontal Excel Grid):** Completely removed `divide-y divide-gray-200`, alternating row shading (`bg-slate-50`), and `bg-slate-100` header background. Table background is clean white with soft vertical column dividers (`border-r border-gray-300`).
- **Single-Line Product Description:** Product name and composition/company are rendered horizontally on a **single line**:
  `[PRODUCT NAME IN BOLD] [Composition • Manufacturer in muted uppercase]`.
- **100% Height Absolute Stretcher & Spacer Row:** The table is wrapped in a `flex-grow relative bg-white min-h-0` container with `<div className="absolute inset-0">` and `<table className="h-full table-fixed">`. An empty spacer row `<tr style={{ height: '100%' }}>` with `border-r border-gray-300` cells stretches vertical column lines continuously all the way down to the footer boundary (`border-t-[2px] border-gray-900`).

---

## 2. Single-Line Product Details (`renderCell`)

### JSX in `renderCell` (`case 'productName':`)
```tsx
case 'productName': {
    const name = item.name || item.productName || '—';
    const mfg = item.manufacturer ? abbrevMfg(item.manufacturer) : '';
    const comp = item.composition || (item as any)?.genericName || '';
    const metadata = comp && mfg ? `${comp} • ${mfg}` : (comp || mfg);

    return (
        <>
            <span className="font-bold text-gray-900 leading-none uppercase text-[0.78rem]">{name}</span>
            {metadata ? (
                <span className="text-gray-500 leading-none ml-1.5 uppercase text-[0.68rem]">
                    {metadata}
                </span>
            ) : null}
        </>
    );
}
```

---

## 3. Table Layout & Vertical Column Lines

### Updated JSX in `InvoiceCard`
```tsx
{/* Main Content Area with Absolute Wrapper for 100% Height */}
<div className="flex-grow relative bg-white min-h-0"> 
    <div className="absolute inset-0">
        <table className="w-full text-left pdf-table h-full table-fixed" style={{ borderCollapse: 'collapse', fontSize: isWholesale ? '0.78rem' : '0.85rem' }}>
            <thead>
                <tr>
                    {sortedColumns.map((col, idx) => (
                        <th 
                            key={col.id} 
                            className={`py-1 px-1.5 text-[0.72rem] font-bold text-gray-800 uppercase tracking-wide border-b-[2px] border-gray-900 ${col.id === 'batch' ? 'break-words whitespace-normal max-w-[80px]' : ''} ${idx === sortedColumns.length - 1 ? 'border-r-0' : 'border-r border-gray-300'} ${['mrp', 'ptr', 'pts', 'amount', 'taxable'].includes(col.id) ? 'text-right' : ['sn', 'qty', 'b_qty', 'f_qty', 'disc', 'gst', 'exp', 'hsn'].includes(col.id) ? 'text-center' : 'text-left'}`}
                            style={{ width: col.width }}
                        >
                            {col.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="align-top">
                {items.map((item, idx) => (
                    <tr key={idx}>
                        {sortedColumns.map((col, cIdx) => (
                            <td 
                                key={col.id} 
                                className={`py-1 px-1.5 leading-tight ${col.id === 'batch' ? 'break-words whitespace-normal max-w-[80px]' : ''} ${cIdx === sortedColumns.length - 1 ? 'border-r-0' : 'border-r border-gray-300'} ${['mrp', 'ptr', 'pts', 'amount', 'taxable'].includes(col.id) ? 'text-right' : ['sn', 'qty', 'b_qty', 'f_qty', 'disc', 'gst', 'exp', 'hsn'].includes(col.id) ? 'text-center' : 'text-left'}`}
                            >
                                {renderCell(item, col.id, idx)}
                            </td>
                        ))}
                    </tr>
                ))}
                {/* Empty Spacer Row (expands to fill vertical space with columns all the way to bottom) */}
                <tr style={{ height: '100%' }}>
                    {sortedColumns.map((col, cIdx) => (
                        <td 
                            key={`spacer-${col.id}`} 
                            className={`${cIdx === sortedColumns.length - 1 ? 'border-r-0' : 'border-r border-gray-300'}`}
                        />
                    ))}
                </tr>
            </tbody>
        </table>
    </div>
</div>
```

---

## 4. Verification & Testing

- **Jest Suites:** `npm test -- ManavataA4Invoice`
  - All 7 tests passing in both test files (`ManavataA4Invoice.test.tsx` and `__tests__/ManavataA4Invoice.test.tsx`).
  - Batch word-wrapping constraint preserved (`break-words whitespace-normal max-w-[80px]`).
  - Column visibility and reordering tests verified.
