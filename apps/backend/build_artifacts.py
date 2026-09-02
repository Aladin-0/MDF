import os
import re
import json

base_dir = '/home/asta/.gemini/antigravity/brain/d0439193-3544-4947-8b83-4634ae1f5119'

# 1. Build agent5_audit_report.md
audit_md = """# Backend Test Audit Report

## Failing Tests Categorization

| Test File | Test Name | Failure Message | Likely Root Cause | Recommended Action | Module Affected |
|-----------|-----------|-----------------|-------------------|--------------------|-----------------|
| `apps/purchases/tests/test_purchase_edit_migration.py` | `test_purchase_edit_happy_path` | `AssertionError: 'schedule_h_data' not found in {...}` | Outdated payload structure | Update test to provide or expect new payload structure | Purchases |
| `apps/billing/tests/test_strip_math.py` | (Multiple) | `TypeError: MasterProduct() got unexpected keyword arguments: 'default_sale_rate'` | Schema/migration problem (field removed) | Remove `default_sale_rate` and `purchase_rate` from `MasterProduct` instantiation | Sales/Billing |
| `apps/billing/tests/test_api_schemas.py` | `test_quotation_convert_and_sale_create_require_same_fields` | Schema mismatch | Real application defect | Sync the validation fields between Quotation and Sale create serializers | Sales |
| `apps/billing/tests/test_cancel_reissue.py` | `test_cancel_and_reissue_links_invoices` | Validation fails | Real application defect / stale assertion | Check revised logic for invoice linking on cancel/reissue | Sales |
| `apps/billing/tests/test_direct_revise.py` | `test_direct_revise_reduces_qty` | `AssertionError: False is not true` | Stale assertion | Update test assertion to match new behavior | Sales |
| `apps/billing/tests/test_packet_b.py` | (Multiple) | `TypeError: MasterProduct() got unexpected keyword arguments: 'default_sale_rate'` | Schema/migration problem | Remove `default_sale_rate` | Sales |
| `apps/billing/tests/test_quotation_api.py` | (Multiple) | `AttributeError: 'Quotation' object has no attribute 'doctor_id'` | Schema/migration problem | Change `doctor_id` to `doctor` in tests | Sales |
| `apps/billing/tests/test_return_aware_correction.py` | `test_return_aware_allow_qty_above_returned` | `AssertionError: unexpectedly None` | Stale assertion / app defect | Investigate correction logic returning None | Returns |
| `apps/billing/tests/test_revise_api.py` | (Multiple) | `TypeError: Batch() got unexpected keyword arguments: 'sale_rate'` | Schema/migration problem | Remove `sale_rate` from Batch kwargs | Sales |
| `apps/audit/tests/test_api.py` | (Multiple) | `Cannot resolve keyword 'timestamp' into field` / `Cannot resolve keyword 'action' into field` | Schema/migration problem | Update filters to use `occurred_at` and `event_name` | Audit |
| `apps/audit/tests/test_async_logging.py` | (Multiple) | `AssertionError: 0 != 1` | Real application defect | Fix Celery eager logging trigger or signals | Audit |
| `apps/audit/tests/test_signals.py` | (Multiple) | `AssertionError: unexpectedly None` | Stale assertion / Setup problem | Ensure audit signals are connected in test env | Audit |

*Note: This is a representative sample grouped by failure category based on the 91 failures observed.*

## Tests Mutating Shared Records
Tests in `apps/billing/tests/test_billing_concurrency.py` and `apps/purchases/tests/test_purchase_edit_concurrency.py` mutate shared product/batch records simultaneously to test locking and concurrency.

## Database Verification
Confirmed tests are run using the isolated `mediflow_test` database (as seen by the local test setup environment overriding DATABASE_URL and the `django: version: 5.0.3, settings: mediflow.settings.test` pytest trace).
"""
with open(os.path.join(base_dir, 'agent5_audit_report.md'), 'w') as f:
    f.write(audit_md)

# 2. Build agent5_factories.md
factories_md = """# Isolated Factories Documentation

Deterministic isolated factories have been reviewed in `apps/billing/tests/factories.py` and `apps/purchases/tests/factories.py` and `apps/audit/tests/factories.py`.

## Built/Documented Factories

- **Test Outlet (`make_test_outlet`)**: Creates isolated Outlet and Organization and seeds standard ledgers.
- **Test Customer (`make_test_customer`)**: Creates Customer and links a Ledger for accounts.
- **Test Staff (`make_test_staff`)**: Creates Staff, assigns roles/permissions, and creates auth User.
- **Test Medicine / Product / Batch (`make_test_medicine`)**: Creates MasterProduct, Batch, and StockLedger entries. Need to remove legacy kwargs like `sale_rate` and `default_sale_rate` to fix tests.
- **Test Invoice (`make_test_invoice`)**: Generates an isolated SaleInvoice with nested SaleItems and related Ledger/Credit entries.
- **Test Sales Return (`make_test_sales_return`)**: Creates SalesReturn, SalesReturnItem, and handles restocking logic.
- **Test Receipt / Voucher (`make_test_receipt`)**: Creates ReceiptEntry and ReceiptAllocation.

All tests using these functions operate in isolation to prevent side-effects, provided database transaction rollbacks occur (pytest-django `db` fixture).
"""
with open(os.path.join(base_dir, 'agent5_factories.md'), 'w') as f:
    f.write(factories_md)

# 3. Build agent5_permissions_matrix.md
permissions_md = """# Role Permissions Matrix

Based on test cases reviewed (e.g., `test_bill_revision_permissions.py`, `test_permissions.py`):

| Action | Super Admin | Admin/Manager | Staff (Cashier w/ Perms) | Read-only / Staff (w/o Perms) | Unauthenticated |
|--------|-------------|---------------|--------------------------|-------------------------------|-----------------|
| View Logs (`test_api.py`) | Allowed | Denied | Denied | Denied | Denied |
| Export Logs | Allowed | Denied | Denied | Denied | Denied |
| View Bill Revision History | Allowed | Allowed | Conditional (if `can_view_bill_revision_history`) | Denied | Denied |
| Cancel and Reissue Bill | Allowed | Allowed | Conditional (if `can_cancel_and_reissue_bill`) | Denied | Denied |
| Modify Unpaid Bill | Allowed | Allowed | Conditional (if `can_modify_unpaid_bill`) | Denied | Denied |
| Correct Header Fields | Allowed | Allowed | Conditional (if `can_correct_header_fields`) | Denied | Denied |
| Correct Rates/Discounts | Allowed | Allowed | Conditional (if `can_correct_rates_discounts`) | Denied | Denied |

*Skipped modification tests categorize modifications that involve sensitive fields (like staff PIN or passwords) which are excluded from standard audit diffs or require special review (e.g., `test_password_not_in_changes_json SKIPPED`).*
"""
with open(os.path.join(base_dir, 'agent5_permissions_matrix.md'), 'w') as f:
    f.write(permissions_md)
