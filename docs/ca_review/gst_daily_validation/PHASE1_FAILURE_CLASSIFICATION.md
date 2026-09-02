# Phase 1.1 Failure Classification

### test_advisory_only_reconciliation
- **Test Name**: `test_advisory_only_reconciliation`
- **File**: `apps/gst/tests/test_phase2b_gstr2b.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_migration_additive_safety
- **Test Name**: `test_migration_additive_safety`
- **File**: `apps/gst/tests/test_phase2b_gstr2b.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_normalization_and_unknown_category
- **Test Name**: `test_normalization_and_unknown_category`
- **File**: `apps/gst/tests/test_phase2b_gstr2b.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_outlet_isolation
- **Test Name**: `test_outlet_isolation`
- **File**: `apps/gst/tests/test_phase2b_gstr2b.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_pagination_and_failed_handling
- **Test Name**: `test_pagination_and_failed_handling`
- **File**: `apps/gst/tests/test_phase2b_gstr2b.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_valid_live_mode
- **Test Name**: `test_valid_live_mode`
- **File**: `apps/gst/tests/test_sandbox_provider_config.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_valid_test_mode
- **Test Name**: `test_valid_test_mode`
- **File**: `apps/gst/tests/test_sandbox_provider_config.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_sandbox_status_production_blocked
- **Test Name**: `test_sandbox_status_production_blocked`
- **File**: `apps/gst/tests/test_sandbox_views.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_sandbox_status_wrong_gstin_blocked
- **Test Name**: `test_sandbox_status_wrong_gstin_blocked`
- **File**: `apps/gst/tests/test_sandbox_views.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_test_user_blocked
- **Test Name**: `test_test_user_blocked`
- **File**: `apps/gst/tests/test_sandbox_views.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_gstr3b_builder_mapping_and_lifecycle
- **Test Name**: `test_gstr3b_builder_mapping_and_lifecycle`
- **File**: `apps/inventory/tests/test_stock_adjustments.py`
- **Classification**: `UNKNOWN`
- **Root Cause**: Unknown
- **Proposed Correction**: Unknown
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_gstr3b_builder_separation
- **Test Name**: `test_gstr3b_builder_separation`
- **File**: `apps/purchases/tests/test_rule37.py`
- **Classification**: `UNKNOWN`
- **Root Cause**: Unknown
- **Proposed Correction**: Unknown
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_pdf_export_successful
- **Test Name**: `test_pdf_export_successful`
- **File**: `apps/reports/tests/test_ca_working_paper.py`
- **Classification**: `EXPECTED_TEST_AUTH_UPDATE`
- **Root Cause**: Missing authentication. Phase 1 enforced IsAuthenticated globally on GST export endpoints.
- **Proposed Correction**: Authenticate the test client using a valid user tied to the correct outlet.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_gst_transaction_snapshot_creation
- **Test Name**: `test_gst_transaction_snapshot_creation`
- **File**: `apps/reports/tests/test_gst_foundation.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_seed_mumbai_outlet_credentials
- **Test Name**: `test_seed_mumbai_outlet_credentials`
- **File**: `apps/reports/tests/test_gst_foundation.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_template_checksum_matches_manifest
- **Test Name**: `test_template_checksum_matches_manifest`
- **File**: `apps/reports/tests/test_gst_template_integrity.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_excel_export_blocked_by_errors
- **Test Name**: `test_excel_export_blocked_by_errors`
- **File**: `apps/reports/tests/test_gstr1_excel.py`
- **Classification**: `EXPECTED_TEST_AUTH_UPDATE`
- **Root Cause**: Missing authentication. Phase 1 enforced IsAuthenticated globally on GST export endpoints.
- **Proposed Correction**: Authenticate the test client using a valid user tied to the correct outlet.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_excel_export_successful
- **Test Name**: `test_excel_export_successful`
- **File**: `apps/reports/tests/test_gstr1_excel.py`
- **Classification**: `EXPECTED_TEST_AUTH_UPDATE`
- **Root Cause**: Missing authentication. Phase 1 enforced IsAuthenticated globally on GST export endpoints.
- **Proposed Correction**: Authenticate the test client using a valid user tied to the correct outlet.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_reconciliation_matched
- **Test Name**: `test_reconciliation_matched`
- **File**: `apps/reports/tests/test_gstr2b.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_reconciliation_mismatch
- **Test Name**: `test_reconciliation_mismatch`
- **File**: `apps/reports/tests/test_gstr2b.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_reconciliation_missing_in_2b
- **Test Name**: `test_reconciliation_missing_in_2b`
- **File**: `apps/reports/tests/test_gstr2b.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_tc_3b_13_excess_itc
- **Test Name**: `test_tc_3b_13_excess_itc`
- **File**: `apps/reports/tests/test_gstr3b_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_tc_3b_14_liability_shortfall
- **Test Name**: `test_tc_3b_14_liability_shortfall`
- **File**: `apps/reports/tests/test_gstr3b_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_tc_3b_15_invalid_reversals
- **Test Name**: `test_tc_3b_15_invalid_reversals`
- **File**: `apps/reports/tests/test_gstr3b_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_tc_3b_16_table_3_2_bounds
- **Test Name**: `test_tc_3b_16_table_3_2_bounds`
- **File**: `apps/reports/tests/test_gstr3b_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_tc_3b_21_val_008_blocking_override
- **Test Name**: `test_tc_3b_21_val_008_blocking_override`
- **File**: `apps/reports/tests/test_gstr3b_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_tc_99_generate_ca_json
- **Test Name**: `test_tc_99_generate_ca_json`
- **File**: `apps/reports/tests/test_gstr3b_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_gstr1_builder
- **Test Name**: `test_gstr1_builder`
- **File**: `apps/reports/tests/test_gstr_builders.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_gstr3b_builder
- **Test Name**: `test_gstr3b_builder`
- **File**: `apps/reports/tests/test_gstr_builders.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_original_document_traceability_and_manual_override
- **Test Name**: `test_original_document_traceability_and_manual_override`
- **File**: `apps/reports/tests/test_gstr_returns.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_advanced_sample_integrity
- **Test Name**: `test_advanced_sample_integrity`
- **File**: `apps/reports/tests/test_ooxml_integrity.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_clean_sample_integrity
- **Test Name**: `test_clean_sample_integrity`
- **File**: `apps/reports/tests/test_ooxml_integrity.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_reconciliation_excel_export_successful
- **Test Name**: `test_reconciliation_excel_export_successful`
- **File**: `apps/reports/tests/test_reconciliation_excel.py`
- **Classification**: `EXPECTED_TEST_AUTH_UPDATE`
- **Root Cause**: Missing authentication. Phase 1 enforced IsAuthenticated globally on GST export endpoints.
- **Proposed Correction**: Authenticate the test client using a valid user tied to the correct outlet.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_reconciliation_excel_no_run_found
- **Test Name**: `test_reconciliation_excel_no_run_found`
- **File**: `apps/reports/tests/test_reconciliation_excel.py`
- **Classification**: `EXPECTED_TEST_AUTH_UPDATE`
- **Root Cause**: Missing authentication. Phase 1 enforced IsAuthenticated globally on GST export endpoints.
- **Proposed Correction**: Authenticate the test client using a valid user tied to the correct outlet.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_interstate_sale_taxes
- **Test Name**: `test_interstate_sale_taxes`
- **File**: `apps/reports/tests/test_snapshot_services.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_purchase_snapshot_creation
- **Test Name**: `test_purchase_snapshot_creation`
- **File**: `apps/reports/tests/test_snapshot_services.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_sale_snapshot_creation
- **Test Name**: `test_sale_snapshot_creation`
- **File**: `apps/reports/tests/test_snapshot_services.py`
- **Classification**: `TEST_DATA_OR_FIXTURE_DEFECT`
- **Root Cause**: Test setup relies on Outlet.objects.first() or hardcodes GSTINs that conflict with the seeder, or tests were not updated for outlet isolation.
- **Proposed Correction**: Update tests to explicitly create and use a dedicated Outlet, and fix duplicate GSTIN conflicts.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_gstr1_template_integrity
- **Test Name**: `test_gstr1_template_integrity`
- **File**: `apps/reports/tests/test_template_integrity.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_fetch_sandbox_access_token_error
- **Test Name**: `test_fetch_sandbox_access_token_error`
- **File**: `apps/gst/tests/test_sandbox_auth.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_get_sandbox_access_token_expiry_behavior
- **Test Name**: `test_get_sandbox_access_token_expiry_behavior`
- **File**: `apps/gst/tests/test_sandbox_auth.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_get_sandbox_access_token_success_and_cache
- **Test Name**: `test_get_sandbox_access_token_success_and_cache`
- **File**: `apps/gst/tests/test_sandbox_auth.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_authenticate_platform_success
- **Test Name**: `test_authenticate_platform_success`
- **File**: `apps/gst/tests/test_sandbox_provider.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_init_reads_env_correctly
- **Test Name**: `test_init_reads_env_correctly`
- **File**: `apps/gst/tests/test_sandbox_provider.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

### test_init_reads_live_env_correctly
- **Test Name**: `test_init_reads_live_env_correctly`
- **File**: `apps/gst/tests/test_sandbox_provider.py`
- **Classification**: `EXPECTED_PROVIDER_FIXTURE_UPDATE`
- **Root Cause**: Strict constructor-level validation of SANDBOX_PROVIDER_MODE blocks instantiation without explicit configuration.
- **Proposed Correction**: Mock SANDBOX_PROVIDER_MODE environment variable or use proper settings patch during test.
- **Security Impact**: Positive (enforces isolation/config safety).
- **Change Target**: Test Code.

