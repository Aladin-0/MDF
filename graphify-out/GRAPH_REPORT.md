# Graph Report - MDF  (2026-11-13)

## Corpus Check
- 1082 files · ~668,556 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: (none) 13, .Dockerfile 2, .legacy 1)

## Summary
- 7965 nodes · 26947 edges · 297 communities (170 shown, 127 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 3621 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d55d7529`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- react
- SaleInvoice
- staffPermissions.ts
- NewPurchaseForm.tsx
- Ledger
- EditBatchModal.test.tsx
- live_test.py
- test_ocr_matching.py
- CLAUDE.md
- react
- dashboard.ts
- utils.ts
- SandboxConfiguration
- BatchGrid.tsx
- TableHead
- 11.6 frontend — detail
- has_bill_revision_permission
- cn
- FE Dependencies & Webcam
- django_db
- logging
- access.ts
- PurchaseInvoice
- ErpReportService
- test_gemini_normalize.py
- stockLedger.ts
- 5.2 billing
- billing/views.py
- OutletProductConfig
- package.json
- .data
- StockTable.tsx
- effective_permissions
- log_activity
- devDependencies
- po_services.py
- .put
- toast.tsx
- ratelimit.py
- billingStore.ts
- commands (40)
- dashboard_services.py
- get_latest_log
- frontend/types/index.ts
- gst/views.py
- poApi.ts
- docs (46)
- workflows (47)
- count_logs
- StockTable.test.tsx
- AuditContext
- cn
- GST Phase 4B Integration Blueprint
- 1.1 Run, build, test
- SaleReturnItemsGrid.tsx
- _ScanTestBase
- Sidebar.tsx
- reports/views.py
- ReportFilterRibbon.tsx
- IsAuthenticated
- atomic_purchase_update
- Backend requirements.txt
- InventoryStatCards.tsx
- AccessControlBase
- SaleEditMigrationTests
- BillingPage
- ExportButton.tsx
- ScheduleReportTab.tsx
- FakePoBackend
- Batch model
- MediFlow API Reference
- ActivityEventLegacyAdapterSerializer
- docs (72)
- erp_views.py
- fakePoBackend.ts
- billing/tests/conftest.py
- tests_purchase_reports_db.py
- batch_wise_report_service.py
- ActivityLogAdmin
- .patch
- IsAdminStaff
- frontend (81)
- Card
- zod
- PartnerSerializer
- .extract_params
- dashboard/layout.tsx
- SalesList.tsx
- reports/page.tsx
- ocr_engine.py
- D
- ErpExcelService
- tests (92)
- .get
- po_views.py
- CreateIntegrityTests
- inventory/views.py
- e2e (97)
- @playwright/test
- tests (99)
- getHeaders
- PurchaseItemRow.tsx
- ui (102)
- C.6 Billing math (must mirror backend)
- ReviseIntegrityTests
- Family accounts (shared mobile number + shared credit)
- gemini_ocr.py
- payloadSchemas.ts
- shortcuts.ts
- frontend (109)
- scan_cleanup.py
- IsSuperAdmin
- ProductBatchTable.tsx
- Command
- line_cost_floor
- ModalShell
- DefinitionApiTests
- frontend (117)
- ChainDashboardTests
- UserTimelineTests
- RevisionHistoryPage
- Command
- StaffPinAuthTests
- .get
- TaxSlab
- .claude/CLAUDE.md
- sw.ts
- Customer
- detect_orientation
- parse_skips.js
- item_amounts.py
- ActivityLog
- MiddlewareTests
- TestSaleModificationOptionsView
- re
- signals.py
- Command
- docker-compose.yml (138)
- docs (139)
- axios
- docs (141)
- docs (142)
- SummaryTests
- IsAuthenticated
- AuditConfig
- 0019_po_normalise_old_statuses.py
- 0002_pg_trgm_index.py
- _get_requested_outlet_ids
- SensitiveFieldsTests
- Mobile layout
- tailwindcss
- core/models.py
- atomic_sale_save
- inventory_cache_version
- learn_distributor_alias
- public (162)
- fixtures (163)
- lucide-react
- docker-compose.yml (165)
- docs (166)
- docs (167)
- plans (168)
- 5.4 reports
- LedgerEntry
- CustomerCreateUpdateSerializer
- PurchaseBookServiceTests
- OCRFlowTest
- 0004_outlet_state_code.py
- OutletFilteredManager
- GlobalShortcuts.tsx
- 6.3 State management & data fetching
- tests (182)
- CustomerSerializer
- DoctorSerializer
- JournalEntry
- docker-compose.yml (189)
- docker-compose.yml (190)
- docs (191)
- 4. Deployment procedure (what was done on 2026-11-03)
- .generate_purchase_book_excel
- MasterProductFactory
- tests (198)
- OutletFilteredManager
- ActivityLogFilter
- ActivityEvent
- docker-compose.yml (204)
- docker-compose.yml (205)
- docker-compose.yml (206)
- docs (207)
- docs (208)
- mediflow/urls.py
- GrossLossOnReturnExportView
- accounts (213)
- SalesReturn
- make_test_invoice
- ui (223)
- docker-compose.yml (224)
- test_db_name.py
- attendance/views.py
- StockLedgerPage.test.tsx
- core/permissions.py
- types (241)
- docker-compose.yml (242)
- docker-compose.yml (243)
- docs (244)
- lib (254)
- RISKS / GAPS (report only)
- frontend (258)
- docker-compose.yml (260)
- constants (262)
- accounts (264)
- test_product_search.py
- DiffEngine
- purchases (287)
- frontend (290)
- frontend (291)
- types (292)
- scripts (293)
- Batch
- frontend (308)
- frontend (309)
- dev-health-check.sh (347)
- make_staff
- docs (415)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 434 edges
2. `Button` - 319 edges
3. `react` - 273 edges
4. `Outlet` - 264 edges
5. `lucide-react` - 212 edges
6. `useOutletId()` - 179 edges
7. `Batch` - 176 edges
8. `SaleInvoice` - 166 edges
9. `Input` - 161 edges
10. `useAuthStore` - 149 edges

## Surprising Connections (you probably didn't know these)
- `BillRevision (l.786) `billing_billrevision`` --references--> `DocumentRevisionV2`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/audit/models.py
- `H.5 Infra / build / CI` --references--> `create_audit_log_async()`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/audit/tasks.py
- `C4. Discount capping` --references--> `atomic_sale_save()`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/billing/sale_services.py
- `ScheduleHRegister (l.296) `billing_schedulehregister`` --references--> `schedule_h_validate()`  [INFERRED]
  PROJECT_MAP.md → apps/backend/apps/billing/services.py
- `Validation on every write` --references--> `pack_errors()`  [INFERRED]
  docs/PACK_DEFINITIONS.md → apps/backend/apps/inventory/pack_rules.py

## Import Cycles
- 2-file cycle: `apps/backend/apps/purchases/po_services.py -> apps/backend/apps/purchases/services.py -> apps/backend/apps/purchases/po_services.py`

## Hyperedges (group relationships)
- **Atomic purchase/payment flow updating stock and ledger** — docs_backend_documentation_purchase_save_logic, docs_backend_documentation_bill_by_bill_payment, docs_backend_documentation_ledgerentry, docs_backend_documentation_batch_model, docs_backend_documentation_critical_rules [EXTRACTED 1.00]
- **GST Dashboard UI component and API flow** — docs_plans_gst_dashboard_b2_plan_gstdashboard, docs_plans_gst_dashboard_b2_plan_validation_panel, docs_plans_gst_dashboard_b2_plan_reconciliation_widget, docs_plans_gst_dashboard_b2_plan_gst_api_contracts, docs_plans_gst_dashboard_b2_plan_export_actions [EXTRACTED 1.00]
- **GST snapshot population from Sale, SalesReturn and Purchase items** — docs_phase2_snapshot_mapping_rules_saleitem_mapping, docs_phase2_snapshot_mapping_rules_salesreturnitem_mapping, docs_phase2_snapshot_mapping_rules_purchaseitem_mapping, docs_phase2_snapshot_mapping_rules_gst_transaction_snapshot [EXTRACTED 1.00]

## Communities (297 total, 127 thin omitted)

### Community 0 - "react"
Cohesion: 0.03
Nodes (188): AuditPage(), LEDGER_NAME_COLORS, LedgersPage(), handleLedgerSaved(), handleSync(), load(), NATURE_COLORS, EditPurchaseReturnContent() (+180 more)

### Community 1 - "SaleInvoice"
Cohesion: 0.02
Nodes (72): customer_for_ledger(), FamilyAccountError, resolve_bill_parties(), SaleInvoiceAuditSerializer, Meta, Command, is_bug_shift(), _parse() (+64 more)

### Community 2 - "staffPermissions.ts"
Cohesion: 0.13
Nodes (19): ASSIGNABLE_ROLES, AssignableRole, buildStaffPayload(), customisedFlags(), defaultFormValues(), FLAG_FANOUT, FLAG_SOURCES, FlagValues (+11 more)

### Community 3 - "NewPurchaseForm.tsx"
Cohesion: 0.05
Nodes (60): FilterGroup, formatLedgerBalance(), getBalBadgeColor(), LedgerPicker(), LedgerPickerProps, getLineFilter(), LineFilter, VoucherLineRow (+52 more)

### Community 4 - "Ledger"
Cohesion: 0.02
Nodes (98): AccountsConfig, atomic_debit_note_update(), _recompute_invoice_outstanding(), reverse_journal(), Command, CreditNote, Meta, CreditNoteItem (+90 more)

### Community 5 - "EditBatchModal.test.tsx"
Cohesion: 0.12
Nodes (9): EditBatchModal(), batch, mockToast, open(), Caching, Editing batches and products (the old "Quick edit"), Inventory page, stock list and stock adjustment, Keeping the screens calm (no flashing) (+1 more)

### Community 6 - "live_test.py"
Cohesion: 0.08
Nodes (15): process_pending_irn(), threaded_process_pending_irn(), make_test_customer(), SandboxAPIClient, SandboxIntegrationError, generate_irn_payload(), get_irn_by_document_details(), _quantize() (+7 more)

### Community 7 - "test_ocr_matching.py"
Cohesion: 0.06
Nodes (46): build_product_matcher(), match(), _catalog_index(), _product_context(), alias_key(), CatalogProduct, decide_product(), DistributorRecord (+38 more)

### Community 8 - "CLAUDE.md"
Cohesion: 0.22
Nodes (8): Customers, families and shared credit, Deploying to production, graphify, Inventory, Mobile layout, Pack size, unit and type, Project map (read first), UI consistency

### Community 9 - "react"
Cohesion: 0.04
Nodes (133): InvoiceSkeleton(), PastInvoicePage(), FullScreenBillingPage(), INR(), LEDGER_SORT_OPTIONS, LedgerStatementPage(), handleRowClick(), SourceType (+125 more)

### Community 10 - "dashboard.ts"
Cohesion: 0.19
Nodes (18): StatCard(), StatCardProps, StatCardSkeleton(), TrendChip(), StatCardsRow(), compactInr(), comparisonLabel(), describeQty() (+10 more)

### Community 11 - "utils.ts"
Cohesion: 0.05
Nodes (70): BalanceSheetPage(), BSData, BSSide, calYearForFyMonth(), fmt(), fmtFull(), FY_MONTHS, fyYear() (+62 more)

### Community 12 - "SandboxConfiguration"
Cohesion: 0.10
Nodes (13): SandboxAuthService, _get_fernet(), SandboxConfiguration, Meta, client_ip(), _digest(), 11.5 reports & infrastructure — detail, 5.1 accounts / attendance / audit / core (+5 more)

### Community 13 - "BatchGrid.tsx"
Cohesion: 0.08
Nodes (48): BatchGrid(), BatchGridProps, COLUMNS, ColumnSpec, GridBatchRow, SHOW_AS_MONEY, was(), EditBatchDialog() (+40 more)

### Community 14 - "TableHead"
Cohesion: 0.08
Nodes (70): ConsolidatedPurchaseBookPage(), FormatMode, GrossLossOnReturnPage(), GrossLossReport, GrossLossRow, percent(), rupees(), ErpGrossProfitPage() (+62 more)

### Community 15 - "11.6 frontend — detail"
Cohesion: 0.07
Nodes (31): ExpiryReportPage(), SalesSummaryPage(), BillAdjustmentModal(), DaysRemainingBadge(), ExpiryFilter, ExpiryReportTab(), FILTER_OPTIONS, helper (+23 more)

### Community 16 - "has_bill_revision_permission"
Cohesion: 0.19
Nodes (3): BillRevisionPermissionTests, MockView, HasBillRevisionPermission

### Community 17 - "cn"
Cohesion: 0.04
Nodes (96): AccountsLayout(), NAV_LINKS, AttendancePage(), StaffPage(), AttendancePctBadge(), AttendanceSummaryTab(), CURRENT_YEAR, formatTime12h() (+88 more)

### Community 18 - "FE Dependencies & Webcam"
Cohesion: 0.03
Nodes (82): dependencies, class-variance-authority@^0.7.1, clsx@^2.1.1, cmdk@^1.1.1, date-fns@^4.1.0, dexie@^4.3.0, fuse.js@^7.5.0, @hookform/resolvers@^5.2.2 (+74 more)

### Community 19 - "django_db"
Cohesion: 0.01
Nodes (146): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+138 more)

### Community 20 - "logging"
Cohesion: 0.05
Nodes (18): GSTR3BValidationConfig, Command, Command, BaseGstProvider, get_active_provider(), SandboxGstProvider, fetch_sandbox_access_token(), get_sandbox_access_token() (+10 more)

### Community 21 - "access.ts"
Cohesion: 0.16
Nodes (18): PermissionGateProps, ShortcutDef, ADMIN_ROLES, BILLING_ROLES, canonicalRole(), fallbackPermissions(), hasAllPermissions(), hasAnyPermission() (+10 more)

### Community 22 - "PurchaseInvoice"
Cohesion: 0.04
Nodes (30): PurchaseInvoiceAuditSerializer, Meta, PurchaseItemAuditSerializer, Meta, PaymentAllocation, Meta, PaymentEntry, Meta (+22 more)

### Community 24 - "test_gemini_normalize.py"
Cohesion: 0.07
Nodes (37): build_prompt(), check_line_math(), find_issues(), normalize_expiry(), normalize_extraction(), _num(), parse_invoice_date(), parse_pack_size() (+29 more)

### Community 25 - "stockLedger.ts"
Cohesion: 0.13
Nodes (23): FilterBarProps, LedgerTable(), LedgerTableProps, TxnBadge(), SummaryCardsProps, useLedgerFilters(), applyFilterPatch(), DEFAULT_PAGE_SIZE (+15 more)

### Community 26 - "5.2 billing"
Cohesion: 0.11
Nodes (22): batch_no(), invoice(), 5.2 billing, BillRevision (l.786) `billing_billrevision`, CreditAccount (l.326) `billing_creditaccount`, CreditTransaction (l.370) `billing_credittransaction`, DraftInvoice (l.846) `billing_draftinvoice`, DraftInvoiceItem (l.893) `billing_draftinvoiceitem` (+14 more)

### Community 27 - "billing/views.py"
Cohesion: 0.02
Nodes (89): DocumentRevisionV2LegacyAdapterSerializer, Meta, convert_dict_to_camel_case(), snake_to_camel(), Command, sync_all_credit_accounts(), BillRevision, Meta (+81 more)

### Community 28 - "OutletProductConfig"
Cohesion: 0.07
Nodes (20): IsManagerOrAbove, OutletProductConfig, Meta, BatchAvailabilityCheckView, BatchDetailUpdateView, BatchLandingCostView, InventoryAdjustView, InventoryAlertsView (+12 more)

### Community 29 - "package.json"
Cohesion: 0.06
Nodes (38): author, bugs, url, dependencies, @radix-ui/react-alert-dialog@^1.1.15, description, devDependencies, @testing-library/react@^16.3.2 (+30 more)

### Community 30 - ".data"
Cohesion: 0.14
Nodes (7): AccessTests, at(), DashboardBase, MarginTests, SalesTotalsTests, TopSellerTests, TrendTests

### Community 31 - "StockTable.tsx"
Cohesion: 0.05
Nodes (75): AdjustTarget, count, InventoryPage(), InventoryView(), BatchBreakdownProps, EditProductModalProps, ExpiryTable(), Row (+67 more)

### Community 32 - "effective_permissions"
Cohesion: 0.25
Nodes (3): Command, build_permission_matrix(), _User

### Community 33 - "log_activity"
Cohesion: 0.08
Nodes (5): ActivityLogSerializer, Meta, log_activity(), AuditLogTests, BillingRevisionTests

### Community 34 - "devDependencies"
Cohesion: 0.06
Nodes (36): devDependencies, autoprefixer@10.4.19, eslint@8.57.0, eslint-config-next@14.2.15, identity-obj-proxy@^3.0.0, jest@^30.3.0, jest-environment-jsdom@^30.3.0, openapi-typescript@^7.13.0 (+28 more)

### Community 35 - "po_services.py"
Cohesion: 0.05
Nodes (50): Command, POEvent, Meta, POSequence, Meta, PurchaseOrder, Meta, PurchaseOrderItem (+42 more)

### Community 36 - ".put"
Cohesion: 0.11
Nodes (8): canonical_role(), effective_permissions(), BatchEditBase, FreshnessTests, PermissionTests, StockSafetyTests, ValidationTests, WarningTests

### Community 37 - "toast.tsx"
Cohesion: 0.11
Nodes (24): metadata, RootLayout(), viewport, ErrorBoundary, AddOutletModal, BillAdjustmentModal, BulkReminderModal, CreateDoctorModal (+16 more)

### Community 39 - "billingStore.ts"
Cohesion: 0.05
Nodes (58): calls, data, refetch, InlineRowEditor(), InlineRowEditorProps, MainInvoiceWorkspace(), MainInvoiceWorkspaceProps, useCheckout() (+50 more)

### Community 40 - "commands (40)"
Cohesion: 0.10
Nodes (13): _build_pack_lookup(), _clean_salt(), Command, _dec(), _gstin(), _hsn(), _int(), _marg_drug_type() (+5 more)

### Community 41 - "dashboard_services.py"
Cohesion: 0.16
Nodes (12): _f(), gross_margin(), hourly_sales(), outstanding_credit(), period_totals(), previous_range(), returns_total(), sales_queryset() (+4 more)

### Community 42 - "get_latest_log"
Cohesion: 0.14
Nodes (4): get_latest_log(), make_product(), ChangesDiffTests, SignalCRUDTests

### Community 43 - "frontend/types/index.ts"
Cohesion: 0.02
Nodes (191): ChainDashboardPage(), fmt(), KPICard(), StockValuationPage(), QuotationsPage(), Providers(), BillAdjustmentModalProps, formatINR() (+183 more)

### Community 44 - "gst/views.py"
Cohesion: 0.08
Nodes (29): send_whatsapp_reminder(), GstTaxpayerAuth, Meta, normalize_invoice_number(), run_advisory_reconciliation(), TaxpayerSessionExpiredException, sync_gstr2b_job(), get_user_outlet() (+21 more)

### Community 45 - "poApi.ts"
Cohesion: 0.09
Nodes (25): fmt(), PublicPurchaseOrderPage(), STATUS_NOTE, Props, RowsProps, call(), fetchPublicPO(), PageInfo (+17 more)

### Community 46 - "docs (46)"
Cohesion: 0.13
Nodes (24): distributorsApi, Marg Data Import guide, Manavata Pharma outlet, SAI Medical outlet, Accounting invariants (double-entry zero-sum), MediFlow Model Fields Reference, DebitNote model, DebitNoteItem model (+16 more)

### Community 47 - "workflows (47)"
Cohesion: 0.07
Nodes (28): BASE_URL, CI, jobs, test, name, on, pull_request, push (+20 more)

### Community 48 - "count_logs"
Cohesion: 0.10
Nodes (3): count_logs(), AsyncLoggingTests, AuthEventTests

### Community 49 - "StockTable.test.tsx"
Cohesion: 0.07
Nodes (22): mockToast, StockAdjustmentModal(), getSearch(), listeners, navigationMock, router, routerPush, setUrl() (+14 more)

### Community 50 - "AuditContext"
Cohesion: 0.07
Nodes (21): AuditJWTAuthentication, AuditContext, get_audit_context(), reset_audit_context(), set_audit_context(), AuditContextMiddleware, AuditContextPermission, AuditContextTests (+13 more)

### Community 51 - "cn"
Cohesion: 0.05
Nodes (83): PurchaseOrderDetailPage(), PurchasesPage(), TAB_VALUES, tabs, ProductSearchDropdown(), NewPurchaseOrderModal(), POConfirmModal(), POStatusBadge() (+75 more)

### Community 52 - "GST Phase 4B Integration Blueprint"
Cohesion: 0.24
Nodes (11): GST Phase 4B Integration Blueprint, GSTR2BFetchService (planned), GSTR2BReconciliationService (planned), GstReconciliationMatch model (planned), IMS (Invoice Management System) Phase 4C, GSTR-2B reconciliation precedes IMS and filing, GST Sandbox Deferred Plan, Kept sandbox foundation (models and services) (+3 more)

### Community 53 - "1.1 Run, build, test"
Cohesion: 0.12
Nodes (15): 10. Conventions and how to add things, 1.1 Run, build, test, 1. Overview, 2. Folder structure, 5.3 inventory & purchases, 5. Data models, B2. purchases/models.py, F.1 Whole stack (Docker) (+7 more)

### Community 54 - "SaleReturnItemsGrid.tsx"
Cohesion: 0.16
Nodes (14): NewCreditNoteContent(), handleSave(), handleSelectInvoice(), NewCreditNotePage(), formatExpiryDate(), RowProductSearch(), SaleReturnItemsGrid(), SaleReturnItemsGridProps (+6 more)

### Community 55 - "_ScanTestBase"
Cohesion: 0.14
Nodes (4): _jpeg(), ScanPhotoCleanupTest, _ScanTestBase, StaleDraftCleanupTest

### Community 56 - "Sidebar.tsx"
Cohesion: 0.10
Nodes (29): GlobalNavigation(), RowMenu(), Breadcrumb(), Header(), HeaderProps, checkIsActive(), NavItem(), NavItemProps (+21 more)

### Community 57 - "reports/views.py"
Cohesion: 0.04
Nodes (40): Outlet, Meta, CanAccessReports, _same_organization(), user_can_access_outlet(), BaseErpReportView, ConsolidatedSalesBookExportView, ConsolidatedSalesBookView (+32 more)

### Community 58 - "ReportFilterRibbon.tsx"
Cohesion: 0.12
Nodes (26): columnHelper, GSTR1Page(), InvoiceRow, GSTR2APage(), GSTR2AWarningRow, col31, col4, GSTR3BPage() (+18 more)

### Community 59 - "IsAuthenticated"
Cohesion: 0.03
Nodes (62): AuditService, DashboardService, RegularMedicine, Meta, build_user_payload(), ChangePinView, ChronicMedicinesView, CustomerAccountView (+54 more)

### Community 60 - "atomic_purchase_update"
Cohesion: 0.13
Nodes (5): atomic_purchase_update(), rebuild_distributor_ledger(), PurchaseEditMigrationTest, PurchaseEditStockTest, C2. Purchase invoice EDIT

### Community 61 - "Backend requirements.txt"
Cohesion: 0.18
Nodes (11): Backend requirements.txt, Celery + Redis task queue, cryptography (Fernet), Django 5.0.3, Django REST Framework + SimpleJWT, OCR stack (rapidocr-onnxruntime, opencv, rapidfuzz, google-genai, pydantic), PostgreSQL driver psycopg2-binary, WeasyPrint / ReportLab PDF generation (+3 more)

### Community 62 - "InventoryStatCards.tsx"
Cohesion: 0.09
Nodes (27): CardProps, count, InventoryStatCards(), StatCard(), give(), loading(), ok(), summaryMock (+19 more)

### Community 63 - "AccessControlBase"
Cohesion: 0.09
Nodes (7): AccessControlBase, LoginTests, PermissionMatrixFixtureTests, AdjustmentTests, ExpiryTests, InventoryListBase, LowStockTests

### Community 66 - "ExportButton.tsx"
Cohesion: 0.13
Nodes (26): DashboardHeaderProps, BatchReportTabProps, DateRangePickerProps, ExportButton(), ExportButtonProps, GSTR1ViewProps, GSTR3BViewProps, GSTReportTabProps (+18 more)

### Community 67 - "ScheduleReportTab.tsx"
Cohesion: 0.13
Nodes (21): ScheduleDrugsPage(), BADGE_COLORS, EmptyState(), fmt(), fmtDate(), monthStart(), nMonthsAgo(), PurchaseRecord (+13 more)

### Community 69 - "Batch model"
Cohesion: 0.23
Nodes (12): openpyxl / xlrd / django-import-export, productsApi, import_marg_data management command, Batch model, CreditNoteItem model, MasterProduct model, SaleItem model, SalesReturn model (+4 more)

### Community 70 - "MediFlow API Reference"
Cohesion: 0.23
Nodes (12): Batch expiry status (ACTIVE / NEAR_EXPIRY / EXPIRED), MediFlow API Reference, authApi, dashboardApi, inventoryApi, Mock API layer (lib/mockApi.ts, NEXT_PUBLIC_USE_MOCK), Mock data IDs reference (staff, products, distributors, purchases), purchasesApi (+4 more)

### Community 71 - "ActivityEventLegacyAdapterSerializer"
Cohesion: 0.11
Nodes (7): is_v2_read_enabled(), ActivityEventLegacyAdapterSerializer, Meta, ActivityLogExportView, ActivityLogListView, UnifiedRevisionDetailView, A.8 audit (`audit/urls.py`, prefix `/api/v1/audit/`)

### Community 72 - "docs (72)"
Cohesion: 0.12
Nodes (22): MediFlow Stage-by-Stage Changelog, billingStore (Zustand), lib/gst.ts GST calculation helper, lib/offline-db.ts Dexie IndexedDB, Stage 1 Project Scaffold and Auth, Stage 2 Dashboard Layout and Navigation, Stage 3 KPI Dashboard and Charts, Stage 4 Billing POS (+14 more)

### Community 73 - "erp_views.py"
Cohesion: 0.03
Nodes (45): ExportBlockedException, GSTExportService, Rule37Adjustment, Meta, get_current_outlet(), GSTExportView, GSTPeriodsView, GSTReconciliationView (+37 more)

### Community 74 - "fakePoBackend.ts"
Cohesion: 0.17
Nodes (10): DISTRIBUTORS, LABEL, Line, ME, PO, PRODUCTS, SB, SB_LABEL (+2 more)

### Community 75 - "billing/tests/conftest.py"
Cohesion: 0.14
Nodes (9): batch_a(), batch_b(), batch_c(), default_outlet(), product_a_pack10(), product_b_inclusive(), product_c_low_stock(), registered_customer() (+1 more)

### Community 76 - "tests_purchase_reports_db.py"
Cohesion: 0.23
Nodes (16): D(), make_invoice(), make_note(), params(), test_bill_amount_is_the_invoice_value_not_net_of_ledger_adjustment(), test_date_range_is_inclusive_and_falls_back_to_created_at_when_invoice_date_missing(), test_excel_exports_download_with_matching_totals(), test_less_returns_default_depends_on_the_book_but_explicit_value_wins() (+8 more)

### Community 80 - "IsAdminStaff"
Cohesion: 0.06
Nodes (12): CoreConfig, default_print_settings_retail(), default_print_settings_wholesale(), OutletSettings, Meta, IsAdminStaff, OutletSettingsPrintEngineTests, OutletSettingsView (+4 more)

### Community 81 - "frontend (81)"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 82 - "Card"
Cohesion: 0.04
Nodes (143): LoginForm(), LoginPage(), metadata, ExpensesPage(), OverviewPage(), PayablesPage(), ReceivablesPage(), RevisionDetailPage() (+135 more)

### Community 83 - "zod"
Cohesion: 0.07
Nodes (21): ManualAttendanceFormValues, manualAttendanceSchema, LoginFormValues, loginSchema, ScheduleHData, scheduleHSchema, CreditPaymentFormData, creditPaymentSchema (+13 more)

### Community 84 - "PartnerSerializer"
Cohesion: 0.13
Nodes (9): Partner, Meta, PartnerShareHistory, Meta, PartnerDetailView, PartnerListCreateView, PartnerSerializer, Meta (+1 more)

### Community 85 - ".extract_params"
Cohesion: 0.10
Nodes (3): _is_consolidated(), _purchase_less_returns(), A.1 `/api/v1/reports/...` (R/urls.py)

### Community 86 - "dashboard/layout.tsx"
Cohesion: 0.29
Nodes (14): AdminLayout(), BillingLayout(), DashboardLayout(), DashboardLayout(), DashboardSkeleton(), SKELETON_HEIGHTS, GlobalOverlays(), OfflineBanner() (+6 more)

### Community 87 - "SalesList.tsx"
Cohesion: 0.16
Nodes (16): SalesPage(), PAYMENT_COLORS, PaymentBreakdownCell(), PaymentBreakdownCellProps, DATE_PRESETS, fd(), fmt(), fmtShort() (+8 more)

### Community 88 - "reports/page.tsx"
Cohesion: 0.16
Nodes (12): MetricData, MetricWidget(), REPORT_DIRECTORY, ReportCategory, ReportsCenterPage(), ReportWidget(), ReportWidgetData, SAMPLE_METRICS (+4 more)

### Community 89 - "ocr_engine.py"
Cohesion: 0.06
Nodes (28): MasterProductAlias, Meta, _calculate_confidence(), _clean_item(), _clean_name(), _deskew(), detect_column_map(), _distributor_records() (+20 more)

### Community 90 - "D"
Cohesion: 0.32
Nodes (3): D(), ResolveItemAmountsTests, resolve_item_amounts()

### Community 93 - ".get"
Cohesion: 0.25
Nodes (3): build_group_data(), ledger_closing(), classify_balance_sheet_group()

### Community 94 - "po_views.py"
Cohesion: 0.05
Nodes (45): CanCancelPurchaseOrders, CanCreatePurchases, CanSendPurchaseOrders, outlet_settings(), pack_label(), POError, today(), allowed_actions() (+37 more)

### Community 96 - "inventory/views.py"
Cohesion: 0.07
Nodes (16): Command, allows_loose(), batch_allows_loose(), fold_loose_into_packs(), normalize_pack_type(), pack_errors(), raise_if_invalid(), sync_batch_to_pack() (+8 more)

### Community 98 - "@playwright/test"
Cohesion: 0.12
Nodes (5): @playwright/test@^1.58.2, LoginPage, { test, expect }, { test, expect }, @playwright/test

### Community 100 - "getHeaders"
Cohesion: 0.29
Nodes (11): BatchPanelProps, assertOk(), getHeaders(), BatchSummaryItem, EMPTY_SUMMARY, LedgerPage, baseParams(), downloadLedgerExport() (+3 more)

### Community 101 - "PurchaseItemRow.tsx"
Cohesion: 0.23
Nodes (13): calcPTR(), calcPTS(), cellInputCls(), computeTotal(), ExpiryStatus, formatExpiryForDisplay(), getExpiryStatus(), ItemFieldError (+5 more)

### Community 102 - "ui (102)"
Cohesion: 0.16
Nodes (13): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormMessage (+5 more)

### Community 103 - "C.6 Billing math (must mirror backend)"
Cohesion: 0.23
Nodes (11): calculateBillTotals(), calculateItemTotals(), formatGSTIN(), isInterState(), applyGstAndFreightToBaseRate(), calculateBaseLandingRate(), calculateLandingRate(), calculatePurchaseItem() (+3 more)

### Community 105 - "Family accounts (shared mobile number + shared credit)"
Cohesion: 0.25
Nodes (7): API, Deployment, Family accounts (shared mobile number + shared credit), Model, Retail only, Rules (enforced by the server, `apps/accounts/family_accounts.py`), Screens

### Community 106 - "gemini_ocr.py"
Cohesion: 0.10
Nodes (23): auto_rotate_enabled(), _cache(), call_gemini(), extract_invoice(), _extract_with_verification(), fallback_model(), GeminiHeader, GeminiInvoice (+15 more)

### Community 107 - "payloadSchemas.ts"
Cohesion: 0.18
Nodes (10): PurchasePayload, PurchasePayloadSchema, ReturnPayload, ReturnPayloadSchema, SalePayload, SalePayloadSchema, ScheduleHPayload, ScheduleHPayloadSchema (+2 more)

### Community 108 - "shortcuts.ts"
Cohesion: 0.07
Nodes (23): ACCOUNTS_SHORTCUTS, BILL_JUMPS, BILLING_SHORTCUTS, BROWSER_RESERVED, create(), CREATE_SHORTCUTS, GENERAL_SHORTCUTS, go() (+15 more)

### Community 109 - "frontend (109)"
Cohesion: 0.13
Nodes (14): aliases, components, utils, iconLibrary, rsc, $schema, style, tailwind (+6 more)

### Community 110 - "scan_cleanup.py"
Cohesion: 0.08
Nodes (15): Command, cleanup_scan_photos(), delete_stored_file(), draft_auto_delete_at(), draft_ttl_days(), maybe_cleanup_scan_photos(), ttl_hours(), cleanup_scan_photos_task() (+7 more)

### Community 112 - "ProductBatchTable.tsx"
Cohesion: 0.09
Nodes (47): ProductInventoryPage(), batch(), getDetail, inDays(), mockAllowed, mockRouter, mockToast, product() (+39 more)

### Community 115 - "ModalShell"
Cohesion: 0.04
Nodes (62): CreateLedgerModalProps, AddFamilyMemberDialog(), FAMILY_RELATIONS, Props, serverReason(), toMember(), BillingFor(), clean() (+54 more)

### Community 117 - "frontend (117)"
Cohesion: 0.14
Nodes (14): scripts, build, dev, lint, start, sync-api, test, test:e2e (+6 more)

### Community 122 - "Command"
Cohesion: 0.36
Nodes (3): Command, _mask_gstin(), _mask_phone()

### Community 124 - ".get"
Cohesion: 0.60
Nodes (3): build_group_block(), group_total(), ledger_rows_for_group()

### Community 127 - "sw.ts"
Cohesion: 0.29
Nodes (6): serwist, WorkerGlobalScope, serwist@^9.5.13, @serwist/next@^9.5.13, serwist, @serwist/next

### Community 128 - "Customer"
Cohesion: 0.06
Nodes (15): account_ledger(), account_people(), attach_member(), create_family_account(), debtors_group(), detach_member(), ensure_customer_ledger(), has_family() (+7 more)

### Community 129 - "detect_orientation"
Cohesion: 0.24
Nodes (7): _box_dims(), detect_orientation(), _engine(), _rec_score(), rotate_cw(), _invoice_like(), test_detects_rotation()

### Community 130 - "parse_skips.js"
Cohesion: 0.09
Nodes (11): nextConfig, path, withSerwist, allFiles, files, fs, glob, jsFiles (+3 more)

### Community 131 - "item_amounts.py"
Cohesion: 0.20
Nodes (4): SplitAmountsTests, _price_from_rate(), split_amounts(), _to_decimal()

### Community 132 - "ActivityLog"
Cohesion: 0.11
Nodes (8): Command, ActivityLog, Meta, make_batch(), make_organization(), make_outlet(), make_staff(), ImmutabilityTests

### Community 133 - "MiddlewareTests"
Cohesion: 0.09
Nodes (5): AuditContextMiddleware, get_audit_context(), dummy_get_response(), dummy_view(), MiddlewareTests

### Community 135 - "re"
Cohesion: 0.11
Nodes (15): analyze(), analyze(), preview_excel(), export_missing_data(), main(), parse_date(), extract_brand(), infer_from_name() (+7 more)

### Community 138 - "docker-compose.yml (138)"
Cohesion: 0.17
Nodes (11): driver, networks, internal, command, container_name, image, networks, restart (+3 more)

### Community 139 - "docs (139)"
Cohesion: 0.18
Nodes (12): MediFlow Business Flow Matrix, BF-001 Create Sale Bill, BF-002 Edit Sale Bill, Playwright E2E testing strategy, Purchase workflow matrix (create, edit/revision, return), MediFlow Invariant Matrix, API integrity invariants (select_for_update, atomic, tenant isolation), GST calculation invariants (intra/inter-state split, rounding) (+4 more)

### Community 140 - "axios"
Cohesion: 0.40
Nodes (3): axios@^1.13.6, axios, axios

### Community 141 - "docs (141)"
Cohesion: 0.17
Nodes (12): Mock Data Scenarios (Clean, Warnings, Blocked), Inventory Management Module, Permission System (usePermissions, PermissionGate), MediFlow Testing Architecture, Decimal Precision and Ledger Math Testing, E-Way Bill / Sandbox NIC Compliance Testing, GST Snapshot Sync Timezone Testing (gst_snapshot_service), InventoryValuationView testing (+4 more)

### Community 142 - "docs (142)"
Cohesion: 0.17
Nodes (12): authStore (Zustand), Billing POS Screen, billingStore (Zustand), GST Backward Calculation (lib/gst.ts), Invoice Print System (A4 and Thermal), apiClient mock/real API toggle (NEXT_PUBLIC_USE_MOCK), Mock Data Catalogue, Offline Bill Queue (Dexie MediFlowDB) (+4 more)

### Community 144 - "SummaryTests"
Cohesion: 0.20
Nodes (3): FreshnessTests, SummaryTests, ValuationBase

### Community 145 - "IsAuthenticated"
Cohesion: 0.04
Nodes (28): CanAccessPurchases, CanEditPurchaseInvoice, MethodPermissionMixin, CheckPurchaseInvoiceView, PaymentListCreateView, PurchasesView, DistributorDetailView, DistributorLedgerView (+20 more)

### Community 151 - "Mobile layout"
Cohesion: 0.50
Nodes (3): Checking a page, Mobile layout, The rules

### Community 152 - "tailwindcss"
Cohesion: 0.50
Nodes (3): tailwindcss@3.4.1, config, tailwindcss

### Community 153 - "core/models.py"
Cohesion: 0.04
Nodes (20): create_audit_log_async(), force_audit_v1(), Command, Command, OutletFilteredManager, generate_checksum(), GSTR2BJsonExportView, ReconciliationExcelExportView (+12 more)

### Community 154 - "atomic_sale_save"
Cohesion: 0.03
Nodes (26): AgingLimitExceededException, CreditLimitExceededException, validate_credit_exposure(), validate_invoice_aging(), validate_statutory_compliance(), atomic_sale_save(), InsufficientStockError, make_test_medicine() (+18 more)

### Community 155 - "inventory_cache_version"
Cohesion: 0.28
Nodes (3): bump_inventory_cache(), inventory_cache_version(), _key()

### Community 156 - "learn_distributor_alias"
Cohesion: 0.33
Nodes (6): learn_distributor_alias(), is_own_name(), _dist_tokens(), distributor_name_similarity(), best_by_name(), test_distinctive_similarity()

### Community 162 - "public (162)"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 164 - "lucide-react"
Cohesion: 0.06
Nodes (81): CreditPage(), CustomerDetailPage(), DetailRow(), formatINR(), getInvoiceStatus(), getPeriodStart(), InvoiceHistory(), InvoiceItemsExpanded() (+73 more)

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

### Community 169 - "5.4 reports"
Cohesion: 0.16
Nodes (12): FixedMonthlyExpense, Meta, 5.4 reports, DailyCashReport (models.py:207, table `reports_dailycashreport`), DeferredITCEntry (models.py:134, table `reports_deferreditcentry`), FixedMonthlyExpense (models.py:176, table `reports_fixedmonthlyexpense`), GSTExportAudit (models.py:156, table `reports_gstexportaudit`), GSTR2BData (models.py:68, table `reports_gstr2bdata`) (+4 more)

### Community 171 - "LedgerEntry"
Cohesion: 0.06
Nodes (21): ExpenseEntry, Meta, LedgerEntry, Meta, ReceiptAllocation, Meta, create_expense_entry(), create_receipt_payment() (+13 more)

### Community 173 - "PurchaseBookServiceTests"
Cohesion: 0.24
Nodes (5): _invoice(), _note(), PurchaseBookServiceTests, PurchaseReturnBookServiceTests, _qs()

### Community 174 - "OCRFlowTest"
Cohesion: 0.08
Nodes (8): PurchaseInvoicePage, Meta, _fake_call(), _gemini_payload(), _jpeg(), MultiPageScanTest, OCRFlowTest, ReviewFindingsTest

### Community 175 - "0004_outlet_state_code.py"
Cohesion: 0.14
Nodes (6): grant(), Migration, backfill_state_codes(), Migration, Migration, renumber_duplicates()

### Community 180 - "GlobalShortcuts.tsx"
Cohesion: 0.09
Nodes (39): consume(), GlobalShortcuts(), HELP_STEP, isModalOpen(), Kbd(), OPEN_SHORTCUT_HELP_EVENT, SHORTCUT_EVENT, focusTarget() (+31 more)

### Community 181 - "6.3 State management & data fetching"
Cohesion: 0.33
Nodes (6): 6.1 Pages & routes, 6.3 State management & data fetching, 6.4 Types & schemas, 6. Frontend (`apps/frontend`), C.2 React Query (`lib/queryClient.ts`), E.2 Zod schemas

### Community 186 - "JournalEntry"
Cohesion: 0.06
Nodes (31): _build_purchase_gst_lines(), _build_sale_gst_lines(), _create_lines_and_update_balances(), _get_components_safe(), _get_customer_ledger(), _get_distributor_ledger(), _get_ledger(), _get_ledger_safe() (+23 more)

### Community 189 - "docker-compose.yml (189)"
Cohesion: 0.22
Nodes (9): command, container_name, depends_on, env_file, networks, ports, restart, volumes (+1 more)

### Community 190 - "docker-compose.yml (190)"
Cohesion: 0.22
Nodes (9): external, name, external, name, volumes, media_files, postgres_data, redis_data (+1 more)

### Community 191 - "docs (191)"
Cohesion: 0.25
Nodes (9): Phase 2 GST Snapshot Mapping Rules, Phase 2 GST Snapshot Source Map, Customer (accounts.Customer), Distributor (purchases.Distributor), GSTTransactionSnapshot model (apps/reports/models.py), Outlet (core.Outlet), PurchaseItem (purchases), SaleItem (billing) (+1 more)

### Community 192 - "4. Deployment procedure (what was done on 2026-11-03)"
Cohesion: 0.09
Nodes (21): 1. Server layout (the facts that matter), 2. The server config is intentionally different from git — preserve it, 3. How to connect (no `sshpass` on the dev machine), 4. Deployment procedure (what was done on 2026-11-03), 4b. Extra pre-deploy checks for the access-control release (login + roles), 5. Things a future deploy should watch for, 6. Rollback, 7. Deploy history (+13 more)

### Community 195 - "MasterProductFactory"
Cohesion: 0.08
Nodes (32): CustomerFactory, Meta, test_sale_create_api(), test_sale_create_flat_discount_reconciliation_with_smart_capping(), test_sale_create_invalid_payload(), test_sale_create_prevents_loss_sale_below_ptr(), test_sale_create_prevents_loss_sale_when_base_item_under_cost(), test_sale_create_pure_free_quantity_scheme_item() (+24 more)

### Community 198 - "tests (198)"
Cohesion: 0.14
Nodes (10): _canonical_pack_type(), fix_batch_pack_type(), Migration, TestBatchSchema, Keeping the two copies in step, Pack size, unit and type (and selling loose), The model, The rule (one place) (+2 more)

### Community 201 - "ActivityEvent"
Cohesion: 0.23
Nodes (7): ActivityEvent, Meta, SystemEvent, Meta, InventoryConfig, backfill_tenant_ids_dry_run(), backfill_tenant_ids()

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

### Community 210 - "mediflow/urls.py"
Cohesion: 0.11
Nodes (4): CustomerAdmin, PostDatedChequeAdmin, StaffAdmin, StockLedgerAdmin

### Community 218 - "SalesReturn"
Cohesion: 0.04
Nodes (26): DocumentRevision, Meta, SalesReturnAuditSerializer, Meta, SalesReturnItemAuditSerializer, Meta, BillingConfig, ReceiptEntry (+18 more)

### Community 221 - "make_test_invoice"
Cohesion: 0.05
Nodes (17): Doctor, Meta, BaseRevisionTestCase, make_test_invoice(), make_test_receipt(), make_test_sales_return(), CancelReissueTestCase, DirectReviseTestCase (+9 more)

### Community 223 - "ui (223)"
Cohesion: 0.33
Nodes (6): BtnType, BUTTONS, CalcButton, CalculatorProps, CalculatorWidget(), safeEval()

### Community 224 - "docker-compose.yml (224)"
Cohesion: 0.29
Nodes (7): command, container_name, env_file, networks, restart, volumes, celery

### Community 229 - "attendance/views.py"
Cohesion: 0.11
Nodes (13): AttendanceRecord, Meta, AttendanceCheckInView, AttendanceManualView, AttendanceMonthlyView, AttendanceMyIpView, AttendanceSummaryView, AttendanceTodayView (+5 more)

### Community 231 - "StockLedgerPage.test.tsx"
Cohesion: 0.17
Nodes (7): batchesMock, entry(), ledgerMock, mockListeners, mockRouter, page(), renderPage()

### Community 238 - "core/permissions.py"
Cohesion: 0.07
Nodes (17): CanEditSaleReturns, CanEditSalesInvoice, CanManagePartners, CanManageProducts, CanViewPurchaseRates, CanVoidRecords, check_outlet_access(), _is_admin() (+9 more)

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

### Community 257 - "RISKS / GAPS (report only)"
Cohesion: 0.16
Nodes (7): AllOutletsView, ChainDashboardView, OrganizationDetailView, OrganizationListView, OrganizationOutletListView, own_organization_or_404(), A.9 core (outlet + organization/chain)

### Community 258 - "frontend (258)"
Cohesion: 0.40
Nodes (3): http, options, req

### Community 260 - "docker-compose.yml (260)"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 262 - "constants (262)"
Cohesion: 0.40
Nodes (4): exports, main, name, version

### Community 267 - "test_product_search.py"
Cohesion: 0.27
Nodes (11): api_client(), _names(), setup_data(), test_discontinued_products_are_never_returned_even_by_fuzzy_match(), test_every_word_must_match_so_extra_words_narrow_the_results(), test_gibberish_does_not_surface_unrelated_products(), test_names_starting_with_the_query_rank_before_other_matches(), test_search_context_expiry() (+3 more)

### Community 290 - "frontend (290)"
Cohesion: 0.40
Nodes (4): createJestConfig, customJestConfig, ESM_ONLY_DEPENDENCIES, nextJest

### Community 292 - "types (292)"
Cohesion: 0.50
Nodes (3): main, name, version

### Community 301 - "Batch"
Cohesion: 0.03
Nodes (72): Staff, Meta, LedgerFactory, Meta, OrganizationFactory, Meta, OutletFactory, Meta (+64 more)

### Community 377 - "make_staff"
Cohesion: 0.06
Nodes (7): LegacyCustomRoleTests, make_staff(), MergedViewPermissionTests, OutletIsolationTests, PinTests, UnprotectedWriteEndpointTests, SwitchOutletTests

## Knowledge Gaps
- **49 isolated node(s):** `next/core-web-vitals`, `DJANGO_SETTINGS_MODULE`, `BF-002 Edit Sale Bill`, `API integrity invariants (select_for_update, atomic, tenant isolation)`, `GST calculation invariants (intra/inter-state split, rounding)` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2785 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **127 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `9.1 Module dependency overview` connect `billing/views.py` to `SaleInvoice`, `core/models.py`, `NewPurchaseForm.tsx`, `PurchaseItemRow.tsx`, `atomic_sale_save`, `erp_views.py`, `react`, `frontend/types/index.ts`, `Batch`, `core/permissions.py`, `ProductBatchTable.tsx`, `AuditContext`, `reports/views.py`, `JournalEntry`, `IsAuthenticated`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Are the 171 inferred relationships involving `Outlet` (e.g. with `Command` and `Command`) actually correct?**
  _`Outlet` has 171 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `DJANGO_SETTINGS_MODULE`, `BF-002 Edit Sale Bill` to the rest of the system?**
  _49 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `react` be split into smaller, more focused modules?**
  _Cohesion score 0.029393312002007656 - nodes in this community are weakly interconnected._
- **Why does `Outlet` connect `reports/views.py` to `Customer`, `SaleInvoice`, `RISKS / GAPS (report only)`, `Ledger`, `ActivityLog`, `TestSaleModificationOptionsView`, `live_test.py`, `signals.py`, `Command`, `test_product_search.py`, `has_bill_revision_permission`, `IsAuthenticated`, `logging`, `PurchaseInvoice`, `core/models.py`, `atomic_sale_save`, `billing/views.py`, `OutletProductConfig`, `log_activity`, `commands (40)`, `5.4 reports`, `LedgerEntry`, `gst/views.py`, `Batch`, `OCRFlowTest`, `_ScanTestBase`, `JournalEntry`, `IsAuthenticated`, `atomic_purchase_update`, `tests (198)`, `ActivityEventLegacyAdapterSerializer`, `erp_views.py`, `IsAdminStaff`, `PartnerSerializer`, `ocr_engine.py`, `SalesReturn`, `ErpExcelService`, `tests (92)`, `po_views.py`, `attendance/views.py`, `Command`, `Command`, `StaffPinAuthTests`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Should `SaleInvoice` be split into smaller, more focused modules?**
  _Cohesion score 0.023386869540715696 - nodes in this community are weakly interconnected._
- **Why does `NewPurchaseForm()` connect `NewPurchaseForm.tsx` to `react`, `lucide-react`, `PurchaseItemRow.tsx`, `billingStore.ts`, `react`, `frontend/types/index.ts`, `11.6 frontend — detail`, `cn`, `cn`, `ocr_engine.py`, `billing/views.py`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._