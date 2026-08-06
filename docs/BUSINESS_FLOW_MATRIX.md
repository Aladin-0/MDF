# MediFlow Business Flow Matrix

This matrix documents the critical end-to-end business flows validated by the Playwright Smoke Test suite, API tests, and invariant coverage.

## Sales Workflow Matrix

| Flow ID | Scenario | Components Involved | Expected Outcome | Playwright E2E Spec |
|---------|----------|---------------------|------------------|----------------------|
| BF-001  | Create Sale Bill (Happy Path) | Next.js Frontend -> Django Sale API -> PostgreSQL | A new Sale Invoice is created successfully, inventory batches are deducted, ledger balances are updated, and UI redirects to invoice view. | `create-sale-bill` |
| BF-002  | Edit Sale Bill (Quantity Mod) | Next.js Frontend -> Django Revise API -> PostgreSQL | Sale Invoice is revised, inventory batch deductions are adjusted (returned to stock or extra deducted), and UI displays success. | `edit-sale-bill` |

## Purchase Workflow Matrix

| Business Flow | Backend/API Coverage | Invariant Coverage | Concurrency Coverage | Playwright Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **Create Purchase (Cash/Credit)** | `test_purchases_api.py` | `test_purchase_creation_invariants.py` | `test_purchase_create_concurrency.py` | `create-purchase` (in `smoke.spec.ts`) |
| **Purchase Edit / Revision** | `test_purchase_edit_migration.py` | `test_purchase_edit_stock.py` | `test_purchase_edit_concurrency.py` | `purchase-entry-mod.spec.ts` |
| **Purchase Return** | `test_purchase_return.py` | `test_purchase_return.py` | `test_purchase_return_concurrency.py` | `purchase-return-mod.spec.ts` |

## E2E Testing Strategy

- **Setup Phase:** The test suite uses the `reset_test_db_state` management command in Playwright's `globalSetup` to provide a clean, deterministic slate.
- **Workers:** Limited to 1 worker locally to avoid race conditions against the single local backend testing DB.
- **Coverage:** We focus on the "Happy Path" here. Edge cases, invariant checks, and race conditions are handled by backend Pytest API tests.
