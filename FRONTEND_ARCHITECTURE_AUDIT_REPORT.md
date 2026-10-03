# FRONTEND ARCHITECTURE AUDIT REPORT

## 1. Component Inventory Mapping

### Legacy Directory: `apps/frontend/components/billing/`
This folder houses the older billing components, many of which deal with auxiliary modals, success screens, or the legacy print engine.
* **Actively Used:**
  * `BillSuccessScreen.tsx`: The post-checkout UI. Used by `FullScreenBillingPage`.
  * `InvoicePreviewModal.tsx`: The print modal wrapper. Used extensively across the app (`FullScreenBillingPage`, `QuotationsList`, `SalesList`, Customer Dashboard).
  * `InvoiceThermal.tsx`: The thermal print engine. Used inside the modal and the standalone `billing/[id]/page.tsx`.
  * `StaffPinEntry.tsx`: Used for POS authentication on `FullScreenBillingPage`.
* **Orphaned / Deprecated Risk:**
  * `InvoicePreview.tsx`: This is the legacy, hardcoded A4 invoice layout. It was recently severed from the primary `InvoicePreviewModal` in favor of the new Dynamic Print Engine (`ManavataA4Invoice`), but it still actively serves traffic via the older route `app/billing/[id]/page.tsx`. This is a massive technical debt risk.

### Modern Directory: `apps/frontend/components/billing-v3/`
This folder houses the modern grid-based Point of Sale and its granular sub-components.
* **Actively Used:**
  * `ActiveBillsTabs.tsx`, `BillingHeaderStrip.tsx`, `TransactionStrip.tsx`
  * `MainInvoiceWorkspace.tsx`, `RightBillingRail.tsx`, `InlineRowEditor.tsx`
  * `DoctorPicker.tsx`, `LedgerPicker.tsx`, `CreateDoctorModal.tsx`
  * `EditSaleHydrator.tsx`, `RevisionReasonModal.tsx`
* **Artifacts/Tech Debt:**
  * `RightBillingRail.tsx.orig`: A raw Git merge conflict leftover artifact that was never cleaned up.

---

## 2. Dependency & Import Tracing
The `FullScreenBillingPage` (`apps/frontend/app/billing/page.tsx`) acts as the top-level orchestrator. It is heavily fragmented, bridging both folders directly.

### Imports in `FullScreenBillingPage`
**Pulling from `billing-v3/`:**
- `BillingHeaderStrip`, `MainInvoiceWorkspace`, `RightBillingRail`, `ActiveBillsTabs`, `TransactionStrip`, `EditSaleHydrator`

**Pulling from `billing/`:**
- `StaffPinEntry` (Authentication blocker)
- `BillSuccessScreen` (Success state wrapper)
- `InvoicePreviewModal` (Print invocation)

### Cross-Pollination Analysis
A deep grep analysis of both directories reveals that **there are no direct circular dependencies** between the components in `billing/` and `billing-v3/`. 
* Components inside `billing-v3/` do NOT import from `billing/`.
* Components inside `billing/` do NOT import from `billing-v3/`.

The two directories are structurally isolated. The only point of convergence is the orchestrating `FullScreenBillingPage.tsx` route, which glues them together.

---

## 3. Technical Debt Summary & Risk Assessment

1. **High Cognitive Overload:** 
   The coexistence of `billing/` and `billing-v3/` splits the domain context. A new developer joining the project must memorize arbitrary rules about what belongs in the legacy folder (auxiliary screens, printing) versus the new folder (the actual grid POS). When a developer needs to add a new billing component, they face decision paralysis on where to place it.

2. **The "Legacy Trap":**
   Because `billing/` is treated as the "old" folder, developers naturally avoid refactoring it. This has resulted in a critical piece of technical debt: `InvoicePreview.tsx`. It was removed from the primary POS flow, but because it hides in the legacy folder, no one noticed it is still actively serving print traffic on the `app/billing/[id]/page.tsx` dynamic route.

3. **Incomplete Migration Artifacts:**
   The presence of `v3` implies there was a `v1` and `v2`. Maintaining versioned folders in a monolithic frontend repo is an anti-pattern. Furthermore, the presence of `RightBillingRail.tsx.orig` proves that the migration to `v3` was rushed and the workspace was not properly cleaned.

**Architectural Verdict:** 
The application's billing logic is fundamentally stable (no circular dependencies), but structurally fragmented. The `billing/` and `billing-v3/` folders should be unified into a single domain-driven `billing/` folder, and obsolete files like `InvoicePreview.tsx` must be deprecated across all routes.
