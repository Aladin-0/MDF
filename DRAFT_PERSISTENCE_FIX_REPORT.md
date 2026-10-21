# DRAFT PERSISTENCE & HYDRATION FIX REPORT

**Date:** 2026-10-21  
**Target:** Multi-Tab POS Billing (`/billing`)  
**Status:** Resolved & Verified  

---

## 1. Root Cause Analysis

A thorough audit of [`billingStore.ts`](apps/frontend/store/billingStore.ts), [`useAutosaveDraft.ts`](apps/frontend/hooks/useAutosaveDraft.ts), [`useLoadDrafts.ts`](apps/frontend/hooks/useLoadDrafts.ts), and [`page.tsx`](apps/frontend/app/billing/page.tsx) identified four interconnected reasons why drafts and tabs disappeared on page reload (F5):

1. **Absence of Local Persistence in `billingStore`:**
   - [`billingStore.ts`](apps/frontend/store/billingStore.ts) was created with plain Zustand (`create<BillingState>((set, get) => ({ ... }))`) without the `persist` middleware.
   - All state—including `drafts`, `activeDraftId`, `activeStaff`, and `isPinVerified`—lived entirely in volatile browser memory. Refreshing the browser wiped all local tabs instantly.

2. **Asymmetric Autosave vs. Hydration:**
   - While [`useAutosaveDraft.ts`](apps/frontend/hooks/useAutosaveDraft.ts) pushed the active draft to the database (`PUT/POST /api/v1/sales/drafts/`) after a 2-second debounce and set the tab indicator to `"Saved"`, it never wrote to `localStorage`.
   - New blank tabs or drafts without items were never persisted to the backend, so on reload they were lost completely.

3. **PIN Entry Guard Blocking Draft Restoration:**
   - On page reload, `isPinVerified` reset to `false`.
   - [`page.tsx`](apps/frontend/app/billing/page.tsx) guarded rendering with `if (!isPinVerified) return <StaffPinEntry />`.
   - Meanwhile, [`useLoadDrafts.ts`](apps/frontend/hooks/useLoadDrafts.ts) had `if (!activeStaff) return;`, creating a deadlock where draft loading was blocked until staff re-entered their PIN.

4. **Premature Mount of `ActiveBillsTabs` Overwriting State:**
   - [`ActiveBillsTabs.tsx`](apps/frontend/components/billing/ActiveBillsTabs.tsx) contained an effect: `if (draftList.length === 0) createDraft();`.
   - When mounting before hydration completed, the empty in-memory store triggered `createDraft()`, overwriting active draft pointers.

---

## 2. The Store / Hydration Fix

### Store Configuration with `persist` Middleware
In [`apps/frontend/store/billingStore.ts`](apps/frontend/store/billingStore.ts), the store is now wrapped in Zustand's `persist` middleware with `skipHydration: true` (for Next.js SSR safety) and selective partialize to preserve only persistent billing data across reloads:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useBillingStore = create<BillingState>()(
    persist(
        (set, get) => ({
            drafts: {},
            activeDraftId: null,
            activeStaff: null,
            isPinVerified: false,
            _hasHydrated: false,
            setHasHydrated: (state) => set({ _hasHydrated: state }),

            // ... actions ...
        }),
        {
            name: 'mediflow-billing-drafts',
            skipHydration: true,
            partialize: (state) => ({
                drafts: state.drafts,
                activeDraftId: state.activeDraftId,
                activeStaff: state.activeStaff,
                isPinVerified: state.isPinVerified,
                showMarginInfo: state.showMarginInfo,
                billsToday: state.billsToday,
            }),
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.warn('Billing store hydration error:', error);
                }
                useBillingStore.getState().setHasHydrated(true);
            }
        }
    )
);
```

### Global Rehydration in `Providers`
In [`apps/frontend/app/providers.tsx`](apps/frontend/app/providers.tsx), billing store rehydration is initiated on mount alongside `authStore` and `settingsStore`:

```typescript
try {
    useBillingStore.persist.rehydrate();
} catch (e) {
    console.error('Failed to rehydrate billing store:', e);
} finally {
    useBillingStore.getState().setHasHydrated(true);
}
```

---

## 3. The Initialization Hook & Page Load Sequence

### Hydration & Draft Restoration in `page.tsx`
In [`apps/frontend/app/billing/page.tsx`](apps/frontend/app/billing/page.tsx), we guard against rendering the workspace until `hasHydrated && draftsLoaded`:

```tsx
export default function FullScreenBillingPage() {
    const { isPinVerified, activeDraftId, drafts } = useBillingStore();
    const hasHydrated = useBillingStore(state => state._hasHydrated);
    useAutosaveDraft();
    const draftsLoaded = useLoadDrafts();

    // Ensure billing store finishes rehydration on mount
    useEffect(() => {
        if (!useBillingStore.getState()._hasHydrated) {
            useBillingStore.persist?.rehydrate?.();
            useBillingStore.getState().setHasHydrated(true);
        }
    }, []);

    // 1. Wait for local storage rehydration & server sync before rendering workspace
    if (!hasHydrated || !draftsLoaded) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500 font-medium">
                Loading drafts...
            </div>
        );
    }

    // 2. Only show PIN entry if not already verified from persisted session
    if (!isPinVerified) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
                <StaffPinEntry />
            </div>
        );
    }

    return (
        // Render ActiveBillsTabs, MainInvoiceWorkspace, RightBillingRail
    );
}
```

### Server Sync & Tab Recovery in `useLoadDrafts.ts`
In [`apps/frontend/hooks/useLoadDrafts.ts`](apps/frontend/hooks/useLoadDrafts.ts), server drafts are fetched and merged with local drafts:
- Local drafts containing complete item/batch details are preserved.
- Unsaved server drafts are recovered.
- If multiple drafts exist, the most recently updated draft (`updatedAt` descending) is selected as `activeDraftId`.
- If no drafts exist anywhere, one clean initial draft is created.

```typescript
const draftList = Object.values(newDrafts);
if (draftList.length === 0) {
    createDraft();
} else {
    // Sort by updatedAt / createdAt descending to find the most recently modified draft
    const sorted = [...draftList].sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
    });
    const targetId = (currentActiveId && newDrafts[currentActiveId]) 
        ? currentActiveId 
        : sorted[0].id;
    setDrafts(newDrafts, targetId);
}
```

---

## 4. Verification Results

All unit tests and integration tests covering the billing store, hooks, and pickers pass cleanly:

```bash
PASS store/billingStore.test.ts
PASS hooks/__tests__/useLoadDrafts.test.tsx
PASS store/__tests__/billingStore.test.ts
PASS components/billing/DoctorPicker.test.tsx
PASS components/billing/CustomerSearch.test.tsx
PASS components/billing/MainInvoiceWorkspace.test.tsx
PASS components/billing/BillSuccessScreen.test.tsx
PASS components/billing/InvoiceThermal.test.tsx

Test Suites: 8 passed, 8 total
Tests:       25 passed, 25 total
```
