# V3 CONSOLIDATION EXECUTION GUIDE

## 1. File Cleanup & Directory Merging Commands

The following commands can be executed from the project root to permanently remove technical debt artifacts and consolidate the billing domains.

```bash
# 1. Remove orphaned and artifact files
rm apps/frontend/components/billing-v3/RightBillingRail.tsx.orig
rm apps/frontend/components/billing/InvoicePreview.tsx

# 2. Move all modern V3 components into the primary billing folder
mv apps/frontend/components/billing-v3/* apps/frontend/components/billing/

# 3. Remove the now-empty billing-v3 folder
rmdir apps/frontend/components/billing-v3/
```

---

## 2. Modernizing `app/billing/[id]/page.tsx`

The legacy `InvoicePreview.tsx` was deeply hardcoded and did not respect the user's `config` customizations. The route must be rewired to leverage the modern `ManavataA4Invoice.tsx` dynamic print engine and appropriately hydrate its config.

### Updated Imports
```tsx
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ArrowLeft, Printer, MessageCircle, AlertCircle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { salesApi } from '@/lib/apiClient'
import { ManavataA4Invoice } from '@/components/print/ManavataA4Invoice' // Replaced legacy import
import { InvoiceThermal } from '@/components/billing/InvoiceThermal'
import { useSettingsStore } from '@/store/settingsStore'
import { useOutletSettings } from '@/hooks/useOutletSettings' // Added API configuration hook
```

### Updated React State/Variable Resolution (Lines 60-70)
```tsx
    const { data: invoice, isLoading, isError } = useQuery({
        queryKey: ['invoice', invoiceId],
        queryFn: () => salesApi.getById(invoiceId),
        enabled: !!invoiceId,
        staleTime: 1000 * 60 * 10, // invoices don't change
        retry: 1,
    })
    
    // Resolve dynamic schema based on mode
    const isWholesale = invoice?.saleType?.toUpperCase() === 'WHOLESALE'
    const activeConfig = isWholesale ? settings?.printSettingsWholesale : settings?.printSettingsRetail
```

### Updated JSX Return (Lines 169-181)
```tsx
                {/* Built-in Print Overrides for native Ctrl+P to hide nav/sidebar */}
                <style dangerouslySetInnerHTML={{ __html: `
                    ...
                ` }} />

                {isThermal ? (
                    <InvoiceThermal ref={printRef} invoice={invoice} config={activeConfig} />
                ) : (
                    <ManavataA4Invoice ref={printRef as any} invoice={invoice} config={activeConfig} />
                )}
            </div>
        </div>
    )
}
```

---

## 3. Resolving the Top-Level Orchestrator

The main `FullScreenBillingPage` must be updated so its import block exclusively pulls from the unified `@/components/billing/...` directory. 

### Corrected Import Block (`apps/frontend/app/billing/page.tsx`)
```tsx
'use client';

import { BillingHeaderStrip } from '@/components/billing/BillingHeaderStrip';
import { MainInvoiceWorkspace } from '@/components/billing/MainInvoiceWorkspace';
import { RightBillingRail } from '@/components/billing/RightBillingRail';
import { ActiveBillsTabs } from '@/components/billing/ActiveBillsTabs';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { TransactionStrip } from '@/components/billing/TransactionStrip';
import { useBillingStore } from '@/store/billingStore';
import { StaffPinEntry } from '@/components/billing/StaffPinEntry';
import { useAutosaveDraft } from '@/hooks/useAutosaveDraft';
import { useLoadDrafts } from '@/hooks/useLoadDrafts';
import { BillSuccessScreen } from '@/components/billing/BillSuccessScreen';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';
import { useState, useEffect, Suspense } from 'react';
import { shortcutRegistry } from '@/lib/shortcuts';
import { EditSaleHydrator } from '@/components/billing/EditSaleHydrator';
```

### Global Regex Replacement Command
If you are using a Unix environment, you can run the following `sed` command at the project root to permanently replace any stray imports remaining across the app:

```bash
find apps/frontend -type f -name "*.tsx" -exec sed -i 's|@/components/billing-v3/|@/components/billing/|g' {} +
```
