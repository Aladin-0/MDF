# MediFlow Test Inventory & Coverage Report

## 1. Coverage Summary
This report lists all test cases extracted directly from the codebase using AST parsing, avoiding any reliance on outdated chat summaries. The tests cover API contracts, Test Data Factories, Invariants (GST & Stock), Concurrency limits, and E2E Playwright flows.

## 2. Test Inventory Table

| Test Name | File Path | Category | What it Verifies | Flow/Invariant |
|---|---|---|---|---|
| `test_lookup_by_pin_success` | `apps/backend/apps/accounts/tests/test_pin_auth.py` | Unit/Integration | Lookup by pin success | General Functional Logic |
| `test_lookup_by_pin_failure` | `apps/backend/apps/accounts/tests/test_pin_auth.py` | Unit/Integration | Lookup by pin failure | General Functional Logic |
| `test_direct_revise_modifies_and_logs` | `apps/backend/apps/accounts/tests/test_debit_note_mod.py` | Unit/Integration | Direct revise modifies and logs | Revision Audit Trail |
| `test_unauthorized_user_cannot_edit` | `apps/backend/apps/accounts/tests/test_debit_note_mod.py` | Unit/Integration | Unauthorized user cannot edit | Revision Audit Trail |
| `test_voucher_revise_logs_diff` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher revise logs diff | Accounting Double-Entry & Vouchers |
| `test_voucher_payment_mode_switch` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher payment mode switch | Accounting Double-Entry & Vouchers |
| `test_voucher_ledger_rewrite` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher ledger rewrite | Accounting Double-Entry & Vouchers |
| `test_voucher_invoice_link` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher invoice link | Accounting Double-Entry & Vouchers |
| `test_voucher_invoice_unlink` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher invoice unlink | Accounting Double-Entry & Vouchers |
| `test_voucher_validation_reason_code_missing` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher validation reason code missing | Accounting Double-Entry & Vouchers |
| `test_voucher_validation_explanation_too_short` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher validation explanation too short | Accounting Double-Entry & Vouchers |
| `test_voucher_rollback_business_update_fails` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher rollback business update fails | Accounting Double-Entry & Vouchers |
| `test_voucher_rollback_audit_write_fails` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher rollback audit write fails | Accounting Double-Entry & Vouchers |
| `test_voucher_no_duplicate_journal_entries` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher no duplicate journal entries | Accounting Double-Entry & Vouchers |
| `test_voucher_unauthorized` | `apps/backend/apps/accounts/tests/test_voucher_mod.py` | Unit/Integration | Voucher unauthorized | Accounting Double-Entry & Vouchers |
| `test_voucher_modify_bill_allocation` | `apps/backend/apps/accounts/tests/test_voucher_bills.py` | Unit/Integration | Voucher modify bill allocation | Accounting Double-Entry & Vouchers |
| `test_pending_bills_view_with_exclude_voucher` | `apps/backend/apps/accounts/tests/test_voucher_bills.py` | Unit/Integration | Pending bills view with exclude voucher | Accounting Double-Entry & Vouchers |
| `test_purchase_edit_10_to_20_with_4_sold` | `apps/backend/apps/purchases/tests/test_purchase_edit_stock.py` | Invariant/Integration | Purchase edit 10 to 20 with 4 sold | Stock Ledger Append-Only/Running Balance |
| `test_purchase_edit_10_to_12_with_4_sold` | `apps/backend/apps/purchases/tests/test_purchase_edit_stock.py` | Invariant/Integration | Purchase edit 10 to 12 with 4 sold | Stock Ledger Append-Only/Running Balance |
| `test_purchase_edit_10_to_10_noop_with_4_sold` | `apps/backend/apps/purchases/tests/test_purchase_edit_stock.py` | Invariant/Integration | Purchase edit 10 to 10 noop with 4 sold | Stock Ledger Append-Only/Running Balance |
| `test_purchase_edit_10_to_6_with_4_sold` | `apps/backend/apps/purchases/tests/test_purchase_edit_stock.py` | Invariant/Integration | Purchase edit 10 to 6 with 4 sold | Stock Ledger Append-Only/Running Balance |
| `test_purchase_edit_10_to_3_with_4_sold_fails` | `apps/backend/apps/purchases/tests/test_purchase_edit_stock.py` | Invariant/Integration | Purchase edit 10 to 3 with 4 sold fails | Stock Ledger Append-Only/Running Balance |
| `test_multiple_items_and_batches` | `apps/backend/apps/purchases/tests/test_purchase_edit_stock.py` | Invariant/Integration | Multiple items and batches | Stock Ledger Append-Only/Running Balance |
| `test_purchase_edit_concurrency` | `apps/backend/apps/purchases/tests/test_purchase_edit_concurrency.py` | Concurrency | Purchase edit concurrency | Race Condition / Atomic Lock |
| `test_purchase_edit_happy_path` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit happy path | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_amount_tax_update` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit amount tax update | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_line_item_update` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit line item update | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_supplier_outstanding_recalculation` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit supplier outstanding recalculation | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_inventory_valuation_consistency` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit inventory valuation consistency | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_missing_audit_reason_validation` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit missing audit reason validation | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_atomic_rollback_on_business_failure` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit atomic rollback on business failure | Purchase Edit Matrix / Inventory Link |
| `test_purchase_edit_atomic_rollback_on_audit_failure` | `apps/backend/apps/purchases/tests/test_purchase_edit_migration.py` | Unit/Integration | Purchase edit atomic rollback on audit failure | Purchase Edit Matrix / Inventory Link |
| `test_purchase_create_api` | `apps/backend/apps/purchases/tests/test_purchases_api.py` | API | Purchase create api | General Functional Logic |
| `test_purchase_update_api` | `apps/backend/apps/purchases/tests/test_purchases_api.py` | API | Purchase update api | General Functional Logic |
| `test_create_sale_with_empty_items_returns_400` | `apps/backend/apps/billing/tests/test_empty_items_validation.py` | Unit/Integration | Create sale with empty items returns 400 | General Functional Logic |
| `test_create_sale_with_no_items_key_returns_400` | `apps/backend/apps/billing/tests/test_empty_items_validation.py` | Unit/Integration | Create sale with no items key returns 400 | General Functional Logic |
| `test_revise_sale_with_empty_items_returns_400` | `apps/backend/apps/billing/tests/test_empty_items_validation.py` | Unit/Integration | Revise sale with empty items returns 400 | General Functional Logic |
| `test_revise_sale_with_no_items_key_returns_400` | `apps/backend/apps/billing/tests/test_empty_items_validation.py` | Unit/Integration | Revise sale with no items key returns 400 | General Functional Logic |
| `test_create_quotation_success` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Create quotation success | General Functional Logic |
| `test_update_quotation` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Update quotation | General Functional Logic |
| `test_convert_quotation_to_invoice` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Convert quotation to invoice | General Functional Logic |
| `test_convert_quotation_with_schedule_h` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Convert quotation with schedule h | General Functional Logic |
| `test_cannot_edit_converted_quotation` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Cannot edit converted quotation | General Functional Logic |
| `test_walk_in_customer_quotation` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Walk in customer quotation | General Functional Logic |
| `test_create_sale_from_quotation_frontend_flow` | `apps/backend/apps/billing/tests/test_quotation_api.py` | API | Create sale from quotation frontend flow | General Functional Logic |
| `test_overpayment_creates_customer_advance` | `apps/backend/apps/billing/tests/test_paid_correction.py` | Unit/Integration | Overpayment creates customer advance | General Functional Logic |
| `test_journal_balanced_after_paid_correction` | `apps/backend/apps/billing/tests/test_paid_correction.py` | Unit/Integration | Journal balanced after paid correction | General Functional Logic |
| `test_billing_staff_cannot_do_paid_correction` | `apps/backend/apps/billing/tests/test_paid_correction.py` | Unit/Integration | Billing staff cannot do paid correction | General Functional Logic |
| `test_sale_return_revise_logs_diff` | `apps/backend/apps/billing/tests/test_sale_return_mod.py` | Unit/Integration | Sale return revise logs diff | Revision Audit Trail |
| `test_sale_return_unauthorized` | `apps/backend/apps/billing/tests/test_sale_return_mod.py` | Unit/Integration | Sale return unauthorized | Revision Audit Trail |
| `test_missing_gst_ledger_raises_error` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Missing gst ledger raises error | Race Condition / Atomic Lock |
| `test_select_for_update_called_on_create` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Select for update called on create | Race Condition / Atomic Lock |
| `test_select_for_update_called_on_modify` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Select for update called on modify | Race Condition / Atomic Lock |
| `test_missing_gst_ledger_returns_400_on_create` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Missing gst ledger returns 400 on create | Race Condition / Atomic Lock |
| `test_missing_gst_ledger_returns_400_on_modify` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Missing gst ledger returns 400 on modify | Race Condition / Atomic Lock |
| `test_batch_pre_locking_uses_sorted_bulk_query` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Batch pre locking uses sorted bulk query | Race Condition / Atomic Lock |
| `test_sale_create_succeeds_with_two_batch_items` | `apps/backend/apps/billing/tests/test_packet_b.py` | Invariant/Integration | Sale create succeeds with two batch items | Race Condition / Atomic Lock |
| `test_sale_creation_concurrency` | `apps/backend/apps/billing/tests/test_billing_concurrency.py` | Concurrency | Sale creation concurrency | Race Condition / Atomic Lock |
| `test_block_edit_invoice_with_return` | `apps/backend/apps/billing/tests/test_revision_blocks.py` | Unit/Integration | Block edit invoice with return | General Functional Logic |
| `test_block_edit_fully_paid_invoice` | `apps/backend/apps/billing/tests/test_revision_blocks.py` | Unit/Integration | Block edit fully paid invoice | General Functional Logic |
| `test_block_edit_invoice_with_later_payment` | `apps/backend/apps/billing/tests/test_revision_blocks.py` | Unit/Integration | Block edit invoice with later payment | General Functional Logic |
| `test_block_fires_before_any_write` | `apps/backend/apps/billing/tests/test_revision_blocks.py` | Unit/Integration | Block fires before any write | General Functional Logic |
| `test_modification_options_admin` | `apps/backend/apps/billing/tests/test_modification_options.py` | Unit/Integration | Modification options admin | Revision Audit Trail |
| `test_modification_options_blocked` | `apps/backend/apps/billing/tests/test_modification_options.py` | Unit/Integration | Modification options blocked | Revision Audit Trail |
| `test_item_discount_only` | `apps/backend/apps/billing/tests/test_discount_math.py` | Invariant/Integration | Item discount only | General Functional Logic |
| `test_invoice_extra_discount_only` | `apps/backend/apps/billing/tests/test_discount_math.py` | Invariant/Integration | Invoice extra discount only | General Functional Logic |
| `test_item_and_invoice_discount_combined` | `apps/backend/apps/billing/tests/test_discount_math.py` | Invariant/Integration | Item and invoice discount combined | General Functional Logic |
| `test_no_discount` | `apps/backend/apps/billing/tests/test_discount_math.py` | Invariant/Integration | No discount | General Functional Logic |
| `test_direct_revise_unpaid_bill` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Direct revise unpaid bill | Revision Audit Trail |
| `test_revise_blocked_if_paid` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Revise blocked if paid | Revision Audit Trail |
| `test_revise_blocked_if_no_permission` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Revise blocked if no permission | Revision Audit Trail |
| `test_paid_correction_success` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Paid correction success | Revision Audit Trail |
| `test_paid_correction_blocked_if_no_permission` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Paid correction blocked if no permission | Revision Audit Trail |
| `test_cancel_and_reissue_success` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Cancel and reissue success | Revision Audit Trail |
| `test_cancel_and_reissue_blocked_if_no_permission` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Cancel and reissue blocked if no permission | Revision Audit Trail |
| `test_sale_revision_history_api` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Sale revision history api | Revision Audit Trail |
| `test_sale_revision_report_and_export` | `apps/backend/apps/billing/tests/test_revise_api.py` | API | Sale revision report and export | Revision Audit Trail |
| `test_direct_revise_reduces_qty` | `apps/backend/apps/billing/tests/test_direct_revise.py` | Unit/Integration | Direct revise reduces qty | Revision Audit Trail |
| `test_reason_required_for_revise` | `apps/backend/apps/billing/tests/test_direct_revise.py` | Unit/Integration | Reason required for revise | Revision Audit Trail |
| `test_second_revision_creates_r2` | `apps/backend/apps/billing/tests/test_direct_revise.py` | Unit/Integration | Second revision creates r2 | Revision Audit Trail |
| `test_add_item_in_direct_revise` | `apps/backend/apps/billing/tests/test_direct_revise.py` | Unit/Integration | Add item in direct revise | Revision Audit Trail |
| `test_remove_item_in_direct_revise` | `apps/backend/apps/billing/tests/test_direct_revise.py` | Unit/Integration | Remove item in direct revise | Revision Audit Trail |
| `test_sale_create_api` | `apps/backend/apps/billing/tests/test_billing_api.py` | API | Sale create api | General Functional Logic |
| `test_sale_create_invalid_payload` | `apps/backend/apps/billing/tests/test_billing_api.py` | API | Sale create invalid payload | General Functional Logic |
| `test_audit_log_full_diff` | `apps/backend/apps/billing/tests/test_revision_audit.py` | Unit/Integration | Audit log full diff | General Functional Logic |
| `test_audit_log_not_written_on_rollback` | `apps/backend/apps/billing/tests/test_revision_audit.py` | Unit/Integration | Audit log not written on rollback | General Functional Logic |
| `test_no_revision_record_on_blocked` | `apps/backend/apps/billing/tests/test_revision_audit.py` | Unit/Integration | No revision record on blocked | General Functional Logic |
| `test_cancel_and_reissue_links_invoices` | `apps/backend/apps/billing/tests/test_cancel_reissue.py` | Unit/Integration | Cancel and reissue links invoices | General Functional Logic |
| `test_cancelled_invoice_cannot_be_modified` | `apps/backend/apps/billing/tests/test_cancel_reissue.py` | Unit/Integration | Cancelled invoice cannot be modified | General Functional Logic |
| `test_cancel_reissue_stock_integrity` | `apps/backend/apps/billing/tests/test_cancel_reissue.py` | Unit/Integration | Cancel reissue stock integrity | General Functional Logic |
| `test_header_correction_on_paid_invoice` | `apps/backend/apps/billing/tests/test_header_correction.py` | Unit/Integration | Header correction on paid invoice | General Functional Logic |
| `test_header_correction_cannot_change_total` | `apps/backend/apps/billing/tests/test_header_correction.py` | Unit/Integration | Header correction cannot change total | General Functional Logic |
| `test_revisions_invalid_outlet_id_no_500` | `apps/backend/apps/billing/tests/test_revisions_regression.py` | Unit/Integration | Revisions invalid outlet id no 500 | General Functional Logic |
| `test_sale_revisions_invalid_uuid_returns_json_404` | `apps/backend/apps/billing/tests/test_revisions_regression.py` | Unit/Integration | Sale revisions invalid uuid returns json 404 | General Functional Logic |
| `test_sale_revisions_valid_uuid_not_found_returns_json_404` | `apps/backend/apps/billing/tests/test_revisions_regression.py` | Unit/Integration | Sale revisions valid uuid not found returns json 404 | General Functional Logic |
| `test_readonly_user_cannot_modify` | `apps/backend/apps/billing/tests/test_revision_permissions.py` | Unit/Integration | Readonly user cannot modify | General Functional Logic |
| `test_billing_staff_allowed_actions` | `apps/backend/apps/billing/tests/test_revision_permissions.py` | Unit/Integration | Billing staff allowed actions | General Functional Logic |
| `test_manager_actions_on_paid_invoice` | `apps/backend/apps/billing/tests/test_revision_permissions.py` | Unit/Integration | Manager actions on paid invoice | General Functional Logic |
| `test_backend_enforces_permission_regardless_of_frontend` | `apps/backend/apps/billing/tests/test_revision_permissions.py` | Unit/Integration | Backend enforces permission regardless of frontend | General Functional Logic |
| `test_helper_admin_bypass` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Helper admin bypass | General Functional Logic |
| `test_helper_staff_with_permission` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Helper staff with permission | General Functional Logic |
| `test_helper_staff_without_permission` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Helper staff without permission | General Functional Logic |
| `test_helper_unauthenticated_user` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Helper unauthenticated user | General Functional Logic |
| `test_permission_class_allow` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Permission class allow | General Functional Logic |
| `test_permission_class_deny` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Permission class deny | General Functional Logic |
| `test_permission_class_no_required_perm_attribute` | `apps/backend/apps/billing/tests/test_bill_revision_permissions.py` | Unit/Integration | Permission class no required perm attribute | General Functional Logic |
| `test_a1_edit_invoice_with_return_blocked` | `apps/backend/apps/billing/tests/test_sale_modification.py` | Unit/Integration | A1 edit invoice with return blocked | Revision Audit Trail |
| `test_a2_edit_invoice_with_later_payment_blocked` | `apps/backend/apps/billing/tests/test_sale_modification.py` | Unit/Integration | A2 edit invoice with later payment blocked | Revision Audit Trail |
| `test_a3_edit_fully_paid_invoice_blocked` | `apps/backend/apps/billing/tests/test_sale_modification.py` | Unit/Integration | A3 edit fully paid invoice blocked | Revision Audit Trail |
| `test_b1_overpayment_converted_to_advance` | `apps/backend/apps/billing/tests/test_sale_modification.py` | Unit/Integration | B1 overpayment converted to advance | Revision Audit Trail |
| `test_c3_discount_stacking_consistency` | `apps/backend/apps/billing/tests/test_sale_modification.py` | Unit/Integration | C3 discount stacking consistency | Revision Audit Trail |
| `test_gst_tax_calculation_matrix` | `apps/backend/apps/billing/tests/test_phase0_gst.py` | Invariant/Integration | Gst tax calculation matrix | GST Calculation Invariant |
| `test_quotation_convert_and_sale_create_require_same_fields` | `apps/backend/apps/billing/tests/test_api_schemas.py` | API | Quotation convert and sale create require same fields | General Functional Logic |
| `test_build_invoice_snapshot` | `apps/backend/apps/billing/tests/test_revision_service.py` | Unit/Integration | Build invoice snapshot | General Functional Logic |
| `test_compute_bill_revision_diff` | `apps/backend/apps/billing/tests/test_revision_service.py` | Unit/Integration | Compute bill revision diff | General Functional Logic |
| `test_generate_revision_number` | `apps/backend/apps/billing/tests/test_revision_service.py` | Unit/Integration | Generate revision number | General Functional Logic |
| `test_create_bill_revision_record` | `apps/backend/apps/billing/tests/test_revision_service.py` | Unit/Integration | Create bill revision record | General Functional Logic |
| `test_return_aware_block_qty_below_returned` | `apps/backend/apps/billing/tests/test_return_aware_correction.py` | Unit/Integration | Return aware block qty below returned | General Functional Logic |
| `test_return_aware_allow_qty_above_returned` | `apps/backend/apps/billing/tests/test_return_aware_correction.py` | Unit/Integration | Return aware allow qty above returned | General Functional Logic |
| `test_cannot_remove_item_with_existing_return` | `apps/backend/apps/billing/tests/test_return_aware_correction.py` | Unit/Integration | Cannot remove item with existing return | General Functional Logic |
| `test_sale_detail_put_happy_path` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale detail put happy path | General Functional Logic |
| `test_sale_detail_put_audit_write` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale detail put audit write | General Functional Logic |
| `test_sale_detail_put_rollback_on_audit_failure` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale detail put rollback on audit failure | General Functional Logic |
| `test_sale_revise_standard_correction_happy_path` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale revise standard correction happy path | General Functional Logic |
| `test_sale_revise_cancel_reissue_happy_path` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale revise cancel reissue happy path | General Functional Logic |
| `test_sale_revise_cancel_reissue_metadata_persistence` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale revise cancel reissue metadata persistence | General Functional Logic |
| `test_sale_update_rollback_on_business_failure` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale update rollback on business failure | General Functional Logic |
| `test_sale_revise_rollback_on_audit_failure` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale revise rollback on audit failure | General Functional Logic |
| `test_history_api_read_path` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | History api read path | General Functional Logic |
| `test_history_ui_rendering_parity` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | History ui rendering parity | General Functional Logic |
| `test_sale_success_payload_shape_parity` | `apps/backend/apps/billing/tests/test_sale_edit_migration.py` | Unit/Integration | Sale success payload shape parity | General Functional Logic |
| `test_data` | `apps/backend/apps/billing/tests/test_measured_rollback_regression.py` | Unit/Integration | Data | General Functional Logic |
| `test_inventory_list_api` | `apps/backend/apps/billing/tests/test_measured_rollback_regression.py` | Unit/Integration | Inventory list api | General Functional Logic |
| `test_bottle_purchase_and_billing` | `apps/backend/apps/billing/tests/test_measured_rollback_regression.py` | Unit/Integration | Bottle purchase and billing | General Functional Logic |
| `test_accounts_factories` | `apps/backend/apps/inventory/tests/test_factories.py` | Unit/Integration | Accounts factories | General Functional Logic |
| `test_inventory_factories` | `apps/backend/apps/inventory/tests/test_factories.py` | Unit/Integration | Inventory factories | General Functional Logic |
| `test_billing_factories` | `apps/backend/apps/inventory/tests/test_factories.py` | Unit/Integration | Billing factories | General Functional Logic |
| `test_purchases_factories` | `apps/backend/apps/inventory/tests/test_factories.py` | Unit/Integration | Purchases factories | General Functional Logic |
| `test_stock_invariant_exact_deduction` | `apps/backend/apps/inventory/tests/test_stock_invariants.py` | Invariant/Integration | Stock invariant exact deduction | Stock Ledger Append-Only/Running Balance |
| `test_stock_invariant_negative_stock_guard` | `apps/backend/apps/inventory/tests/test_stock_invariants.py` | Invariant/Integration | Stock invariant negative stock guard | Stock Ledger Append-Only/Running Balance |
| `test_stock_invariant_deterministic_rebuild` | `apps/backend/apps/inventory/tests/test_stock_invariants.py` | Invariant/Integration | Stock invariant deterministic rebuild | Stock Ledger Append-Only/Running Balance |
| `test_login_log_created_via_celery_eager` | `apps/backend/apps/audit/tests/test_async_logging.py` | Unit/Integration | Login log created via celery eager | General Functional Logic |
| `test_crud_log_created_via_celery_eager` | `apps/backend/apps/audit/tests/test_async_logging.py` | Unit/Integration | Crud log created via celery eager | General Functional Logic |
| `test_log_not_lost_if_celery_unavailable` | `apps/backend/apps/audit/tests/test_async_logging.py` | Unit/Integration | Log not lost if celery unavailable | General Functional Logic |
| `test_flat_voucher_diff` | `apps/backend/apps/audit/tests/test_core_diff_engine.py` | Unit/Integration | Flat voucher diff | General Functional Logic |
| `test_nested_invoice_diff` | `apps/backend/apps/audit/tests/test_core_diff_engine.py` | Unit/Integration | Nested invoice diff | General Functional Logic |
| `test_log_timestamp_is_auto_set` | `apps/backend/apps/audit/tests/test_immutability.py` | Unit/Integration | Log timestamp is auto set | General Functional Logic |
| `test_log_entry_persists_after_user_deletion` | `apps/backend/apps/audit/tests/test_immutability.py` | Unit/Integration | Log entry persists after user deletion | General Functional Logic |
| `test_two_requests_get_different_request_ids` | `apps/backend/apps/audit/tests/test_immutability.py` | Unit/Integration | Two requests get different request ids | General Functional Logic |
| `test_immutability_known_gap` | `apps/backend/apps/audit/tests/test_immutability.py` | Unit/Integration | Immutability known gap | General Functional Logic |
| `test_is_super_admin_blocks_unauthenticated` | `apps/backend/apps/audit/tests/test_permissions.py` | Unit/Integration | Is super admin blocks unauthenticated | General Functional Logic |
| `test_is_super_admin_blocks_regular_staff` | `apps/backend/apps/audit/tests/test_permissions.py` | Unit/Integration | Is super admin blocks regular staff | General Functional Logic |
| `test_is_super_admin_blocks_outlet_admin` | `apps/backend/apps/audit/tests/test_permissions.py` | Unit/Integration | Is super admin blocks outlet admin | General Functional Logic |
| `test_is_super_admin_allows_super_admin` | `apps/backend/apps/audit/tests/test_permissions.py` | Unit/Integration | Is super admin allows super admin | General Functional Logic |
| `test_is_super_admin_blocks_django_superuser_without_role` | `apps/backend/apps/audit/tests/test_permissions.py` | Unit/Integration | Is super admin blocks django superuser without role | General Functional Logic |
| `test_super_admin_can_view_logs` | `apps/backend/apps/audit/tests/test_api.py` | API | Super admin can view logs | General Functional Logic |
| `test_staff_admin_cannot_view_logs` | `apps/backend/apps/audit/tests/test_api.py` | API | Staff admin cannot view logs | General Functional Logic |
| `test_unauthenticated_user_cannot_view_logs` | `apps/backend/apps/audit/tests/test_api.py` | API | Unauthenticated user cannot view logs | General Functional Logic |
| `test_non_admin_cannot_list_logs` | `apps/backend/apps/audit/tests/test_api.py` | API | Non admin cannot list logs | General Functional Logic |
| `test_filter_by_module` | `apps/backend/apps/audit/tests/test_api.py` | API | Filter by module | General Functional Logic |
| `test_filter_by_action` | `apps/backend/apps/audit/tests/test_api.py` | API | Filter by action | General Functional Logic |
| `test_filter_by_entity_type` | `apps/backend/apps/audit/tests/test_api.py` | API | Filter by entity type | General Functional Logic |
| `test_filter_by_user` | `apps/backend/apps/audit/tests/test_api.py` | API | Filter by user | General Functional Logic |
| `test_logs_cannot_be_created_via_api` | `apps/backend/apps/audit/tests/test_api.py` | API | Logs cannot be created via api | General Functional Logic |
| `test_logs_cannot_be_deleted_via_api` | `apps/backend/apps/audit/tests/test_api.py` | API | Logs cannot be deleted via api | General Functional Logic |
| `test_logs_cannot_be_updated_via_api` | `apps/backend/apps/audit/tests/test_api.py` | API | Logs cannot be updated via api | General Functional Logic |
| `test_super_admin_can_export_logs` | `apps/backend/apps/audit/tests/test_api.py` | API | Super admin can export logs | General Functional Logic |
| `test_staff_admin_cannot_export_logs` | `apps/backend/apps/audit/tests/test_api.py` | API | Staff admin cannot export logs | General Functional Logic |
| `test_update_log_has_old_and_new` | `apps/backend/apps/audit/tests/test_changes_diff.py` | Unit/Integration | Update log has old and new | General Functional Logic |
| `test_unchanged_fields_not_in_diff` | `apps/backend/apps/audit/tests/test_changes_diff.py` | Unit/Integration | Unchanged fields not in diff | General Functional Logic |
| `test_create_log_has_empty_or_null_changes` | `apps/backend/apps/audit/tests/test_changes_diff.py` | Unit/Integration | Create log has empty or null changes | General Functional Logic |
| `test_delete_log_captures_entity_label` | `apps/backend/apps/audit/tests/test_changes_diff.py` | Unit/Integration | Delete log captures entity label | General Functional Logic |
| `test_multiple_field_changes_all_in_diff` | `apps/backend/apps/audit/tests/test_changes_diff.py` | Unit/Integration | Multiple field changes all in diff | General Functional Logic |
| `test_password_not_in_changes_json` | `apps/backend/apps/audit/tests/test_sensitive_fields.py` | Unit/Integration | Password not in changes json | General Functional Logic |
| `test_staff_pin_not_in_changes_json` | `apps/backend/apps/audit/tests/test_sensitive_fields.py` | Unit/Integration | Staff pin not in changes json | General Functional Logic |
| `test_token_not_in_changes_json` | `apps/backend/apps/audit/tests/test_sensitive_fields.py` | Unit/Integration | Token not in changes json | General Functional Logic |
| `test_sensitive_fields_not_in_log_even_if_changed` | `apps/backend/apps/audit/tests/test_sensitive_fields.py` | Unit/Integration | Sensitive fields not in log even if changed | General Functional Logic |
| `test_audit_context_defaults` | `apps/backend/apps/audit/tests/test_core_context.py` | Unit/Integration | Audit context defaults | General Functional Logic |
| `test_audit_context_set_and_reset` | `apps/backend/apps/audit/tests/test_core_context.py` | Unit/Integration | Audit context set and reset | General Functional Logic |
| `test_audit_context_middleware_unauthenticated` | `apps/backend/apps/audit/tests/test_core_context.py` | Unit/Integration | Audit context middleware unauthenticated | General Functional Logic |
| `test_audit_context_middleware_authenticated` | `apps/backend/apps/audit/tests/test_core_context.py` | Unit/Integration | Audit context middleware authenticated | General Functional Logic |
| `test_product_create_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Product create logged | General Functional Logic |
| `test_product_update_logged_with_diff` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Product update logged with diff | General Functional Logic |
| `test_product_delete_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Product delete logged | General Functional Logic |
| `test_batch_create_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Batch create logged | General Functional Logic |
| `test_batch_update_logs_qty_change` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Batch update logs qty change | General Functional Logic |
| `test_invoice_create_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Invoice create logged | General Functional Logic |
| `test_invoice_update_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Invoice update logged | General Functional Logic |
| `test_invoice_cancel_logged_as_cancelled` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Invoice cancel logged as cancelled | General Functional Logic |
| `test_purchase_invoice_create_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Purchase invoice create logged | General Functional Logic |
| `test_purchase_invoice_update_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Purchase invoice update logged | General Functional Logic |
| `test_customer_create_logged` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Customer create logged | General Functional Logic |
| `test_staff_update_logs_diff` | `apps/backend/apps/audit/tests/test_signals.py` | Unit/Integration | Staff update logs diff | General Functional Logic |
| `test_ip_captured_from_remote_addr` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Ip captured from remote addr | General Functional Logic |
| `test_ip_captured_from_x_forwarded_for` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Ip captured from x forwarded for | General Functional Logic |
| `test_endpoint_captured` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Endpoint captured | General Functional Logic |
| `test_http_method_captured` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Http method captured | General Functional Logic |
| `test_user_agent_captured` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | User agent captured | General Functional Logic |
| `test_request_id_captured_from_header` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Request id captured from header | General Functional Logic |
| `test_request_id_generated_if_missing` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Request id generated if missing | General Functional Logic |
| `test_context_cleared_between_requests` | `apps/backend/apps/audit/tests/test_middleware.py` | Unit/Integration | Context cleared between requests | General Functional Logic |
| `test_bill_revision_creates_activity_log` | `apps/backend/apps/audit/tests/test_billing_revision.py` | Unit/Integration | Bill revision creates activity log | General Functional Logic |
| `test_bill_revision_log_contains_reason` | `apps/backend/apps/audit/tests/test_billing_revision.py` | Unit/Integration | Bill revision log contains reason | General Functional Logic |
| `test_modification_blocked_creates_log` | `apps/backend/apps/audit/tests/test_billing_revision.py` | Unit/Integration | Modification blocked creates log | General Functional Logic |
| `test_invoice_cancelled_action_logged` | `apps/backend/apps/audit/tests/test_billing_revision.py` | Unit/Integration | Invoice cancelled action logged | General Functional Logic |
| `test_successful_login_creates_log` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Successful login creates log | General Functional Logic |
| `test_successful_login_captures_ip` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Successful login captures ip | General Functional Logic |
| `test_successful_login_captures_user_agent` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Successful login captures user agent | General Functional Logic |
| `test_failed_login_wrong_pin_creates_log` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Failed login wrong pin creates log | General Functional Logic |
| `test_failed_login_unknown_user_creates_log` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Failed login unknown user creates log | General Functional Logic |
| `test_failed_login_captures_ip` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Failed login captures ip | General Functional Logic |
| `test_failed_login_user_field_is_null_or_correct` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Failed login user field is null or correct | General Functional Logic |
| `test_logout_creates_log` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Logout creates log | General Functional Logic |
| `test_logout_captures_ip` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Logout captures ip | General Functional Logic |
| `test_multiple_failed_logins_all_logged` | `apps/backend/apps/audit/tests/test_auth_events.py` | Unit/Integration | Multiple failed logins all logged | General Functional Logic |
| `test_transaction_rollback_on_error` | `apps/backend/apps/audit/tests/test_atomic_rollbacks.py` | Unit/Integration | Transaction rollback on error | General Functional Logic |
| `test_each_login_logged_separately` | `apps/backend/apps/audit/tests/test_user_timeline.py` | Unit/Integration | Each login logged separately | General Functional Logic |
| `test_user_a_logs_do_not_mix_with_user_b` | `apps/backend/apps/audit/tests/test_user_timeline.py` | Unit/Integration | User a logs do not mix with user b | General Functional Logic |
| `test_api_filter_by_user_returns_correct_logs` | `apps/backend/apps/audit/tests/test_user_timeline.py` | Unit/Integration | Api filter by user returns correct logs | General Functional Logic |
| `test_logs_ordered_newest_first` | `apps/backend/apps/audit/tests/test_user_timeline.py` | Unit/Integration | Logs ordered newest first | General Functional Logic |
| `Create Credit 7 Days` | `apps/frontend/tests/e2e/test_credit_days.spec.ts` | E2E | Create credit 7 days | Business Flow (BF-001/002/003) & Revision History |
| `Create Cash` | `apps/frontend/tests/e2e/test_credit_days.spec.ts` | E2E | Create cash | Business Flow (BF-001/002/003) & Revision History |
| `Edit flow UI hydration, modification and persistence` | `apps/frontend/tests/e2e/edit-sale-bill.spec.ts` | E2E | Edit flow ui hydration, modification and persistence | Business Flow (BF-001/002/003) & Revision History |
| `Complete billing journey` | `apps/frontend/tests/e2e/billing.spec.ts` | E2E | Complete billing journey | Business Flow (BF-001/002/003) & Revision History |
| `admin can toggle margin visibility with Ctrl+Shift+M` | `apps/frontend/tests/e2e/margin-visibility.spec.ts` | E2E | Admin can toggle margin visibility with ctrl+shift+m | Business Flow (BF-001/002/003) & Revision History |
| `Create basic walk-in sale with single item` | `apps/frontend/tests/e2e/create-sale-bill.spec.ts` | E2E | Create basic walk-in sale with single item | Business Flow (BF-001/002/003) & Revision History |
| `Create sale with fractional/loose quantities and discount` | `apps/frontend/tests/e2e/create-sale-bill.spec.ts` | E2E | Create sale with fractional/loose quantities and discount | Business Flow (BF-001/002/003) & Revision History |
| `Empty items rejected gracefully` | `apps/frontend/tests/e2e/create-sale-bill.spec.ts` | E2E | Empty items rejected gracefully | Business Flow (BF-001/002/003) & Revision History |
| `debug purchase form` | `apps/frontend/tests/e2e/test_form_validation.spec.ts` | E2E | Debug purchase form | Business Flow (BF-001/002/003) & Revision History |
| `Modify Flow Verification` | `apps/frontend/tests/e2e/smoke-modify.spec.ts` | E2E | Modify flow verification | Business Flow (BF-001/002/003) & Revision History |
| `create-sale-bill` | `apps/frontend/tests/e2e/smoke.spec.ts` | E2E | Create-sale-bill | Business Flow (BF-001/002/003) & Revision History |
| `edit-sale-bill` | `apps/frontend/tests/e2e/smoke.spec.ts` | E2E | Edit-sale-bill | Business Flow (BF-001/002/003) & Revision History |
| `create-purchase` | `apps/frontend/tests/e2e/smoke.spec.ts` | E2E | Create-purchase | Business Flow (BF-001/002/003) & Revision History |
| `Create and convert quotation` | `apps/frontend/tests/e2e/quotation.spec.ts` | E2E | Create and convert quotation | Business Flow (BF-001/002/003) & Revision History |
| `End-to-End flow remains unaffected by modification tracking rollout` | `apps/frontend/tests/e2e/regression/cross-module-smoke.spec.ts` | E2E | End-to-end flow remains unaffected by modification tracking rollout | Business Flow (BF-001/002/003) & Revision History |
| `Reports data aggregates correctly after modifications` | `apps/frontend/tests/e2e/regression/cross-module-smoke.spec.ts` | E2E | Reports data aggregates correctly after modifications | Business Flow (BF-001/002/003) & Revision History |
| `Create & Edit (Header + Items) — assert exactly one revision entry with diff captured` | `apps/frontend/tests/e2e/modification-tracking/purchase-entry-mod.spec.ts` | E2E | Create & edit (header + items) — assert exactly one revision entry with diff captured | Business Flow (BF-001/002/003) & Revision History |
| `Stock Reversal & Reapplication Math — stock change is exact` | `apps/frontend/tests/e2e/modification-tracking/purchase-entry-mod.spec.ts` | E2E | Stock reversal & reapplication math — stock change is exact | Business Flow (BF-001/002/003) & Revision History |
| `Safe Blocking of Over-Consumption — blocked safely` | `apps/frontend/tests/e2e/modification-tracking/purchase-entry-mod.spec.ts` | E2E | Safe blocking of over-consumption — blocked safely | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit purchases — 403 Forbidden` | `apps/frontend/tests/e2e/modification-tracking/purchase-entry-mod.spec.ts` | E2E | Unauthorized user cannot edit purchases — 403 forbidden | Business Flow (BF-001/002/003) & Revision History |
| `Manager without granular flag is blocked from editing settled purchase` | `apps/frontend/tests/e2e/modification-tracking/purchase-entry-mod.spec.ts` | E2E | Manager without granular flag is blocked from editing settled purchase | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single field — assert exactly one revision entry` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit a single field — assert exactly one revision entry | Business Flow (BF-001/002/003) & Revision History |
| `Edit multiple fields in one save` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit multiple fields in one save | Business Flow (BF-001/002/003) & Revision History |
| `Edit line/item-level data` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit line/item-level data | Business Flow (BF-001/002/003) & Revision History |
| `Edit the same record multiple times in sequence` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit the same record multiple times in sequence | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel/delete the record` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Void/cancel/delete the record | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record mathematically correctly` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit stock-affecting record mathematically correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects ledger/account balances` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit a record that affects ledger/account balances | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects customer/supplier credit` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit a record that affects customer/supplier credit | Business Flow (BF-001/002/003) & Revision History |
| `Attempt to edit downward when stock already sold` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Attempt to edit downward when stock already sold | Business Flow (BF-001/002/003) & Revision History |
| `Edit a Voucher that has linked bill adjustments` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit a voucher that has linked bill adjustments | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Unauthorized user cannot edit | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot view history` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Unauthorized user cannot view history | Business Flow (BF-001/002/003) & Revision History |
| `Post-settlement lock rejects edit for user without override flag` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Post-settlement lock rejects edit for user without override flag | Business Flow (BF-001/002/003) & Revision History |
| `Authorized user succeeds end-to-end` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Authorized user succeeds end-to-end | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel endpoints reject unauthorized users via API` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Void/cancel endpoints reject unauthorized users via api | Business Flow (BF-001/002/003) & Revision History |
| `Assert revision history attributes correct User` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Assert revision history attributes correct user | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits by two users attribute correctly` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Concurrent edits by two users attribute correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit non-existent record returns 404` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit non-existent record returns 404 | Business Flow (BF-001/002/003) & Revision History |
| `Edit with invalid data returns validation error` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Edit with invalid data returns validation error | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits handle conflicts gracefully` | `apps/frontend/tests/e2e/modification-tracking/sale-return-mod.spec.ts` | E2E | Concurrent edits handle conflicts gracefully | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single field — assert exactly one revision entry` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit a single field — assert exactly one revision entry | Business Flow (BF-001/002/003) & Revision History |
| `Edit multiple fields in one save` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit multiple fields in one save | Business Flow (BF-001/002/003) & Revision History |
| `Edit line/item-level data` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit line/item-level data | Business Flow (BF-001/002/003) & Revision History |
| `Edit the same record multiple times in sequence` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit the same record multiple times in sequence | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel/delete the record` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Void/cancel/delete the record | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record mathematically correctly` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit stock-affecting record mathematically correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects ledger/account balances` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit a record that affects ledger/account balances | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects customer/supplier credit` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit a record that affects customer/supplier credit | Business Flow (BF-001/002/003) & Revision History |
| `Attempt to edit downward when stock already sold` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Attempt to edit downward when stock already sold | Business Flow (BF-001/002/003) & Revision History |
| `Edit a Voucher that has linked bill adjustments` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit a voucher that has linked bill adjustments | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Unauthorized user cannot edit | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot view history` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Unauthorized user cannot view history | Business Flow (BF-001/002/003) & Revision History |
| `Post-settlement lock rejects edit for user without override flag` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Post-settlement lock rejects edit for user without override flag | Business Flow (BF-001/002/003) & Revision History |
| `Authorized user succeeds end-to-end` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Authorized user succeeds end-to-end | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel endpoints reject unauthorized users via API` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Void/cancel endpoints reject unauthorized users via api | Business Flow (BF-001/002/003) & Revision History |
| `Assert revision history attributes correct User` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Assert revision history attributes correct user | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits by two users attribute correctly` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Concurrent edits by two users attribute correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit non-existent record returns 404` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit non-existent record returns 404 | Business Flow (BF-001/002/003) & Revision History |
| `Edit with invalid data returns validation error` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Edit with invalid data returns validation error | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits handle conflicts gracefully` | `apps/frontend/tests/e2e/modification-tracking/purchase-return-mod.spec.ts` | E2E | Concurrent edits handle conflicts gracefully | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/sales-bill-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single header field — assert exactly one revision entry with diff captured` | `apps/frontend/tests/e2e/modification-tracking/sales-bill-mod.spec.ts` | E2E | Edit a single header field — assert exactly one revision entry with diff captured | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record — stock change is mathematically correct` | `apps/frontend/tests/e2e/modification-tracking/sales-bill-mod.spec.ts` | E2E | Edit stock-affecting record — stock change is mathematically correct | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit sales — 403 and no revision created` | `apps/frontend/tests/e2e/modification-tracking/sales-bill-mod.spec.ts` | E2E | Unauthorized user cannot edit sales — 403 and no revision created | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/sales-bill-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single field — assert exactly one revision entry` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit a single field — assert exactly one revision entry | Business Flow (BF-001/002/003) & Revision History |
| `Edit multiple fields in one save` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit multiple fields in one save | Business Flow (BF-001/002/003) & Revision History |
| `Edit line/item-level data` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit line/item-level data | Business Flow (BF-001/002/003) & Revision History |
| `Edit the same record multiple times in sequence` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit the same record multiple times in sequence | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel/delete the record` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Void/cancel/delete the record | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record mathematically correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit stock-affecting record mathematically correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects ledger/account balances` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit a record that affects ledger/account balances | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects customer/supplier credit` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit a record that affects customer/supplier credit | Business Flow (BF-001/002/003) & Revision History |
| `Attempt to edit downward when stock already sold` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Attempt to edit downward when stock already sold | Business Flow (BF-001/002/003) & Revision History |
| `Edit a Voucher that has linked bill adjustments` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit a voucher that has linked bill adjustments | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Unauthorized user cannot edit | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot view history` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Unauthorized user cannot view history | Business Flow (BF-001/002/003) & Revision History |
| `Post-settlement lock rejects edit for user without override flag` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Post-settlement lock rejects edit for user without override flag | Business Flow (BF-001/002/003) & Revision History |
| `Authorized user succeeds end-to-end` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Authorized user succeeds end-to-end | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel endpoints reject unauthorized users via API` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Void/cancel endpoints reject unauthorized users via api | Business Flow (BF-001/002/003) & Revision History |
| `Assert revision history attributes correct User` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Assert revision history attributes correct user | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits by two users attribute correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Concurrent edits by two users attribute correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit non-existent record returns 404` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit non-existent record returns 404 | Business Flow (BF-001/002/003) & Revision History |
| `Edit with invalid data returns validation error` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Edit with invalid data returns validation error | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits handle conflicts gracefully` | `apps/frontend/tests/e2e/modification-tracking/voucher-payment-mod.spec.ts` | E2E | Concurrent edits handle conflicts gracefully | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single field — assert exactly one revision entry` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit a single field — assert exactly one revision entry | Business Flow (BF-001/002/003) & Revision History |
| `Edit multiple fields in one save` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit multiple fields in one save | Business Flow (BF-001/002/003) & Revision History |
| `Edit line/item-level data` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit line/item-level data | Business Flow (BF-001/002/003) & Revision History |
| `Edit the same record multiple times in sequence` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit the same record multiple times in sequence | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel/delete the record` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Void/cancel/delete the record | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record mathematically correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit stock-affecting record mathematically correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects ledger/account balances` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit a record that affects ledger/account balances | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects customer/supplier credit` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit a record that affects customer/supplier credit | Business Flow (BF-001/002/003) & Revision History |
| `Attempt to edit downward when stock already sold` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Attempt to edit downward when stock already sold | Business Flow (BF-001/002/003) & Revision History |
| `Edit a Voucher that has linked bill adjustments` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit a voucher that has linked bill adjustments | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Unauthorized user cannot edit | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot view history` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Unauthorized user cannot view history | Business Flow (BF-001/002/003) & Revision History |
| `Post-settlement lock rejects edit for user without override flag` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Post-settlement lock rejects edit for user without override flag | Business Flow (BF-001/002/003) & Revision History |
| `Authorized user succeeds end-to-end` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Authorized user succeeds end-to-end | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel endpoints reject unauthorized users via API` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Void/cancel endpoints reject unauthorized users via api | Business Flow (BF-001/002/003) & Revision History |
| `Assert revision history attributes correct User` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Assert revision history attributes correct user | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits by two users attribute correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Concurrent edits by two users attribute correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit non-existent record returns 404` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit non-existent record returns 404 | Business Flow (BF-001/002/003) & Revision History |
| `Edit with invalid data returns validation error` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Edit with invalid data returns validation error | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits handle conflicts gracefully` | `apps/frontend/tests/e2e/modification-tracking/voucher-receipt-mod.spec.ts` | E2E | Concurrent edits handle conflicts gracefully | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single field — assert exactly one revision entry` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit a single field — assert exactly one revision entry | Business Flow (BF-001/002/003) & Revision History |
| `Edit multiple fields in one save` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit multiple fields in one save | Business Flow (BF-001/002/003) & Revision History |
| `Edit line/item-level data` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit line/item-level data | Business Flow (BF-001/002/003) & Revision History |
| `Edit the same record multiple times in sequence` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit the same record multiple times in sequence | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel/delete the record` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Void/cancel/delete the record | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record mathematically correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit stock-affecting record mathematically correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects ledger/account balances` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit a record that affects ledger/account balances | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects customer/supplier credit` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit a record that affects customer/supplier credit | Business Flow (BF-001/002/003) & Revision History |
| `Attempt to edit downward when stock already sold` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Attempt to edit downward when stock already sold | Business Flow (BF-001/002/003) & Revision History |
| `Edit a Voucher that has linked bill adjustments` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit a voucher that has linked bill adjustments | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Unauthorized user cannot edit | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot view history` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Unauthorized user cannot view history | Business Flow (BF-001/002/003) & Revision History |
| `Post-settlement lock rejects edit for user without override flag` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Post-settlement lock rejects edit for user without override flag | Business Flow (BF-001/002/003) & Revision History |
| `Authorized user succeeds end-to-end` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Authorized user succeeds end-to-end | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel endpoints reject unauthorized users via API` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Void/cancel endpoints reject unauthorized users via api | Business Flow (BF-001/002/003) & Revision History |
| `Assert revision history attributes correct User` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Assert revision history attributes correct user | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits by two users attribute correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Concurrent edits by two users attribute correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit non-existent record returns 404` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit non-existent record returns 404 | Business Flow (BF-001/002/003) & Revision History |
| `Edit with invalid data returns validation error` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Edit with invalid data returns validation error | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits handle conflicts gracefully` | `apps/frontend/tests/e2e/modification-tracking/voucher-contra-mod.spec.ts` | E2E | Concurrent edits handle conflicts gracefully | Business Flow (BF-001/002/003) & Revision History |
| `Create a new record — assert no false modified history` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Create a new record — assert no false modified history | Business Flow (BF-001/002/003) & Revision History |
| `Edit a single field — assert exactly one revision entry` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit a single field — assert exactly one revision entry | Business Flow (BF-001/002/003) & Revision History |
| `Edit multiple fields in one save` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit multiple fields in one save | Business Flow (BF-001/002/003) & Revision History |
| `Edit line/item-level data` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit line/item-level data | Business Flow (BF-001/002/003) & Revision History |
| `Edit the same record multiple times in sequence` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit the same record multiple times in sequence | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel/delete the record` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Void/cancel/delete the record | Business Flow (BF-001/002/003) & Revision History |
| `Edit stock-affecting record mathematically correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit stock-affecting record mathematically correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects ledger/account balances` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit a record that affects ledger/account balances | Business Flow (BF-001/002/003) & Revision History |
| `Edit a record that affects customer/supplier credit` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit a record that affects customer/supplier credit | Business Flow (BF-001/002/003) & Revision History |
| `Attempt to edit downward when stock already sold` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Attempt to edit downward when stock already sold | Business Flow (BF-001/002/003) & Revision History |
| `Edit a Voucher that has linked bill adjustments` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit a voucher that has linked bill adjustments | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot edit` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Unauthorized user cannot edit | Business Flow (BF-001/002/003) & Revision History |
| `Unauthorized user cannot view history` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Unauthorized user cannot view history | Business Flow (BF-001/002/003) & Revision History |
| `Post-settlement lock rejects edit for user without override flag` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Post-settlement lock rejects edit for user without override flag | Business Flow (BF-001/002/003) & Revision History |
| `Authorized user succeeds end-to-end` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Authorized user succeeds end-to-end | Business Flow (BF-001/002/003) & Revision History |
| `Granular permission explicitly blocks action regardless of role` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Granular permission explicitly blocks action regardless of role | Business Flow (BF-001/002/003) & Revision History |
| `Void/cancel endpoints reject unauthorized users via API` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Void/cancel endpoints reject unauthorized users via api | Business Flow (BF-001/002/003) & Revision History |
| `Assert revision history attributes correct User` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Assert revision history attributes correct user | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits by two users attribute correctly` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Concurrent edits by two users attribute correctly | Business Flow (BF-001/002/003) & Revision History |
| `Edit non-existent record returns 404` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit non-existent record returns 404 | Business Flow (BF-001/002/003) & Revision History |
| `Edit with invalid data returns validation error` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Edit with invalid data returns validation error | Business Flow (BF-001/002/003) & Revision History |
| `Concurrent edits handle conflicts gracefully` | `apps/frontend/tests/e2e/modification-tracking/voucher-journal-mod.spec.ts` | E2E | Concurrent edits handle conflicts gracefully | Business Flow (BF-001/002/003) & Revision History |


