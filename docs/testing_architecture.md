# MediFlow Testing Architecture

This document outlines the testing architecture for the MediFlow system, encompassing both backend Django/Pytest coverage and frontend E2E Playwright coverage.

## Core Principles
1. **Isolated Environments**: Tests must not mutate live database or state.
2. **Deterministic Assertions**: Use fixed seeds, mocked timers where necessary, and exact precision matchers.
3. **End-to-End Confidence**: Critical business flows (like Billing and Inventory) must be proven from UI to DB.

## Backend Testing (Pytest & Django)

The backend utilizes `pytest` with `pytest-django`. We heavily employ `factory_boy` to scaffold isolated models (Outlets, MasterProducts, Batches, StockLedgers, etc.).

### Decimal Precision and Ledger Math
For financial and inventory calculations (such as fractional pill consumption), tests must enforce strict `Decimal` types.
- **Floating Point Ban**: Assertions must never use primitive floats for money or fractional stock (`0.3000` != `0.3`).
- **Assertion Standard**: When verifying `sale_services.py` or ledger deductions, assert using `Decimal(string)` to guarantee quantized bounds.
  ```python
  ledger_entry = StockLedger.objects.get(...)
  assert ledger_entry.qty_out == Decimal('0.3000') # 3 loose pills out of a 10 pack
  ```

### Dynamic Inventory Valuation
Valuation algorithms natively parse complex multi-basis returns. 
- **Assertion Standards**: `InventoryValuationView` logic handles fractional `effective_qty`. 
- Tests must seed a complex mathematical scenario (e.g., 10 strips + 5 loose with a pack size of 10 = `10.5` effective quantity) and explicitly assert the output aggregates: `total_value_purchase`, `total_value_landing`, and `total_value_mrp`.

## Frontend E2E Testing (Playwright)

We utilize Microsoft Playwright (`@playwright/test`) to verify real user interactions across the Next.js frontend, ensuring UI elements react properly to state (Zustand) and API payloads.

### UI Interaction Standards
- **Wait Mechanisms**: Rely on `expect(locator).toBeVisible()` or `waitForSelector` to handle async state changes gracefully, instead of arbitrary `page.waitForTimeout()`.
- **Selectors**: Prefer `getByRole` and `getByText` for accessibility-friendly assertions over strict CSS locators.

### Master-Detail UI Components
When testing TanStack Table Master-Detail expansions (like the `StockTable`):
1. **Target the Expander**: Locate the parent row chevron (e.g., `locator('button:has(svg.lucide-chevron-right)')`).
2. **Assert Visibility Shift**: Click the chevron and explicitly wait for nested table headers (`Batch No`, `Landing Rate`) to become visible before asserting row contents.

### Form State and Calculators
For complex modals like the Tabbed `EditProductModal`:
- **Navigation**: Verify Radix Tab interactions via `page.getByRole('tab')`.
- **Reactive Hooks**: Verify `react-hook-form` and `useFieldArray` integrations by clicking "Add Batch", inputting numbers (`MRP`, `Margin%`), and asserting that auto-calculator hooks (like the Landing Rate calculator) instantly populate the derived values.

## GST Engine Testing

The GST Engine tests (`apps.gst.tests`) rigorously verify API behaviors, date-boundary snapshot syncs, and sandbox integrations.

### Snapshot Syncing Lifecycle (Timezone Handling)
- **Local Time vs UTC**: The snapshot sync service (`apps/reports/gst_snapshot_service.py`) relies on `django.utils.timezone.localtime` to convert timezone-aware datetimes before calling `.date()`.
- **Test Standard**: When writing GST sync tests, you MUST mock boundary conditions (e.g., a bill created late at night local time where UTC rolls over to the previous day) to ensure `create_sale_snapshots` records the correct LOCAL date. 
  ```python
  # Always test UTC boundary conditions explicitly
  inv = SaleInvoice.objects.create(
      invoice_date=make_aware(datetime(2026, 9, 3, 2, 0, 0)) # UTC: 2026-09-02 20:30:00
  )
  create_sale_snapshots(inv)
  snap = GSTTransactionSnapshot.objects.get(document_id=inv.id)
  assert snap.document_date.strftime('%Y-%m-%d') == '2026-09-03'
  ```

### Date-Range Filtering Protocols
- The Live GSTR-1, 2B, and 3B dashboard views derive period parameters from explicit date-ranges.
- Validations (e.g., `GSTR3BValidator`) which strictly expect a `MMYYYY` period string must dynamically synthesize it from `start_date` bounds if the direct `period` query parameter is omitted.
- Test suites must verify that `VAL-002` blocking errors do not emerge when querying endpoints solely via `?start=YYYY-MM-DD&end=YYYY-MM-DD`.
