# TABLET VIEWPORT CRUSH & PWA OVERHAUL REPORT

## Executive Summary
On touch tablet devices, the on-screen virtual keyboard and browser chrome typically occupy ~65% of the viewport, pushing traditional floating search dropdowns below the fold or hiding them entirely behind the keyboard. This overhaul resolves the issue through:
1. **PWA Standalone Configuration:** Removing browser URL bars and toolbars to reclaim 100% of the screen.
2. **Responsive Full-Screen Search Overlay:** Converting the dropdown into a fixed 50vh overlay that floats safely above the virtual keyboard on touch tablets with a sticky input bar.
3. **Automatic Keyboard Dismissal:** Instantly retracting the virtual keyboard upon product selection via `document.activeElement?.blur()`.

---

## 1. The PWA Setup: `manifest.json`

Created `apps/frontend/public/manifest.json` configured for standalone landscape mode:

```json
{
  "name": "MediFlow POS & Pharmacy Management",
  "short_name": "MediFlow",
  "description": "Fast, reliable, and compliant pharmacy management and POS software",
  "start_url": "/billing",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Injected Meta Tags in `apps/frontend/app/layout.tsx`:
```tsx
export const metadata: Metadata = {
    title: 'MediFlow — Modern Pharmacy Management',
    description: 'Fast, reliable, and compliant pharmacy management software for India.',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'MediFlow',
    },
    other: {
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': 'black-translucent',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="manifest" href="/manifest.json" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="theme-color" content="#ffffff" />
            </head>
            <body className="font-sans antialiased">
                ...
            </body>
        </html>
    );
}
```
*Note: Also updated `apps/frontend/middleware.ts` to allow unauthenticated static requests to `/manifest.json` and `/manifest.webmanifest`.*

---

## 2. The Overlay CSS: Responsive Positioning & Sticky Search Bar

### Overlay Container
When the user types at least 2 characters on a tablet/touch screen, the container transitions from an inline relative box into a fixed overlay covering the top `50vh` of the screen (safely above the on-screen keyboard). On desktop (`lg:`), it remains a standard relative container:

```tsx
<div className={cn(
    "w-full transition-all",
    isSearchFocused && searchQuery.length >= 2 && !quickAddProduct
        ? "fixed inset-x-0 top-0 h-[50vh] z-50 bg-white shadow-xl overflow-y-auto p-4 border-b-2 border-blue-500 lg:relative lg:inset-auto lg:top-auto lg:h-auto lg:shadow-none lg:overflow-visible lg:p-0 lg:border-none"
        : "relative"
)}>
```

### Sticky Search Bar
Within the 50vh overlay, the `<Input>` remains sticky at the top with a dedicated close button on mobile/tablet, ensuring the search term and live loader are always visible while scrolling through results:

```tsx
<div className={cn(
    "w-full relative",
    isSearchFocused && searchQuery.length >= 2 && !quickAddProduct
        ? "sticky top-0 z-20 bg-white pb-3 pt-1 border-b border-slate-100 flex items-center gap-2 lg:static lg:p-0 lg:border-none"
        : ""
)}>
    <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
        <Input ... />
        {isFetching && <Loader2 ... />}
    </div>
    {/* Tablet/Mobile Close Button */}
    {isSearchFocused && searchQuery.length >= 2 && !quickAddProduct && (
        <button
            type="button"
            onClick={() => {
                setIsSearchFocused(false);
                if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }}
            className="lg:hidden shrink-0 h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold text-xs flex items-center gap-1"
        >
            <X className="w-4 h-4" />
            <span>Close</span>
        </button>
    )}
</div>
```

### Search Results List Container
On tablets, the results stream inside the 50vh overlay. On desktop, it acts as a floating dropdown:

```tsx
<div 
    className={cn(
        "w-full bg-white divide-y divide-slate-100",
        "lg:absolute lg:left-0 lg:w-full lg:bg-white lg:border lg:border-slate-300 lg:rounded-md lg:shadow-2xl lg:max-h-[min(45vh,340px)] lg:overflow-y-auto lg:overscroll-contain lg:touch-pan-y lg:scrollbar-thin lg:scrollbar-thumb-slate-300 lg:scrollbar-track-transparent lg:z-50",
        dropdownPlacement === 'top' ? "lg:bottom-full lg:top-auto lg:mb-1" : "lg:top-full lg:mt-1"
    )}
>
```

---

## 3. The Blur Fix: Automatic Keyboard Dismissal

### `handleSelectProduct` & `handleSelectBatch` in `MainInvoiceWorkspace.tsx`
When a product is tapped, `document.activeElement?.blur()` is executed immediately, instantly retracting the virtual keyboard. Furthermore, autofocusing of quantity input is gated by `window.matchMedia('(pointer: fine)').matches`, so the virtual keyboard does not automatically re-open on touch devices.

```tsx
const handleSelectProduct = (product: ProductSearchResult) => {
    // Force blur active element to instantly retract virtual keyboard on tablets
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }

    const availableBatches = product.batches || [];
    
    // Filter out expired batches and batches with no stock
    const validBatches = availableBatches.filter(b => {
        const isExpired = b.expiryDate ? new Date(b.expiryDate) < new Date() : false;
        const hasStock = b.qtyStrips > 0 || b.qtyLoose > 0;
        return !isExpired && hasStock;
    });

    if (validBatches.length === 0 && availableBatches.length > 0) {
        setErrorMsg(`No valid stock (unexpired, qty > 0) available for ${product.name}`);
        setTimeout(() => setErrorMsg(''), 3000);
        return;
    } else if (availableBatches.length === 0) {
        setErrorMsg(`No stock available for ${product.name}`);
        setTimeout(() => setErrorMsg(''), 3000);
        return;
    }

    setQuickAddProduct(product);
    setSearchQuery('');
    setIsSearchFocused(false);
    setErrorMsg('');

    if (validBatches.length === 1) {
        handleSelectBatch(validBatches[0]);
    } else {
        setQuickAddBatch(null);
    }
};

const handleSelectBatch = (batch: Batch) => {
    setQuickAddBatch(batch);
    setQtyStrips('1');
    setQtyLoose('');
    setDiscountPct('');
    // Only autofocus qty on desktop/mouse to avoid re-summoning virtual keyboard on touch tablets
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
        setTimeout(() => {
            qtyInputRef.current?.focus();
            qtyInputRef.current?.select();
        }, 50);
    }
};
```