## 3. Phase Mapping

- **Phase 1: Contracts:** Implicitly covered by API tests and strict typing steps in CI (type-check gate).
- **Phase 2: Factories/Reset:** Leveraged heavily in Pytest setups (`accounts/tests/factories.py`, `inventory/tests/factories.py`). The Playwright `global-setup.ts` utilizes the `reset_test_db_state` management command successfully.
- **Phase 3: Invariants:** `test_phase0_gst.py` strictly tests the GST matrix. `test_packet_b.py` and stock-related unit tests guarantee batch invariants and locking mechanisms.
- **Phase 4: API/Concurrency:** Thread-based testing (`test_billing_concurrency.py`, `test_purchase_edit_concurrency.py`) strictly enforces database isolation levels (select_for_update).
- **Phase 5: Playwright/Docs:** Three happy-path Playwright flows (`smoke.spec.ts`) trace BF-001, BF-002, and BF-003, exactly matching `BUSINESS_FLOW_MATRIX.md`. `INVARIANT_MATRIX.md` exists and maps accurately to Phase 3 and Phase 4 locks.

## 4. Missing or Weak Coverage

1. **Frontend Unit Tests (Jest/Vitest):** Almost all frontend testing is purely E2E Playwright. The frontend lacks unit tests for hooks, complex formatting utilities, and isolated component states.
2. **Offline/Local-First Degradation:** No tests simulate dropped network connections during billing to guarantee offline-first capabilities or queued syncing.
3. **Missing Docs Mappings:** `BUSINESS_FLOW_MATRIX.md` is very sparse (only 3 flows). The backend has over 150 tests covering returns, quotations, credit notes, vouchers, and revisions, but these are NOT documented in the Flow Matrix yet.

## 5. Final Assessment

The testing architecture is remarkably robust on the backend. The integration of `factory_boy` with real PostgreSQL, combined with genuine threaded concurrency testing for race conditions, provides absolute confidence in data integrity and lock behavior. The weakest links are the lack of purely isolated frontend unit tests (relying entirely on heavy Playwright E2E) and the fact that the living documentation (`BUSINESS_FLOW_MATRIX.md`) is drastically out of sync with the true massive scope of the backend test suite.
