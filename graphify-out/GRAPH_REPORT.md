# Graph Report - MDF  (2026-11-03)

## Corpus Check
- 928 files · ~535,734 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: (none) 13, .Dockerfile 2, .legacy 1)

## Summary
- 6142 nodes · 21037 edges · 367 communities (168 shown, 199 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 3101 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `763de0d9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- VoucherLinesGrid.tsx
- FE Lib, Hooks & Inventory Pages
- cn
- dashboard/layout.tsx
- useOutletId
- ScheduleReportTab.tsx
- billingStore.ts
- B.5 Other feature folders
- django_db
- KioskMode
- FE Types & Report Tabs
- uuid
- ErpReportService
- react
- ExpiryReportTab.tsx
- utils.ts
- inventory/views.py
- reports/urls.py
- FE Dependencies & Webcam
- Staff
- MasterProduct
- Customer
- BE Attendance Module
- JournalEntry
- FE package.json Deps
- check_outlet_access
- SaleInvoice
- billing/views.py
- StockLedger
- Root package.json
- ErpExcelService
- MasterProductFactory
- SaleReturnItemsGrid.tsx
- BE Audit Middleware
- 5.2 billing
- purchases/views.py
- voucher_serializers.py
- quantity_to_pack_display
- django_conf
- PurchaseBookServiceTests
- commands (40)
- atomic_sale_update
- get_latest_log
- rebuild_stock_ledger
- ManavataA4Invoice.tsx
- settings.ts
- docs (46)
- workflows (47)
- ITCReconciliationResult
- voucher_views.py
- AuditContext
- zod
- GST Phase 4B Integration Blueprint
- PROJECT_MAP — MediFlow / MDF (pharmacy ERP + billing)
- C.3 GST suite (snapshot driven)
- Outlet
- ExportButton.tsx
- SandboxConfiguration
- GSTTransactionSnapshot
- gst/views.py
- PurchaseInvoice
- Backend requirements.txt
- Correctness bugs (verified by reading)
- 5.4 reports
- SaleEditMigrationTests
- IsAuthenticated
- PurchaseOrderSuggestionsView
- purchases/services.py
- A.1 `/api/v1/reports/...` (R/urls.py)
- Batch model
- MediFlow API Reference
- GrossLossOnReturnExportView
- docs (72)
- tests_purchase_reports_db.py
- payloadSchemas.ts
- ActivityLog
- PurchaseServiceError
- 4.2 billing
- atomic_sale_save
- gstr2b_service.py
- purchases (80)
- frontend (81)
- StripMathTestCase
- LogoutView
- partner_views.py
- DocumentRevisionV2LegacyAdapterSerializer
- mediflow/urls.py
- JournalLine
- IsAuthenticated
- TaxSlab
- usePurchaseReturnCart
- tests (92)
- .get
- PurchaseExcelTests
- atomic_purchase_update
- gstr1_excel.py
- e2e (97)
- e2e (98)
- tests (99)
- purchases (100)
- payloadBuilders.ts
- ui (102)
- tests (103)
- ocr_engine.py
- RISKS / GAPS (report only)
- PurchaseListView
- pandas
- backend (108)
- frontend (109)
- A.2 accounts: customers (`accounts/customer_urls.py`, prefix `/api/v1/customers/`)
- MainInvoiceWorkspace.tsx
- scheduleTypes.ts
- billing/tests/factories.py
- make_test_invoice
- ActivityEvent
- 11.1 Highest-priority items (cross-cutting summary)
- frontend (117)
- CLAUDE.md
- 11.4 inventory / purchases — detail
- StaffDetailView
- DebitNoteSerializer
- DraftInvoiceSerializer
- react
- PacketBTests
- DiffEngine
- .claude/CLAUDE.md
- CustomerSerializer
- C4. OCR / AI invoice scanning pipeline
- has_bill_revision_permission
- parse_skips.js
- resolve_item_amounts
- DeadlockRegressionTests
- credit_controls.py
- UserTimelineTests
- tests (135)
- SaleCreateView
- SaleReturnModTests
- docker-compose.yml (138)
- docs (139)
- SaleListView
- docs (141)
- docs (142)
- CustomerCreateUpdateSerializer
- clean_units.py
- pricing.py
- post_stock_ledger_entry
- MasterProductAlias
- commands (148)
- parse_header
- DraftInvoiceItem
- Organization
- LedgerEntry
- EmptyItemsValidationTestCase
- FixedMonthlyExpense
- DoctorSerializer
- AuditConfig
- StaffPinAuthTests
- billing/views.py
- QuotationSaleSchemaParityTest
- purchases.ts
- stockledger/page.tsx
- public (162)
- fixtures (163)
- test_purchase_return_concurrency
- docker-compose.yml (165)
- docs (166)
- docs (167)
- plans (168)
- DebitNoteAuditSerializer
- staff.ts
- PurchaseInvoiceAuditSerializer
- count_logs
- tests (173)
- tests (174)
- AccountsConfig
- billing (176)
- 0016_staff_can_edit_purchase_returns_and_more.py
- 0017_staff_can_modify_paid_purchases_and_more.py
- 0006_migrate_billrevisions.py
- ActivityLogFilter
- sale_services.py
- tests (182)
- CoreConfig
- OutletSettingsPrintEngineTests
- commands (185)
- SaleInvoiceAuditSerializer
- os
- InventoryConfig
- docker-compose.yml (189)
- docker-compose.yml (190)
- docs (191)
- update_commands.js (192)
- 0009_populate_opening_qty.py
- 0013_inventory_search_performance.py
- PurchasesConfig
- validations/auth.ts
- billing.ts
- tests (198)
- customers.ts
- inventory.ts
- SalesReturnAuditSerializer
- docker-compose.yml (204)
- docker-compose.yml (205)
- docker-compose.yml (206)
- docs (207)
- docs (208)
- OutletFilteredManager
- accounts (210)
- test_bottle_purchase_and_billing
- accounts (213)
- 0014_taxslab.py
- 0015_activate_pharma_tax_slabs.py
- Ledger
- Command
- StockLedgerView
- BillingConfig
- Command
- frontend (222)
- ui (223)
- docker-compose.yml (224)
- Command
- 0007_alter_staff_staff_pin.py
- 0012_rename_accounts_jo_outlet_12345_idx_accounts_jo_outlet__f42d6e_idx_and_more.py
- 0013_customer_state_doctor_address_doctor_degree_and_more.py
- migrations (229)
- 0014_staff_can_edit_purchases_staff_can_edit_sales.py
- 0018_voucher_status.py
- 0020_voucher_updated_at.py
- 0022_alter_customer_unique_together.py
- 0025_staff_shift_end_time_staff_shift_start_time_and_more.py
- 0026_merge_20261003_1403.py
- 0027_journalline_description.py
- 0002_attendancerecord_check_in_photo_url_and_more.py
- 0003_activitylog_ip_is_routable.py
- 0006_saleitem_qty_returned_remove_saleinvoice_has_return.py
- 0015_delete_billrevision.py
- types (241)
- docker-compose.yml (242)
- docker-compose.yml (243)
- docs (244)
- 0017_creditaccount_updated_at_and_more.py
- 0022_saleinvoice_ack_date_saleinvoice_ack_no_and_more.py
- 0023_quotation_billing_basis_quotation_is_interstate_and_more.py
- 0024_saleinvoice_eway_bill_date_and_more.py
- 0025_saleitem_applied_ptr_saleitem_applied_pts.py
- 0027_salesreturn_deduction_amount.py
- 0003_add_org_contact_fields.py
- 0008_outlet_gst_username.py
- 0009_outletsettings_gstr2b_tolerance.py
- lib (254)
- frontend (255)
- frontend (256)
- 0010_outletsettings_allowed_attendance_ips_and_more.py
- frontend (258)
- 0010_sandboxconfiguration__einvoice_password_encrypted_and_more.py
- docker-compose.yml (260)
- constants (261)
- constants (262)
- commands (263)
- accounts (264)
- 0012_merge_20261003_1403.py
- 0012_outletsettings_enable_einvoice_and_more.py
- 0018_merge_20260806_1213.py
- commands (268)
- 0021_batch_landing_rate_alter_stockledger_qty_in_and_more.py
- 0022_batch_default_scheme_batch_ptr_batch_pts.py
- 0023_batch_inventory_b_product_57baca_idx.py
- 0002_distributor_food_license_no.py
- 0003_purchaseinvoice_ledger_adjustment_and_more.py
- 0012_purchaseinvoice_invoice_discount.py
- 0015_alter_purchaseinvoice_status.py
- calculate_line_item
- 0007_alter_gsttransactionsnapshot_transaction_type.py
- 0008_itcreconciliationresult_reports_itc_run_id_4dc9bf_idx_and_more.py
- migrations (281)
- core (283)
- migrations (284)
- inventory (286)
- purchases (287)
- frontend (290)
- frontend (291)
- types (292)
- scripts (293)
- tests (305)
- frontend (308)
- frontend (309)
- dev-health-check.sh (347)
- docs (415)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 365 edges
2. `Button` - 266 edges
3. `Outlet` - 256 edges
4. `react` - 221 edges
5. `lucide-react` - 190 edges
6. `useOutletId()` - 156 edges
7. `Batch` - 154 edges
8. `SaleInvoice` - 144 edges
9. `Input` - 137 edges
10. `useAuthStore` - 133 edges

## Surprising Connections (you probably didn't know these)
- `BillRevision (l.786) `billing_billrevision`` --references--> `DocumentRevisionV2`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/audit/models.py
- `ScheduleHRegister (l.296) `billing_schedulehregister`` --references--> `schedule_h_validate()`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/billing/services.py
- `GSTTransactionSnapshot (models.py:6, table `reports_gsttransactionsnapshot`)` --references--> `create_sale_snapshots()`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/reports/gst_snapshot_service.py
- `F.4 Tests (backend)` --references--> `authenticated_client()`  [INFERRED]
  PROJECT_MAP.md → apps/backend/conftest.py
- `Root / auth` --references--> `LoginForm()`  [INFERRED]
  PROJECT_MAP.md → apps/frontend/app/(auth)/login/LoginForm.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Atomic purchase/payment flow updating stock and ledger** — docs_backend_documentation_purchase_save_logic, docs_backend_documentation_bill_by_bill_payment, docs_backend_documentation_ledgerentry, docs_backend_documentation_batch_model, docs_backend_documentation_critical_rules [EXTRACTED 1.00]
- **GST Dashboard UI component and API flow** — docs_plans_gst_dashboard_b2_plan_gstdashboard, docs_plans_gst_dashboard_b2_plan_validation_panel, docs_plans_gst_dashboard_b2_plan_reconciliation_widget, docs_plans_gst_dashboard_b2_plan_gst_api_contracts, docs_plans_gst_dashboard_b2_plan_export_actions [EXTRACTED 1.00]
- **GST snapshot population from Sale, SalesReturn and Purchase items** — docs_phase2_snapshot_mapping_rules_saleitem_mapping, docs_phase2_snapshot_mapping_rules_salesreturnitem_mapping, docs_phase2_snapshot_mapping_rules_purchaseitem_mapping, docs_phase2_snapshot_mapping_rules_gst_transaction_snapshot [EXTRACTED 1.00]

## Communities (367 total, 199 thin omitted)

### Community 0 - "VoucherLinesGrid.tsx"
Cohesion: 0.11
Nodes (17): CreateLedgerModalProps, FilterGroup, formatLedgerBalance(), getBalBadgeColor(), LedgerPicker(), LedgerPickerProps, getLineFilter(), LineFilter (+9 more)

### Community 1 - "FE Lib, Hooks & Inventory Pages"
Cohesion: 0.05
Nodes (112): AuditPage(), PurchaseOrderDetailPage(), ConsolidatedPurchaseBookPage(), FormatMode, GrossLossOnReturnPage(), GrossLossReport, GrossLossRow, percent() (+104 more)

### Community 2 - "cn"
Cohesion: 0.05
Nodes (88): AccountsLayout(), NAV_LINKS, BalanceSheetPage(), BSData, BSSide, calYearForFyMonth(), fmt(), fmtFull() (+80 more)

### Community 3 - "dashboard/layout.tsx"
Cohesion: 0.07
Nodes (43): AdminLayout(), BillingLayout(), DashboardLayout(), DashboardLayout(), metadata, RootLayout(), viewport, Providers() (+35 more)

### Community 4 - "useOutletId"
Cohesion: 0.03
Nodes (145): CreditPage(), DetailRow(), formatINR(), getInvoiceStatus(), getPeriodStart(), InvoiceHistory(), InvoiceItemsExpanded(), PeriodFilter (+137 more)

### Community 5 - "ScheduleReportTab.tsx"
Cohesion: 0.06
Nodes (50): ScheduleDrugsPage(), columnHelper, GSTR1Page(), InvoiceRow, GSTR2APage(), GSTR2AWarningRow, col31, col4 (+42 more)

### Community 6 - "billingStore.ts"
Cohesion: 0.10
Nodes (35): FullScreenBillingPage(), ActiveBillsTabs(), BillingHeaderStrip(), BillingHeaderStripProps, BillSuccessScreen(), CreateDoctorModalProps, DoctorPicker(), DoctorPickerProps (+27 more)

### Community 7 - "B.5 Other feature folders"
Cohesion: 0.03
Nodes (117): AttendancePage(), InventoryPage(), StaffPage(), AttendancePctBadge(), AttendanceSummaryTab(), CURRENT_YEAR, formatTime12h(), MONTHS (+109 more)

### Community 8 - "django_db"
Cohesion: 0.03
Nodes (39): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+31 more)

### Community 9 - "KioskMode"
Cohesion: 0.20
Nodes (11): KioskMode(), appendDigit(), captureAndProceed(), performAction(), processPin(), skipPhoto(), triggerShake(), WebcamCapture() (+3 more)

### Community 10 - "FE Types & Report Tabs"
Cohesion: 0.03
Nodes (94): BillAdjustmentModalProps, Props, VoucherFormProps, AlertsRowProps, PaymentPieChartProps, ProfitAnalysisCardProps, LeaderboardStaff, StatCardsRowProps (+86 more)

### Community 11 - "uuid"
Cohesion: 0.04
Nodes (34): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+26 more)

### Community 13 - "react"
Cohesion: 0.03
Nodes (201): INR(), LEDGER_SORT_OPTIONS, LedgerStatementPage(), handleRowClick(), load(), SourceType, txColor(), txIcon() (+193 more)

### Community 14 - "ExpiryReportTab.tsx"
Cohesion: 0.36
Nodes (6): ExpiryReportPage(), DaysRemainingBadge(), ExpiryFilter, ExpiryReportTab(), FILTER_OPTIONS, helper

### Community 15 - "utils.ts"
Cohesion: 0.03
Nodes (154): LoginForm(), ExpensesPage(), OverviewPage(), PayablesPage(), ReceivablesPage(), KPICard(), CustomerDetailPage(), DashboardPage() (+146 more)

### Community 16 - "inventory/views.py"
Cohesion: 0.08
Nodes (22): Batch, Meta, OutletProductConfig, Meta, BatchAvailabilityCheckView, BatchDetailUpdateView, BatchLandingCostView, _canonical_pack_type() (+14 more)

### Community 17 - "reports/urls.py"
Cohesion: 0.08
Nodes (13): BaseErpReportView, ConsolidatedSalesBookExportView, ConsolidatedSalesBookView, GrossLossOnReturnView, GrossProfitReportExportView, GrossProfitReportView, _is_consolidated(), _purchase_less_returns() (+5 more)

### Community 18 - "FE Dependencies & Webcam"
Cohesion: 0.04
Nodes (77): dependencies, class-variance-authority@^0.7.1, clsx@^2.1.1, cmdk@^1.1.1, date-fns@^4.1.0, dexie@^4.3.0, fuse.js@^7.5.0, @hookform/resolvers@^5.2.2 (+69 more)

### Community 19 - "Staff"
Cohesion: 0.11
Nodes (4): Doctor, Meta, Staff, Meta

### Community 20 - "MasterProduct"
Cohesion: 0.10
Nodes (9): Command, MasterProduct, Meta, StockAdjustmentAllocation, Meta, PurchaseItem, Meta, BatchWiseReportService (+1 more)

### Community 21 - "Customer"
Cohesion: 0.08
Nodes (14): Command, seed_outlet_ledgers(), Customer, Meta, LedgerGroup, Meta, api_client(), test_data() (+6 more)

### Community 22 - "BE Attendance Module"
Cohesion: 0.10
Nodes (14): AttendanceRecord, Meta, AttendanceCheckInView, AttendanceCheckOutView, AttendanceManualView, AttendanceMonthlyView, AttendanceMyIpView, AttendanceSummaryView (+6 more)

### Community 23 - "JournalEntry"
Cohesion: 0.11
Nodes (16): post_voucher(), reverse_journal(), Command, Command, JournalEntry, Meta, Voucher, Meta (+8 more)

### Community 24 - "FE package.json Deps"
Cohesion: 0.05
Nodes (40): devDependencies, autoprefixer@10.4.19, eslint@8.57.0, eslint-config-next@14.2.15, identity-obj-proxy@^3.0.0, jest@^30.3.0, jest-environment-jsdom@^30.3.0, openapi-typescript@^7.13.0 (+32 more)

### Community 25 - "check_outlet_access"
Cohesion: 0.10
Nodes (9): CanEditSaleReturns, CanEditVouchers, CanViewPurchaseRates, CanVoidRecords, check_outlet_access(), _get_requested_outlet_id(), _is_admin(), 4.1 accounts / attendance / audit / core / gst (+1 more)

### Community 26 - "SaleInvoice"
Cohesion: 0.06
Nodes (28): DocumentRevision, Meta, PurchaseItemAuditSerializer, Meta, SaleItemAuditSerializer, Meta, SalesReturnItemAuditSerializer, Meta (+20 more)

### Community 27 - "billing/views.py"
Cohesion: 0.08
Nodes (16): CreateSalesReturnView, CreditTransactionListView, CustomerCreditPaymentView, DashboardDailyView, EwayBillPdfDownloadView, NextInvoiceNumberView, ReceiptListCreateView, SalePrintView (+8 more)

### Community 28 - "StockLedger"
Cohesion: 0.06
Nodes (39): LedgerFactory, Meta, LedgerGroupFactory, Meta, OrganizationFactory, Meta, OutletFactory, Meta (+31 more)

### Community 29 - "Root package.json"
Cohesion: 0.06
Nodes (39): author, bugs, url, dependencies, @radix-ui/react-alert-dialog@^1.1.15, description, devDependencies, @testing-library/react@^16.3.2 (+31 more)

### Community 31 - "MasterProductFactory"
Cohesion: 0.06
Nodes (39): CustomerFactory, Meta, batch_a(), batch_b(), batch_c(), default_outlet(), product_a_pack10(), product_b_inclusive() (+31 more)

### Community 32 - "SaleReturnItemsGrid.tsx"
Cohesion: 0.16
Nodes (13): NewCreditNoteContent(), handleSave(), handleSelectInvoice(), NewCreditNotePage(), formatExpiryDate(), RowProductSearch(), SaleReturnItemsGrid(), SaleReturnItemsGridProps (+5 more)

### Community 33 - "BE Audit Middleware"
Cohesion: 0.08
Nodes (5): ActivityLogSerializer, Meta, log_activity(), AuditLogTests, BillingRevisionTests

### Community 34 - "5.2 billing"
Cohesion: 0.10
Nodes (20): 5.2 billing, BillRevision (l.786) `billing_billrevision`, CreditAccount (l.326) `billing_creditaccount`, CreditTransaction (l.370) `billing_credittransaction`, DraftInvoice (l.846) `billing_draftinvoice`, DraftInvoiceItem (l.893) `billing_draftinvoiceitem`, ExpenseEntry (l.632) `billing_expenseentry`, InvoicePayment (l.251) `billing_invoicepayment` (+12 more)

### Community 35 - "purchases/views.py"
Cohesion: 0.07
Nodes (16): CanAccessPurchases, PaymentListCreateView, DistributorDetailView, DistributorLedgerView, DistributorListView, DistributorOutstandingView, DistributorPaymentView, InvoiceOCRRetryView (+8 more)

### Community 36 - "voucher_serializers.py"
Cohesion: 0.07
Nodes (17): CreditNote, Meta, CreditNoteItem, Meta, VoucherBillAdjustment, Meta, CreditNoteService, VoucherBillModTests (+9 more)

### Community 38 - "django_conf"
Cohesion: 0.06
Nodes (17): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+9 more)

### Community 39 - "PurchaseBookServiceTests"
Cohesion: 0.17
Nodes (7): PurchaseBookExportView, _invoice(), _note(), PurchaseBookServiceTests, PurchaseReportRouteTests, PurchaseReturnBookServiceTests, _qs()

### Community 40 - "commands (40)"
Cohesion: 0.10
Nodes (12): _build_pack_lookup(), _clean_salt(), _dec(), _gstin(), _hsn(), _int(), _marg_drug_type(), _marg_pack_unit() (+4 more)

### Community 41 - "atomic_sale_update"
Cohesion: 0.11
Nodes (16): InvoicePayment, Meta, atomic_sale_update(), cancel_invoice(), get_sale_modification_constraints(), rebuild_customer_ledger(), SaleServiceError, SaleModificationTests (+8 more)

### Community 42 - "get_latest_log"
Cohesion: 0.13
Nodes (5): get_latest_log(), make_batch(), make_product(), ChangesDiffTests, SignalCRUDTests

### Community 43 - "rebuild_stock_ledger"
Cohesion: 0.11
Nodes (15): atomic_debit_note_update(), DebitNote, Meta, DebitNoteItem, Meta, DebitNoteService, record_mutation(), DebitNoteItemAuditSerializer (+7 more)

### Community 44 - "ManavataA4Invoice.tsx"
Cohesion: 0.11
Nodes (19): mockDoctors, abbrevMfg(), amountInWords(), DEFAULT_CONFIG, fmtAmt(), fmtExpiry(), InvoicePreviewProps, ManavataA4Invoice (+11 more)

### Community 45 - "settings.ts"
Cohesion: 0.15
Nodes (12): AttendanceSettingsFormValues, attendanceSettingsSchema, BillingSettingsFormValues, billingSettingsSchema, GSTSettingsFormValues, gstSettingsSchema, NotificationSettingsFormValues, notificationSettingsSchema (+4 more)

### Community 46 - "docs (46)"
Cohesion: 0.13
Nodes (24): distributorsApi, Marg Data Import guide, Manavata Pharma outlet, SAI Medical outlet, Accounting invariants (double-entry zero-sum), MediFlow Model Fields Reference, DebitNote model, DebitNoteItem model (+16 more)

### Community 47 - "workflows (47)"
Cohesion: 0.07
Nodes (28): BASE_URL, CI, jobs, test, name, on, pull_request, push (+20 more)

### Community 48 - "ITCReconciliationResult"
Cohesion: 0.15
Nodes (7): Rule37Adjustment, Meta, GSTR2BService, strip_invoice_number(), Command, ITCReconciliationResult, Meta

### Community 49 - "voucher_views.py"
Cohesion: 0.08
Nodes (25): LedgerGroupSerializer, Meta, LedgerSerializer, Meta, VoucherSerializer, Meta, BalanceSheetView, get_outlet_id() (+17 more)

### Community 50 - "AuditContext"
Cohesion: 0.08
Nodes (19): AuditJWTAuthentication, AuditContext, get_audit_context(), reset_audit_context(), set_audit_context(), AuditContextMiddleware, AuditContextPermission, AuditContextTests (+11 more)

### Community 51 - "zod"
Cohesion: 0.25
Nodes (6): ManualAttendanceFormValues, manualAttendanceSchema, CreditPaymentFormData, creditPaymentSchema, zod@^4.3.6, zod

### Community 52 - "GST Phase 4B Integration Blueprint"
Cohesion: 0.24
Nodes (11): GST Phase 4B Integration Blueprint, GSTR2BFetchService (planned), GSTR2BReconciliationService (planned), GstReconciliationMatch model (planned), IMS (Invoice Management System) Phase 4C, GSTR-2B reconciliation precedes IMS and filing, GST Sandbox Deferred Plan, Kept sandbox foundation (models and services) (+3 more)

### Community 53 - "PROJECT_MAP — MediFlow / MDF (pharmacy ERP + billing)"
Cohesion: 0.11
Nodes (17): 10.2 How to add things (follow the existing pattern), 10. Conventions and how to add things, 1.1 Run, build, test, 1. Overview, 2. Folder structure, 6.1 Pages & routes, 6.4 Types & schemas, 6. Frontend (`apps/frontend`) (+9 more)

### Community 54 - "C.3 GST suite (snapshot driven)"
Cohesion: 0.05
Nodes (26): ExportBlockedException, GSTExportService, StockAdjustment, get_current_outlet(), GSTExportView, GSTPeriodsView, GSTReconciliationView, GSTSummaryView (+18 more)

### Community 55 - "Outlet"
Cohesion: 0.08
Nodes (13): Command, Outlet, Meta, CanAccessReports, BalanceSheetView, BatchWiseReportExportView, ExpiryReportView, GSTR2AReconciliationView (+5 more)

### Community 56 - "ExportButton.tsx"
Cohesion: 0.20
Nodes (17): ExportButton(), downloadCSV(), exportExpiryReportCSV(), exportGSTR1_CSV(), exportGSTR3B_CSV(), exportGSTReportCSV(), exportPurchaseReportCSV(), exportSalesReportCSV() (+9 more)

### Community 57 - "SandboxConfiguration"
Cohesion: 0.07
Nodes (21): process_pending_ewaybill(), SandboxAuthService, _get_fernet(), SandboxConfiguration, Meta, SandboxAPIClient, SandboxIntegrationError, cancel_einvoice() (+13 more)

### Community 58 - "GSTTransactionSnapshot"
Cohesion: 0.13
Nodes (11): create_purchase_return_snapshots(), create_purchase_snapshots(), create_sale_snapshots(), create_sales_return_snapshots(), _determine_interstate(), _get_local_date(), _get_state_code(), Command (+3 more)

### Community 59 - "gst/views.py"
Cohesion: 0.08
Nodes (33): GstTaxpayerAuth, Meta, normalize_invoice_number(), run_advisory_reconciliation(), sync_gstr2b_job(), get_user_outlet(), GSTExportAuditView, GSTR1InvoicesView (+25 more)

### Community 60 - "PurchaseInvoice"
Cohesion: 0.11
Nodes (11): Command, clean_seed_data(), Command, generate_deterministic_anchors(), run_seeder(), seed_master_data(), seed_purchases(), seed_returns() (+3 more)

### Community 61 - "Backend requirements.txt"
Cohesion: 0.18
Nodes (11): Backend requirements.txt, Celery + Redis task queue, cryptography (Fernet), Django 5.0.3, Django REST Framework + SimpleJWT, OCR stack (rapidocr-onnxruntime, opencv, rapidfuzz, google-genai, pydantic), PostgreSQL driver psycopg2-binary, WeasyPrint / ReportLab PDF generation (+3 more)

### Community 62 - "Correctness bugs (verified by reading)"
Cohesion: 0.09
Nodes (9): build_sale_response_payload(), CreditAccountListView, CreditLedgerView, LowStockAlertView, MargMigrationView, SaleInvoiceSearchView, SaleReviseView, 9.1 Module dependency overview (+1 more)

### Community 63 - "5.4 reports"
Cohesion: 0.11
Nodes (15): 5.1 accounts / attendance / audit / core, 5.3 inventory & purchases, 5.4 reports, 5. Data models, B1. inventory/models.py, B2. purchases/models.py, B.2 attendance (`attendance/models.py`), B.3 audit (`audit/models.py`) (+7 more)

### Community 65 - "IsAuthenticated"
Cohesion: 0.06
Nodes (26): DashboardService, RegularMedicine, Meta, ChangePinView, ChronicMedicinesView, CustomerDetailView, CustomerListView, CustomerOutstandingInvoicesView (+18 more)

### Community 66 - "PurchaseOrderSuggestionsView"
Cohesion: 0.09
Nodes (11): PurchaseOrder, Meta, PurchaseOrderItem, Meta, PurchaseOrderBulkCreateView, PurchaseOrderDetailView, PurchaseOrderListView, PurchaseOrderSuggestionsView (+3 more)

### Community 67 - "purchases/services.py"
Cohesion: 0.14
Nodes (4): is_v2_write_enabled(), record_activity(), record_revision(), SnapshotBuilderRegistry

### Community 68 - "A.1 `/api/v1/reports/...` (R/urls.py)"
Cohesion: 0.09
Nodes (14): DailyCashReportView, DailySnapshotExportView, DailySnapshotView, FixedMonthlyExpenseView, BatchWiseReportView, make_cache_key(), 4.4 reports (+ `/api/v1/gst/` routes owned by reports), 9.4 Reports logic map (+6 more)

### Community 69 - "Batch model"
Cohesion: 0.23
Nodes (12): openpyxl / xlrd / django-import-export, productsApi, import_marg_data management command, Batch model, CreditNoteItem model, MasterProduct model, SaleItem model, SalesReturn model (+4 more)

### Community 70 - "MediFlow API Reference"
Cohesion: 0.23
Nodes (12): Batch expiry status (ACTIVE / NEAR_EXPIRY / EXPIRED), MediFlow API Reference, authApi, dashboardApi, inventoryApi, Mock API layer (lib/mockApi.ts, NEXT_PUBLIC_USE_MOCK), Mock data IDs reference (staff, products, distributors, purchases), purchasesApi (+4 more)

### Community 72 - "docs (72)"
Cohesion: 0.12
Nodes (22): MediFlow Stage-by-Stage Changelog, billingStore (Zustand), lib/gst.ts GST calculation helper, lib/offline-db.ts Dexie IndexedDB, Stage 1 Project Scaffold and Auth, Stage 2 Dashboard Layout and Navigation, Stage 3 KPI Dashboard and Charts, Stage 4 Billing POS (+14 more)

### Community 73 - "tests_purchase_reports_db.py"
Cohesion: 0.12
Nodes (26): SupplierFactory, Meta, make_purchase_invoice(), PurchaseInvoiceFactory, Meta, PurchaseItemFactory, Meta, test_purchase_create_concurrency() (+18 more)

### Community 74 - "payloadSchemas.ts"
Cohesion: 0.18
Nodes (10): PurchasePayload, PurchasePayloadSchema, ReturnPayload, ReturnPayloadSchema, SalePayload, SalePayloadSchema, ScheduleHPayload, ScheduleHPayloadSchema (+2 more)

### Community 75 - "ActivityLog"
Cohesion: 0.23
Nodes (5): ActivityLog, Meta, make_organization(), make_outlet(), make_staff()

### Community 76 - "PurchaseServiceError"
Cohesion: 0.13
Nodes (7): CanCreatePurchases, OverpaymentError, PurchaseServiceError, CheckPurchaseInvoiceView, InvoiceDraftConfirmView, PurchaseCreateView, C1. Purchase invoice CREATE (manual or OCR-confirmed)

### Community 77 - "4.2 billing"
Cohesion: 0.13
Nodes (10): SaleInvoiceSerializer, Meta, SaleItemSerializer, Meta, CustomerOutstandingSummaryView, DistributorOutstandingSummaryView, ExpenseListCreateView, RetryEinvoiceView (+2 more)

### Community 78 - "atomic_sale_save"
Cohesion: 0.12
Nodes (15): atomic_sale_save(), InsufficientStockError, make_test_staff(), test_missing_customer_credit_sale(), test_out_of_stock_boundary(), test_credit_sale_partial_payment(), test_discount_application(), test_non_strip_product_qty_loose_rejected() (+7 more)

### Community 79 - "gstr2b_service.py"
Cohesion: 0.06
Nodes (18): GSTR3BValidationConfig, Command, Command, BaseGstProvider, get_active_provider(), SandboxGstProvider, fetch_sandbox_access_token(), get_sandbox_access_token() (+10 more)

### Community 80 - "purchases (80)"
Cohesion: 0.10
Nodes (29): EditProductModalProps, ProductSearchDropdownProps, Props, calcPTR(), calcPTS(), cellInputCls(), computeTotal(), ExpiryStatus (+21 more)

### Community 81 - "frontend (81)"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 83 - "LogoutView"
Cohesion: 0.18
Nodes (3): LogoutView, serialize_outlet_data(), A.1 accounts: auth (`accounts/auth_urls.py`, prefix `/api/v1/auth/`)

### Community 84 - "partner_views.py"
Cohesion: 0.12
Nodes (9): Partner, Meta, PartnerShareHistory, Meta, PartnerDetailView, PartnerListCreateView, PartnerSerializer, Meta (+1 more)

### Community 86 - "DocumentRevisionV2LegacyAdapterSerializer"
Cohesion: 0.10
Nodes (12): DebitNoteRevisionDetailView, VoucherRevisionDetailView, is_v2_read_enabled(), DocumentRevisionV2LegacyAdapterSerializer, Meta, ActivityLogExportView, ActivityLogListView, UnifiedRevisionDetailView (+4 more)

### Community 88 - "JournalLine"
Cohesion: 0.13
Nodes (8): JournalLine, Meta, Command, sync_all_credit_accounts(), CreditAccount, Meta, CreditTransaction, Meta

### Community 89 - "IsAuthenticated"
Cohesion: 0.15
Nodes (8): CreditAccountDetailView, SaleDetailView, SaleItemsView, SaleModificationOptionsView, CanEditSalesInvoice, IsAuthenticated, C5. MRP vs landing cost vs profit, Security / access control

### Community 90 - "TaxSlab"
Cohesion: 0.14
Nodes (6): _get_standard_gst_rates(), TaxSlab, Meta, serialize_product(), 4.3 inventory & purchases, A1. inventory (`inventory/urls.py`, views in `inventory/views.py`)

### Community 91 - "usePurchaseReturnCart"
Cohesion: 0.42
Nodes (6): PurchaseReturnItemsGridProps, RETURN_REASONS, calcPurchaseItemTotal(), newPurchaseReturnItem(), PurchaseReturnItemRow, usePurchaseReturnCart()

### Community 93 - ".get"
Cohesion: 0.14
Nodes (7): build_group_data(), ledger_closing(), classify_balance_sheet_group(), get_descendant_group_ids(), build_group_block(), group_total(), ledger_rows_for_group()

### Community 95 - "atomic_purchase_update"
Cohesion: 0.05
Nodes (15): PaymentAllocation, Meta, PaymentEntry, Meta, _date(), atomic_purchase_save(), atomic_purchase_update(), bill_by_bill_payment_allocate() (+7 more)

### Community 96 - "gstr1_excel.py"
Cohesion: 0.07
Nodes (9): GSTR1ExcelExportView, safe_pos(), GSTR2BJsonExportView, GSTR3BExcelExportView, get_col_letter(), OOXMLInjector, ReconciliationExcelExportView, ExporterPreflightValidator (+1 more)

### Community 97 - "e2e (97)"
Cohesion: 0.13
Nodes (3): test, TestFixtures, LoginPage

### Community 98 - "e2e (98)"
Cohesion: 0.07
Nodes (5): BillingPage, RevisionHistoryPage, { test, expect }, { test, expect }, @playwright/test

### Community 100 - "purchases (100)"
Cohesion: 0.16
Nodes (6): _call_gemini_with_retry(), GeminiHeader, GeminiInvoice, GeminiLineItem, GeminiTotals, process_with_gemini()

### Community 101 - "payloadBuilders.ts"
Cohesion: 0.10
Nodes (22): handleSave(), handleClear(), handleKey(), handleSave(), useSaveBill(), salesApi, distributeSmartDiscounts(), Logger (+14 more)

### Community 102 - "ui (102)"
Cohesion: 0.16
Nodes (14): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+6 more)

### Community 104 - "ocr_engine.py"
Cohesion: 0.22
Nodes (5): _clean_item(), extract_line_items(), _group_into_rows(), _ocr_cell_number(), _validate_item_math()

### Community 105 - "RISKS / GAPS (report only)"
Cohesion: 0.06
Nodes (14): AuditService, PostDatedCheque, Meta, process_pdc_bounced(), AllOutletsView, OrganizationDetailView, OrganizationListView, OrganizationOutletListView (+6 more)

### Community 106 - "PurchaseListView"
Cohesion: 0.14
Nodes (3): PurchasesView, PurchaseListView, C3. Payment (bill-by-bill) flow

### Community 107 - "pandas"
Cohesion: 0.16
Nodes (7): analyze(), analyze(), preview_excel(), export_missing_data(), parse_date(), infer_from_name(), main()

### Community 108 - "backend (108)"
Cohesion: 0.23
Nodes (5): _fuzzy_ratio(), main(), parse_pytest_output(), infer_from_name(), main()

### Community 109 - "frontend (109)"
Cohesion: 0.13
Nodes (14): aliases, components, utils, iconLibrary, rsc, $schema, style, tailwind (+6 more)

### Community 111 - "MainInvoiceWorkspace.tsx"
Cohesion: 0.14
Nodes (19): InlineRowEditor(), InlineRowEditorProps, MainInvoiceWorkspace(), MainInvoiceWorkspaceProps, useCheckout(), useGridNavigation(), calculateLineMargin(), calculateTotalMargin() (+11 more)

### Community 112 - "scheduleTypes.ts"
Cohesion: 0.40
Nodes (4): PRESCRIPTION_REQUIRED_SCHEDULES, SCHEDULE_MARKERS, SCHEDULE_TYPE_OPTIONS, STRICT_CONTROLLED_SCHEDULES

### Community 113 - "billing/tests/factories.py"
Cohesion: 0.27
Nodes (4): make_test_customer(), make_test_medicine(), make_test_outlet(), test_live_sandbox()

### Community 114 - "make_test_invoice"
Cohesion: 0.06
Nodes (19): DebitNoteModTests, DocumentRevisionV2, Meta, BaseRevisionTestCase, make_test_invoice(), make_test_receipt(), make_test_sales_return(), CancelReissueTestCase (+11 more)

### Community 115 - "ActivityEvent"
Cohesion: 0.17
Nodes (8): ActivityEvent, Meta, SystemEvent, Meta, ActivityEventLegacyAdapterSerializer, Meta, backfill_tenant_ids_dry_run(), backfill_tenant_ids()

### Community 116 - "11.1 Highest-priority items (cross-cutting summary)"
Cohesion: 0.12
Nodes (8): BillRevision, Meta, CustomerLedgerView, PatchEwbView, SendReminderView, 11.1 Highest-priority items (cross-cutting summary), 11.3 billing — detail, 11. Risks and gaps (reported only — nothing was fixed)

### Community 117 - "frontend (117)"
Cohesion: 0.14
Nodes (14): scripts, build, dev, lint, start, sync-api, test, test:e2e (+6 more)

### Community 119 - "11.4 inventory / purchases — detail"
Cohesion: 0.17
Nodes (5): CanEditPurchaseInvoice, _auto_create_stock_adjustment(), PurchaseDetailView, 11.4 inventory / purchases — detail, C5. Batch / stock creation and stock ledger

### Community 120 - "StaffDetailView"
Cohesion: 0.18
Nodes (4): _format_time_safe(), _serialize_staff(), StaffDetailView, A.3 accounts: staff (`accounts/staff_urls.py`, prefix `/api/v1/staff/`)

### Community 121 - "DebitNoteSerializer"
Cohesion: 0.20
Nodes (7): DebitNoteItemSerializer, Meta, DebitNoteSerializer, Meta, DebitNoteDetailView, DebitNoteListView, CanEditPurchaseReturns

### Community 122 - "DraftInvoiceSerializer"
Cohesion: 0.18
Nodes (6): DraftInvoice, Meta, DraftInvoiceSerializer, Meta, DraftInvoiceDetailView, DraftInvoiceListCreateView

### Community 123 - "react"
Cohesion: 0.03
Nodes (124): LoginPage(), metadata, InvoiceSkeleton(), PastInvoicePage(), LEDGER_NAME_COLORS, NATURE_COLORS, PurchaseReturnsPage(), STATUS_COLORS (+116 more)

### Community 128 - "C4. OCR / AI invoice scanning pipeline"
Cohesion: 0.12
Nodes (12): _calculate_confidence(), _deskew(), detect_column_map(), extract_text_blocks(), match_distributor(), match_medicine(), parse_footer(), preprocess_image() (+4 more)

### Community 129 - "has_bill_revision_permission"
Cohesion: 0.16
Nodes (4): BillRevisionPermissionTests, MockView, has_bill_revision_permission(), HasBillRevisionPermission

### Community 130 - "parse_skips.js"
Cohesion: 0.20
Nodes (8): allFiles, files, fs, glob, jsFiles, path, skipList, testDir

### Community 131 - "resolve_item_amounts"
Cohesion: 0.30
Nodes (4): _price_from_rate(), resolve_item_amounts(), split_amounts(), _to_decimal()

### Community 133 - "credit_controls.py"
Cohesion: 0.27
Nodes (5): AgingLimitExceededException, CreditLimitExceededException, validate_credit_exposure(), validate_invoice_aging(), validate_statutory_compliance()

### Community 135 - "tests (135)"
Cohesion: 0.09
Nodes (5): AuditContextMiddleware, get_audit_context(), dummy_get_response(), dummy_view(), MiddlewareTests

### Community 136 - "SaleCreateView"
Cohesion: 0.12
Nodes (11): convert_dict_to_camel_case(), snake_to_camel(), Quotation, Meta, QuotationConvertView, QuotationDetailView, QuotationListCreateView, QuotationSerializer (+3 more)

### Community 138 - "docker-compose.yml (138)"
Cohesion: 0.17
Nodes (11): driver, networks, internal, command, container_name, image, networks, restart (+3 more)

### Community 139 - "docs (139)"
Cohesion: 0.18
Nodes (12): MediFlow Business Flow Matrix, BF-001 Create Sale Bill, BF-002 Edit Sale Bill, Playwright E2E testing strategy, Purchase workflow matrix (create, edit/revision, return), MediFlow Invariant Matrix, API integrity invariants (select_for_update, atomic, tenant isolation), GST calculation invariants (intra/inter-state split, rounding) (+4 more)

### Community 141 - "docs (141)"
Cohesion: 0.17
Nodes (12): Mock Data Scenarios (Clean, Warnings, Blocked), Inventory Management Module, Permission System (usePermissions, PermissionGate), MediFlow Testing Architecture, Decimal Precision and Ledger Math Testing, E-Way Bill / Sandbox NIC Compliance Testing, GST Snapshot Sync Timezone Testing (gst_snapshot_service), InventoryValuationView testing (+4 more)

### Community 142 - "docs (142)"
Cohesion: 0.17
Nodes (12): authStore (Zustand), Billing POS Screen, billingStore (Zustand), GST Backward Calculation (lib/gst.ts), Invoice Print System (A4 and Thermal), apiClient mock/real API toggle (NEXT_PUBLIC_USE_MOCK), Mock Data Catalogue, Offline Bill Queue (Dexie MediFlowDB) (+4 more)

### Community 144 - "clean_units.py"
Cohesion: 0.48
Nodes (5): extract_brand(), infer_from_name(), main(), resolve_unit(), web_search_unit()

### Community 148 - "commands (148)"
Cohesion: 0.36
Nodes (3): Command, _mask_gstin(), _mask_phone()

### Community 149 - "parse_header"
Cohesion: 0.33
Nodes (3): _clean_name(), _normalise_date(), parse_header()

### Community 150 - "DraftInvoiceItem"
Cohesion: 0.33
Nodes (4): DraftInvoiceItem, Meta, DraftInvoiceItemSerializer, Meta

### Community 151 - "Organization"
Cohesion: 0.06
Nodes (11): TestSaleModificationOptionsView, ChainDashboardView, Command, default_print_settings_retail(), default_print_settings_wholesale(), Organization, Meta, OutletSettings (+3 more)

### Community 154 - "FixedMonthlyExpense"
Cohesion: 0.28
Nodes (6): FixedMonthlyExpense, Meta, 11.5 reports & infrastructure — detail, FixedMonthlyExpense (models.py:176, table `reports_fixedmonthlyexpense`), H.1 Security / data exposure, H.2 Reports authorization / isolation gaps

### Community 158 - "billing/views.py"
Cohesion: 0.08
Nodes (14): ExpenseEntry, Meta, ReceiptAllocation, Meta, ReceiptEntry, Meta, create_expense_entry(), create_receipt_payment() (+6 more)

### Community 160 - "purchases.ts"
Cohesion: 0.50
Nodes (3): createPurchaseSchema, distributorSchema, purchaseItemSchema

### Community 161 - "stockledger/page.tsx"
Cohesion: 0.31
Nodes (9): authHeaders(), Badge(), BatchSummaryItem, COLORS, fmt(), getToken(), LedgerEntry, StockLedgerPage() (+1 more)

### Community 162 - "public (162)"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 165 - "docker-compose.yml (165)"
Cohesion: 0.20
Nodes (10): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, container_name, environment, image, networks, restart (+2 more)

### Community 166 - "docs (166)"
Cohesion: 0.24
Nodes (10): MediFlow Backend Developer Documentation v2.0, REST API Specification (/api/v1), JWT Authentication (Simple JWT), Critical Backend Rules (atomicity, outlet filter, no negative stock), Outlet-based Multi-Tenancy Model, MediFlow Project Report (Phase 1 Frontend), Tech Stack (Next.js 14, Django, PostgreSQL, Redis), Staff PIN Quick Reference Card (+2 more)

### Community 167 - "docs (167)"
Cohesion: 0.29
Nodes (10): CreditAccount model, CreditNote model, CreditTransaction model, Customer model, Doctor model, NotificationLog model, ReceiptAllocation model, ReceiptEntry model (+2 more)

### Community 168 - "plans (168)"
Cohesion: 0.27
Nodes (10): Phase B2 GST Dashboard UI MVP Design, GSTR-1/3B JSON and Reconciliation CSV Export, GST Dashboard API Contracts (periods, summary, reconciliation, export), GSTDashboard component tree, ReconciliationWidget and Deferred ITC, ValidationPanel and validation badge states, Date-Range Filtering and GSTR3BValidator period synthesis, GST Dashboard MVP README (+2 more)

### Community 170 - "staff.ts"
Cohesion: 0.50
Nodes (3): StaffFormData, staffPinSchema, staffSchema

### Community 172 - "count_logs"
Cohesion: 0.10
Nodes (3): count_logs(), AsyncLoggingTests, AuthEventTests

### Community 176 - "billing (176)"
Cohesion: 0.25
Nodes (3): NotificationLog, Meta, send_whatsapp_reminder()

### Community 181 - "sale_services.py"
Cohesion: 0.09
Nodes (17): ScheduleHRegister, Meta, generate_return_number(), process_pending_irn(), threaded_process_pending_ewaybill(), threaded_process_pending_irn(), validate_unit_integrity(), fefo_batch_select() (+9 more)

### Community 187 - "os"
Cohesion: 0.06
Nodes (7): create_audit_log_async(), generate_checksum(), extract_monetary(), normalize_gstr2b_record(), parse_date(), main(), H.5 Infra / build / CI

### Community 189 - "docker-compose.yml (189)"
Cohesion: 0.22
Nodes (9): command, container_name, depends_on, env_file, networks, ports, restart, volumes (+1 more)

### Community 190 - "docker-compose.yml (190)"
Cohesion: 0.22
Nodes (9): external, name, external, name, volumes, media_files, postgres_data, redis_data (+1 more)

### Community 191 - "docs (191)"
Cohesion: 0.25
Nodes (9): Phase 2 GST Snapshot Mapping Rules, Phase 2 GST Snapshot Source Map, Customer (accounts.Customer), Distributor (purchases.Distributor), GSTTransactionSnapshot model (apps/reports/models.py), Outlet (core.Outlet), PurchaseItem (purchases), SaleItem (billing) (+1 more)

### Community 192 - "update_commands.js (192)"
Cohesion: 0.22
Nodes (8): arrayEnd, arrayStart, arrayStr, commands, fileContent, fs, replacedIds, updates

### Community 198 - "tests (198)"
Cohesion: 0.25
Nodes (4): _canonical_pack_type(), fix_batch_pack_type(), Migration, TestBatchSchema

### Community 204 - "docker-compose.yml (204)"
Cohesion: 0.25
Nodes (8): command, container_name, env_file, networks, ports, restart, volumes, backend

### Community 205 - "docker-compose.yml (205)"
Cohesion: 0.29
Nodes (8): environment, environment, DJANGO_SETTINGS_MODULE, NODE_ENV, TZ, environment, environment, environment

### Community 206 - "docker-compose.yml (206)"
Cohesion: 0.25
Nodes (8): container_name, depends_on, image, networks, ports, restart, volumes, nginx

### Community 207 - "docs (207)"
Cohesion: 0.36
Nodes (8): Accounts Tables (PaymentEntry, PaymentAllocation, ReceiptEntry, ExpenseEntry), Batch (inventory table), Bill-by-Bill Payment Allocation, Distributor model, FEFO Batch Selection on Sale, LedgerEntry (auto-generated running balance), Atomic Purchase Save Logic, PurchaseInvoice / PurchaseItem (GRN)

### Community 208 - "docs (208)"
Cohesion: 0.36
Nodes (8): Append-Only Snapshot Principle, Snapshot Exclusions: PurchaseReturn, Debit/Credit Notes, RCM, gst_transaction_snapshot (append-only table), IGST vs CGST/SGST Split Rule, Polarity Sign Convention (sale/return/purchase), PurchaseItem to Snapshot Mapping, SaleItem to Snapshot Mapping, SalesReturnItem to Snapshot Mapping

### Community 210 - "accounts (210)"
Cohesion: 0.29
Nodes (3): CustomerAdmin, PostDatedChequeAdmin, StaffAdmin

### Community 216 - "Ledger"
Cohesion: 0.09
Nodes (22): _build_purchase_gst_lines(), _build_sale_gst_lines(), _create_lines_and_update_balances(), _get_components_safe(), _get_customer_ledger(), _get_distributor_ledger(), _get_ledger(), _get_ledger_safe() (+14 more)

### Community 222 - "frontend (222)"
Cohesion: 0.29
Nodes (6): serwist, WorkerGlobalScope, serwist@^9.5.13, @serwist/next@^9.5.13, serwist, @serwist/next

### Community 223 - "ui (223)"
Cohesion: 0.33
Nodes (6): BtnType, BUTTONS, CalcButton, CalculatorProps, CalculatorWidget(), safeEval()

### Community 224 - "docker-compose.yml (224)"
Cohesion: 0.29
Nodes (7): command, container_name, env_file, networks, restart, volumes, celery

### Community 241 - "types (241)"
Cohesion: 0.33
Nodes (5): components, $defs, operations, paths, webhooks

### Community 242 - "docker-compose.yml (242)"
Cohesion: 0.40
Nodes (6): depends_on, depends_on, postgres, redis, condition, condition

### Community 243 - "docker-compose.yml (243)"
Cohesion: 0.53
Nodes (6): interval, retries, test, timeout, healthcheck, healthcheck

### Community 244 - "docs (244)"
Cohesion: 0.33
Nodes (6): Customer model, Auto Invoice Numbering (INV-YYYY-NNNNNN), SaleInvoice / SaleItem, Schedule H Blocking Validation, ScheduleHRegister, Schedule H/H1/X/Narcotic Handling (ScheduleHModal)

### Community 255 - "frontend (255)"
Cohesion: 0.40
Nodes (3): nextConfig, path, withSerwist

### Community 256 - "frontend (256)"
Cohesion: 0.40
Nodes (3): axios@^1.13.6, axios, axios

### Community 258 - "frontend (258)"
Cohesion: 0.40
Nodes (3): http, options, req

### Community 260 - "docker-compose.yml (260)"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 261 - "constants (261)"
Cohesion: 0.40
Nodes (4): DRUG_SCHEDULES, GST_RATES, INDIAN_STATES, STAFF_ROLES

### Community 262 - "constants (262)"
Cohesion: 0.40
Nodes (4): exports, main, name, version

### Community 276 - "calculate_line_item"
Cohesion: 0.36
Nodes (3): calculate_line_item(), resolve_unit_rate(), TaxCalculatorService

### Community 290 - "frontend (290)"
Cohesion: 0.40
Nodes (4): createJestConfig, customJestConfig, ESM_ONLY_DEPENDENCIES, nextJest

### Community 292 - "types (292)"
Cohesion: 0.50
Nodes (3): main, name, version

## Knowledge Gaps
- **49 isolated node(s):** `next/core-web-vitals`, `DJANGO_SETTINGS_MODULE`, `BF-002 Edit Sale Bill`, `API integrity invariants (select_for_update, atomic, tenant isolation)`, `GST calculation invariants (intra/inter-state split, rounding)` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2224 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **199 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `9.1 Module dependency overview` connect `Correctness bugs (verified by reading)` to `billingStore.ts`, `B.5 Other feature folders`, `SaleCreateView`, `FE Types & Report Tabs`, `react`, `inventory/views.py`, `Staff`, `MasterProduct`, `check_outlet_access`, `SaleInvoice`, `StockLedger`, `AuditContext`, `Outlet`, `GSTTransactionSnapshot`, `gst/views.py`, `IsAuthenticated`, `PurchaseOrderSuggestionsView`, `atomic_sale_save`, `purchases (80)`, `Ledger`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Are the 168 inferred relationships involving `Outlet` (e.g. with `Command` and `Command`) actually correct?**
  _`Outlet` has 168 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `DJANGO_SETTINGS_MODULE`, `BF-002 Edit Sale Bill` to the rest of the system?**
  _49 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `VoucherLinesGrid.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10582010582010581 - nodes in this community are weakly interconnected._
- **Why does `Outlet` connect `Outlet` to `C4. OCR / AI invoice scanning pipeline`, `has_bill_revision_permission`, `DeadlockRegressionTests`, `SaleCreateView`, `SaleReturnModTests`, `SaleListView`, `inventory/views.py`, `reports/urls.py`, `Staff`, `MasterProduct`, `Customer`, `BE Attendance Module`, `JournalEntry`, `Organization`, `commands (148)`, `SaleInvoice`, `billing/views.py`, `StockLedger`, `StaffPinAuthTests`, `billing/views.py`, `MasterProductFactory`, `FixedMonthlyExpense`, `BE Audit Middleware`, `ErpExcelService`, `purchases/views.py`, `voucher_serializers.py`, `test_purchase_return_concurrency`, `PurchaseBookServiceTests`, `atomic_sale_update`, `rebuild_stock_ledger`, `ITCReconciliationResult`, `voucher_views.py`, `sale_services.py`, `C.3 GST suite (snapshot driven)`, `OutletSettingsPrintEngineTests`, `GSTTransactionSnapshot`, `gst/views.py`, `PurchaseInvoice`, `os`, `Correctness bugs (verified by reading)`, `IsAuthenticated`, `PurchaseOrderSuggestionsView`, `purchases/services.py`, `tests (198)`, `GrossLossOnReturnExportView`, `ActivityLog`, `PurchaseServiceError`, `4.2 billing`, `gstr2b_service.py`, `partner_views.py`, `IsAuthenticated`, `StockLedgerView`, `tests (92)`, `atomic_purchase_update`, `gstr1_excel.py`, `purchases (100)`, `RISKS / GAPS (report only)`, `PurchaseListView`, `billing/tests/factories.py`, `make_test_invoice`, `ActivityEvent`, `11.1 Highest-priority items (cross-cutting summary)`, `11.4 inventory / purchases — detail`, `PacketBTests`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Should `FE Lib, Hooks & Inventory Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.04852167603845456 - nodes in this community are weakly interconnected._
- **Why does `NewPurchaseForm()` connect `react` to `VoucherLinesGrid.tsx`, `cn`, `useOutletId`, `payloadBuilders.ts`, `billingStore.ts`, `MainInvoiceWorkspace.tsx`, `purchases (80)`, `react`, `Correctness bugs (verified by reading)`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._