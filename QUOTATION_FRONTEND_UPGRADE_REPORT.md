# QUOTATION FRONTEND UPGRADE REPORT

## 1. Dashboard Redesign & Filtering

The Quotation Dashboard (`apps/frontend/components/sales/QuotationsList.tsx`) has been enhanced to visually distinguish and filter `RETAIL` vs `WHOLESALE` quotations.

### Filter Layout:
```tsx
const [typeFilter, setTypeFilter] = useState<'ALL' | 'RETAIL' | 'WHOLESALE'>('ALL');

// JSX
<div className="flex items-center gap-3 w-full sm:w-auto">
    <select
        className="h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value as any)}
    >
        <option value="ALL">All Types</option>
        <option value="RETAIL">Retail</option>
        <option value="WHOLESALE">Wholesale</option>
    </select>
    <div className="relative flex-1 sm:w-64">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
            placeholder="Search Quotation No, Customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
        />
    </div>
</div>
```

### Table Row Badge:
```tsx
<td className="px-6 py-4">
    <div className="flex items-center gap-2">
        <div className="font-semibold text-slate-900">{q.quotationNo}</div>
        {(q.saleType === 'WHOLESALE') ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">WHOLESALE</span>
        ) : (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">RETAIL</span>
        )}
    </div>
    <div className="text-slate-500 text-xs mt-0.5">{fd(q.createdAt)}</div>
</td>
```

## 2. Smart Actions (Convert & Print)

### Smart Convert Route
The `handleConvertToInvoice` logic was upgraded to pass the `saleType` into both the Billing Store draft and the URL parameters, ensuring the POS automatically locks into the correct mode:

```tsx
// Inside handleConvertToInvoice...
store.setDraftDocumentMode(draftId, 'invoice');
store.setSaleType(draftId, fullQ.saleType || 'RETAIL'); // Locks the POS state

const mode = (fullQ.saleType || 'RETAIL').toLowerCase();
router.push(`/billing?quoteId=${fullQ.id}&mode=${mode}`);
```

### Smart Print Preview ("Open")
The "Open" button was refactored to open the `InvoicePreviewModal` instead of pushing the user immediately back into the editable POS mode. The Modal and the inner `ManavataA4Invoice` component intelligently handle the document format:

```tsx
// InvoicePreviewModal.tsx determines formatting based on the quote's saleType
const isQuotation = invoice.invoiceNo?.startsWith('QT-') || !!(invoice as any).quotationNo;
const isWholesale = invoice?.saleType?.toUpperCase() === 'WHOLESALE';

{isWholesale ? (
    <ManavataA4Invoice invoice={invoice} />
) : isThermal ? (
    <InvoiceThermal ref={printRef} invoice={invoice} />
) : (
    <InvoicePreview ref={printRef} invoice={invoice} />
)}
```

Inside the **`ManavataA4Invoice.tsx`** template, conditional styling was added to re-title the document properly and suppress the "Original for Buyer" legal text when displaying an estimate:

```tsx
const isQuotation = !!invoice.quotationNo || invoice.invoiceNo?.startsWith('QT-');

// Header Rendering
<div>
    {!isQuotation && <div className="text-right text-xs font-bold">Original for Buyer</div>}
    <div className="text-center font-bold text-lg mt-1 border border-black p-1 bg-gray-100">
        {isQuotation ? 'QUOTATION / ESTIMATE' : 'GST INVOICE'}
    </div>
    <div className="text-center font-bold text-md mt-1 border border-black p-1">CREDIT</div>
</div>
```
