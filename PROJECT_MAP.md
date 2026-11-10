# PROJECT_MAP — MediFlow / MDF (pharmacy ERP + billing)

> Generated 2026-11-03 from the Graphify knowledge graph (`graphify-out/`, 5,916 nodes / 19,270 edges) plus targeted code reads.
> Items marked **(inferred)** were reasoned from code/docs, not verified by running anything. Line numbers are as of this snapshot (working tree had uncommitted changes in purchases, reports, billing-margin and settings files) — re-verify before editing.
> **Scope of this file:** orientation + lookup tables. For "where is X" use `graphify query/explain/path`; for exact behavior open the cited `file:line`.
> No secret values appear here — env var *names* only.

## How to use this file (token budget)

This file is ~2,200 lines (~90k tokens) — **do not read it whole.** Read sections 1–3 and 11.1 for orientation, then only the section/subsection you need via the line numbers below (`Read` with offset/limit). For locating code prefer `graphify query|explain|path`.

**Table of contents (line numbers refresh when this file is regenerated):**

- L55: 1. Overview
- L72:   1.1 Run, build, test
- L126: 2. Folder structure
- L154: 3. Features and modules
- L177: 4. API reference
- L192:   4.1 accounts / attendance / audit / core / gst
- L351:   4.2 billing
- L399:   4.3 inventory & purchases
- L455:   4.4 reports (+ `/api/v1/gst/` routes owned by reports)
- L514: 5. Data models
- L517:   5.1 accounts / attendance / audit / core
- L609:   5.2 billing
- L933:   5.3 inventory & purchases
- L1006:   5.4 reports
- L1081: 6. Frontend (`apps/frontend`)
- L1089:   6.1 Pages & routes
- L1220:   6.2 Key components
- L1278:   6.3 State management & data fetching
- L1375:   6.4 Types & schemas
- L1408: 7. Config and environment (names only — no secret values)
- L1411:   7.1 Backend / infra variables
- L1474:   7.2 Frontend env & build config
- L1496:   7.3 Django settings highlights
- L1518: 8. External services and integrations
- L1547: 9. Dependency map and "change X → also check Y"
- L1549:   9.1 Module dependency overview
- L1573:   9.2 Billing business-logic map
- L1728:   9.3 Inventory / purchases / OCR logic map
- L1806:   9.4 Reports logic map
- L1865: 10. Conventions and how to add things
- L1867:   10.1 Observed conventions
- L1879:   10.2 How to add things (follow the existing pattern)
- L1904: 11. Risks and gaps (reported only — nothing was fixed)
- L1906:   11.1 Highest-priority items (cross-cutting summary)
- L1934:   11.2 accounts / attendance / audit / core / gst — detail
- L1998:   11.3 billing — detail
- L2072:   11.4 inventory / purchases — detail
- L2129:   11.5 reports & infrastructure — detail
- L2197:   11.6 frontend — detail


## 1. Overview

**What it is:** a multi-outlet pharmacy ERP: POS billing (retail/wholesale, GST invoices, quotations, drafts, bill revisions), inventory with batches/expiry/schedule drugs, purchases with AI/OCR invoice scanning, double-entry-style accounts (ledgers, vouchers, journals), credit/receivables, staff attendance + PIN auth, audit logging, and GST compliance (GSTR-1/2B/3B builders, snapshots, GST sandbox provider integration) plus ERP-style reports (sales book, gross profit, stock valuation, expiry, schedule drugs). Currency INR, timezone Asia/Kolkata, `USE_TZ=False`.

**Tenancy model:** Organization → Outlet(s) → Staff. Most data is outlet-scoped (`outlet` FK; request param `outletId` / header `OutletId`). Roles: `super_admin > admin > manager > billing_staff > view_only`, plus many per-staff `can_*` boolean flags.

| Layer | Stack |
|---|---|
| Backend | Python 3.10 (Docker `python:3.10-slim`), Django 5.0.3, DRF 3.15.1, simplejwt 5.3.1 (+token blacklist), django-cors-headers, django-filter, drf-spectacular, django-import-export, Celery (≥5.3) + Redis, gunicorn (image CMD; compose uses `runserver`), PostgreSQL 17 (`psycopg2-binary`) |
| Docs/OCR/AI | `google-genai` (Gemini OCR), `rapidocr-onnxruntime` + `opencv-python-headless` (local OCR), `rapidfuzz`, `weasyprint`/`reportlab` (PDF), `openpyxl`/`xlrd` (Excel) |
| Frontend | Next.js 14.2.15 App Router, React 18.2, TypeScript 5.4, Tailwind 3.4 + shadcn/Radix, Zustand 5 (persist), TanStack Query 5 / Table 8, react-hook-form + zod 4, Recharts 3, axios + raw `fetch` |
| Infra | docker-compose (postgres, redis, backend, celery, frontend, nginx:8090), Netlify config for frontend, GitHub Actions `playwright.yml` |
| Monorepo | npm workspaces (`apps/*`, `packages/*`), turbo referenced but **no `turbo.json`** |

**Languages:** Python (≈430 backend source files), TypeScript/TSX (≈400 frontend files), a few shell/JS helper scripts.


### 1.1 Run, build, test

#### F.1 Whole stack (Docker)
```
docker compose up -d --build          # from repo root
```
Needs: root `.env` (POSTGRES_*), `apps/backend/.env`, `apps/frontend/.env.local`, and the external volumes `mediflow_main_postgres_data` and `mediflow_main_redis_data` created beforehand (`docker volume create ...`), otherwise compose errors.

| Service (container) | Image / build | Port (host:container) | Command | Notes |
|---|---|---|---|---|
| postgres (`mediflow_postgres`) | postgres:17-alpine | none published | default | healthcheck `pg_isready -U $POSTGRES_USER` |
| redis (`mediflow_redis`) | redis:7-alpine | none | `redis-server --save 60 1 --loglevel warning` | healthcheck `redis-cli ping` |
| backend (`mediflow_backend`) | `docker/backend.Dockerfile` (python:3.10-slim) context `apps/backend` | 8000:8000 | `python manage.py migrate --noinput && python manage.py runserver 0.0.0.0:8000` | overrides the image's gunicorn CMD (`gunicorn mediflow.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120`); bind-mounts `./apps/backend:/app`; settings = `mediflow.settings.dev` |
| celery (`mediflow_celery`) | same image | none | `celery -A mediflow worker --loglevel=info --concurrency=2` | no `-Q`, no beat |
| frontend (`mediflow_frontend`) | `docker/frontend.Dockerfile` (node:20-alpine, npm workspaces) context repo root | 3000:3000 | `npm run dev` (compose) vs image CMD `npm start` after `npm run build` | `next dev -H 0.0.0.0` |
| nginx (`mediflow_nginx`) | nginx:stable-alpine | 8090:80 | default | `nginx/nginx.conf`: `/static/`, `/media/`, `/admin/` (IP allow-listed), `/api/v1/auth/login/` (rate 5 req/min burst 5), `/api/` (50 r/s burst 100, read timeout 120 s), `/` -> frontend (WebSocket upgrade), `client_max_body_size 50M` |

Health: `curl http://localhost:8000/api/v1/health/` (returns `{"status":"ok"}`); `./dev-health-check.sh` pings redis in container, logs in via `/api/v1/auth/login/`, hits `/api/v1/purchases/` and `/api/v1/sales/` and expects 200 (uses hard-coded test credentials, see H).

#### F.2 Backend without Docker
```
cd apps/backend
source venv/bin/activate              # venv present in repo dir (git-ignored? see H)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
celery -A mediflow worker --loglevel=info --concurrency=2      # needs Redis
python manage.py seeder               # core/management/commands/seeder.py: org, outlets, staff, data
python manage.py seed_gst_dashboard   # GST mock data (needs seeder first)
python manage.py sync_missing_snapshots
python manage.py spectacular --file ../../schema.yml           # OpenAPI
```
Other management commands: accounts (`audit_journals, backfill_journals, import_daybook, seed_ledgers`), audit (`cleanup_audit_logs`), billing (`export_missing_sales_items, import_marg_sales, sync_credit_accounts`), core (`print_test_credentials, reset_test_db_state, seeder, seed_local_gst_test_data, setup_manvta_admin, validate_test_data`), gst (`diagnose_gst_config, request_gst_otp_for_outlet, seed_bulk_gst, seed_gst_e2e_data, seed_gst_sandbox_demo`), inventory (`backfill_stock_ledger, find_skeleton_products, fresh_tally_migration, import_marg_data, rebuild_bottle_stock, reconcile_inventory`).

#### F.3 Frontend
Root (`package.json`, npm workspaces `apps/*`, `packages/*`, turbo): `npm install`, `npm run dev | build | lint | type-check` -> `turbo run ...`. There is NO `turbo.json` at the repo root (checked), so turbo (version "latest") will fail or warn depending on version (inferred).
In `apps/frontend`: `npm run dev` (`next dev -H 0.0.0.0`, port 3000), `npm run build`, `npm start`, `npm run lint`, `npm run type-check` (`tsc --noEmit`), `npm test` (jest), `npm run test:e2e`, `test:e2e:ui|headed|critical|legacy|all` (Playwright), `npm run sync-api` (`bash ../../scripts/sync_contracts.sh`). `next.config.js` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so a build never fails on type/lint errors. Netlify: `npm run build` in `apps/frontend`.

#### F.4 Tests (backend)
- `pytest.ini`: `DJANGO_SETTINGS_MODULE=mediflow.settings.dev`, `python_files = test_*.py`, markers `unit, integration, contract, smoke, concurrency, repair, regression`, `addopts=-v`. `conftest.py` (apps/backend) gives `api_client`, `authenticated_client` fixtures. pytest/pytest-django are installed in the local venv but are NOT in `requirements.txt` (CI installs only requirements).
- Run: `cd apps/backend && pytest` (all), `pytest -m smoke`, `pytest apps/reports/tests/`; or Django runner `python manage.py test --tag=smoke` / `--tag=regression` (tags set with `@tag(...)`, e.g. billing/tests/test_api_schemas.py:5). Note `apps/reports/tests/tests_gross_loss_return.py` (new, untracked) is named `tests_*.py`, which pytest's `test_*.py` pattern does NOT collect (Django runner pattern `test*.py` does).
- Settings for DB-less runs: `mediflow.settings.test_sqlite` (inherits dev, sqlite `:memory:`), but base still needs `DATABASE_URL` set and `django.contrib.postgres` is installed.
- Reports tests: `apps/backend/apps/reports/tests/` (20 files: GSTR builders, OOXML integrity, exports, snapshots, preflight, inventory valuation, security). Additional repo-level GST tests in `apps/backend/tests/` (3 files), `tests/e2e/` (python files at repo root `tests/e2e`: CA working paper, export consistency, GSTR flows, template integrity...).
- Frontend: jest (`apps/frontend/__tests__`, `jest.config.js`), Playwright e2e (`apps/frontend/tests/e2e`, `apps/frontend/e2e`).

#### F.5 CI (`.github/workflows/playwright.yml`, name "Playwright Tests")
Trigger: push/PR to `main`/`master`. Single job `test` on ubuntu-latest (timeout 60 min): checkout v3; Node 20 with npm cache `apps/frontend/package-lock.json`; `npm ci` in `apps/frontend`; `npx playwright install --with-deps`; Python 3.10; `pip install -r requirements.txt`; `python manage.py migrate`; start `runserver 8000 &` and `npm run dev &`; `npx wait-on` (|| sleep 10); backend `manage.py test --tag=smoke` then `--tag=regression` (blocking); frontend `npm test -t "@smoke"` (allowed to fail), `-t "@regression|@integration"` (blocking), `npm run type-check`, `npx playwright test` (env `CI=true`, `BASE_URL`), upload `playwright-report` (actions/upload-artifact@v3). No deploy job, no lint job.
CI problems are listed in H (missing lockfile path, no DB service, no SECRET_KEY).

#### F.6 Celery schedule
There is no `CELERY_BEAT_SCHEDULE`, no `django_celery_beat`, and no beat container. Nothing is scheduled; periodic tasks (e.g. `audit` log cleanup via `cleanup_audit_logs`, snapshot sync) must be run manually/cron.

---

## 2. Folder structure

| Path | Purpose |
|---|---|
| `apps/backend/` | Django project root (`manage.py`, `pytest.ini`, `conftest.py`, `requirements.txt`) |
| `apps/backend/mediflow/` | Project package: `urls.py` (root router), `settings/{base,dev,prod,test_sqlite}.py`, `celery.py`, wsgi/asgi |
| `apps/backend/apps/accounts/` | Staff (auth user), customers, doctors, partners/distributors, ledgers, vouchers, journals, dashboard KPI service |
| `apps/backend/apps/billing/` | Sales (invoice/items/drafts/quotations), sale returns, credit/debit notes, payments, expenses, credit accounts, pricing/credit controls, GST e-invoice/EWB fields, Marg migration |
| `apps/backend/apps/inventory/` | MasterProduct (+ OutletProductConfig, aliases), Batch, StockLedger, stock adjustments, product search, inventory export |
| `apps/backend/apps/purchases/` | Purchase invoices/orders/payments, distributor purchasing, OCR (Gemini + local) pipeline via Celery |
| `apps/backend/apps/reports/` | Sales/ERP/GST reports, GSTR builders, GST snapshots, daily snapshot, Excel/PDF exports |
| `apps/backend/apps/gst/` | GST dashboard API (sandbox auth/OTP, GSTR-1/2B/3B, reconciliation, locking), `conf.py` constants |
| `apps/backend/apps/core/` | Organization/Outlet/chain models, role permissions (`permissions.py`), settings, seeders, management commands |
| `apps/backend/apps/audit/` | Audit logging middleware/JWT auth, ActivityLog, DocumentRevisionV2 (bill revision history) |
| `apps/backend/apps/attendance/` | Staff check-in/out with selfie photos |
| `apps/backend/apps/integrations/`, `compliance/`, `apps/apps/gst/` | Sandbox GST provider client; compliance services (Rule 37 tracker). **Not in `INSTALLED_APPS`** / no routes; `apps/apps/gst` is empty |
| `apps/frontend/app/` | Next.js routes: `(auth)/login`, `billing`, `dashboard/*`, `admin`, `gst`, `print`, `sw.ts`, `manifest.ts` |
| `apps/frontend/components/` | Feature components (billing, purchases, reports, accounts, settings, attendance, credit, customers…) + `ui/` shadcn primitives |
| `apps/frontend/{hooks,lib,store,types,utils,schemas,config,constants}/` | React Query hooks; `lib/apiClient.ts`/`api.ts` clients + billing math; Zustand stores; shared types/zod; misc |
| `apps/frontend/{__tests__,tests,e2e}/` | Jest unit tests; Playwright e2e (`tests/e2e`, `e2e`) |
| `packages/{types,constants}/` | Shared workspace packages (small) |
| `docker/`, `docker-compose.yml`, `nginx/` | Container build files, stack definition, reverse proxy (rate-limit login, `/api/`, `/media/`, `/admin/` allow-list) |
| `docs/` | Curated reference docs (API_REFERENCE, MODEL_FIELDS, BUSINESS_FLOW_MATRIX, INVARIANT_MATRIX, GST sandbox/snapshot design). Old phase reports and `ca_review/` were removed. Treat as potentially stale vs code |
| `scripts/`, root `*.py`/`*.js` | Ad-hoc one-off scripts (unit cleaning, contract sync `sync_contracts.sh`, tests probes) — not part of runtime |
| `.github/workflows/playwright.yml` | Only CI workflow |
| `graphify-out/` | Knowledge graph (`graph.json`, `GRAPH_REPORT.md`, `graph.html`, cache/manifest). `.graphifyignore` controls what is indexed |

## 3. Features and modules

| Feature | Backend (entry points) | Frontend (entry points) |
|---|---|---|
| Auth, staff PIN, roles | `accounts/auth_urls.py` → `LoginView`, PIN verify/lookup; `core/permissions.py`; `audit/authentication.py` | `app/(auth)/login`, `middleware.ts`, `store/authStore.ts`, `StaffPinEntry` |
| POS billing (sales, drafts, quotations, revisions) | `billing/urls.py` → `SaleCreateView`/`SalesView`, `SaleReviseView`, drafts, `quotation_views.py`; `billing/sale_services.py` | `app/billing/page.tsx`, `store/billingStore.ts`, `lib/billingMarginUtils.ts`, `lib/cartUtils`, `EditSaleHydrator` |
| Sales returns / credit & debit notes | `billing/sale_return_*`, `accounts` debit-note services | `dashboard/accounts/sale-returns/new`, credit-note components |
| Inventory & stock ledger | `inventory/urls.py` (products, batches, adjust, stockledger, search) | `dashboard/inventory`, `dashboard/stockledger` |
| Purchases + AI OCR | `purchases/urls.py`, `ocr_engine.py`, `gemini_ocr.py`, `tasks.py` (Celery) | `dashboard/purchases`, `NewPurchaseForm`, `PurchaseItemRow`, `AddNewProductDrawer` |
| Accounts (ledgers, vouchers, journals, payables/receivables, expenses) | `accounts/voucher_urls.py`, `journal_service.py`, `billing/accounts_urls.py` | `dashboard/accounts/*` |
| Credit management | `billing/credit_controls.py` (dormant, see risks), credit account views | `dashboard/credit`, `BulkReminderModal` |
| Reports (sales book, gross profit, ERP, purchase book / consolidated purchase book / purchase return book, stock valuation, expiry, schedule drugs, P&L, balance sheet) | `reports/urls.py`, `erp_views.py` (+ `PurchaseBook*`/`PurchaseReturnBook*`), `services/erp_report_service.py`, `erp_excel_service.py`, `daily_snapshot_views.py` | `dashboard/reports/*`, `ErpReportModal`, `ReportPageLayout` |
| GST compliance | `gst/urls.py`, `reports/gst_urls.py`, `gstr_builders.py`, `gstr2b_service.py`, `gst_snapshot_service.py`, `integrations/sandbox` | `app/gst`, `store/gstStore.ts` |
| Attendance | `attendance/urls.py` | `dashboard/attendance`, `WebcamCapture` |
| Audit & revision history | `audit/urls.py`, `DocumentRevisionV2` | `dashboard/sales/revisions`, admin audit page |
| Multi-outlet / chain admin | `core/chain_urls.py`, `core/outlet_urls.py` | `dashboard/chain`, settings |
| Settings (billing/pricing, outlet) | `core/views.py` (`/outlet/settings/`) | `components/settings/*`, `store/settingsStore.ts` |
| Data migration (Marg/Tally) | `MargMigrationView`, mgmt cmds `import_marg_data`, `import_marg_sales`, `fresh_tally_migration` | — |



---

## 4. API reference

All routes are mounted from `apps/backend/mediflow/urls.py` under `/api/v1/` (see 4.0). Auth default: `AuditJWTAuthentication` (JWT Bearer); default permission DRF `IsAuthenticated`. Permission classes named `IsAuthenticated` exist in two flavours (DRF vs `core.permissions`, which also checks outlet) — see 4.1 preamble. Query-param/body casing: camelCase (`outletId`) in most endpoints; a few use `outlet_id`.

Root URL conf: `apps/backend/mediflow/urls.py`. Everything below is under `/api/v1/` unless stated. All paths are relative to `/home/asta/coding/MDF/apps/backend/`. Line numbers are `apps/<app>/<file>:<line>`.

Global facts (verified):
- Default DRF auth = `apps.audit.authentication.AuditJWTAuthentication` (simplejwt JWT bearer; also seeds the audit context with user_id/tenant_id from `outletId`). Default permission = DRF `IsAuthenticated`. Pagination default PageNumberPagination (50), but almost all views here are `APIView` with hand-rolled pagination (`mediflow/settings/base.py:129-141`).
- JWT: access 8h, refresh 7d, rotate + blacklist (`base.py:121-126`). `AUTH_USER_MODEL = accounts.Staff`.
- Permission classes come in two flavours with the SAME name `IsAuthenticated`:
  - `core.permissions.IsAuthenticated` = authenticated + `check_outlet_access` (non-super_admin may not pass an `outletId` query/body value different from their own `user.outlet_id`). Note it only inspects the camelCase `outletId` param (`core/permissions.py:11-42`); `outlet_id` (snake) and path-embedded ids are NOT checked.
  - `rest_framework.permissions.IsAuthenticated` = authenticated only (no outlet isolation). Used by attendance, gst, core/chain_views, accounts dashboard views.
- Role ladder: super_admin > admin > manager > billing_staff > view_only (`core/permissions.py`; `cashier` is a legacy alias of billing_staff via `ROLE_ALIASES`, never assignable). `IsAdminStaff` = {super_admin, admin}; `IsManagerOrAbove` = + manager; `IsBillingStaffOrAbove` = + billing_staff. Flag-based classes (`CanAccessReports`, `CanCreatePurchases`, `CanEditSalesInvoice`, ... + `CanManageProducts`, `CanManagePartners`) pass for admin/super_admin or when the Staff flag is set. **`effective_permissions(user)` computes the permission list sent to the UI as `user.permissions` (login, /auth/me, switch-outlet via `accounts/views.py build_user_payload`); a backend test checks it against every class.** `check_outlet_access` guards every outlet id in query+body (`outletId` and `outlet_id`; super_admin limited to own organization); `assert_outlet_access(user, obj.outlet_id)` is the object-level helper; `MethodPermissionMixin` gives merged list+create views per-method permissions. Legacy roles `cashier`/`custom` behave as billing_staff (`ROLE_ALIASES`; `manage.py normalize_staff_roles`). Staff rules: `can_assign_role`, `can_manage_staff_member` (only super_admin makes/edits super_admins; no self role-change/deactivation); login + PIN endpoints are rate-limited (`core/ratelimit.py`). Full reference: `docs/ACCESS_CONTROL.md`.
- Response envelope is inconsistent: some views return bare arrays/objects, some `{success, data, meta}`, some `{data, meta}`, some `{error:{code,message}}`, some `{detail}`, some `{error:"..."}`.

### 4.1 accounts / attendance / audit / core / gst

#### A.1 accounts: auth (`accounts/auth_urls.py`, prefix `/api/v1/auth/`)

| Method | Full path | Handler | Auth/perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| POST | /auth/login/ | `LoginView.post` accounts/views.py:42-196 | AllowAny | body `{phone, password}` | 200 `{access, refresh, user{id,name,phone,role,outletId,organizationId,isSuperAdmin,outlet{...},avatarUrl,maxDiscount,canEditRate,canViewPurchaseRates,canCreatePurchases,canAccessReports,canEditSales,canEditPurchases,canModifyPaidPurchases,canModifySettledVouchers,canModifySettledReturns,canEditSaleReturns,canEditPurchaseReturns,canEditVouchers,canViewAuditHistory,canVoidRecords,canModifyDraftBill,canModifyUnpaidBill,canCorrectHeaderFields,canCorrectRatesDiscounts,canCorrectQuantities,canCorrectCustomer,canModifyBillWithReturn,canModifyPaidBill,canCancelAndReissueBill,canViewBillRevisionHistory,canManagePartners}}`; 400 missing; 401 `{detail}` | Staff, Outlet, Organization; ActivityLog (via log_activity LOGIN/LOGIN_FAILED) |
| POST | /auth/logout/ | `LogoutView.post` (subclass of simplejwt `TokenBlacklistView`) accounts/views.py:2110 | none declared (TokenBlacklistView default: AllowAny, no authentication) | body `{refresh}` | 200 `{}`; logs LOGOUT only if `request.user` authenticated | token_blacklist tables, ActivityLog |
| POST | /auth/refresh/ | simplejwt `TokenRefreshView` | AllowAny | body `{refresh}` | `{access, refresh}` (rotating) | token_blacklist |
| GET | /auth/me/ | `StaffMeView.get` :298-358 | core.IsAuthenticated | none | same `user` object as login (flat, no wrapper); 401 if inactive | Staff, Outlet |
| PATCH | /auth/me/pin/ | `ChangePinView.patch` :2037-2073 | core.IsAuthenticated | body `{currentPin,newPin}` (newPin 4-6 digits, unique per outlet among active staff) | `{success, data:{message}}`; 400 `{error}` | Staff; ActivityLog |
| POST | /auth/switch-outlet/ | `SwitchOutletView.post` :199-295 | core.IsAuthenticated + in-body role check (super_admin only, 403 otherwise) | body `{outletId}` (must be in caller's org) | new `{access, refresh, user{...slim outlet{id,name,city,state}}}`; persists `staff.outlet` | Staff, Outlet |

#### A.2 accounts: customers (`accounts/customer_urls.py`, prefix `/api/v1/customers/`)

All `core.IsAuthenticated` (any role incl. view_only). Customer JSON shape (camelCase): `id,name,phone,address,state,dob,gstin,fixedDiscount,creditLimit,dlNo20b,dlNo21b,dlExpiry,customerType,stateCode,outstanding,totalPurchases,isChronic,isActive,createdAt`.

| Method | Full path | Handler | Request | Response | Tables |
|---|---|---|---|---|---|
| GET | /customers/ | `CustomerListView.get` :669-776 | q: `outletId`(req), `search`, `page`(1), `pageSize`(50), `isChronic`, `hasOutstanding` | `{data:[customer], pagination:{page,pageSize,totalPages,totalRecords}}`; `outstanding` taken from Sundry Debtors Ledger.current_balance, fallback Customer.outstanding | Customer, Ledger |
| POST | /customers/ | `CustomerListView.post` :778-907 | body `outletId,name*,phone*(regex ^[6-9]\d{9}$),address,state,dob,gstin(15-char regex),isChronic,fixedDiscount(0-100),creditLimit(>=0),dlNo20b,dlNo21b,dlExpiry,customerType(default RETAIL),stateCode(default '27')`; dup (outlet+phone+name iexact) rejected | 201 customer; side effect: auto-creates LedgerGroup 'Sundry Debtors' (get_or_create) + Ledger `"{name} ({phone})"` linked_customer | Customer, LedgerGroup, Ledger |
| GET | /customers/search/ | `CustomerSearchView.get` :361-456 | q: `q`(min 2 chars else `[]`), `outletId` | `[customer]` (is_active only; name/phone icontains) | Customer |
| GET | /customers/refill-alerts/ | `RefillAlertsView.get` :1784-1858 | q: `outletId`(def user outlet), `days`(7) | `{success,data:[{customerId,customerName,phone,medicines:[{productName,qty,frequency,lastPurchaseDate,nextDueDate,daysUntilDue}]}],meta:{totalAlerts,daysFilter}}` | Customer, RegularMedicine, SaleItem(billing) |
| GET | /customers/{uuid}/ | `CustomerDetailView.get` :459-519 | q: `outletId` (fallback user outlet) | customer + `ledgerId` (Sundry Debtors ledger) | Customer, Ledger |
| PUT | /customers/{uuid}/ | `CustomerDetailView.put` :521-666 | body `outletId`(req) + any subset of customer fields (partial semantics despite PUT) | customer (no ledgerId); also syncs phone/gstin to linked Ledger | Customer, Ledger |
| GET | /customers/{uuid}/purchase-history/ | `CustomerPurchaseHistoryView.get` :1181-1252 | q: `outletId` | `[{invoiceId,date,total,items,billedBy,paymentMode}]` last 50 | SaleInvoice, SaleItem |
| GET | /customers/{uuid}/ledger/ | `apps.billing.views.CustomerLedgerView` (billing app, out of my scope) | | | |
| GET | /customers/{uuid}/chronic-medicines/ | `ChronicMedicinesView.get` :1729-1781 | q: `outletId` | `{success,data:[{id,productId,productName,genericName:'',qty,frequency,notes,currentStock,lastPurchaseDate,nextDueDate}]}` | RegularMedicine, Batch(inventory) |
| GET | /customers/{uuid}/outstanding/ | `CustomerOutstandingInvoicesView.get` :2075-2106 | none (outlet from `request.user.outlet`) | `{data:[{id,invoiceNo,invoiceDate,grandTotal,outstanding}]}` (amount_due>0) | SaleInvoice |

No DELETE / activate toggle / PDC / RegularMedicine CRUD endpoint exists for customers.

#### A.3 accounts: staff (`accounts/staff_urls.py`, prefix `/api/v1/staff/`)

| Method | Full path | Handler | Auth/perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| GET | /staff/ | `StaffListView.get` :1001-1072 | IsAdminStaff | q: `outletId` | bare array of staff incl. `staffPin` (HASH), all `can*` flags, `canExportGst`, `shiftStartTime,shiftEndTime,weeklyOffDay,isActive,joiningDate,lastLogin`; active only | Staff |
| POST | /staff/create/ | `StaffCreateView.post` :1308-1393 | IsAdminStaff | body `name,phone*(unique global),password*,pin*,role(def billing_staff; one of 5),email,outletId(super_admin only, same org),maxDiscount,all can* camelCase flags,shiftStartTime,shiftEndTime,weeklyOffDay` ; PIN uniqueness per-outlet via check_password loop | 201 `{success,data:_serialize_staff}`; 400 `{error}` | Staff |
| GET | /staff/leaderboard/ | `StaffLeaderboardView.get` :1666-1726 | core.IsAuthenticated (any role) | q: `outletId`,`from`,`to` (YYYY-MM-DD) | `{success,data:[{staffId,staffName,role,totalInvoices,totalSalesAmount,avgInvoiceValue,totalDiscountGiven,rank,badge(gold/silver/bronze/null)}]}` | Staff, SaleInvoice |
| POST | /staff/lookup-by-pin/ | `StaffLookupByPinView.post` :910-998 | core.IsAuthenticated | body `{pin, outletId}` | `{id,name,role,staffPin(hash),maxDiscount,canEditRate,canViewPurchaseRates,canEditSales,canEditPurchases,billsToday,totalSalesToday}`; 400 `{error:{code:MISSING_PIN|INVALID_PIN|AMBIGUOUS_PIN}}` | Staff, SaleInvoice; Django cache `pin_check:{hash}:{pin}` TTL 7d |
| PATCH | /staff/{uuid}/ | `StaffDetailView.patch` :1396-1562 | IsAdminStaff (+in-body role recheck) | body subset of camel flags/`name,email,role,password,pin,isActive,shift*` ; super_admin scope = same org, admin = same outlet | `{success,data:_serialize_staff}` | Staff |
| DELETE | /staff/{uuid}/ | `StaffDetailView.delete` :1564-1582 | IsAdminStaff | none | soft delete `is_active=False`; `{success,data:{id,isActive:false}}` | Staff |
| GET | /staff/{uuid}/performance/ | `StaffPerformanceView.get` :1585-1663 | core.IsAuthenticated (any role, any staff in outlet) | q: `outletId`,`from`,`to` | `{success,data:{staffId,staffName,role,totalInvoices,totalSalesAmount,totalDiscountGiven,avgInvoiceValue,topProducts[10],salesByDay[],salesByPaymentMode{cash,upi,card,credit}}}` | SaleInvoice, SaleItem |
| POST | /staff/{uuid}/verify-pin/ | `StaffPinVerifyView.post` :1075-1178 | core.IsAuthenticated | q `outletId`; body `{pin}` | same as lookup-by-pin; 400 `{error:{code}}` | Staff, SaleInvoice; cache |

#### A.4 accounts: doctors, partners

| Method | Full path | Handler | Auth/perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| GET | /doctors/ | `DoctorListCreateView.get` accounts/views.py:1861-1906 | core.IsAuthenticated | q `outletId`,`search`(name/registration_no),`limit`(1-200; default top 50 when searching) | `{success,data:[{id,name,phone,registrationNo,regNo,degree,qualification,specialty,specialization,hospitalName,address}],meta:{total}}` (duplicate alias keys) | Doctor |
| POST | /doctors/ | `.post` :1908-1941 | core.IsAuthenticated | body `outletId,name,phone,registrationNo|regNo,degree,qualification,specialty|specialization,hospitalName,address` (name not validated) | 201 `{success,data}` | Doctor |
| GET | /doctors/{uuid}/ | `DoctorDetailView.get` :1944-1973 | core.IsAuthenticated | q `outletId` | `{success,data}` | Doctor |
| PUT | /doctors/{uuid}/ | `.put` :1975-2010 | same | body subset | `{success,data}` | Doctor |
| PATCH | /doctors/{uuid}/ | `.patch` :2012-2034 | same | only `name,specialization,phone,registrationNo,qualification` honoured (ignores degree/hospital/address/specialty) | slim `{success,data}` | Doctor |
| GET | /partners/ | `PartnerListCreateView.get` accounts/partner_views.py:14 | core.IsAuthenticated | q `outletId` | `[{id,name,profitPercentage,isActive,createdAt}]` active only | Partner |
| POST | /partners/ | `.post` :25-48 | core.IsAuthenticated + inline gate (admin/super_admin or `can_manage_partners`) | body `outletId,name,profit_percentage` (snake in, camel out) | 201 partner; writes PartnerShareHistory(start=today) | Partner, PartnerShareHistory |
| GET | /partners/{uuid}/ | `PartnerDetailView.get` :56 | core.IsAuthenticated | q `outletId` | partner | Partner |
| PUT | /partners/{uuid}/ | `.put` :64-102 | + inline gate | body partial; on % change closes open history row (end=yesterday) and opens new, or overwrites same-day row | partner | Partner, PartnerShareHistory |
| DELETE | /partners/{uuid}/ | `.delete` :104-115 | + inline gate | q/body `outletId` | 204; soft `is_active=False` | Partner |

#### A.5 accounts: ledgers, vouchers, notes, accounting reports (`accounts/voucher_urls.py`, mounted at `/api/v1/` with NO sub-prefix; docstrings in views wrongly say `/api/v1/accounts/...`)

Handlers in `accounts/voucher_views.py`. `get_outlet_id()` = `query outletId` or `body outletId` (:19). Reports below (trial-balance, gst-summary, balance-sheet, profit-loss) use snake `outlet_id` instead.

| Method | Full path | Handler | Auth/perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| GET | /ledger-groups/ | `LedgerGroupListView.get` :23-34 | IsManagerOrAbove | q `outletId` | `{data:[{id,name,nature,parentId,isSystem}],meta:{total}}` | LedgerGroup |
| POST | /ledger-groups/ | `.post` :36-50 | IsManagerOrAbove | body `outletId,name,nature,parentId` ; any exception -> 400 `{detail:str(e)}` | 201 group | LedgerGroup |
| GET | /ledgers/ | `LedgerListView.get` :53-106 | IsManagerOrAbove | q `outletId`,`type`(cash|bank),`group`(name or csv),`filterGroup=cashbank`,`voucherType`(receipt/payment/contra filters by group nature),`search`,`limit`(<=200; 50 when searching) | `{data:[Ledger __all__ camel],meta:{total}}` | Ledger, LedgerGroup |
| POST | /ledgers/ | `.post` :108-212 | IsManagerOrAbove | body `outletId,name,groupId|groupName,openingBalance,balanceType,phone,gstin,address,+all contact/compliance/GST/settings camel fields (see Ledger model)`; if group has 'debtor' or ledgerCategory=CUSTOMER, auto-creates Customer (phone fallback `TMP-xxxxxxxx`) and links | 201 ledger | Ledger, LedgerGroup, Customer |
| POST | /ledgers/sync/ | `LedgerSyncView.post` :447-460 | IsManagerOrAbove | body `outletId` | `{detail}` ; runs `LedgerService.sync_customer_ledgers`+`sync_distributor_ledgers` | Ledger, Customer, Distributor(purchases) |
| GET | /ledgers/next-no/ | `VoucherNextNoView.get` :463-472 | IsManagerOrAbove | q `outletId`,`type`(receipt) | `{voucherNo}` | Voucher |
| PUT | /ledgers/{uuid}/ | `LedgerDetailView.put` :215-253 | IsAdminStaff | body subset of camel ledger fields + `groupId`; enforces `ledger.outlet_id == user.outlet_id` (403) | ledger | Ledger |
| GET | /ledgers/{uuid}/statement/ | `LedgerStatementView.get` :256-444 | IsManagerOrAbove | q `from`,`to`,`page`,`page_size`(50-2000, def 1000),`ordering` | `{ledger,openingBalance,closingBalance,balanceType,isCreditNature,totalDebit,totalCredit,pageDebit,pageCredit,transactions[{date,voucherNo,voucherType,description,debit,credit,balance,sourceType,sourceId,journalEntryId}],pagination{page,page_size,total_count,total_pages,has_more}}`; merges VoucherLine + JournalLine (excludes JE source VOUCHER to avoid double count) | Ledger, VoucherLine, JournalLine |
| GET | /ledgers/{uuid}/outstanding/ | `LedgerOutstandingView.get` :715-725 | IsManagerOrAbove | none | `{outstanding,balanceType}` | Ledger |
| GET | /ledgers/{uuid}/pending-bills/ | `LedgerPendingBillsView.get` :728-737 | IsManagerOrAbove | q `outletId`,`exclude_voucher_id` | `{data:[bills],meta:{total}}` via `VoucherService.get_pending_bills` | SaleInvoice/PurchaseInvoice, VoucherBillAdjustment |
| GET | /vouchers/ | `VoucherListView.get` :475-495 | CanEditVouchers (gates GET too) | q `outletId`,`type`,`page`,`pageSize`(20) | `{data:[voucher],meta:{total,page}}` voucher=`{id,voucherType,voucherNo,date,narration,totalAmount,paymentMode,status,createdBy(name),createdAt,lines[{id,ledger,debit,credit,description}],billAdjustments[]}` | Voucher, VoucherLine |
| POST | /vouchers/ | `.post` :497-516 | CanEditVouchers | body `outletId, voucher_type*(snake), date*, narration, total_amount, payment_mode, lines[{ledgerId|ledger_id, side(debit/dr/credit/cr)+amount | debit,credit, description}], bill_adjustments[]` | 201 voucher. Rules: >=1 line, no negative, Dr==Cr, non-zero; receipt/payment direction guards on expense ledgers; contra only Cash in Hand/Bank Accounts; atomic; posts JournalEntry (`journal_service.post_voucher`), rollback if posting fails | Voucher, VoucherLine, VoucherBillAdjustment, Ledger, JournalEntry/Line, PurchaseInvoice/SaleInvoice |
| GET | /vouchers/{voucher_id}/ | `VoucherDetailView.get` :525-611 (route type `uuid`, but code also handles non-uuid voucher_no; unreachable via this urlconf since converter is uuid) | IsManagerOrAbove (get_permissions) | none | voucher; falls back to JournalEntry synthesized voucher (`isJournalEntry:true`, payment mode guessed from ledger names) | Voucher, JournalEntry |
| PUT | /vouchers/{voucher_id}/ | `.put` :613-630 | CanEditVouchers | body as create + `revisionReasonCode`,`revisionReasonText`(>=10 chars) mandatory when status=posted; calls `voucher_update_service.atomic_voucher_update` | voucher | Voucher, lines, JournalEntry, DocumentRevisionV2 |
| GET | /vouchers/{uuid}/history/ | `VoucherRevisionDetailView.get` :1736-1770 | CanViewAuditHistory | q `outletId` (required in practice; get_object_or_404 with None -> 404) | `{voucher, revisions[]}` (V2 adapter when flag on) | Voucher, DocumentRevision(V2) |
| GET | /debit-notes/ | `DebitNoteListView.get` :633-650 | IsManagerOrAbove | q `outletId`,`page`,`pageSize` | `{data,meta}` | DebitNote, DebitNoteItem |
| POST | /debit-notes/ | `.post` :652-671 | IsManagerOrAbove | body `date,distributor_id,purchase_invoice_id,reason,subtotal,gst_amount,total_amount,items[{batch_id,product_name,qty,rate,gst_rate,total}]` | 201 note; deducts stock, posts journal | DebitNote(+Item), Batch, Distributor, JournalEntry |
| GET | /debit-notes/{uuid}/ | `DebitNoteDetailView.get` :1810 | core.IsAuthenticated | none | note; NO outlet filter (`get_object_or_404(id=pk)`) | DebitNote |
| PUT | /debit-notes/{uuid}/ | `.put` :1817-1841 | core.IsAuthenticated + inline `CanEditPurchaseReturns` | body `outletId` + items + `revisionReasonCode/Text` | note; 409 on `stale_edit_conflict` | DebitNote, Batch, JournalEntry |
| GET | /credit-notes/ | `CreditNoteListView.get` :674-691 | IsManagerOrAbove | same paging | `{data,meta}` | CreditNote(+Item) |
| POST | /credit-notes/ | `.post` :693-712 | IsManagerOrAbove | body `date,customer_id,sale_invoice_id,reason,subtotal,gst_amount,total_amount,items[...]`; reduces `Customer.outstanding` directly | 201 note | CreditNote, Batch, Customer |
| GET | /trial-balance/ | `TrialBalanceView.get` :740-893 | IsAdminStaff | q `outlet_id`*,`from_date`,`to_date` (FY default Apr 1); manual outlet check (non-super_admin) | grouped ledgers with opening/period Dr,Cr/closing | LedgerGroup, Ledger, JournalLine |
| GET | /gst-summary/ | `GSTSummaryView.get` :896-985 | IsAdminStaff | q `outlet_id`*,`month`(YYYY-MM); NO outlet ownership check | `{gst_output,gst_input,gst_payable,...}` from JournalLine on GST ledgers | JournalLine, Ledger |
| GET | /balance-sheet/ | `BalanceSheetView.get` :1053-1436 | IsAdminStaff | q `outlet_id`*,`as_on_date`,`stock_valuation`(purchase_rate...) | two-sided BS incl. stock-in-hand from Batch and FY net profit | Ledger, JournalLine, Batch |
| GET | /profit-loss/ | `ProfitLossView.get` :1439-1733 | IsAdminStaff | q `outlet_id`*,`from_date`,`to_date`,`stock_scope`,`stock_valuation` | Marg-style trading + P&L two-sided + `grand_total` | JournalLine, Batch |

Unrouted view: `DebitNoteRevisionDetailView` (voucher_views.py:1773) is not referenced by any urlconf (dead).
Not routed anywhere: `accounts/urls.py` (see A/B notes).

#### A.6 accounts: dashboard (view classes exist in `accounts/views.py:2133-2155`, but ONLY referenced from the unmounted `accounts/urls.py`)

| Method | Would-be path | Handler | Perm | Notes |
|---|---|---|---|---|
| GET | dashboard/kpis/, dashboard/aging/, dashboard/urgent/, dashboard/audit-alerts/ | `DashboardKPIView/AgingView/UrgentActionsView/AuditAlertsView` | DRF IsAuthenticated (no outlet check) | NOT reachable: `accounts/urls.py` is not included in `mediflow/urls.py`. Query `outletId` unchecked. `DashboardService.get_audit_alerts` calls `AuditService` that references non-existent model fields (see notes). |

#### A.7 attendance (`attendance/urls.py`, prefix `/api/v1/attendance/`; all DRF `IsAuthenticated` unless noted)

| Method | Full path | Handler | Perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| POST | /attendance/check-in/ | `AttendanceCheckInView.post` attendance/views.py:113 | IsAuthenticated | body `outletId, type(check_in|check_out, default check_in), photoBase64|selfieUrl, latitude, longitude`; staff = caller (cannot fake others); security: allowed IP list OR GPS radius from OutletSettings; late if after 09:00+10min (hard-coded) | 201 serialized record `{id,staffId,staffName,staff{id,name,role},outletId,date,checkInTime,checkOutTime,status,isLate,lateByMinutes,workingHours,checkInPhoto,checkOutPhoto,notes,createdAt}` ; 400 ALREADY_CHECKED_IN/NOT_CHECKED_IN/ALREADY_CHECKED_OUT; 403 SECURITY_REJECTED | AttendanceRecord, OutletSettings, Staff |
| POST | /attendance/check-out/ | `AttendanceCheckOutView.post` :236 | IsAuthenticated | body `staffId, photo, latitude, longitude` (staffId taken from BODY, not caller) | 200 record | AttendanceRecord, Staff |
| GET | /attendance/today/ | `AttendanceTodayView.get` :295 | IsAuthenticated | q `outletId`; non-admin roles see only own | `[record]` | AttendanceRecord |
| GET | /attendance/ | `AttendanceMonthlyView.get` :319 | IsAuthenticated | q `outletId, month(YYYY-MM), staffId`(admin only) | `[record]` | AttendanceRecord |
| GET | /attendance/summary/ | `AttendanceSummaryView.get` :354 | IsAuthenticated | q `outletId, month`* | `[{staffId,staffName,role,month,year,totalWorkingDays(=calendar days),presentDays,absentDays,lateDays,halfDays,totalHoursWorked,avgCheckInTime,attendancePct}]` | AttendanceRecord, Staff |
| POST | /attendance/manual/ | `AttendanceManualView.post` :430 | IsAdminStaff | body `outletId,staffId,date*,status,notes,checkInTime,checkOutTime` (HH:MM[:SS]) ; upsert | record | AttendanceRecord |
| GET | /attendance/my-ip/ | `AttendanceMyIpView.get` :482 | IsAuthenticated | none | `{ip}` (REMOTE_ADDR) | none |

#### A.8 audit (`audit/urls.py`, prefix `/api/v1/audit/`)

| Method | Full path | Handler | Perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| GET | /audit/logs/ | `ActivityLogListView` audit/views.py:55 (generics.ListAPIView) | `audit.permissions.IsSuperAdmin` (role == 'super_admin' only) | filters (django-filter, V1 only): `module,action,entity_type,entity_id,user,outlet,timestamp__gte/lte,search`; `ordering`; DRF PageNumberPagination (50) | paginated `{count,next,previous,results:[{id,timestamp,user,user_email,outlet,outlet_name,action,module,entity_type,entity_id,entity_label,description,changes_json,metadata_json,endpoint,http_method,status_code,ip_address,ip_is_routable,user_agent,request_id}]}`. With `AUDIT_V2_READ_ENABLED` (True in settings) the queryset is `ActivityEvent` via `ActivityEventLegacyAdapterSerializer` and filterset is disabled | ActivityLog or ActivityEvent |
| GET | /audit/logs/export/ | `ActivityLogExportView.get` :109 | IsSuperAdmin | same filters | CSV attachment `audit_logs.csv` (Timestamp,Module,Action,User,Outlet,Entity Type,Entity ID,Entity Label,Description); streams `.iterator()`; in V2 mode user/outlet columns are raw actor_id/tenant_id | ActivityLog / ActivityEvent |
| GET | /audit/revisions/{record_type}/{uuid}/ | `UnifiedRevisionDetailView.get` :160 | `core.CanViewAuditHistory` | q `outletId` (or header `OutletId`, or user outlet); `record_type` in {purchase, sale_return, voucher, sale, debit_note} | `{record:{<number fields>,id,createdAt,createdBy},revisions:[...]}`; uses DocumentRevisionV2 when V2 read flag on OR type in (purchase, sale, voucher); else legacy DocumentRevision (incl. `resulting_document_id` matches) | Model by type, DocumentRevision, DocumentRevisionV2 |

#### A.9 core (outlet + organization/chain)

| Method | Full path | Handler | Perm | Request | Response | Tables |
|---|---|---|---|---|---|---|
| GET | /outlet/settings/ | `OutletSettingsView.get` core/views.py:70 | IsAdminStaff | q `outletId` (fallback user outlet) | `{success,data:{openingTime,closingTime,gracePeriodMinutes,defaultCreditDays,invoicePrefix,gstRegistered,printLogo,thermalPrint,printerWidth,lowStockAlertDays,expiryAlertDays,enableWhatsapp,whatsappApiKey(plain),enableEwayBill,enableEinvoice,currencySymbol,landingCostIncludeGst,landingCostIncludeFreight,minMarginWarningPct,allowedAttendanceIps,attendanceLatitude,attendanceLongitude,attendanceRadiusMeters,printSettingsRetail,printSettingsWholesale,updatedAt},outlet:{id,organizationId,name,address,city,state,stateCode,pincode,phone,gstin,drugLicenseNo,logoUrl,invoiceFooter}}` ; get_or_create OutletSettings | Outlet, OutletSettings |
| PATCH | /outlet/settings/ | `.patch` core/views.py:84 | IsAdminStaff | body `outletId` + any settings key above, + outlet fields in either `outletName|name`, `outletAddress|address`, `outletCity|city`, `outletState|state`, `outletPincode|pincode`, `outletPhone|phone`, `outletGstin|gstin`, `outletDrugLicenseNo|drugLicenseNo`, `invoiceFooter`, `outletLogoUrl|logoUrl` ; no value validation (raw setattr) | same shape as GET | Outlet, OutletSettings |
| GET | /organizations/ | `OrganizationListView.get` core/chain_views.py:65 | DRF IsAuthenticated + in-body `role=='super_admin'` | none | `{success,data:[{id,name,slug,plan,masterGstin,phone,email,createdAt,outletCount}]}` (ALL orgs, not just caller's) | Organization, Outlet |
| GET | /organizations/dashboard/ | `ChainDashboardView.get` :202 | same | q `orgId`*,`from`,`to` | `{success,data:{organization,period,totalSales{total,invoices},todaySales,totalPurchases,totalPayables,totalReceivables,outlets[{id,name,city,state,periodSales,periodInvoices,todaySales}]}}` | SaleInvoice, PurchaseInvoice, Customer, Outlet |
| GET | /organizations/outlets/all/ | `AllOutletsView.get` :18 | same | none | `{success,data:[{id,name,city,state,phone}]}` of caller's org | Outlet |
| GET | /organizations/{uuid}/ | `OrganizationDetailView.get` :94 | same | none | org + outlets[{id,name,city,state,gstin,phone}] | Organization, Outlet |
| GET | /organizations/{org_id}/outlets/ | `OrganizationOutletListView.get` :132 | same | none | `{success,data:[outlet..]}` | Outlet |
| POST | /organizations/{org_id}/outlets/ | `.post` :162 | same | body `name,address,city,state,pincode,gstin,drug_license_no,phone` (snake keys; uniqueness pre-check on gstin & DL) | 201 `{success,data:{id,name}}` | Outlet |

#### A.10 gst (`gst/urls.py`, prefix `/api/v1/gst/`; ALL use DRF `IsAuthenticated`, outlet = `request.user.outlet`; `reports/gst_urls.py` also mounted at the same prefix: periods/, summary/, reconciliation/, export/... belong to the reports fragment)

| Method | Full path | Handler | Request | Response | Tables |
|---|---|---|---|---|---|
| GET | /gst/tax-slabs/ | `TaxSlabListView.get` gst/views.py:737 | none | `[{id,rate,description,is_active,effective_from,effective_to}]` | TaxSlab |
| GET | /gst/sandbox/status/ | `SandboxStatusView.get` :124 | none | `{is_configured,provider_mode,environment,outlet_name,masked_gstin,masked_username,provider,auth_status(UNAUTHENTICATED|AUTHENTICATED|OTP_PENDING),session_expiry,otp_cooldown_active,next_otp_allowed_at,gstin_matches_outlet}` or `{is_configured:false,error}` | SandboxConfiguration, GstTaxpayerAuth |
| POST | /gst/sandbox/request-otp/ | `SandboxRequestOTPView.post` :183 | none | `{status:"OTP_REQUESTED",message,retry_after_seconds:60,next_allowed_at}`; 422/429/500 `{error}` | GstTaxpayerAuth |
| POST | /gst/sandbox/verify-otp/ | `SandboxVerifyOTPView.post` :235 | body `{otp}` | `{status:"AUTHENTICATED",masked_gstin,outlet_name,session_expiry,next_action}`; env `MOCK_SANDBOX_DATA=true` accepts ANY otp and stores a fake session token | GstTaxpayerAuth |
| POST | /gst/sandbox/gstr2b/sync/ | `GSTR2BSyncView.post` :282 | body `{period: MMYYYY}` | 202 `{job_id,status,period,masked_gstin,status_url}`; 401 `{error_code:OTP_REQUIRED}`; 409 if IN_PROGRESS; enqueues Celery `sync_gstr2b_job` | GSTR2BImportJob(reports), GstTaxpayerAuth |
| GET | /gst/sandbox/gstr2b/status/ | `GSTR2BStatusView.get` :339 | q `period` | `{job_id,status,period,retrieval_timestamp,record_count,hash,error_metadata}` or `{status:NOT_RETRIEVED}` | GSTR2BImportJob |
| POST | /gst/sandbox/reconciliation/run/ | `GSTR2BReconciliationRunView.post` :380 | body `{period}` | `{message,run_id,summary}` (sync run of `run_advisory_reconciliation`) | ITCReconciliationRun/Result, GSTR2BData, PurchaseInvoice, GSTTransactionSnapshot |
| GET | /gst/audit/ | `GSTExportAuditView.get` :33 | q `period,export_type,page`(page size 20) | `{count,next,previous,results:[{id,export_type,export_type_display,period,timestamp,template_version,status,output_file_hash,source_hash,generated_by}]}`; `reports.export_gst` permission is checked but ignored (`pass`) | GSTExportAudit(reports) |
| GET | /gst/gstr1-invoices/ | `GSTR1InvoicesView.get` :421 | q `report_type(all|b2b|b2c)`,`tax_filter(all|with_gst|without_gst)`,`start_date|start|from`,`end_date|end|to` | `[{id,invoice_no,customer_name,gstin,taxable_value,igst,cgst,sgst,total}]`; falls back to GSTTransactionSnapshot when no SaleInvoice rows | SaleInvoice, Customer, GSTTransactionSnapshot |
| GET | /gst/periods/{fp}/gstr2b-reconciliation/ | `GSTR2BReconciliationDataView.get` :554 | none | `[{id,supplier_name,supplier_gstin,invoice_no,invoice_date,pr_taxable,gstr2b_taxable,pr_itc,gstr2b_itc,status,itc_availability_status,ims_status}]` | ITCReconciliationRun/Result, GSTR2BData, GSTTransactionSnapshot |
| GET | /gst/periods/{fp}/gstr2a-warning/ | `GSTR2AWarningView.get` :638 | fp = MMYYYY | `[{supplier_name,invoice_no,pr_taxable,pr_itc,portal_status(UPLOADED|PENDING_SUPPLIER_UPLOAD)}]` | PurchaseInvoice, GSTR2BData |
| GET | /gst/validate/{mmyyyy}/gstr1/ | `GSTR1ValidationView.get` :689 | none | `{warnings:[{invoice_no,issue}]}` (missing HSN / tax rate / POS) ; BROKEN, see notes | GSTTransactionSnapshot |

Celery: `gst/tasks.py` `sync_gstr2b_job(job_id)` (bind, max_retries=3) pulls GSTR-2B through `get_active_provider()` (`gst/provider/__init__.py`, only `SandboxGstProvider`), normalizes, upserts `GSTR2BData`.

#### A.11 integrations / compliance / apps/apps/gst (no HTTP routes)
- `apps/integrations/sandbox/{client,einvoice,ewaybill}.py`: outbound HTTP client to sandbox.co.in (`/authenticate`, `/gst/compliance/e-invoice/tax-payer/invoice[...]`, `/gst/compliance/e-way-bill/consignor/bill`); `SandboxAPIClient` caches platform token in Django cache for 5.5h, retries 3x on 429/5xx incl. POST. Used by `billing/sale_services.py:37-39`, `billing/sale_update_service.py:95`, `billing/views.py:66`, `gst/provider/sandbox.py:9`.
- `apps/compliance/services/sandbox_auth.py`: `SandboxAuthService` (platform JWT, NIC e-invoice token, e-way token) used only by `integrations/sandbox/ewaybill.py:3`.
- `apps/apps/gst/` contains only empty `__init__.py` files (stray nested path, dead).
- Neither `integrations` nor `compliance` is in `INSTALLED_APPS` and neither has `__init__.py` at app root (works as implicit namespace packages; no models/migrations).

### 4.2 billing


36 routes: 31 in `urls.py` (some multi-method), 3 in `accounts_urls.py`, 2 in root conf. All prefixed `/api/v1/`. `views.py` = `apps/backend/apps/billing/views.py`.

| Method(s) | Full path | Handler (file:line) | Auth/permission | Request body / query | Response shape | Models/tables touched |
|---|---|---|---|---|---|---|
| GET | `/api/v1/invoice-number/` | `NextInvoiceNumberView` views.py:40 | IsAuthenticated | q: `outletId` | `{invoiceNo,isPreview:true}`; 404 `{detail}` | Outlet (row lock), SaleInvoice (read) |
| GET | `/api/v1/sales/invoices/search/` | `SaleInvoiceSearchView` views.py:4222 | IsAuthenticated | q: `outletId`(req), `q`, `customerId` | `{data:[{id,invoiceNo,date,customerName,customerId,doctorName,hospitalName,grandTotal,items[]}]}` max 10; falls back to `accounts.JournalEntry` (source_type SALE) rows flagged `isDaybook,defaultGstRate` | SaleInvoice, SaleItem, accounts.JournalEntry/JournalLine |
| GET | `/api/v1/sales/returns/<uuid:pk>/print/` | `SalesReturnPrintView` views.py:3985 | IsManagerOrAbove | q: `outletId` | `{success,data:{returnNo,returnDate,originalInvoiceNo,customerName,items[productName,batchNo,qtyReturned,packSize,returnRate,totalAmount],totalAmount,refundMode,reason,outletName,outletGSTIN}}`; item amounts pro-rated by `total/gross` when a deduction exists | SalesReturn, SalesReturnItem, SaleItem |
| GET, PUT | `/api/v1/sales/returns/<uuid:pk>/` | `SalesReturnDetailView` views.py:3897 (get 3901, put 3955) | IsManagerOrAbove | GET q: `outletId`. PUT body: `outletId,expectedUpdatedAt,revisionReasonCode*,revisionReasonText*,refundMode,reason,deductionAmount,items[{originalSaleItemId,qtyReturned\|qtyStrips/qtyLoose,returnRate,totalAmount}]` | GET `{success,data:{id,returnNo,returnDate,originalInvoiceNo,originalSaleId,customerId,customerName,totalAmount,deductionAmount,grossAmount,refundMode,reason,items[],createdAt,updatedAt}}`. PUT `{success,data:{id,returnNo,totalAmount,refundMode,reason,updatedAt}}`; 409 on stale edit, 400 on ValidationError | SalesReturn, SalesReturnItem, SaleItem, LedgerEntry, Customer, Batch (via stock ledger rebuild), StockLedger, audit |
| GET | `/api/v1/sales/returns/` | `SalesReturnListView` views.py:3843 | IsManagerOrAbove | q: `outletId`, `from`, `to`, `customerId` | `{success,data:[{id,returnNo,returnDate,originalInvoiceNo,customerName,totalAmount,deductionAmount,refundMode,reason,createdAt}],meta:{total,totalAmount}}` (not paginated) | SalesReturn, SaleInvoice, Customer |
| POST | `/api/v1/sales/return/` | `CreateSalesReturnView` views.py:3813 | IsManagerOrAbove | body: `outletId,originalSaleId?,returnDate,refundMode(cash\|upi\|credit_note),reason,overrideReason,deductionAmount,items[{saleItemId,batchId,qtyReturned\|qtyStrips+qtyLoose,packSize,returnRate}]` | 201 `{success,data:{id,returnNo,totalAmount,returnDate}}`; 400 `{error:{code:RETURN_ERROR,message}}` | SalesReturn, SalesReturnItem, SaleItem.qty_returned, Batch, StockLedger, LedgerEntry, Customer.outstanding, accounts.JournalEntry (reversal), audit.ActivityEvent |
| GET | `/api/v1/sales/<uuid:sale_id>/print/` | `SalePrintView` views.py:2855 | IsAuthenticated | q: `outletId`(req) | `{id,invoiceNo,invoiceDate,grandTotal,paymentMode,customer{name,phone,address}\|null,outlet{name,address,phone,gstin,drugLicenseNo},billedBy,items[productName,composition,batchNo,expiryDate,qty,mrp,saleRate,discountPct,gstRate,totalAmount]}` | SaleInvoice, SaleItem, Outlet |
| GET | `/api/v1/sales/<uuid:sale_id>/items/` | `SaleItemsView` views.py:2044 | IsAuthenticated | none (no outletId) | `{data:[{id,productName,qtyStrips,qtyLoose,totalQty(units),rate,discountPct,totalAmount,packSize,packUnit,batchNo,expiryDate,gstRate,landingCost}]}`. If id is not a SaleInvoice it falls back to JournalEntry/Voucher/`ob-` synthetic rows | SaleInvoice, SaleItem, Batch, PurchaseItem (landing cost), accounts.JournalEntry/Voucher |
| GET, PUT | `/api/v1/sales/<uuid:sale_id>/` | `SaleDetailView` views.py:2964 (get 2976, put 3147) | GET IsAuthenticated; PUT `CanEditSalesInvoice` (get_permissions 2971) | GET q: `outletId?`. PUT body = sale payload (see SaleCreate) + `outletId*,revisionAction,revisionReasonCode,revisionReasonText` | GET: full invoice incl. `outlet{}`, `customer{}`, `scheduleHData`, `items[batchId,productId,name,...,qtyReturned,saleItemId,purchaseRate,landingRate,ptr,pts]`, `hasReturns,returnCount,returnTotal,returnSummary,hasLaterPayments,sale_type/saleType`. Legacy ids resolved via Redis key `legacy_sale_map:<id>`. PUT: `build_sale_response_payload` + `message,revisionId` | SaleInvoice, SaleItem, InvoicePayment, Batch, StockLedger, CreditAccount/Transaction, LedgerEntry, Customer, JournalEntry, audit DocumentRevisionV2/ActivityEvent |
| GET | `/api/v1/sales/<uuid:sale_id>/eway-bill-pdf/` | `EwayBillPdfDownloadView` views.py:69 | IsAuthenticated | none | PDF attachment `EwayBill_<no>.pdf`; 400 `{detail}` | SaleInvoice (eway_bill_no); Sandbox API |
| POST | `/api/v1/sales/<uuid:sale_id>/patch-ewb/` | `PatchEwbView` views.py:94 | `permission_classes=[]` (see D: only DRF auth classes apply, no permission check) | body: `eway_bill_no*` | `{detail,eway_bill_no}`. Sets `eway_bill_no` and `irn_status='GENERATED'` | SaleInvoice |
| POST | `/api/v1/sales/<uuid:sale_id>/retry-einvoice/` | `RetryEinvoiceView` views.py:113 | none declared (DRF default IsAuthenticated) | none | `SaleInvoiceSerializer` data; 400 if irn exists or status not FAILED/PENDING | SaleInvoice; Sandbox einvoice |
| GET | `/api/v1/sales/<uuid:sale_id>/modification-options/` | `SaleModificationOptionsView` views.py:4381 | IsAuthenticated | q: `outletId` or header `OutletId` | `{invoice{id,invoiceNo,date,customerName,itemCount,grandTotal,amountPaid,balanceDue,hasReturns,isPaid},allowedActions[],blockReason}` | SaleInvoice, SaleItem |
| POST | `/api/v1/sales/<uuid:sale_id>/revise/` | `SaleReviseView` views.py:3211 (`@transaction.atomic`) | IsAuthenticated + per-action `has_bill_revision_permission` | body: `outletId,revisionAction*(direct_revise\|commercial_correction\|paid_bill_correction\|return_aware_correction\|header_correction\|cancel_and_reissue\|standard_correction),revisionReasonCode*,revisionReasonText*` + full sale payload | `build_sale_response_payload` + `message,revisionId` | same as PUT `/sales/<id>/`; cancel_and_reissue also creates a new SaleInvoice |
| GET | `/api/v1/sales/revisions/report/` | `SaleRevisionReportView` views.py:4567 | IsAuthenticated + CanViewBillRevisionHistory | q: `outletId`/header, `fromDate`,`toDate` (YYYY-MM-DD; default last 30d) | `{summary{modifiedToday,totalModified,returnLinked,paidBillCorrections,cancelAndReissue,commercialCorrections,directRevise},topModifiers[{id,name:'User',count}]}` | audit.DocumentRevisionV2 |
| GET, POST | `/api/v1/sales/` | `SalesView(SaleListView, SaleCreateView)` urls.py:32 -> `SaleListView.get` views.py:1443, `SaleCreateView.post` views.py:289 | effective `IsAuthenticated` for both verbs (MRO uses `SaleListView.permission_classes`; `SaleCreateView`'s `IsBillingStaffOrAbove` is shadowed, see D) | GET q: `outletId`(req), `startDate\|start_date`, `endDate`, `customerId`, `doctorId`, `hospitalName`, `saleType`, `search`, `paymentMode`, `isModified\|modified\|status`, `ordering`, `page`, `pageSize`(max 200). POST body: `outletId*,items*[{batchId,productId,qtyStrips,qtyLoose,freeQtyStrips,rate,discountPct,gstRate,taxableAmount,gstAmount,totalAmount,saleMode,scheduleType}],customerId,partyLedgerId,createNewCustomer,customerName/Phone/Address,doctorId,hospitalName,prescriptionNo,scheduleHData{patientName,patientAge,patientAddress,doctorName,doctorRegNo,prescriptionNo},subtotal,discountAmount,extraDiscountPct,grandTotal,payments[{method,amount,referenceNo,ledgerId}]\|cashPaid/upiPaid/cardPaid/creditGiven,paymentMode,saleType,billingBasis,invoiceDate,billedBy,transporterId,vehicleNo,transDistance,transMode,vehicleType,quotationId` | GET `{data:[invoice rows incl. invoiceCost,invoiceProfit,isModified,revisionCount,payments[],irn,irn_status,eway_bill_no],analytics{totalRevenue,netRevenue,salesReturnAmount,totalCost,totalProfit,cashCollected,upiCollected,cardCollected,creditGiven,customerOutstanding,...},pagination{page,pageSize,totalPages,totalRecords}}`; if filtering by customer with zero invoices it substitutes accounts ledger/voucher rows. POST 201 `build_sale_response_payload` (views.py:140); 400 codes `DEACTIVATED_GST_RATE`,`LOSS_SALE_PREVENTED` | SaleInvoice, SaleItem, InvoicePayment, ScheduleHRegister, Batch, StockLedger, CreditAccount, CreditTransaction, LedgerEntry, Customer, accounts.Ledger/LedgerGroup, JournalEntry, Quotation, core.TaxSlab, OutletSettings |
| GET, POST | `/api/v1/sales/drafts/` | `DraftInvoiceListCreateView` views.py:4644 (generics.ListCreateAPIView) | IsAuthenticated | GET q: `outletId` (none -> empty). POST: DraftInvoiceSerializer (`outlet,customer,doctor,hospital_name,prescription_no,draft_status,subtotal,...,items[{batch,qty_strips,qty_loose,discount_pct}],payment_mode,schedule_h_json`) | DRF paginated list / created object (snake_case) | DraftInvoice, DraftInvoiceItem |
| GET, PUT, PATCH, DELETE | `/api/v1/sales/drafts/<uuid:pk>/` | `DraftInvoiceDetailView` views.py:4657 | IsAuthenticated | optional q `outletId`; body as above | snake_case object | DraftInvoice, DraftInvoiceItem (items fully replaced on update) |
| GET | `/api/v1/revisions/` | `SaleRevisionListView` views.py:4448 | IsAuthenticated + CanViewBillRevisionHistory | q: `outletId`/header, `userId`,`actionType`,`fromDate`,`toDate`,`invoiceId`,`export=csv`,`pageSize`(20); `customerId`/`invoiceNo` accepted but ignored | paginated `DocumentRevisionV2LegacyAdapterSerializer`, or CSV | audit.DocumentRevisionV2 |
| GET | `/api/v1/credit/` | `CreditAccountListView` views.py:2713 | IsAuthenticated | q: `outletId`(req), `page`,`pageSize`(50, uncapped),`search`,`status` | `{data:[{id,customerId,customer{id,name,phone,address,isChronic,totalPurchases},outletId,creditLimit,totalOutstanding,totalBorrowed,totalRepaid,status,lastTransactionDate,createdAt}],pagination{...}}`; side effect: calls `sync_all_credit_accounts()` when outlet has none | CreditAccount, Customer, (sync: Ledger, JournalLine, VoucherLine, CreditTransaction) |
| GET | `/api/v1/credit/accounts/<uuid:account_id>/` | `CreditAccountDetailView` views.py:2810 | IsAuthenticated | none | single account object (same shape + customer) | CreditAccount, Customer |
| GET | `/api/v1/credit/<uuid:account_id>/transactions/` | `CreditTransactionListView` views.py:3392 | IsAuthenticated | q: `outletId`(req) | array `[{id,creditAccountId,customerId,invoiceId,type,amount,description,balanceAfter,recordedBy,createdAt,date}]` | CreditTransaction, CreditAccount |
| GET | `/api/v1/credit/<uuid:customer_id>/ledger/` | `CreditLedgerView` views.py:3433 | IsAuthenticated | q: `outletId`(req); path id is a Customer id | array `[{id,date,entryType,referenceNo,description,debit,credit,runningBalance,createdAt}]` | LedgerEntry, Customer |
| PATCH | `/api/v1/credit/<uuid:pk>/limit/` | `UpdateCreditLimitView` views.py:3778 | IsAuthenticated (any role) | body: `creditLimit*`, `outletId` | `{success,data:{id,creditLimit,outstandingBalance}}`; path pk is a Customer id; writes `Customer.credit_limit`, not `CreditAccount.credit_limit` | Customer |
| POST | `/api/v1/credit/payment/` | `CustomerCreditPaymentView` views.py:2157 | IsAuthenticated | q/body: `outletId`; body `creditAccountId*,amount*,mode\|paymentMode,reference,notes,paymentDate` | 201 CreditAccount shape + `voucher_no`; errors `{error:{code,message}}` (OUTLET_NOT_FOUND, ACCOUNT_NOT_FOUND, INVALID_AMOUNT, OVERPAYMENT, LEDGER_NOT_FOUND, VOUCHER_ERROR) | accounts.VoucherService.create_voucher (-> Voucher, Ledger, CreditAccount via hooks), Ledger |
| GET, POST | `/api/v1/receipts/` | `ReceiptListCreateView` views.py:3479 | IsAuthenticated | GET q: `outletId`,`customerId`,`from`,`to`. POST body: `outletId,customerId*,totalAmount*,date*,paymentMode,referenceNo,notes,allocations*[{saleInvoiceId,allocatedAmount}]` | GET `{success,data:[{id,customerId,customerName,date,totalAmount,paymentMode,referenceNo,notes,createdAt}],meta{total}}`. POST 201 `{success,data:{id,referenceNo,totalAmount,date}}`; 400 `{error:{code:RECEIPT_ERROR}}` | ReceiptEntry, ReceiptAllocation, SaleInvoice(amount_paid/due), Customer.outstanding, LedgerEntry, audit |
| POST | `/api/v1/credit/<uuid:id>/reminder/` | `SendReminderView` views.py:4038 | IsAuthenticated | body: `channel`(whatsapp),`message`; URL kwarg is `id` but handler signature is `pk` (see D) | `{success,data:{notificationId,channel,status:'pending',message}}` | NotificationLog, CreditAccount |
| GET | `/api/v1/dashboard/daily/` | `DashboardDailyView` views.py:2353 | IsAuthenticated | q: `outletId`(req), `date`, `startDate`+`endDate` | `{date,startDate,endDate,totalSales,totalBills,salesReturnAmount,salesReturnCount,cashCollected,upiCollected,cardCollected,creditGiven,totalDiscount,totalGst,topSellingItems[],staffLeaderboard[],hourlySales[],paymentBreakdown{},alerts{lowStock,expiringSoon,overdueAccounts}}` | SaleInvoice, SaleItem, SalesReturn, accounts.JournalLine/Ledger, Batch, CreditAccount |
| GET, POST | `/api/v1/quotations/` | `QuotationListCreateView` quotation_views.py:12 | IsBillingStaffOrAbove | GET q: `outletId` (optional; none = all outlets). POST camelCase body: `outletId*,customerId\|partyLedgerId,doctorName,hospitalName,saleType,billingBasis,placeOfSupply,isInterstate,transporterId,vehicleNo,discountAmount,extraDiscountPct,taxableAmount,cgstAmount,sgstAmount,igstAmount,grandTotal,notes,valid_until,items[{batchId,qtyStrips,qtyLoose,freeQtyStrips,freeQtyLoose,discountPct,gstRate,taxableAmount,gstAmount,totalAmount,hsnCode,rate,ptr,pts}]` | camelCase (via `convert_dict_to_camel_case`) un-paginated array / 201 object + `invoiceNo=quotationNo`; `customer` expanded `{id,name,phone}` | Quotation, QuotationItem, Batch (snapshot), Customer, Ledger |
| GET, PUT, PATCH, DELETE | `/api/v1/quotations/<uuid:pk>/` | `QuotationDetailView` quotation_views.py:191 | IsBillingStaffOrAbove | body as above (partial=True always); blocked when status='converted' | camelCase object | Quotation, QuotationItem |
| POST | `/api/v1/quotations/<uuid:pk>/convert/` | `QuotationConvertView` quotation_views.py:306 (`@transaction.atomic`) | IsBillingStaffOrAbove | body optional: `doctorId,doctorName,hospitalName,prescriptionNo,scheduleHData,paymentMode,cashPaid,upiPaid,cardPaid,creditGiven,amountPaid,amountDue` | 201 = SaleCreate response; sets quotation `status=converted,converted_at,converted_to_invoice` | Quotation, then everything SaleCreateView touches |
| GET | `/api/v1/outstanding/distributors/` | `DistributorOutstandingSummaryView` views.py:3554 | IsAuthenticated | q: `outletId` | `{success,data:[{distributorId,distributorName,totalOutstanding,overdueAmount,invoiceCount,oldestDueDate}],meta{total}}` | purchases.Distributor, purchases.PurchaseInvoice |
| GET | `/api/v1/outstanding/customers/` | `CustomerOutstandingSummaryView` views.py:3597 | IsAuthenticated | q: `outletId` | `{success,data:[{customerId,customerName,phone,totalOutstanding,overdueAmount,creditLimit,lastPaymentDate}],meta}` | Customer, SaleInvoice, ReceiptEntry |
| GET, POST | `/api/v1/expenses/` | `ExpenseListCreateView` views.py:3636 | IsAuthenticated | GET q: `outletId`,`from`,`to`,`head`. POST body: `outletId,date*,expenseHead*,customHead(req if 'other'),amount*,paymentMode,referenceNo,notes` | `{success,data,meta{total,totalAmount,breakdown{head:amt}}}`; POST 201 `{success,data:{...}}` | ExpenseEntry |
| POST | `/api/v1/notifications/low-stock/` | `LowStockAlertView` views.py:4086 (root urls.py:28) | IsAuthenticated | none (uses `user.outlet_id`) | intended `{success,data:[{productId,productName,batchNo,currentStock,minQty,reorderQty}],meta{total}}`; currently raises NameError (see D) | inventory.Batch, MasterProduct |
| POST | `/api/v1/migrate/marg/` | `MargMigrationView` views.py:4131 (root urls.py:30; `@db_transaction.atomic`) | IsAuthenticated (any role) | multipart `file` CSV columns ProductName,HSNCode,BatchNo,ExpiryDate,MRP,PurchaseRate,SaleRate,Qty,PackSize,Manufacturer,Category,PackUnit | `{success,data:{imported,skipped,errors[{row,error}]}}`; aborts (500, rollback) at 10 errors | inventory.MasterProduct (get_or_create by hsn_code), Batch |

Defined but NOT routed (dead views): `CustomerLedgerView` views.py:3722 (docstring says `/customers/{id}/ledger/`; it is imported in `urls.py` but has no `path()`), `SaleRevisionDetailView` views.py:4528 (docstring `/billing/sales/<id>/revisions/`; neither imported nor routed).

Helper (not a route): `build_sale_response_payload(sale_invoice, message=None, revision_id=None)` views.py:140. It returns camelCase fields plus mixed snake_case keys `sale_type` and `billing_basis`. `isModified` is computed from DocumentRevisionV2, DocumentRevision and BillRevision.

### 4.3 inventory & purchases

Conventions: `outletId` is almost always a required query param (GET) or body field (POST/PUT). camelCase JSON in/out. Errors are mixed shapes: `{detail}`, `{error:{code,message}}`, `{errors:{field:msg}}`.

#### A1. inventory (`inventory/urls.py`, views in `inventory/views.py`)

| Method(s) | Full path | Handler (file:line) | Auth | Request / query | Response | Tables |
|---|---|---|---|---|---|---|
| PUT | /api/v1/batches/{batch_id}/ | BatchDetailUpdateView.put views.py:49/53 | IsManagerOrAbove | JSON subset of: batchNo, expiryDate(YYYY-MM-DD), mfgDate, mrp, purchaseRate, landingRate\|landing_rate, packSize, packUnit, packType, rackLocation. NO outletId filter | 200 serialize_batch(); 400 `{errors}`; 404 | inventory_batch (W) |
| GET | /api/v1/batches/{batch_id}/landing-cost/ | BatchLandingCostView.get views.py:22/26 | IsAuthenticated | none (outlet from request.user.outlet_id) | `{landing_cost, mrp, purchase_rate, gst_percent, freight_per_unit}` (strings) | inventory_batch, purchases_purchaseitem, core OutletSettings (R) |
| GET, POST | /api/v1/products/ | ProductListView views.py:208 (get :211, post :215) | IsAuthenticated (POST has no role gate) | POST JSON: name*, hsnCode*, packUnit*, packType(def strip), scheduleType(def OTC), gstRate (validated by TaxSlab.is_rate_active), packSize(>=1), mrp(>0), composition, manufacturer | GET: unpaginated list of ALL MasterProduct (serialize_product). POST 201 serialize_product / 400 `{errors}` | inventory_masterproduct (R/W), core_taxslab (R) |
| GET | /api/v1/products/search/ | ProductSearchView.get views.py:524/534 | IsAuthenticated | q (min 2 chars), outletId, context=purchase (includes expired batches) | `{data:[product+minQty,reorderQty,has_stock,totalStock,nearestExpiry,isLowStock,batches,available_batches]}` max 15 in-stock+10 zero-stock; cached 60s key `prod_search:v2:{outlet}:{ctx}:{q}` | masterproduct, batch, outletproductconfig (R) |
| GET | /api/v1/products/catalog/search/ | MasterCatalogSearchView.get views.py:730/740 | IsAuthenticated | q (min 2), outletId | `{data:[{id,name,composition,manufacturer,packSize,packUnit,packType,minQty,currentStock,mrp,purchaseRate=mrp*0.8}]}` max 30; cache 60s `prod_catalog_search:v2:*` | masterproduct, batch, outletproductconfig (R) |
| GET, PUT (PATCH permitted by get_permissions but no handler => 405) | /api/v1/products/{pk}/ | ProductDetailView views.py:296 (get_permissions :298, get :303, put :310) | GET IsAuthenticated; PUT/PATCH IsManagerOrAbove | PUT JSON subset: name, composition, manufacturer, hsnCode, gstRate, packSize, packUnit, packType, scheduleType, mrp, saleRate(=mrp), minQty, reorderQty, isFridge, isDiscontinued, barcode | serialize_product / `{errors}`; PUT calls `cache.clear()` (global) | masterproduct (W) |
| GET | /api/v1/products/{pk}/batches/ | ProductBatchesView.get views.py:442/445 | IsAuthenticated | outletId | list of serialize_batch (active, non-zero stock, expiry asc) | batch (R) |
| GET | /api/v1/inventory/ | InventoryListView.get views.py:826/839 | IsAuthenticated | outletId, page, pageSize(<=100,def 50), search, scheduleType, lowStock, expiringSoon(90d), sortBy(name\|stock\|expiry), sortOrder, productId, export_format(excel\|xlsx\|csv => always xlsx) | `{data:[product+batches], pagination}`; cache 120s `inventory:list:{outlet}:{md5}` unless productId | masterproduct, batch, outletproductconfig (R) |
| GET | /api/v1/inventory/alerts/ | InventoryAlertsView.get views.py:1111/1120 | IsAuthenticated | outletId | `{lowStock[],expiringIn30Days[],outOfStock[]}` | batch (R) |
| POST | /api/v1/inventory/adjust/ | InventoryAdjustView.post views.py:1228/1237 | IsManagerOrAbove | query outletId; body batchId, type(any str), qty(int, +/-), reason, pin*, adjustUnit(strips\|loose) | `{success,message}`; 400/401(INVALID_PIN)/404/500 | batch (W), inventory_stockledger (W), auto inventory_stockadjustment(+allocation) on ADJUSTMENT_OUT, audit log |
| GET | /api/v1/inventory/export/excel/ | InventoryExportExcelView.get views.py:466/469 | IsManagerOrAbove | outletId | xlsx `Batch-Details.xlsx` | batch (R) |
| POST | /api/v1/inventory/outlet-configs/ | OutletProductConfigView.post views.py:1706/1709 | IsManagerOrAbove | body outletId, productId, minQty, reorderQty | `{status:'success'}` / `{error}` 400 | outletproductconfig (W) |
| GET | /api/v1/inventory/stockledger/batches/ | StockLedgerBatchesView.get views.py:1429/1437 | IsAuthenticated | outletId\|outlet_id | list `{batch_id,batch_number,product_name,qty_remaining,pack_size,expiry_date}` | batch (R) |
| GET | /api/v1/inventory/stockledger/ | StockLedgerView.get views.py:1464/1470 (export_xlsx :1598) | IsAuthenticated | outletId*, batchId, productId, startDate\|date_from, endDate\|date_to, search, txnType, page, pageSize, export_format=xlsx (both camel/snake accepted) | `{data:[ledger rows snake_case],summary,pagination}` or xlsx | inventory_stockledger (R) |
| POST | /api/v1/inventory/batches/availability-check/ | BatchAvailabilityCheckView.post views.py:1644/1659 | IsAuthenticated | JSON list `[{batchId,qtyStrips,qtyLoose}]` (outlet = request.user.outlet_id) | list `{batchId,availableQtyStrips,availableQtyLoose,status: AVAILABLE\|LOW_STOCK\|BATCH_EXPIRED\|BATCH_UNAVAILABLE}` | batch (R) |

Helpers in same file: `serialize_product` :148, `_canonical_pack_type` :175, `serialize_batch` :183.

#### A2. purchases (`purchases/urls.py`, views in `purchases/views.py`)

Route order in urls.py matters only cosmetically (uuid converters vs literal segments do not collide).

| Method(s) | Full path | Handler (file:line) | Auth | Request / query | Response | Tables |
|---|---|---|---|---|---|---|
| POST (multipart) | /api/v1/purchases/scan/upload/ | InvoiceScanUploadView.post views.py:2099/2121 | CanCreatePurchases | form outletId, image\|file\|invoice_image | 202 `{draftId,status:'processing',message}`; 400 MISSING_OUTLET/MISSING_IMAGE; 404; 503 OCR_QUEUE_UNAVAILABLE. Creates SAVED PurchaseInvoice + enqueues celery `purchases.process_invoice_ocr` | purchases_purchaseinvoice (W), media/purchase_invoices/%Y/%m/ |
| GET | /api/v1/purchases/{purchase_id}/ocr-status/ | InvoiceOCRStatusView.get views.py:2244/2300 | CanAccessPurchases | outletId (draft must be status SAVED) | 200 `{status:'processing'}` \| `{status:'error',code,message}` \| `{status:'ready',draftId,invoiceImageUrl,confidence,warnings,header{...,partyLedger},items[],totals}`; 404 | purchaseinvoice, distributor, accounts Ledger (R) |
| POST | /api/v1/purchases/{purchase_id}/ocr-retry/ | InvoiceOCRRetryView.post views.py:2202/2206 | CanCreatePurchases | outletId (body or query) | 202 processing / 200 ready / 400 OCR_IMAGE_MISSING / 404 / 503 | purchaseinvoice (W) |
| POST | /api/v1/purchases/{purchase_id}/confirm/ | InvoiceDraftConfirmView.post views.py:2451/2464 | CanCreatePurchases | body = full CreatePurchasePayload (see C1) + optional `_learnedColumnMap` | 201 PurchaseInvoiceFull (+invoiceImageUrl); 400 PURCHASE_ERROR; 404; 500 | atomic_purchase_save tables + distributor.ocr_column_map (W); deletes draft |
| GET | /api/v1/purchases/check-invoice/ | CheckPurchaseInvoiceView.get urls.py:32/35 | IsAuthenticated (DRF's) | outletId, invoiceNo, partyLedgerId | `{exists:bool}` (swallows all errors => false) | purchaseinvoice, accounts Ledger (R) |
| GET | /api/v1/purchases/invoices/search/ | PurchaseInvoiceSearchView.get views.py:1419/1423 | CanAccessPurchases | outletId*, q (invoice_no/distributor name) | `{data:[{id,invoiceNo,date,distributorName,distributorId,grandTotal,items[{productName,batchId,batchNo,expiry,qty,availableQty,rate,purchaseRate,gstRate}]}]}` top 20 | purchaseinvoice, item, batch (R) |
| GET, POST | /api/v1/purchases/orders/ | PurchaseOrderListView views.py:1697 (get :1703, post :1752) | IsAuthenticated | GET outletId*, search, distributorId, startDate, endDate, status. POST outletId, distributorId, items[{productId,orderQty\|deficit,estimatedPtr\|lastRate}] | GET `{results:[{id,poNumber,status,distributorName,orderDate,totalAmount}]}`; POST 201 `{id,poNumber}` | purchaseorder(+item) |
| GET, PUT | /api/v1/purchases/orders/{pk}/ | PurchaseOrderDetailView views.py:1807 (get :1814, put :1850) | IsAuthenticated | outletId (query for GET, body for PUT); PUT items[] replaces all items | GET PO+items; PUT `{detail}` | purchaseorder(+item) |
| GET | /api/v1/purchases/orders/{pk}/export/excel/ | PurchaseOrderExcelExportView.get views.py:1892/1898 | IsAuthenticated | outletId | xlsx file | purchaseorder (R) |
| GET | /api/v1/purchases/orders/{pk}/export/pdf/ | PurchaseOrderPdfExportView.get views.py:1993/1999 | IsAuthenticated | outletId | PDF (reportlab) `PO_{po_number}.pdf` | purchaseorder (R) |
| GET | /api/v1/purchases/orders/suggestions/ | PurchaseOrderSuggestionsView.get views.py:1477/1483 | IsAuthenticated | outletId*, distributorId | `{data:[{productId,productName,manufacturer,packSize,packType,minQty,reorderQty,currentStock,onOrder,available,deficit,lastDistributorId/Name,estimatedPtr,lastPurchasePrice}]}` max 200 | masterproduct, batch, config, purchaseorderitem, purchaseitem (R) |
| POST | /api/v1/purchases/orders/bulk-create/ | PurchaseOrderBulkCreateView.post views.py:1627/1633 | IsAuthenticated | outletId, items[{productId,distributorId\|lastDistributorId,orderQty\|deficit,estimatedPtr}] | 201 `{detail,pos:[po_number]}`; one PO per distributor | purchaseorder(+item) (W) |
| GET, POST | /api/v1/purchases/ | PurchasesView(PurchaseListView, PurchaseCreateView) urls.py:63 -> PurchaseListView.get views.py:692, PurchaseCreateView.post views.py:459 | EFFECTIVE `CanAccessPurchases` for BOTH (MRO picks PurchaseListView.permission_classes; PurchaseCreateView's CanCreatePurchases is shadowed) | GET outletId*, distributorId, startDate, endDate, status(draft\|modified\|paid\|overdue\|partial\|unpaid\|all), isModified, search, ordering, page, pageSize(<=100). POST CreatePurchasePayload (C1) | GET `{data:[PurchaseInvoice summary + paymentMode,cashPaid,bankPaid,chequePaid,upiPaid,creditGiven,payments,isModified,revisionCount,ocrData?],pagination}`; POST 201 PurchaseInvoiceFull / 400 PURCHASE_ERROR / 404 / 500 | purchaseinvoice(+item), batch, stockledger, billing LedgerEntry, accounts Journal*, audit |
| GET, POST | /api/v1/purchases/payments/ | PaymentListCreateView(PaymentListView, DistributorPaymentView) urls.py:72 -> PaymentListView.get views.py:1334, DistributorPaymentView.post views.py:1019 | EFFECTIVE `CanAccessPurchases` for BOTH (DistributorPaymentView's IsManagerOrAbove shadowed by MRO) | GET outletId, distributorId, from, to. POST {outletId(query or body), distributorId, date, totalAmount, paymentMode, referenceNo, notes, allocations[{purchaseInvoiceId,allocatedAmount}]} | GET `{success,data[],meta}`; POST 201 PaymentEntry+allocations; 400 OVERPAYMENT_ERROR/PAYMENT_ERROR | billing PaymentEntry, PaymentAllocation, LedgerEntry, purchaseinvoice (W) |
| GET | /api/v1/purchases/distributors/{pk}/outstanding/ | DistributorOutstandingView.get views.py:1377/1384 | CanAccessPurchases | outletId | `{success,data:[{id,invoiceNo,invoiceDate,dueDate,grandTotal,amountPaid,outstanding,isOverdue,daysPastDue}],meta}` | purchaseinvoice (R) |
| GET, POST | /api/v1/purchases/distributors/ | DistributorListView views.py:22 (get :32, post :116) | CanAccessPurchases (POST also) | GET outletId; POST outletId, name, gstin, drugLicenseNo, foodLicenseNo, phone, email, address, city, state, creditDays, openingBalance, balanceType | GET list (+currentBalance from accounts Ledger); POST 201 distributor; auto-creates Sundry Creditors Ledger | distributor (W), accounts Ledger/LedgerGroup (R/W) |
| GET, PUT | /api/v1/purchases/distributors/{distributor_id}/ | DistributorDetailView views.py:193 (get :202, put :242) | CanAccessPurchases | GET outletId query; PUT body outletId + fields (name,gstin,drugLicenseNo,foodLicenseNo,phone,email,address,city,state,creditDays,openingBalance,balanceType,isActive) | distributor dict; PUT syncs state to linked Ledger | distributor (W), Ledger.state (W) |
| GET | /api/v1/purchases/distributors/{distributor_id}/ledger/ | DistributorLedgerView.get views.py:314/324 | CanAccessPurchases | outletId | `{distributor,entries[{id,date,entryType,referenceNo:'',description,debit,credit,balance}],openingBalance,closingBalance}` built from accounts JournalLine of linked Ledger | accounts Ledger, JournalLine, JournalEntry (R) |
| GET, PUT, DELETE | /api/v1/purchases/{purchase_id}/ | PurchaseDetailView views.py:1108 (get_permissions :1115, get :1120, put :1264, delete :1305) | GET/DELETE `IsAuthenticated` (custom); PUT `CanEditPurchaseInvoice` | GET outletId; PUT = CreatePurchasePayload + revisionReasonCode, revisionReasonText(>=10 chars), outletId; DELETE outletId (SAVED drafts only) | GET PurchaseInvoiceFull-like (+partyLedger,isModified,revisionCount); PUT `{message,id}`; DELETE 204 | purchaseinvoice/item/batch/stockledger/LedgerEntry/Journal*, audit revision |

Totals: inventory 15 routes (15 handler classes, 20 verb-handlers incl. ProductList GET/POST, ProductDetail GET/PUT); purchases 19 routes.

Registered-but-not-routed purchases view classes: none; all imported views appear in urls.py. `PurchaseCreateView`/`DistributorPaymentView` are only reachable through the combined `PurchasesView`/`PaymentListCreateView`.

### 4.4 reports (+ `/api/v1/gst/` routes owned by reports)

Auth for every route: JWT (`AuditJWTAuthentication`, header `Authorization: Bearer <access>`), see section G. DRF default pagination is NOT applied by any reports view (plain `APIView`s).

#### A.1 `/api/v1/reports/...` (R/urls.py)

| Method(s) | Full path | Handler (file:line) | Auth/permission | Query params/body | Response shape | Models/tables read |
|---|---|---|---|---|---|---|
| GET | `/api/v1/reports/erp/sales-book/` | `ConsolidatedSalesBookView.get` R/erp_views.py:105 | `IsAuthenticated`+`CanAccessReports` (core) | `outletId`/`outlet_id` (falls back to user's outlet), `startDate`/`start_date`/`from` (default today), `endDate`/`end_date`/`to` (default=start), `format`/`format_mode` = `detailed` (default) or `summarised`/`summarized`/`summary`, `lessReturns`/`less_returns` (default true) | JSON `{format, date_range{start_date,end_date}, less_returns, rows[], summary{...}}`. Detailed row: `date, bill_no, party_name, gstin, taxable, tax_5, tax_12, tax_18, tax_28, total_gst, exempted, round_off, net_total, is_return`. Summarised row: `date, bill_count, taxable, tax_5.., exempted, round_off, net_total` | SaleInvoice, SaleItem (+Batch, MasterProduct via prefetch), Customer, SalesReturn(+items) when less_returns |
| GET | `/api/v1/reports/erp/sales-book/export/` | `ConsolidatedSalesBookExportView.get` R/erp_views.py:134 | same | same | File: `.xlsx` (`Sales_Book_{Detailed|Summarised}_{start}_to_{end}.xlsx`), attachment | same |
| GET | `/api/v1/reports/erp/gross-profit/` | `GrossProfitReportView.get` R/erp_views.py:184 | same | same | JSON `{format, date_range, less_returns, rows[], summary{total_sales,total_cogs,gross_profit,..}}`. Row: `date, bill_no, party_name, net_sales, cogs, gross_profit, profit_pct, is_return` (return rows negative). Summarised: `date, bill_count, net_sales, cogs, gross_profit, profit_pct` | SaleInvoice, SaleItem, Batch (landing_rate/purchase_rate/pack_size), SalesReturn, SalesReturnItem |
| GET | `/api/v1/reports/erp/gross-profit/export/` | `GrossProfitReportExportView.get` R/erp_views.py:213 | same | same | `.xlsx` `Gross_Profit_{fmt}_{start}_to_{end}.xlsx` | same |
| GET | `/api/v1/reports/erp/sales-return-book/` | `SalesReturnBookView.get` R/erp_views.py:263 | same | same (lessReturns ignored) | JSON same envelope as sales book, rows are credit notes (`return_no`...) | SalesReturn, SalesReturnItem, Customer (via original_sale) |
| GET | `/api/v1/reports/erp/sales-return-book/export/` | `SalesReturnBookExportView.get` R/erp_views.py:292 | same | same | `.xlsx` `Sales_Return_Book_{fmt}_{start}_to_{end}.xlsx` | same |
| GET | `/api/v1/reports/erp/gross-loss-return/` | `GrossLossOnReturnView.get` R/erp_views.py:334 | same | same (lessReturns ignored) | JSON `{format, date_range, rows[], summary{return_count,total_return_amount,total_cogs,total_gross_loss,loss_pct}}`. Row: `date, return_no, party_name, return_amount, cogs, gross_loss, loss_pct`; summarised row has `return_count` | SalesReturn, SalesReturnItem, Batch |
| GET | `/api/v1/reports/erp/gross-loss-return/export/` | `GrossLossOnReturnExportView.get` R/erp_views.py:358 | same | same | `.xlsx` `Gross_Loss_On_Return_{fmt}_{start}_to_{end}.xlsx` | same |
| GET | `/api/v1/reports/erp/purchase-book/` | `PurchaseBookView.get` R/erp_views.py:401 | same (`BaseErpReportView`: IsAuthenticated+CanAccessReports) | q: `outletId`, `startDate`, `endDate`, `format`=detailed\|summarised, `lessReturns` (if omitted: false for Purchase Book, true when `variant=consolidated`; explicit value always wins) | JSON `{format, date_range, less_returns, rows[{date,bill_no,party_name,gstin,bill_amt,taxable,tax,tax_free,exempted,round_off,is_return}] (summarised: {date,bill_count (invoices),return_count (debit notes),bill_amt,...}); bill_amt = grand_total + ledger_adjustment (gross bill value); money accumulated as Decimal, emitted as 2dp floats, summary{total_bill_amt,total_taxable,total_tax,total_tax_free,total_exempted,total_round_off,bill_count,return_count,return_amount}}` | purchases.PurchaseInvoice (POSTED only), accounts.DebitNote (only when lessReturns; negated rows) |
| GET | `/api/v1/reports/erp/purchase-book/export/` | `PurchaseBookExportView.get` R/erp_views.py:434 | same | same + `variant=consolidated` (title/filename) | `.xlsx` Marg layout `DATE,BILL NO.,PARTY NAME,BILL AMT.,TAXABLE,TAX,TAX FREE,EXEMPTED,R.OFF` (`Purchase_Book_*` / `Consolidated_Purchase_Book_*`) | same |
| GET | `/api/v1/reports/erp/purchase-return-book/` | `PurchaseReturnBookView.get` R/erp_views.py:479 | same | q: `outletId`, `startDate`, `endDate`, `format` | JSON same shape as purchase-book, positive values, all rows `is_return=true` | accounts.DebitNote |
| GET | `/api/v1/reports/erp/purchase-return-book/export/` | `PurchaseReturnBookExportView.get` R/erp_views.py:509 | same | same | `.xlsx` `Purchase_Return_Book_{fmt}_{start}_to_{end}.xlsx` | same |
| GET | `/api/v1/reports/daily-snapshot/` | `DailySnapshotView.get` R/daily_snapshot_views.py:560 | core `IsAuthenticated` only (NOT CanAccessReports) | `outletId` (req), `startDate`, `endDate` (default=start), legacy `date` (default today) | JSON: `date,startDate,endDate,isSingleDay, financials{grossProfit,netProfit,totalSales,saleUpto,cumulativePurchase,stockValue}, salesBreakdown{openingCash,grossSales,saleReturn,creditSale,upi,phonePay,card,cashExpenses,expenses,cashPayments,cashPurchases,cashReceived,customerJama,cashIncome,cartonSale,cashRequired,actualCash,extraShort, details{grossSales[],saleReturn[],creditSale[],upi[],card[],cashExpenses[],cashPayments[],cashPurchases[],cashReceived[],cashIncome[]}}, cashState{openingCash,notes2000..notes10,pettyCashExp,sideCash,nextDayOpening}, fixedExpenses{...,totalMonthly,daysInMonth,perDay}, bills{first,last}, partners[{name,percentage,shareAmount}]`. Side effect: `get_or_create` DailyCashReport (single day) and FixedMonthlyExpense on a GET | SaleInvoice, SaleItem, SalesReturn(+Item), ReceiptEntry, PurchaseInvoice, Batch, Voucher/VoucherLine/Ledger/LedgerGroup, Partner, PartnerShareHistory, DailyCashReport, FixedMonthlyExpense |
| GET | `/api/v1/reports/daily-snapshot/export/` | `DailySnapshotExportView.get` R/daily_snapshot_views.py:632 | core `IsAuthenticated` | same as above | `.xlsx` `Daily_Report_{start}[_to_{end}].xlsx` (openpyxl, "DAILY REPORTING" layout, yellow/blue fills) | same as snapshot |
| POST | `/api/v1/reports/daily-snapshot/cash/` | `DailyCashReportView.post` R/daily_snapshot_views.py:578 | core `IsAuthenticated` | body `outletId`, `date` (req); optional `notes2000,notes500,notes200,notes100,notes50,notes20,notes10,sideCash,nextDayOpening,openingCash,cartonSale` | `{"status":"ok"}`; 400 empty body if outletId/date missing. No type validation | writes DailyCashReport (get_or_create outlet+date) |
| POST | `/api/v1/reports/daily-snapshot/fixed-expenses/` | `FixedMonthlyExpenseView.post` R/daily_snapshot_views.py:606 | core `IsAuthenticated` | body `outletId` (req) + `salary,rent,transport,petrol,light,water,internet,stationery,intOnCc,incomeTax,caFees,godown,other,daysInMonth` | `{"status":"ok"}` | writes FixedMonthlyExpense |
| GET | `/api/v1/reports/sales/daily/` | `SalesDailyReportView.get` R/views.py:55 | `CanAccessReports` | `outletId` (req, 404 if bad), `date` YYYY-MM-DD (default today) | JSON `{rows:[{date,invoiceCount,grossSales,totalSales(net),salesReturnAmount,salesReturnCount,totalDiscount,totalTax,paymentBreakdown{cash,upi,card,credit}}], summary:[{label,value,change,trend}], chartData:[{date,sales,grossSales,returns,bills}]}` | SaleInvoice (is_return False/True). Does NOT filter `is_cancelled` |
| GET | `/api/v1/reports/sales/summary/` | `SalesSummaryReportView.get` R/views.py:359 | `CanAccessReports` | `outletId`, `from`, `to` (bad dates silently ignored) | `{success, data{grossSales,totalSales(net),salesReturnAmount,salesReturnCount,totalInvoices,totalDiscount,totalGST,totalCashSales,totalUpiSales,totalCardSales,totalCreditSales,avgInvoiceValue,byDay[],topProducts[10],topStaff[10]}}` | SaleInvoice, SaleItem, Staff (billed_by) |
| GET | `/api/v1/reports/gst/gstr1/` | `GSTR1ReportView.get` R/views.py:213 | `CanAccessReports` | `outletId`, `from`/`start`/`start_date`, `to`/`end`/`end_date` (req; 400 if bad) | `{period{from,to,period:'custom'}, outletGstin, outletName, rows[HSN: hsnCode,productName,taxableAmount,cgstRate,cgstAmount,sgstRate,sgstAmount,igstRate,igstAmount,totalTax,totalAmount], totals{...}, gstSlabBreakup[{rate,taxableAmount,taxAmount}]}`. LEGACY live aggregation (not snapshot based) | SaleItem, SaleInvoice, Batch->MasterProduct (hsn_code), Customer.gstin, Outlet.gstin |
| GET | `/api/v1/reports/gst/gstr2/` | `GSTR2ReportView.get` R/views.py:472 | `CanAccessReports` | `outletId`, `from`, `to` | `{success, data{period(str), rows[distributorName,distributorGSTIN,invoiceNo,invoiceDate,taxableAmount,cgst/sgst/igstAmount,cessAmount,totalAmount], summary{totalTaxable,totalCGST,totalSGST,totalIGST,totalCess,grandTotal}}}` | PurchaseInvoice, Distributor |
| GET | `/api/v1/reports/gst/gstr3b/` | `GSTR3BReportView.get` R/views.py:548 | `CanAccessReports` | `outletId`, `month` YYYY-MM (req) | `{success,data{month,outwardSupplies,inwardSupplies,netTaxLiability,inputTaxCredit,netPayable}}` each `{cgst,sgst,igst,cess,total..}`. LEGACY simplified (ITC = purchase gst/2 as CGST+SGST, igst 0) | SaleInvoice (taxable/cgst/sgst/igst), PurchaseInvoice |
| GET | `/api/v1/reports/inventory/valuation/` | `InventoryValuationView.get` R/views.py:624 | core `IsAuthenticated` (comment: open to every role incl. billing_staff) | `outletId` | `{success,data{totalValuation,total_value_purchase,total_value_landing,total_value_mrp,totalProducts,products[{productId,productName,genericName,manufacturer,totalQty,valuation_purchase/landing/mrp,avgPurchaseRate,mrp,valuationAmount,batches[{batchNo,expiryDate,qty,qtyLoose,purchaseRate,landingRate,mrp,valuation_*}]}]},meta{generatedAt,outletId}}`. Redis cache 600 s, key `mf:stock_val:{outletId}` | Batch (is_active, qty_strips>0), MasterProduct |
| GET | `/api/v1/reports/inventory/movement/` | `InventoryMovementReportView.get` R/views.py:738 | `CanAccessReports` | `outletId`, `productId` (req), `from`, `to` | `{success,data{productId,productName,genericName,openingStock,closingStock,movements[{date,type purchase|sale,referenceNo,partyName,batchNo,qtyIn,qtyOut,balanceAfter}]}}` | Batch, MasterProduct, PurchaseItem, SaleItem |
| GET | `/api/v1/reports/expiry/` | `ExpiryReportView.get` R/views.py:849 | `CanAccessReports` | `outletId`, `days` int default 30 (non-int -> 500) | `{success,data{totalBatches,totalProducts,totalStockAtRisk,products[{productId,productName,genericName,manufacturer,batches[{batchNo,expiryDate,daysToExpiry,qtyStrips,mrp,purchaseRate,valuationAtRisk}]}]},meta{generatedAt,daysFilter}}`. Cache 600 s, key `mf:expiry:{outlet}:{days}` | Batch, MasterProduct |
| GET | `/api/v1/reports/staff/performance/` | `StaffPerformanceReportView.get` R/views.py:925 | `CanAccessReports` | `outletId`, `from`, `to` | `{success,data[{staffId,staffName,role,totalInvoices,totalSalesAmount,totalDiscountGiven,avgInvoiceValue,avgDiscountPct,salesByDay[]}],meta{from,to,topPerformer}}`. Cache 120 s. Per-staff query loop (N+1) | Staff, SaleInvoice |
| GET | `/api/v1/reports/balance-sheet/` | `BalanceSheetView.get` R/views.py:1008 | `CanAccessReports` | `outletId` (falls back to `request.user.outlet_id`; read via `request.GET`) | `{success,data{asOfDate,assets{currentStock,receivables,cashAndBank,otherAssets,totalAssets,breakdown},liabilities{payables,otherLiabilities,totalLiabilities,breakdown},netWorth}}` | Batch, Ledger, LedgerGroup (nature/name) |
| POST | `/api/v1/reports/gstr2a/` | `GSTR2AReconciliationView.post` R/views.py:1102 | `CanAccessReports` | body `gstin`, `from`, `to` (all req) | `{success,data{gstin,period,summary{ourInvoices,gstr2aInvoices,matched,ourOnly,gstr2aOnly,totalOurAmount,totalGstr2aAmount,totalVariance},matched[],ourOnly[],gstr2aOnly[],note}}`. GSTR-2A data is HARD-CODED MOCK (R/views.py:1134-1151) | PurchaseInvoice (by `outlet__gstin`), Distributor |
| GET | `/api/v1/reports/schedule/` | `ScheduleReportView.get` R/views.py:1227 | `CanAccessReports` | `outletId` (req), `schedule_type` (blank = all incl. OTC), `from`, `to`, `export_format=csv` | JSON `{success,data{scheduleType,sales[...47 fields incl. patient/doctor/Rx register],purchases[],saleSummary[],purchaseSummary[]}}` or `text/csv` attachment `schedule_{type|all}_report.csv` (CSV is a flattened subset) | SaleItem, SaleInvoice, Customer, Doctor, Staff, Batch, MasterProduct, ScheduleHRegister, PurchaseItem, PurchaseInvoice, Distributor |
| GET | `/api/v1/reports/batch-wise/` | `BatchWiseReportView.get` R/views.py:1470 | `CanAccessReports` | `outletId` (req), `report_type` = `current_stock`(default)/`movement`/`near_expiry`/`expired`/`zero_stock`, `date_from`, `date_to`, `search`, `product_id`, `expiry_within_days` default 90 | `{success, ...BatchWiseReportService output (rows, totals)}`. Cache 300 s, key hashed from all params. Any exception -> 500 `{detail: str(e)}` | Batch, StockLedger, PurchaseItem(+invoice, distributor), MasterProduct |
| GET | `/api/v1/reports/batch-wise/export/` | `BatchWiseReportExportView.get` R/views.py:1529 | `CanAccessReports` | same + `export_format` = `csv`(default)/`xlsx`/`pdf` | file: `text/csv` / `.xlsx` / `application/pdf` (WeasyPrint, template `apps/backend/templates/reports/batch_report.html`, `batch-wise-report-{date}.pdf`) | same |

#### A.2 `/api/v1/gst/...` (R/gst_urls.py), all based on the user's own outlet (`request.user.outlet`)

Order matters: the generic `export/<fp>/<export_type>/` is last so the specific `.../gstr1_excel/` etc. win.

| Method(s) | Full path | Handler (file:line) | Auth/permission | Query params/body | Response shape | Models/tables read |
|---|---|---|---|---|---|---|
| GET | `/api/v1/gst/periods/` | `GSTPeriodsView.get` R/dashboard_views.py:19 | DRF `IsAuthenticated` (no flag check) | none | `[{period:"MMYYYY", status:"draft"|"validated"}]` ("draft" if GSTR1 or 3B builder reports blocking errors). Builds GSTR1+3B JSON per period (heavy, N periods) | GSTTransactionSnapshot (+builders: StockAdjustment, Rule37Adjustment, DeferredITCEntry) |
| GET | `/api/v1/gst/summary/` | `GSTSummaryView.get` R/dashboard_views.py:46 | DRF `IsAuthenticated` | `start_date`/`start`/`from`, `end_date`/`end`/`to`, `return_type` = `gstr1`/`gstr3b`/(none = combined) | `{gstr1{b2b_total,b2cs_total,b2cl_total,cdnr_total,cdnur_total,hsn_count}, gstr3b{outward_tax,net_itc,cash_payable,sup_details,itc_elg}, validation{is_valid_for_export,blocking_errors[],warnings[],info[]}, mom_delta{...0 mocked}}`. SIDE EFFECT: lazily creates missing sale snapshots (`create_sale_snapshots`) for every invoice in range, exceptions swallowed | SaleInvoice, GSTTransactionSnapshot |
| GET | `/api/v1/gst/reconciliation/<fp>/` | `GSTReconciliationView.get` R/dashboard_views.py:202 | DRF `IsAuthenticated` | path `fp` MMYYYY | `{status,stats{total_invoices,matched,missing_in_2b,mismatched},summary{matched_count,matched_tax_amount,...},mismatch_breakdown{reason:n},deferred_itc{opening_balance(mock 0),newly_deferred,claimed_this_period,total_deferred_balance,caption},top_mismatches[5]}`; empty-shell JSON when no run | ITCReconciliationRun/Result, GSTTransactionSnapshot, DeferredITCEntry |
| GET | `/api/v1/gst/export/<fp>/gstr1_excel/` | `GSTR1ExcelExportView.get` R/exports/gstr1_excel.py:31 | DRF `IsAuthenticated` + GST export perm | `fp`; optional `start_date`/`end_date` (else derived from fp month) | File: official GSTR-1 Excel template V2.2 (`.xlsx`, or `.xlsm` if manifest says so) filled via `OOXMLInjector`; "Download & Warn": blocking errors only printed, still returns file. Writes GSTExportAudit | GSTTransactionSnapshot (+lazy snapshot creation), SaleInvoice, Outlet; template `apps/backend/resources/gst_templates/GSTR1_Excel_Workbook_Template_V2.2.xlsx` + `template_manifest.json` |
| GET | `/api/v1/gst/export/<fp>/gstr3b_excel/` | `GSTR3BExcelExportView.get` R/exports/gstr3b_excel.py:23 | same | `fp` | File `application/vnd.ms-excel.sheet.macroEnabled.12` `GSTR3B_{gstin}_{fp}_{ts}.xlsm` from `GSTR3B_Excel_Utility_V5.6.xlsm`. 422 `{error,details}` on blocking errors. Writes GSTExportAudit | GSTTransactionSnapshot, StockAdjustment, Rule37Adjustment, DeferredITCEntry |
| GET | `/api/v1/gst/export/<fp>/ca_working_paper/` | `CAWorkingPaperPDFExportView.get` R/exports/ca_working_paper.py:27 | same | `fp` | `application/pdf` (ReportLab) CA working paper: GSTR-1 liability, 3B ITC summary, recon counts, deferred ITC. 422 on GSTR-1 blocking errors. Writes GSTExportAudit (`WORKING_PAPER_PDF`) | snapshots, ITCReconciliationRun/Result, DeferredITCEntry |
| GET | `/api/v1/gst/periods/<fp>/export/reconciliation/` | `ReconciliationExcelExportView.get` R/exports/reconciliation_excel.py:21 | same | `fp` | `.xlsx` `MediFlow_Reconciliation_Audit_{gstin}_{fp}_{ts}.xlsx` (openpyxl, multiple sheets). 404 if no run. Writes GSTExportAudit | ITCReconciliationRun/Result, GSTR2BData, snapshots |
| GET | `/api/v1/gst/export/<fp>/gstr2b_json/` | `GSTR2BJsonExportView.get` R/exports/gstr2b_json.py:17 | same | `fp` | `application/json` attachment (GSTR-2B style JSON rebuilt from recon records). 404 if no run. Writes GSTExportAudit | ITCReconciliationRun/Result, GSTR2BData |
| GET | `/api/v1/gst/export/<fp>/<export_type>/` | `GSTExportView.get` R/dashboard_views.py:287 | DRF `IsAuthenticated` ONLY (no export-flag check) | `export_type` = `gstr1`/`gstr1_json` -> GSTR-1 JSON (`gstr1_{fp}.json`); `gstr3b` -> GSTR-3B JSON (`gstr3b_{fp}.json`); `reconciliation` -> CSV (`reconciliation_{fp}.csv`: GSTIN, Invoice No, Status, Reasons); else 400 | JSON/CSV attachment; JSON is served even when blocking errors exist (no gating, no audit row) | snapshots, ITCReconciliationRun/Result |

Routes owned by other modules but touching reports models (for cross-reference only): `/api/v1/gst/sandbox/*`, `/api/v1/gst/audit/`, `/api/v1/gst/gstr1-invoices/`, `/api/v1/gst/periods/<fp>/gstr2b-reconciliation/`, `/api/v1/gst/validate/<mmyyyy>/gstr1/` live in `apps/gst/urls.py` (all DRF `IsAuthenticated`); they create `GSTR2BImportJob`, `GSTR2BData`, `ITCReconciliationRun/Result` (see `apps/gst/tasks.py:19 sync_gstr2b_job`, `apps/gst/views.py`).

---

## 5. Data models


### 5.1 accounts / attendance / audit / core

Conventions: PK is `UUIDField(default=uuid4)` unless stated. "OFM" = custom manager `OutletFilteredManager` (`.for_outlet(outlet_id)`) assigned to `objects`. null/blank noted as `null`, `blank`. Apps' `default_auto_field` is BigAutoField but all models declare explicit UUID PKs, so it is unused.

#### B.1 accounts (`accounts/models.py`)

**Staff** (:37, table `accounts_staff`; `AbstractBaseUser + PermissionsMixin`; `USERNAME_FIELD=phone`, `REQUIRED_FIELDS=[name]`; managers `objects=StaffManager`, `outlet_objects=OFM`; ordering `-created_at`; indexes `(outlet,is_active)`, `(phone)`)
- outlet FK core.Outlet CASCADE related `staff_members`; name Char255; phone Char20 UNIQUE (global, not per-outlet); email Email null/blank; role Char20 choices {super_admin,admin,manager,billing_staff,view_only} default billing_staff; staff_pin Char128 required (stored as Django password hash); avatar_url URL null/blank; max_discount Dec(5,2) def 0.
- Boolean flags (all default False): can_edit_rate, can_view_purchase_rates, can_create_purchases, can_access_reports, can_edit_sales, can_edit_purchases, can_export_gst, can_manage_partners, can_edit_sale_returns, can_edit_purchase_returns, can_edit_vouchers, can_view_audit_history, can_void_records, can_modify_paid_purchases, can_modify_settled_vouchers, can_modify_settled_returns, can_modify_draft_bill, can_modify_unpaid_bill, can_correct_header_fields, can_correct_rates_discounts, can_correct_quantities, can_correct_customer, can_modify_bill_with_return, can_modify_paid_bill, can_cancel_and_reissue_bill, can_view_bill_revision_history.
- shift_start_time Time null/blank; shift_end_time Time null/blank; weekly_off_day Int null/blank (0=Mon..6=Sun); is_active Bool def True; is_staff Bool def False; joining_date DateTime auto_now_add; last_login DateTime null/blank (overrides AbstractBaseUser); created_at auto_now_add. Also `password` (from AbstractBaseUser; app login password), `is_superuser/groups/user_permissions` (PermissionsMixin).
- Methods: `StaffManager.create_user(phone,password,**extra)` (sets password hash), `create_superuser` (role=super_admin). `__str__` "name (Role)".

**Customer** (:119, `accounts_customer`; OFM; ordering `-created_at`; indexes `(outlet,is_active)`,`(phone,outlet)`; NO unique constraint on phone)
- outlet FK Outlet CASCADE related `customers`; name Char255; phone Char20; address Text null/blank; state Char100 null/blank; dob Date null/blank; gstin Char15 null/blank; customer_type Char20 {RETAIL,WHOLESALE} def RETAIL; dl_no_20b/dl_no_21b Char50 null/blank; dl_expiry Date null/blank; pan Char10 null/blank; state_code Char2 def '27'.
- fixed_discount Dec(5,2) def 0; credit_limit Dec(12,2) def 0; credit_days Int def 0; is_credit_blocked Bool def False; outstanding Dec(12,2) def 0 (legacy cached balance); total_purchases Dec(12,2) def 0; total_visits Int def 0; is_chronic Bool def False; is_active Bool def True.
- blood_group Char5 null/blank; allergies JSON list def []; chronic_conditions JSON list def []; preferred_doctor FK Doctor SET_NULL null/blank related `patients`; last_refill_date Date null/blank; next_refill_due Date null/blank; notes Text null/blank; created_at auto_now_add.
- Methods: `outstanding_balance` property (Sundry Debtors Ledger.current_balance else `outstanding`; 1 query per access); `clean()` (WHOLESALE: gstin must be 15 chars if given; needs DL 20B or 21B); `save()` always calls `clean()` (so every save of a WHOLESALE customer enforces DL); `is_dl_valid()`; `get_available_credit()`.

**Doctor** (:216, `accounts_doctor`; OFM; ordering `name`; index `(outlet,is_active)`)
- outlet FK Outlet CASCADE related `doctors`; name Char255; phone Char20 null/blank; registration_no Char50 null/blank; degree Char100 null/blank; qualification Char255 null/blank; specialty Char100 null/blank; hospital_name Char255 null/blank; address Text null/blank; is_active Bool def True; created_at.

**RegularMedicine** (:246, `accounts_regular_medicine`; OFM; ordering `name`; indexes `(customer,outlet)`,`(outlet,product_id)`)
- customer FK Customer CASCADE related `regular_medicines`; outlet FK Outlet CASCADE related `regular_medicines`; product_id Char255 (string, NOT an FK to Product); name Char255; qty PositiveInt def 1; frequency Char10 {Daily,Weekly,Monthly} def Monthly; notes Text null/blank; created_at.

**LedgerGroup** (:309, `accounts_ledgergroup`; OFM; unique_together `(outlet,name)`)
- id UUID (no editable=False); outlet FK Outlet CASCADE (no related_name); name Char100; parent FK self SET_NULL null/blank related `children`; nature Char20 {asset,liability,income,expense}; is_system Bool def False; created_at.

**Ledger** (:336, `accounts_ledger`; OFM; unique_together `(outlet,name)`)
- outlet FK Outlet CASCADE; name Char255; group FK LedgerGroup PROTECT; opening_balance Dec(12,2) def 0; balance_type Char5 def 'Dr' (free text, no choices); current_balance Dec(12,2) def 0; phone Char15 blank; gstin Char15 blank; address Text blank; linked_customer FK Customer SET_NULL null/blank related `ledgers`; linked_distributor FK purchases.Distributor SET_NULL null/blank related `ledgers`; is_system Bool; created_at.
- Contact (all Char blank unless noted): station(100), mail_to(255), contact_person(255), designation(100), phone_office(15), phone_residence(15), fax_no(15), website(255), email(EmailField blank), pincode(10).
- Compliance: freeze_upto Date null/blank (never enforced, see notes); dl_no(50), dl_expiry Date null; vat_no(50), vat_expiry Date null; st_no(50), st_expiry Date null; food_licence_no(50), food_licence_expiry Date null; extra_heading_no(50), extra_heading_expiry Date null; pan_no(10); it_pan_no(10).
- GST/tax & settings: gst_heading {local,central,exempt} def local; bill_export {gstn,non_gstn} def gstn; ledger_type {registered,unregistered,composition,consumer} def registered; balancing_method {bill_by_bill,on_account} def bill_by_bill; ledger_category Char50 def 'OTHERS'; state Char50 blank; country Char50 def 'India'; color {normal,red,green,blue} def normal; is_hidden Bool def False; retailio_id Char100 blank.
- Balance kept in `current_balance`, updated by `LedgerService.update_balance` and `journal_service._create_lines_and_update_balances`.

**Voucher** (:432, `accounts_voucher`; OFM; unique_together `(outlet,voucher_no)`)
- outlet FK Outlet CASCADE; voucher_type {receipt,payment,contra,journal}; voucher_no Char50; date Date; narration Text blank; total_amount Dec(12,2); payment_mode {cash,bank,upi} def cash; status {draft,posted,reversed,cancelled} def posted; created_by FK Staff PROTECT related `vouchers_created`; created_at; updated_at auto_now.

**VoucherLine** (:476, `accounts_voucherline`): voucher FK Voucher CASCADE related `lines`; ledger FK Ledger PROTECT; debit Dec(12,2) def 0; credit Dec(12,2) def 0; description Text blank.

**VoucherBillAdjustment** (:491, `accounts_voucherbilladjustment`): voucher FK Voucher CASCADE related `bill_adjustments`; invoice_type {sale,purchase}; sale_invoice FK billing.SaleInvoice SET_NULL null/blank related `bill_adjustments`; purchase_invoice FK purchases.PurchaseInvoice SET_NULL null/blank related `bill_adjustments`; adjusted_amount Dec(12,2); created_at. (No check that exactly one invoice FK is set.)

**DebitNote** (:518, `accounts_debitnote`; OFM; unique_together `(outlet,debit_note_no)`; purchase return): outlet FK CASCADE; debit_note_no Char50; date; distributor FK purchases.Distributor PROTECT; purchase_invoice FK PurchaseInvoice SET_NULL null/blank; reason Text; subtotal Dec(12,2) def 0; gst_amount def 0; total_amount Dec(12,2); status {pending,adjusted,refunded} def pending; created_by FK Staff PROTECT related `debit_notes_created`; created_at; updated_at.
**DebitNoteItem** (:550, `accounts_debitnoteitem`): debit_note FK CASCADE related `items`; batch FK inventory.Batch PROTECT; product_name Char255; qty Dec(10,2); rate Dec(10,2); gst_rate Dec(5,2) def 0; total Dec(12,2).

**CreditNote** (:564, `accounts_creditnote`; OFM; unique_together `(outlet,credit_note_no)`; sale return): outlet FK CASCADE; credit_note_no Char50; date; customer FK Customer SET_NULL null/blank related `credit_notes`; sale_invoice FK billing.SaleInvoice SET_NULL null/blank related `credit_notes`; reason Text; subtotal/gst_amount Dec(12,2) def 0; total_amount Dec(12,2); status {pending,adjusted,refunded} def pending; created_by FK Staff PROTECT related `credit_notes_created`; created_at (no updated_at, unlike DebitNote).
**CreditNoteItem** (:597, `accounts_creditnoteitem`): credit_note FK CASCADE related `items`; batch FK inventory.Batch PROTECT; product_name; qty Dec(10,2); rate Dec(10,2); gst_rate Dec(5,2) def 0; total Dec(12,2).

**JournalEntry** (:611, `accounts_journalentry`; OFM; unique_together `(outlet,source_type,source_id)`; indexes `(outlet,source_type,source_id)`,`(outlet,date)`): outlet FK CASCADE related `journal_entries`; source_type {SALE,PURCHASE,VOUCHER,RETURN,CREDIT_PAYMENT}; source_id UUID (generic, no FK); date Date; narration Text blank; created_at. Note: unique (outlet,source_type,source_id) means a source can have only one entry per type; `RETURN`/reversals depend on `reverse_journal`.
**JournalLine** (:646, `accounts_journalline`): journal_entry FK CASCADE related `lines`; ledger FK Ledger PROTECT related `journal_lines`; debit_amount Dec(12,2) def 0; credit_amount Dec(12,2) def 0; description Char255 blank def ''.

**Partner** (:683, `accounts_partner`; OFM; ordering `name`; unique_together `(outlet,name)`): outlet FK CASCADE related `partners`; name Char255; profit_percentage Dec(5,2) def 0; is_active def True; created_at; updated_at.
**PartnerShareHistory** (:704, `accounts_partnersharehistory`; ordering `-start_date`): partner FK Partner CASCADE related `share_history`; profit_percentage Dec(5,2); start_date Date; end_date Date null/blank (null = current); created_at; updated_at.

**PostDatedCheque** (:723, `accounts_postdatedcheque`; ordering `cheque_date`): customer FK Customer CASCADE related `post_dated_cheques`; cheque_number Char50; bank_name Char100; amount Dec(12,2); cheque_date; deposit_date null/blank; status {PENDING,DEPOSITED,CLEARED,BOUNCED,RETURNED} def PENDING; linked_invoice FK billing.SaleInvoice SET_NULL null/blank related `linked_pdcs`; created_at; updated_at. Only reachable via Django admin + `pdc_services.process_pdc_clearance/process_pdc_bounced` (no API, no callers found).

Non-model service modules: `services.py` (LedgerService seed/sync/update_balance; VoucherService create/number/pending bills; DebitNoteService; CreditNoteService), `journal_service.py` (1340 lines: `post_sale_invoice`, `post_purchase_invoice`, `post_voucher`, `post_credit_payment`, `post_debit_note`, `reverse_journal`, GST line builders with intra/inter-state split via `_is_interstate`, `_guard_double_posting`), `voucher_update_service.atomic_voucher_update`, `debit_note_update_service.atomic_debit_note_update`, `dashboard_service.DashboardService`, `audit_service.AuditService`, management commands `backfill_journals`, `audit_journals`, `import_daybook`, `seed_ledgers` (`seed_outlet_ledgers`).

#### B.2 attendance (`attendance/models.py`)

**AttendanceRecord** (:5, `attendance_attendancerecord`; ordering `-date,-created_at`; unique_together `(outlet,staff,date)`; indexes `(outlet,staff,date)`,`(outlet,date)`,`(staff,date)`): outlet FK Outlet CASCADE related `attendance_records`; staff FK Staff CASCADE related `attendance_records`; date Date; check_in_time/check_out_time Time null/blank; status {present,absent,late,half_day,holiday,weekly_off} def present; is_late Bool def False; late_by_minutes Int null/blank; early_leave_minutes Int def 0 (never written by code); working_hours Dec(5,2) null/blank; check_in_photo/check_out_photo Text null/blank (base64 blobs stored in DB); check_in_photo_url/check_out_photo_url URL(500) null/blank; check_in_ip/check_out_ip Char45 null/blank; check_in_lat/lng, check_out_lat/lng Dec(10,7) null/blank; check_in_device/check_out_device Char255 null/blank; marked_by FK Staff SET_NULL null/blank related `marked_attendance` (never set by AttendanceManualView); notes Text null/blank; created_at. Default manager (no OFM).

#### B.3 audit (`audit/models.py`)

**ActivityLog** (:6, default table `audit_activitylog`; ordering `-timestamp`; indexes `(module,action)`,`(entity_type,entity_id)`,`(timestamp,outlet)`): timestamp DateTime auto_now_add db_index; user FK AUTH_USER_MODEL SET_NULL null/blank related `activity_logs`; outlet FK core.Outlet SET_NULL null/blank related `activity_logs`; action Char255 idx; module Char255 idx; entity_type Char255 blank idx; entity_id Char255 blank idx; entity_label Char255 blank; description Text blank; changes_json JSON def {}; metadata_json JSON def {}; endpoint Char512 blank; http_method Char20 blank; status_code Int null; ip_address GenericIP null; ip_is_routable Bool null; user_agent Text blank; request_id Char255 blank idx. Written ONLY via Celery task `create_audit_log_async` (queue `audit`) enqueued by `audit.services.log_activity`; admin is read-only and super_admin-only.

**DocumentRevision** (:48, `audit_documentrevision`; V1; ordering `-created_at`; indexes `(content_type,object_id)`,`(outlet,created_at)`): outlet FK Outlet CASCADE related `document_revisions`; content_type FK ContentType CASCADE; object_id UUID; original_document GenericForeignKey; revision_number Char50; revision_type Char50 {correction,financial_change,cancel_reissue,commercial_correction,paid_bill_correction,return_aware_correction,direct_revise}; revision_status Char50 {draft,applied,failed} def applied; modified_by FK AUTH_USER SET_NULL null related `document_revisions_created`; modified_at auto_now_add; reason_code Char50 blank; reason_text Text blank; old_snapshot_json/new_snapshot_json/diff_summary_json/stock_impact_json/payment_impact_json/return_impact_json JSON def {}; resulting_document_id UUID null/blank; linked_credit_note_id UUID null/blank; linked_debit_note_id UUID null/blank; created_at; updated_at.

**DocumentRevisionV2** (:100, `audit_document_revision_v2`; ordering `-created_at`; indexes `(content_type,object_id)`,`(tenant_id,created_at)`): id UUID; tenant_id Char255 null/blank (= outlet id as string); content_type FK ContentType CASCADE; object_id UUID; entity_type Char255 blank; revision_no Int def 1; action Char50 (create/update/delete/void/correction); old/new_snapshot_json, diff_summary_json JSON def {}; reason_code Char50 blank; reason_text Text blank; actor_id Char255 null/blank; actor_type Char50 def 'human'; request_id Char255 null/blank; source Char50 blank; created_at. Written by `audit.core.orchestrator.record_revision/record_mutation` (gated by `AUDIT_V2_WRITE_ENABLED`, True).

**ActivityEvent** (:131, `audit_activity_event`; ordering `-occurred_at`): id UUID; tenant_id Char255 null/blank; occurred_at auto_now_add idx; actor_id/ actor_type(def human)/ request_id / session_id (Char255 null); ip_address GenericIP null; user_agent Text blank; action Char255 idx; module Char255 idx; entity_type/entity_id idx blank; entity_label blank; reason_code Char50 blank; reason_text Text blank; metadata_json JSON def {}; severity Char50 def info; correlation_id Char255 null/blank. Indexes `(module,action)`,`(entity_type,entity_id)`,`(tenant_id,occurred_at)`.

**SystemEvent** (:162, `audit_system_event`; ordering `-occurred_at`; indexes `(event_name)`,`(tenant_id,occurred_at)`): id UUID; tenant_id null/blank; occurred_at idx; event_name Char255 idx; component Char255; source Char255; job_id/request_id null/blank; actor_type def 'system'; entity_type/entity_id blank; status Char50 def success; payload_json JSON def {}; severity def info.

Non-model audit machinery: `AuditContextMiddleware` is registered TWICE in settings (`audit.middleware` contextvars dict and `audit.core.middleware` AuditContext dataclass; `base.py:49-50`); `core/registry.SnapshotBuilderRegistry` (registered in `snapshot_serializers.py` for Voucher, SaleInvoice, PurchaseInvoice, SalesReturn, DebitNote); `core/diff_engine.DiffEngine`; `core/flags` (AUDIT_V2_WRITE/READ_ENABLED, both True); `drf_permissions.AuditContextPermission` (defined, not used by default); management cmd `cleanup_audit_logs --days 365 [--dry-run]` (deletes only ActivityLog).

#### B.4 core (`core/models.py`)

**Organization** (:55, `core_organization`; ordering `-created_at`): name Char255; slug Slug255 UNIQUE; plan {starter,pro,enterprise} def starter; master_gstin Char15 blank def ''; phone Char20 blank; email Email blank; is_active def True; created_at.

**Outlet** (:81, `core_outlet`; OFM; ordering `-created_at`; index `(organization,is_active)`): organization FK Organization CASCADE related `outlets` (required); name Char255; address Text; city Char100; state Char100; state_code Char2 blank def '' (auto-derived in `save()` from `_STATE_CODES[state]`, overwritten every save so empty if state spelling is not in the map); pincode Char10; gstin Char15 UNIQUE; drug_license_no Char100 UNIQUE; phone Char20; gst_username Char50 blank; logo_url URL null/blank; invoice_footer Text null/blank; is_active def True; created_at. Signal receiver `core/signals.py:on_outlet_created` (post_save created -> `seed_outlet_ledgers`) exists but is never imported (see notes).

**OutletSettings** (:147, `core_outletsettings`): outlet O2O Outlet CASCADE related `settings`; opening_time Time def '09:00'; closing_time Time def '21:00'; grace_period_minutes Int 15; default_credit_days Int 30; invoice_prefix Char10 'INV'; gst_registered Bool True; print_logo True; thermal_print False; printer_width Int 80; low_stock_alert_days 7; expiry_alert_days 30; enable_whatsapp False; whatsapp_api_key Char200 null/blank (plaintext); currency_symbol Char5 '₹'; gstr2b_tolerance Dec(5,2) 1.00; enable_eway_bill False; enable_einvoice False; landing_cost_include_gst Bool False; landing_cost_include_freight Bool True; min_margin_warning_pct Dec(5,2) 0.00; allowed_attendance_ips Text blank (comma-separated public IPs); attendance_latitude/longitude Dec(10,7) null/blank; attendance_radius_meters Int 100; print_settings_retail JSON (callable default `default_print_settings_retail`: Thermal_80mm, 9 column defs, header, footer); print_settings_wholesale JSON (A4 defaults); updated_at auto_now. Always accessed with `get_or_create` (not auto-created with Outlet).

**SandboxConfiguration** (:~229, `core_sandboxconfiguration`; ordering `-created_at`): outlet FK Outlet CASCADE null/blank (null = global); `_api_key_encrypted`, `_api_secret_encrypted`, `_einvoice_username_encrypted`, `_einvoice_password_encrypted` Char255 blank def '' (Fernet; plaintext exposed via properties `api_key`, `api_secret`, `einvoice_username`, `einvoice_password` with setters; decrypt failure returns ''); base_url Char255 def 'https://api.sandbox.co.in'; active Bool True; created_at; updated_at. Fernet key = first 32 bytes of `SECRET_KEY` zero-padded (`_get_fernet`).

**GstTaxpayerAuth** (:~316, `core_gsttaxpayerauth`): outlet O2O Outlet CASCADE; gstin Char15; gst_username Char50; `_session_token_encrypted` Text blank (property `session_token` w/ setter, Fernet); session_expires_at DateTime null/blank; last_otp_requested_at DateTime null/blank; active Bool False; created_at; updated_at. Method `is_session_valid()` = active and not expired.

**TaxSlab** (:~357, `core_taxslab`; ordering `rate`): rate Dec(5,2) UNIQUE; description Char120 blank; is_active Bool True; effective_from Date null/blank; effective_to Date null/blank; created_at; updated_at. Classmethods `get_active_rates()`, `get_all_rates()` (fall back to hard-coded lists if table empty), `is_rate_active(rate, transaction_date)` (GST 2.0 cut-off 2025-09-01: before -> any known slab; on/after -> only active slabs). Seeded/activated by migration `core/migrations/0015_activate_pharma_tax_slabs.py` (untracked, in working tree).

#### B.5 gst
No models of its own (`apps/gst` has no models.py/migrations; not given a models import). It uses `core.GstTaxpayerAuth/SandboxConfiguration/TaxSlab` and `reports.{GSTR2BImportJob, GSTR2BData, ITCReconciliationRun, ITCReconciliationResult, GSTTransactionSnapshot, GSTExportAudit}` (documented in the reports fragment). Provider abstraction: `gst/provider/base.py:BaseGstProvider` (authenticate_platform, request_taxpayer_otp, verify_taxpayer_otp, fetch_gstr2b, file_gstr1, file_gstr3b) with only `SandboxGstProvider` (file_gstr1/file_gstr3b are stubs, `gst/provider/sandbox.py:248-252`). `gst/conf.py`: `B2CL_THRESHOLD=100000`, `GSTR3BValidationConfig` tolerances. `gst/services/export_service.py:GSTExportService` (draft preview/execute export; blocked by validation).

### 5.2 billing

20 models. `OutletFilteredManager` (l.7) adds `.for_outlet(outlet_id)`; it is `objects` on all models below except SaleItem, ScheduleHRegister, CreditTransaction, PaymentAllocation, ReceiptAllocation, SalesReturnItem, DraftInvoiceItem, QuotationItem. PKs are `UUIDField(default=uuid4, editable=False)` everywhere. Tables named `billing_<lowercase model>`.

#### SaleInvoice (l.15) table `billing_saleinvoice`
- FKs:
  - `outlet`->core.Outlet CASCADE, related `sale_invoices`.
  - `customer`->accounts.Customer SET_NULL null/blank (no related_name).
  - `doctor`->accounts.Doctor SET_NULL null/blank.
  - `billed_by`->accounts.Staff SET_NULL null, related `billed_invoices`.
  - `cancelled_by`->accounts.Staff SET_NULL null/blank, related `cancelled_invoices`.
- Identity:
  - `invoice_no` Char50 (req)
  - `invoice_date` DateTime (req)
  - `hospital_name` Char255 null
  - `prescription_no` Char100 null
- Amounts (Decimal 12,2 unless noted):
  - `subtotal` req
  - `discount_amount` default 0
  - `extra_discount_pct` (5,2) default 0
  - `taxable_amount` req
  - `cgst_amount`, `sgst_amount`, `igst_amount` default 0
  - `cgst`, `sgst`, `igst` (5,2) default 0, these are rates
  - `round_off` default 0
  - `grand_total` req
  - `cash_discount_percent` (5,2) default 0
  - `cash_discount_amount` default 0
- Sale type:
  - `sale_type` choices RETAIL/WHOLESALE, default RETAIL
  - `billing_basis` choices MRP/PTR/PTS, default MRP
  - `place_of_supply` Char100 null
  - `is_interstate` Bool default False
  - `total_free_strips`, `total_free_loose` Int default 0
- E-invoice:
  - `irn` Char100 null
  - `irn_status` choices NOT_REQUIRED/PENDING/GENERATED/FAILED, default NOT_REQUIRED
  - `qr_code` Text null
  - `ack_no` Char50 null
  - `ack_date` DateTime null
- E-way bill:
  - `eway_bill_no` Char100 null
  - `eway_bill_status` choices PENDING/GENERATED/FAILED/CANCELLED, null
  - `eway_bill_date`, `valid_until` DateTime null
  - `transporter_id` Char50 null
  - `vehicle_no` Char50 null
  - `trans_distance` Int default 0
  - `trans_mode` Int default 1
  - `vehicle_type` Char1 default 'R'
- Payment:
  - `payment_mode` Char20 choices cash/upi/card/credit/cheque/bank_transfer/split (req)
  - `cash_paid`, `upi_paid`, `card_paid`, `credit_given` default 0
  - `amount_paid` (req)
  - `amount_due` default 0
- Flags/audit:
  - `is_return` Bool default False
  - `is_cancelled` Bool default False
  - `cancellation_reason` Text null
  - `cancelled_at` DateTime null
  - `created_at` auto_now_add
- Meta: ordering `[-invoice_date,-created_at]`; indexes (outlet,invoice_date), (outlet,customer), (invoice_no,outlet); **unique_together (outlet, invoice_no)**.
- Methods/props:
  - `has_return` (l.140): every item fully returned. It compares `qty_returned` vs `qty_strips*pack_size+qty_loose`.
  - `clean()` (l.150): sets `is_interstate` from `customer.state_code != outlet.state_code`, then validates `cash+upi+card == amount_paid` (tolerance 0.01).
  - `save()` always calls `clean()`.
  - `is_irn_cancelable` (l.172): False when GENERATED and older than 24h.
- No signals; `apps.py ready()` only imports models (duplicate import line).

#### SaleItem (l.181) `billing_saleitem`
- FKs: `invoice`->SaleInvoice CASCADE related `items`; `batch`->inventory.Batch **PROTECT** related `sale_items`.
- Snapshots:
  - `product_name` Char255
  - `composition` Char255 null
  - `pack_size` Int
  - `pack_unit` Char50
  - `schedule_type` Char20
  - `batch_no` Char100
  - `expiry_date` Date
  - `hsn_code` Char20 null
- Pricing (Decimal 10,2):
  - `mrp`
  - `applied_ptr`, `applied_pts` null
  - `sale_rate` (price per pack)
  - `rate` (final charged rate per pack)
  - `unit_rate` default 0
- Quantity:
  - `qty_strips` Int
  - `qty_loose` Int default 0
  - `qty_returned` PositiveInt default 0 (**units/tablets**, not strips)
  - `qty_returned_strips`, `qty_returned_loose` Int default 0
  - `free_qty_strips`, `free_qty_loose` Int default 0
  - `sale_mode` choices strip/loose/bottle/mixed, default 'strip'
- Discount/tax:
  - `trade_discount_percent` (5,2)
  - `trade_discount_amount` (12,2)
  - `discount_pct` (5,2)
  - `gst_rate` (5,2) req
  - `cgst_rate`, `sgst_rate`, `igst_rate` (5,2) default 0
- Computed (12,2):
  - `taxable_amount` req
  - `gst_amount` req
  - `cgst_amount`, `sgst_amount`, `igst_amount` default 0
  - `total_amount` req
- `created_at` auto_now_add.
- Meta: ordering `[-created_at]`; no indexes.
- Reverse: `schedule_h_register` (1:1), `return_items`.

#### InvoicePayment (l.251) `billing_invoicepayment`
- `outlet`->core.Outlet CASCADE related `invoice_payments`.
- `invoice`->SaleInvoice CASCADE related `payments`.
- `ledger`->accounts.Ledger PROTECT null/blank related `invoice_payments`.
- `method` choices cash/upi/card/credit/cheque/bank_transfer/credit_note (req).
- `amount` (12,2).
- `reference_no` Char100 null.
- `created_at`.
- Meta: ordering `[created_at]`; indexes (outlet,created_at), (invoice,method). Manager: OutletFilteredManager.

#### ScheduleHRegister (l.296) `billing_schedulehregister`
- `sale_item`->SaleItem **OneToOne** CASCADE related `schedule_h_register`.
- `patient_name` Char255, `patient_age` Int, `patient_address` Text (all req).
- `doctor_name` Char255, `doctor_reg_no` Char50, `prescription_no` Char100 (all req).
- `created_at`.
- Meta: ordering `[-created_at]`; index (sale_item).
- Note: create path passes `patient_name=None` when `schedule_h_data` is missing and the item is G/H/H1/X/C/Narcotic. `schedule_h_validate` normally blocks this first.

#### CreditAccount (l.326) `billing_creditaccount`
- `outlet`->core.Outlet CASCADE related `credit_accounts`.
- `customer`->accounts.Customer CASCADE related `credit_accounts`.
- `credit_limit`, `total_outstanding`, `total_borrowed`, `total_repaid` (12,2) default 0.
- `status` choices active/partial/cleared/overdue, default 'active'.
- `last_transaction_date` DateTime null.
- `created_at`.
- Meta: ordering `[-created_at]`; indexes (outlet,customer), (outlet,status). **No unique constraint on (outlet, customer)**; `get_or_create` is used and could create duplicates under race.

#### CreditTransaction (l.370) `billing_credittransaction`
- `credit_account`->CreditAccount CASCADE related `transactions`.
- `customer`->accounts.Customer CASCADE related `credit_transactions`.
- `invoice`->SaleInvoice SET_NULL null/blank.
- `type` choices debit/credit.
- `amount`, `balance_after` (12,2).
- `description` Char255.
- `recorded_by`->accounts.Staff SET_NULL null.
- `created_at`.
- `date` Date null.
- Meta: ordering `[-created_at]`; index (credit_account,created_at).

#### PaymentEntry (l.407) `billing_paymententry`
- Payment to a distributor.
- `outlet` CASCADE related `payment_entries`.
- `distributor`->purchases.Distributor PROTECT related `payments`.
- `date` Date.
- `total_amount` (12,2).
- `payment_mode` choices cash/upi/card/cheque/bank_transfer.
- `reference_no` Char100 null.
- `notes` Text null.
- `created_by`->Staff SET_NULL null.
- `created_at`.
- Meta: ordering `[-date,-created_at]`; indexes (outlet,distributor), (outlet,date). Manager OutletFiltered.
- Used by purchases app (`purchases/services.py`, `views.py`), not by billing views.

#### PaymentAllocation (l.448) `billing_paymentallocation`
- `payment`->PaymentEntry CASCADE related `allocations`.
- `invoice`->purchases.PurchaseInvoice PROTECT related `payment_allocations`.
- Denormalised: `invoice_no` Char50, `invoice_date` Date, `invoice_total`, `current_outstanding`, `allocated_amount` (12,2).
- `created_at`.
- Meta: ordering `[-created_at]`; indexes (payment,invoice), (invoice).

#### LedgerEntry (l.481) `billing_ledgerentry` (customer/distributor sub-ledger, "append-only")
- `outlet` CASCADE related `ledger_entries`.
- `entity_type` choices distributor/customer.
- `distributor`->purchases.Distributor PROTECT null/blank related `ledger_entries`.
- `customer`->accounts.Customer PROTECT null/blank related `ledger_entries`.
- `date` Date.
- `entry_type` Char30 choices purchase/payment/sale/receipt/debit_note/credit_note/expense/opening_balance.
- `reference_no` Char100.
- `description` Char255.
- `debit`, `credit` default 0.
- `running_balance` (12,2).
- `created_at`.
- Meta: ordering `[-date,-created_at]`; indexes (outlet,distributor,date), (outlet,customer,date), (outlet,reference_no); permissions `cannot_update_ledger`, `cannot_delete_ledger` (labels only, unenforced).
- Methods:
  - `clean()`: requires distributor when entity_type=distributor and customer when entity_type=customer.
  - `save()`: raises ValidationError if the pk already exists in the DB (blocks ORM update).
  - `delete()`: always raises.
- Queryset `.update()`/`.delete()` bypass both guards, and the code does exactly that (see C and D).

#### ReceiptEntry (l.574) `billing_receiptentry`
- `outlet` CASCADE related `receipt_entries`.
- `customer`->Customer PROTECT related `receipt_entries`.
- `date` Date.
- `total_amount` (12,2).
- `payment_mode` choices cash/upi/card/cheque/bank_transfer.
- `reference_no` Char100 null.
- `notes` Text null.
- `created_by`->Staff SET_NULL null.
- `created_at`.
- Meta: ordering `[-date,-created_at]`; indexes (outlet,customer), (outlet,date).

#### ReceiptAllocation (l.612) `billing_receiptallocation`
- `receipt`->ReceiptEntry CASCADE related `allocations`.
- `invoice`->SaleInvoice PROTECT related `receipt_allocations`.
- `allocated_amount` (12,2).
- `created_at`.
- Meta: ordering `[-created_at]`; index (receipt,invoice).

#### ExpenseEntry (l.632) `billing_expenseentry`
- `outlet` CASCADE related `expense_entries`.
- `date` Date.
- `expense_head` choices rent/salary/electricity/transport/maintenance/marketing/other.
- `custom_head` Char100 null.
- `amount` (10,2).
- `payment_mode` choices cash/upi/card/cheque/bank_transfer.
- `reference_no` Char100 null.
- `notes` Text null.
- `created_by`->Staff SET_NULL null.
- `created_at`.
- Meta: ordering `[-date,-created_at]`; indexes (outlet,date), (outlet,expense_head).

#### SalesReturn (l.682) `billing_salesreturn` (this is the credit note)
- `outlet` CASCADE related `sales_returns`.
- `original_sale`->SaleInvoice PROTECT null/blank related `returns`.
- `manual_override` Bool default False.
- `return_no` Char100.
- `return_date` Date.
- `reason` Text.
- `total_amount` (12,2): net after deduction.
- `deduction_amount` default 0.00.
- `refund_mode` choices cash/upi/credit_note.
- `created_by`->Staff SET_NULL null.
- `created_at`, `updated_at` (auto_now, used for optimistic concurrency).
- Meta: ordering `[-return_date,-created_at]`; indexes (outlet,return_date), (outlet,original_sale), (return_no,outlet); **unique_together (outlet, return_no)**.

#### SalesReturnItem (l.723) `billing_salesreturnitem`
- `sales_return`->SalesReturn CASCADE related `items`.
- `original_sale_item`->SaleItem PROTECT null/blank related `return_items`.
- `batch`->inventory.Batch PROTECT related `return_items`.
- `product_name` Char255, `batch_no` Char100.
- `qty_returned` Int (units).
- `qty_returned_strips`, `qty_returned_loose` Int default 0.
- `return_rate` (10,2), `total_amount` (12,2).
- Meta: ordering `[-id]` (random UUID order).

#### NotificationLog (l.749) `billing_notificationlog`
- `outlet` CASCADE related `notification_logs`.
- `customer`->Customer CASCADE related `notification_logs`.
- `channel` choices whatsapp/sms, default whatsapp.
- `message` Text.
- `status` choices pending/sent/failed, default pending.
- `sent_at` null.
- `created_at`.
- Meta: ordering `[-created_at]`; indexes (outlet,customer), (outlet,status).
- Celery task `tasks.py:5 send_whatsapp_reminder` (stub; marks 'sent') is never enqueued.

#### BillRevision (l.786) `billing_billrevision`
- `outlet` CASCADE related `bill_revisions`.
- `original_invoice`->SaleInvoice CASCADE related `revisions`.
- `revision_number` Char50.
- `revision_type` choices correction/financial_change/cancel_reissue.
- `revision_status` choices draft/applied/failed, default 'applied'.
- `modified_by`->Staff SET_NULL null related `bill_revisions_created`.
- `modified_at` auto_now_add.
- `reason_code` Char50, `reason_text` Text.
- JSON (default dict): `old_snapshot_json`, `new_snapshot_json`, `diff_summary_json`, `stock_impact_json`, `payment_impact_json`, `return_impact_json`.
- Plain UUIDs (null/blank): `resulting_invoice_id`, `linked_credit_note_id`, `linked_debit_note_id`.
- `created_at`, `updated_at`.
- Meta: ordering `[-created_at]`; indexes (outlet,original_invoice), (revision_number,outlet); **unique_together (outlet, revision_number)**.
- **Never written anywhere in app code** (only read for `isModified`). Real revision history lives in `apps.audit` `DocumentRevisionV2`.

#### DraftInvoice (l.846) `billing_draftinvoice`
- `outlet` CASCADE related `draft_invoices`.
- `customer`->Customer SET_NULL null.
- `doctor`->Doctor SET_NULL null.
- `hospital_name`, `prescription_no`.
- `draft_status` choices draft/held, default 'draft'.
- Amounts all default 0: `subtotal`, `discount_amount`, `extra_discount_pct`, `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `round_off`, `grand_total`.
- `payment_mode` Char20 default 'cash'.
- `schedule_h_json` JSON null.
- `created_at`, `updated_at`.
- Meta: ordering `[-updated_at]`. Does NOT deduct stock.

#### DraftInvoiceItem (l.893) `billing_draftinvoiceitem`
- `draft_invoice`->DraftInvoice CASCADE related `items`.
- `batch`->inventory.Batch **CASCADE** (deleting a batch deletes draft lines).
- `qty_strips`, `qty_loose` default 0.
- `discount_pct` (5,2) default 0.

#### Quotation (l.913) `billing_quotation` (no stock/accounting effect)
- `outlet` CASCADE related `quotations`.
- `quotation_no` Char50.
- `quotation_date` auto_now_add.
- `valid_until` DateTime null.
- `status` choices draft/saved/converted/expired/cancelled, default 'saved'.
- `sale_type` Char20 default 'RETAIL'.
- `billing_basis` Char20 null.
- `place_of_supply` Char100 null.
- `is_interstate` Bool.
- `transporter_id` Char100 null.
- `vehicle_no` Char50 null.
- `customer`->Customer SET_NULL null.
- `customer_name_override` Char255 null.
- `customer_phone_override` Char20 null.
- `doctor_name`, `hospital_name`, `notes`.
- Amounts: `subtotal` req; `discount_amount`, `extra_discount_pct`, `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `round_off` default 0; `grand_total` req.
- `converted_to_invoice`->SaleInvoice SET_NULL null related `quotations`.
- `converted_at` null.
- `created_by`->Staff SET_NULL null related `created_quotations`.
- `created_at`, `updated_at`.
- Meta: ordering `[-created_at]`; indexes (outlet,quotation_date), (quotation_no,outlet); **no unique constraint on quotation_no**.

#### QuotationItem (l.979) `billing_quotationitem`
- `quotation`->Quotation CASCADE related `items`.
- `medicine_name` Char255.
- `batch`->inventory.Batch SET_NULL null/blank.
- `batch_no` Char100.
- `expiry_date` Date null.
- `pack_size` Int default 1.
- `qty_strips`, `qty_loose`, `free_qty_strips`, `free_qty_loose` default 0.
- `mrp`, `sale_rate`, `rate`, `ptr`, `pts` (10,2) default 0.
- `hsn_code` Char50 null.
- `discount_pct`, `gst_rate` (5,2).
- `taxable_amount`, `gst_amount`, `total_amount` (12,2).
- No Meta.

Serializers (`serializers.py`): `SaleItemSerializer` (l.7, `validate` runs `validate_sale_price`) and `SaleInvoiceSerializer` (l.49) are used only by `RetryEinvoiceView`; `DocumentRevisionSerializer` (l.66); `DraftInvoiceSerializer` (l.82) and `QuotationSerializer` (l.129) have custom create/update that replace items wholesale.

### 5.3 inventory & purchases

All PKs are `UUIDField(default=uuid4, editable=False)`. `OutletFilteredManager.for_outlet(outlet_id)` exists on Batch (inventory/models.py:8, assigned :~170 `objects`), Distributor, PurchaseOrder, PurchaseInvoice (purchases/models.py:6). apps.py `ready()` in both apps only re-imports models (no signals anywhere in these two apps).

#### B1. inventory/models.py

**MasterProduct** (:16) table `inventory_masterproduct`; global catalog (no outlet FK). Ordering `['name']`.
- name Char255; composition Text; manufacturer Char255; category Char100 (all required, no default).
- drug_type Char20 choices {allopathy,ayurveda,homeo,surgical,general,fmcg}; required.
- schedule_type Char20 choices {OTC,G,H,H1,X,C,Narcotic,Ayurvedic,Surgical,Cosmetic,Veterinary}, default 'OTC'.
- hsn_code Char20 null/blank db_index; gst_rate Decimal(5,2) default 0; pack_size Int (required); pack_unit Char50 (required); pack_type Char20 choices {strip,bottle,vial,box,blister,tube,packet,other}.
- barcode Char100 null/blank UNIQUE; is_fridge bool F; is_discontinued bool F; image_url URL null; mrp Decimal(10,2) default 0; created_at auto_now_add.
- Indexes: hsn_code, schedule_type, drug_type, 3 GIN trigram (`master_prod_name_trgm_gin`, `master_prod_comp_trgm_gin`, `master_prod_mfg_trgm_gin`, gin_trgm_ops; needs pg_trgm).
- NOTE: no min_qty/reorder_qty fields (those live in OutletProductConfig).

**OutletProductConfig** (:88) `inventory_outletproductconfig`: outlet FK core.Outlet CASCADE rel `product_configs`; product FK MasterProduct CASCADE rel `outlet_configs`; min_qty Dec(10,2) def 0 (strips); reorder_qty Dec(10,2) def 0; created_at, updated_at. unique_together (outlet, product); index (outlet, product).

**MasterProductAlias** (:112) `inventory_masterproductalias`: outlet FK CASCADE rel `product_aliases`; product FK MasterProduct CASCADE rel `aliases`; alias_name Char255 db_index; created_at. unique_together (outlet, alias_name). Written only by atomic_purchase_save (OCR learning); read by ocr_engine.match_medicine.

**Batch** (:128) `inventory_batch`; ordering `['expiry_date','-created_at']`.
- outlet FK CASCADE rel `batches`; product FK MasterProduct SET_NULL null/blank rel `batches` (nullable => custom-product batches).
- batch_no Char100; mfg_date Date null; expiry_date Date (required); mrp Dec(10,2) req; ptr Dec(10,2) def 0; pts Dec(10,2) def 0; default_scheme Char50 null; purchase_rate Dec(10,2) req ("cost per pack"); landing_rate Dec(10,2) null/blank (only written by BatchDetailUpdateView, never by purchase flow); pack_size Int def 1; pack_unit Char50 def 'tablet'; pack_type Char20 choices PACK_TYPE_CHOICES (required, no default).
- qty_strips Int def 0; qty_loose Int def 0; opening_qty Dec(12,3) null; rack_location Char100 null; is_active bool T; is_opening_stock bool F; created_at.
- Indexes: (outlet, expiry_date), (outlet, product, is_active), (batch_no, outlet), (product_id, expiry_date, ptr). Constraints: CHECK qty_strips>=0 `batch_qty_strips_non_negative`; CHECK qty_loose>=0 `batch_qty_loose_non_negative`. NO unique constraint on (outlet, product, batch_no, expiry_date).
- Methods: `clean()` :178 (negative checks), `save()` :185 (calls clean), props `total_stock` :191 (=strips*pack_size+loose, UNITS), `stock_value` :197 (float, purchase_rate), `mrp_value` :203.
- Quantity contract: qty_strips = whole packs, qty_loose = units < pack_size.

**StockLedger** (:209) default table `inventory_stockledger`; ordering `['txn_date','created_at']`.
- outlet FK PROTECT rel `stock_ledger_entries`; product FK MasterProduct SET_NULL null rel `stock_ledger_entries`; batch FK Batch SET_NULL null rel `stock_ledger_entries`.
- txn_type Char20 choices {OPENING,PURCHASE_IN,SALE_OUT,PURCHASE_RETURN,SALE_RETURN,ADJUSTMENT_IN,ADJUSTMENT_OUT}; txn_date Date; voucher_type Char50; voucher_number Char50 blank def ''; party_name Char200 blank def ''.
- content_type FK contenttypes SET_NULL null + object_id UUID null (generic source pointer, no GenericForeignKey declared).
- batch_number Char100 snapshot; expiry_date Date null snapshot.
- qty_in/qty_out Dec(12,4) def 0; rate Dec(12,4); value_in/value_out Dec(14,2); running_qty Dec(12,4); running_value Dec(14,2); created_at; actor FK AUTH_USER_MODEL SET_NULL null.
- Indexes: (outlet, product, txn_date), (outlet, batch, txn_date), (outlet, product, batch).
- Unit: qty_in/qty_out/running_qty are in STRIPS (fractional for loose) per sale_services.py:462-478 and purchase/adjust writers.

**StockAdjustment** (:266) default table `inventory_stockadjustment`: outlet FK CASCADE rel `stock_adjustments`; batch FK Batch CASCADE rel `stock_adjustments`; source_ledger_entry OneToOne StockLedger CASCADE null rel `stock_adjustment`; adjustment_type Char50 {EXPIRED,DAMAGED,DESTROYED,THEFT_LOSS}; qty_strips Int 0; qty_loose Int 0; status {PROPOSED,APPROVED,INCLUDED_IN_EXPORT} def PROPOSED; traceability_status {FIFO_MATCHED,NEEDS_REVIEW} def NEEDS_REVIEW; reason Text null; effective_date Date; gstr_reason_code Char50 def 'SECTION_17_5_H'; target_gstr3b_table Char50 def '4(B)(1)'; created_at/updated_at. `clean()` :300 blocks edits to INCLUDED_IN_EXPORT rows; `save()` :316 calls clean. No Meta (no ordering/indexes). Created automatically by `inventory.services._auto_create_stock_adjustment`.

**StockAdjustmentAllocation** (:321) default table: stock_adjustment FK CASCADE rel `allocations`; source_purchase_item FK purchases.PurchaseItem PROTECT rel `adjustment_allocations`; allocated_qty Dec(12,3); taxable_value, reversed_igst_amount, reversed_cgst_amount, reversed_sgst_amount, reversed_cess_amount Dec(14,2) def 0; allocation_order Int 0; metadata JSON {}; created_at. Ordering `['allocation_order']`. (Consumer: reports/gstr_builders, ITC reversal Sec 17(5)(h) (inferred).)

#### B2. purchases/models.py

**Distributor** (:14) `purchases_distributor`; ordering `['name']`; manager OutletFilteredManager.
- outlet FK CASCADE rel `distributors`; name Char255; gstin Char15 null; drug_license_no Char100 null; dl_no_20b Char50 null; dl_no_21b Char50 null; food_license_no Char50 null; phone Char20 blank def ''; mobile Char15 null; contact_person Char100 null; email Email null; address Text def ''; city Char100 def ''; state Char100 def ''; state_code Char5 null.
- credit_days Int 0; opening_balance Dec(12,2) null; balance_type Char2 {CR,DR} def 'CR' (labels are inverted/confusing: 'CR'="Distributor Owes Us"); ocr_column_map JSON {} (learned column synonyms); is_active T; created_at.
- Indexes: (outlet,is_active), (gstin), (outlet,name). No uniqueness on gstin.
- Linked 1:1-ish from accounts.Ledger.linked_distributor.

**PurchaseOrder** (:75) `purchases_purchaseorder`; ordering `['-created_at']`: outlet FK CASCADE rel `purchase_orders`; distributor FK PROTECT rel `purchase_orders`; po_number Char50 (not unique); status {SAVED,SENT,PARTIAL,COMPLETED,CANCELLED} def SAVED; order_date auto_now_add; sent_at DateTime null; expected_date Date null; total_amount Dec(12,2); purchase_bill FK PurchaseInvoice SET_NULL null rel `linked_pos`; created_at/updated_at. Indexes (outlet,status), (po_number).

**PurchaseOrderItem** (:114) `purchases_purchaseorderitem`: purchase_order FK CASCADE rel `items`; product FK MasterProduct PROTECT rel `po_items`; qty_strips Int 1; received_qty Int 0; last_rate Dec(10,2); unit_ptr_estimated Dec(10,2); taxable_amount Dec(12,2).

**PurchaseInvoice** (:134) `purchases_purchaseinvoice`; ordering `['-invoice_date','-created_at']`.
- outlet FK CASCADE rel `purchase_invoices`; distributor FK PROTECT null/blank rel `purchase_invoices` (null while SAVED draft).
- status Char10 {SAVED=draft scanned, POSTED} DEFAULT 'POSTED'; invoice_image ImageField upload_to `purchase_invoices/%Y/%m/` null; ocr_raw_data JSON null; ocr_confidence Float null; ocr_distributor_name Char255 null; ocr_distributor_gstin Char15; ocr_distributor_phone Char20; ocr_distributor_dl Char100; ocr_distributor_address Text; ocr_processing_error Text null (holds an OCR_* code).
- invoice_no Char100 blank def ''; invoice_date Date null; due_date Date null; purchase_type {cash,credit} def credit; purchase_order_ref Char100 null; godown {main,cold_storage,secondary} def main.
- subtotal Dec(12,2) req; discount_amount 0; invoice_discount 0; taxable_amount req; gst_amount 0; cess_amount 0; freight 0; round_off 0; ledger_adjustment 0; ledger_note Char255 null; grand_total req; amount_paid 0; outstanding 0.
- created_by FK accounts.Staff SET_NULL null rel `purchase_invoices_created`; notes Text null; created_at.
- Indexes: (outlet,invoice_date), (outlet,distributor), (invoice_no,outlet), (outlet,status). Uniqueness of (outlet, distributor, invoice_no) for POSTED is service-level only (services.py:96-103), no DB constraint.
- Props `is_draft` :248, `is_posted` :252.

**PurchaseItem** (:256) `purchases_purchaseitem`; ordering `['-created_at']`; index (invoice,batch).
- invoice FK CASCADE rel `items`; batch FK inventory.Batch PROTECT rel `purchase_items` (required, so every item has a batch); master_product FK SET_NULL null rel `purchase_items`; custom_product_name Char255 null; is_custom_product bool F.
- hsn_code Char20 null; batch_no Char100; expiry_date Date; pkg Int (pack size frozen); qty Int (packs); actual_qty Int (= pkg*qty UNITS, audit only); free_qty Int 0.
- purchase_rate Dec(10,2); discount_pct Dec(5,2) 0; cash_discount_pct 0; gst_rate Dec(5,2) 0; cess Dec(5,2) 0; mrp, ptr, pts Dec(10,2) (all required).
- freight_per_unit Dec(10,4) 0; other_cost_per_unit Dec(10,4) 0; gst_per_unit Dec(10,4) 0; landing_rate Dec(10,4) 0.
- taxable_amount, gst_amount, total_amount Dec(12,2) req; cess_amount 0; created_at.
- Method `get_landing_cost(include_gst=False)` :305 = purchase_rate [+ purchase_rate*gst_rate/100 if include_gst] + freight_per_unit + other_cost_per_unit, quantized 0.0001 (ignores discounts and cess; see D).

**Rule37Adjustment** (:337) `purchases_rule37adjustment`; ordering `['-calculation_date']`: invoice FK PurchaseInvoice CASCADE rel `rule37_adjustments`; status {PROPOSED,NEEDS_REVIEW,APPROVED,INCLUDED_IN_EXPORT}; action_type {REVERSAL_DUE,REAVAILMENT_ELIGIBLE}; rule37_due_date Date; days_outstanding_at_evaluation Int; calculation_date auto_now_add; payment_date Date null; reclaim_period Char6 null (MMYYYY); reclaimed_igst/cgst/sgst Dec(12,2) null; invoice_total_at_evaluation, amount_paid_at_evaluation, unpaid_amount_at_evaluation Dec(12,2); unpaid_ratio Dec(5,4); reversed_igst/cgst/sgst/cess Dec(12,2) 0; gstr_reason_code Char50 def 'RULE_37'; target_gstr3b_table Char50 def '4(B)(2)'; source_reversal FK self SET_NULL null rel `reavailments`; metadata JSON {} (required default dict); created_at/updated_at. Producer: `Rule37TrackerService.evaluate_invoices` (services.py:1171); consumer: reports/gstr_builders.py:569-618.

Related models owned by other apps but central to these flows: billing.PaymentEntry (billing/models.py:407, FK distributor PROTECT rel `payments`), billing.PaymentAllocation (:448, FK invoice->PurchaseInvoice PROTECT rel `payment_allocations`), billing.LedgerEntry (:481; legacy distributor/customer running-balance ledger), accounts.Ledger (linked_distributor), accounts.JournalEntry/JournalLine, core.TaxSlab (core/models.py:398), core.OutletSettings (gst_registered :184, landing_cost_include_gst :200).

### 5.4 reports

File `apps/backend/apps/reports/models.py`. Migrations 0001-0010 in `R/migrations/`. All PKs UUID (`default=uuid.uuid4`, non-editable) unless noted. `USE_TZ=False`, so all datetimes are naive IST.

#### GSTTransactionSnapshot (models.py:6, table `reports_gsttransactionsnapshot`)
Immutable-ish normalised JSON of a finalized sale/purchase/return for GST reporting.
- `id` UUID PK
- `outlet` FK core.Outlet CASCADE (related `gst_snapshots`), required
- `gstin` Char(15) required (taxpayer GSTIN at time of txn)
- `period` Char(6) required, format `MMYYYY`
- `transaction_type` Char(20) required, choices: sale, purchase, sales_return, purchase_return, sales_credit_note, sales_debit_note, purchase_credit_note, purchase_debit_note
- `document_id` UUID required (source invoice/return id, NOT a FK)
- `document_number` Char(50) required
- `document_date` Date required
- `snapshot_json` JSON required. Keys written by `gst_snapshot_service.create_sale_snapshots`: `customer_name, customer_gstin, is_b2b, is_interstate, pos, supplier_state_code, original_supply_classification (B2B|B2CL|B2CS), items_by_rate{rate_str:{taxable_amount,igst,cgst,sgst,cess}}, hsn_summary{hsn_rate_uqc:{taxable_amount,igst,cgst,sgst,cess,qty,uqc,rate,hsn_code}}`. Purchase snapshots add `distributor_gstin`, `is_rcm`, `is_import`, `is_exempt` flags (read by builders).
- `created_at` auto_now_add, `updated_at` auto_now
- Meta: ordering `-document_date,-created_at`; indexes `(outlet,period,transaction_type)`, `(document_number)`. No unique constraint on `(outlet, transaction_type, document_id)` (dedup is delete-then-create in the service).

#### GSTR2BImportJob (models.py:46, table `reports_gstr2bimportjob`)
- `id` UUID PK; `outlet` FK Outlet CASCADE (related `gstr2b_jobs`); `gstin` Char(15); `period` Char(6)
- `provider` Char(50) default "Sandbox"; `retrieval_timestamp` auto_now_add
- `session_reference_id` UUID null (points at core.GstTaxpayerAuth.id); `provider_chksum`, `local_payload_sha256`, `raw_payload_hash`, `page_hash` Char(64) null
- `request_metadata` JSON default dict; `provider_mode` Char(20) default 'test'; `host` Char(255) null
- `status` Char(30) required (IN_PROGRESS, COMPLETED, FAILED, INCOMPLETE, NO_CHANGE, NO_DATA_AVAILABLE; free text, no choices)
- `file_count_expected` Int default 1; `file_count_fetched` Int default 0; `record_count` Int default 0
- `error_metadata` JSON default dict; `reused_from_job` FK self null SET_NULL
- Meta: index `(outlet,period,gstin)`

#### GSTR2BData (models.py:68, table `reports_gstr2bdata`)
Header-level parsed GSTR-2B document.
- `outlet` FK Outlet CASCADE (no related_name); `import_job` FK GSTR2BImportJob null CASCADE (related `documents`); `period` Char(6)
- `supplier_gstin` Char(15); `supplier_name` Char(255) null; `document_type` Char(10) null, choices B2B,B2BA,CDN,CDNA,ISD
- `invoice_number` Char(50); `invoice_date` Date; `original_document_reference` Char(50) null
- `taxable_value` Dec(12,2) required; `igst,cgst,sgst,cess` Dec(12,2) default 0
- `supplier_status` Char(20) default "Active"; `itc_availability_status` Char(5) null; `itc_ineligible_reason` Char(255) null; `ims_status` Char(50) null
- `raw_data` JSON default dict (legacy); `normalizer_version` Char(20) default '1.0'; `raw_record_hash` Char(64) null; `source_document_type` Char(20) null; `source_field_map` JSON default dict
- Meta: index `(outlet,period,supplier_gstin)`; unique_together `(import_job, supplier_gstin, document_type, invoice_number)` (ineffective when `import_job` is NULL because Postgres treats NULLs as distinct; `GSTR2BService.reconcile` creates rows without `import_job`)

#### ITCReconciliationRun (models.py:104, table `reports_itcreconciliationrun`)
- `outlet` FK CASCADE; `import_job` FK GSTR2BImportJob null CASCADE; `period` Char(6); `run_date` auto_now_add; `status` Char(20) (Pending/Completed/Failed); `summary` JSON default dict

#### ITCReconciliationResult (models.py:117, table `reports_itcreconciliationresult`)
- `run` FK Run CASCADE (related `results`); `purchase_snapshot` FK GSTTransactionSnapshot null SET_NULL; `gstr2b_record` FK GSTR2BData null SET_NULL
- `match_status` Char(30): MATCHED / MISMATCHED / MISSING_IN_2B / MISSING_IN_PR (set in `gstr2b_service.py`); `mismatch_reasons` JSON list
- Meta: indexes `(run,match_status)`, `(purchase_snapshot,gstr2b_record)`. Note `purchase_snapshot` has `null=True` but no `blank=True`.

#### DeferredITCEntry (models.py:134, table `reports_deferreditcentry`)
- `purchase_invoice` FK purchases.PurchaseInvoice CASCADE (related `deferred_itc_entries`); `original_period` Char(6)
- `iamt,camt,samt,csamt` Dec(12,2) default 0; `status` Char(20) choices DEFERRED/CLAIMED/WRITTEN_OFF default DEFERRED; `claimed_period` Char(6) null; `created_at`, `updated_at`
- Meta: unique_together `(purchase_invoice, original_period)`

#### GSTExportAudit (models.py:156, table `reports_gstexportaudit`)
- `actor` FK AUTH_USER_MODEL (accounts.Staff) null SET_NULL (related `gst_exports`); `outlet` FK core.Outlet CASCADE; `period` Char(6)
- `export_type` Char(50) choices GSTR1_EXCEL, GSTR3B_OFFLINE_UTILITY, WORKING_PAPER_PDF, RECONCILIATION_EXCEL (GSTR2B JSON export writes its own value, not in choices)
- `timestamp` auto_now_add; `template_checksum` Char(64) null; `template_version` Char(50) null; `source_json_hash` Char(64) null; `output_file_hash` Char(64) required; `validation_state` JSON default dict
- Meta: ordering `-timestamp`. Uses default integer `id` (BigAutoField), the only reports model without a UUID PK.

#### FixedMonthlyExpense (models.py:176, table `reports_fixedmonthlyexpense`)
- `outlet` FK CASCADE (related `fixed_monthly_expenses`), unique per outlet (`unique_together=('outlet',)`)
- Dec(10,2) default 0: `salary, rent, transport, petrol, light, water, internet, stationery, int_on_cc, income_tax, ca_fees, godown, other`
- `days_in_month` Int default 30; `updated_at` auto_now; `updated_by` FK Staff null SET_NULL (no related_name)
- Properties: `total_monthly` (sum of 13 amounts), `per_day` = round(total/days_in_month, 2) (0.0 if days<=0)

#### DailyCashReport (models.py:207, table `reports_dailycashreport`)
- `outlet` FK CASCADE (related `daily_cash_reports`); `date` Date
- Int default 0: `notes_2000, notes_500, notes_200, notes_100, notes_50, notes_20, notes_10`
- Dec(10,2) default 0: `opening_cash, carton_sale, petty_cash_exp, side_cash, next_day_opening`
- `updated_at` auto_now; `updated_by` FK Staff null SET_NULL
- Meta: unique `(outlet,date)`, ordering `-date`
- Property `actual_cash` = sum(notes x denomination) + float(side_cash) (mixed int/float; `petty_cash_exp` field is unused by the snapshot, which recomputes expenses from vouchers)

Reports does not own models for ERP/sales/expiry/schedule reports; those read other apps' tables (SaleInvoice `billing_saleinvoice`, PurchaseInvoice `purchases_purchaseinvoice`, Batch, StockLedger, etc.).

---

## 6. Frontend (`apps/frontend`)

Stack: Next.js 14.2.15, React 18.2, TypeScript 5.4 (strict, but `ignoreBuildErrors: true`), Tailwind 3.4 + shadcn/Radix, Zustand 5 (persist), TanStack Query 5, TanStack Table 8, react-hook-form + zod 4, Recharts 3, date-fns 4, sonner + Radix toast, axios (only `lib/api.ts`), Dexie (installed, **no longer used**), Serwist (PWA, **disabled**).
Counts: 66 `page.tsx`, 7 `layout.tsx`, ~154 component files outside `components/ui` (+34 ui primitives), 28 hook files, 5 Zustand stores.
Path alias `@/*` -> `apps/frontend/*` (tsconfig). A few files use bare `components/...` imports (baseUrl `.`), e.g. `app/dashboard/staff/page.tsx`.

Conventions: API JSON is camelCase end-to-end (backend has `apps/billing/camel_case_helper.py`); the frontend does NO global key conversion. A few endpoints are written with hand-built snake_case payloads (see C.5 / F).

### 6.1 Pages & routes

#### A.0 Route guards and layouts

| Layer | File | Behaviour |
|---|---|---|
| Edge middleware | `middleware.ts` | Matcher excludes `api`, `_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `manifest*`, `icon-*`. Reads cookie `access_token` OR `mediflow_mock_auth`. No cookie and path not in `PUBLIC_PATHS` (`/login`, `/setup`, `/sw.js`, `/manifest.webmanifest`, `/manifest.json`) -> redirect `/login?redirect=<path>`. Authenticated user hitting `/login` -> `/dashboard`. **Presence-only check**: token is never verified/decoded; no role checks at the edge. `/setup` is whitelisted but no such route exists. |
| Root layout | `app/layout.tsx` | `<Providers>` (`app/providers.tsx`: QueryClientProvider + manual rehydrate of auth/billing/settings stores + unregisters all service workers and clears all Cache Storage on every load), `ErrorBoundary`, `Toaster`, `GlobalShortcuts` (keyboard shortcuts; replaced the Ctrl-K palette), `GlobalModalManager`. Viewport locks zoom (`userScalable:false`). |
| `app/dashboard/layout.tsx` | client | If store hydrated and `!isAuthenticated` -> `router.push('/login')`; else calls `authApi.me()` to refresh user/outlet in `authStore`. Renders `OfflineBanner`, sticky `GlobalNavigation` + `SmartCheckInBanner`, `GlobalOverlays` (renders `null`). Shows `DashboardSkeleton` until hydrated. |
| `app/billing/layout.tsx` | client | Same auth check + `me()` refresh; full-screen (`h-screen`) shell, `OfflineBanner` only (no nav; nav is rendered inside `billing/page.tsx`). |
| `app/gst/layout.tsx` | client | Same auth check; adds GST tab bar (Overview, GSTR-1, GSTR-3B, GSTR-2A, GSTR-2B Recon, Sandbox, Export History). |
| `app/admin/layout.tsx` | client | Same auth check; handles `me()` shape `data.user` (dead branch, `me()` returns flat object). **No admin role check here**; the role check is inside `admin/audit/page.tsx` (`role !== admin/super_admin`). |
| `app/dashboard/accounts/layout.tsx` | client | "Finance Command Center" header + tabs (Overview, Payables, Receivables, Vouchers). Hides header/tabs on "deep" pages (path depth > 4, `sale-returns`, `purchase-returns`). |
| `app/dashboard/attendance/mark/layout.tsx` | server | Pass-through `<>{children}</>`; file contains a long rambling comment (cannot override parent layout). |
| `app/(auth)/loading.tsx` | server | Spinner for the auth group. |
| Permission gating | `lib/access.ts` (`hasPermission`: server `user.permissions` first, local mirror only for old cached sessions), `hooks/usePermissions.ts`, `components/shared/PermissionGate.tsx`, `lib/navConfig.ts`, `lib/routeAccess.ts` + `components/shared/RouteGuard.tsx` (page-level guard in the dashboard/billing/gst/admin layouts; denies only after the first server refresh), `components/shared/SessionSync.tsx` (refreshes the stored user on load/focus/3 min/after any 403), `hooks/useAuthGate.ts`, `lib/authMapper.ts` | UI mirrors the server; the API is the authority. Fixture `lib/permission-matrix.fixture.json` (generated by `manage.py dump_permission_matrix`) keeps the local mirror identical to the server rules. |

Redirects (next.config.js): `/dashboard/billing[/*]` -> `/billing[/*]` (permanent).

#### A.1 Page table

Legend: "Store" = Zustand store; hooks listed by name. API paths are relative to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). `apiClient` wrapper names are given as `xxxApi.method` and resolved in C.4.

##### Root / auth

| Route | File | Purpose | Key components | Hooks/store | Backend APIs |
|---|---|---|---|---|---|
| `/` | `app/page.tsx` | `redirect('/login')` | - | - | - |
| `/login` | `app/(auth)/login/page.tsx` (+ `LoginForm.tsx`) | Phone + password login; on success sets `access_token` cookie (max-age 86400, SameSite=Lax, **not HttpOnly**), stores user in authStore, redirects to `?redirect` or `/dashboard` | `LoginForm` | react-hook-form + `loginSchema`, `authStore` | POST `/auth/login/` |

##### Billing (POS) — full screen, no dashboard chrome

| Route | File | Purpose | Key components | Hooks/store | Backend APIs |
|---|---|---|---|---|---|
| `/billing` | `app/billing/page.tsx` | POS terminal: staff PIN gate -> multi-tab draft invoices, product grid, right rail with totals/payment, success screen | `StaffPinEntry`, `BillingHeaderStrip`, `ActiveBillsTabs`, `MainInvoiceWorkspace`, `RightBillingRail`, `BillSuccessScreen`, `InvoicePreviewModal`, `EditSaleHydrator`, `GlobalNavigation` | `billingStore`, `useLoadDrafts`, `useAutosaveDraft`, `useEnterNavigation`; Ctrl+M toggles margin view | GET `/sales/drafts/?outletId=`, POST `/sales/drafts/`, PUT `/sales/drafts/{id}/` (hooks, raw fetch); POST `/staff/lookup-by-pin/`; GET `/products/search/`; POST `/sales/`, PUT `/sales/{id}/`, POST `/sales/{id}/revise/`, POST/PUT `/quotations/`; GET `/sales/{id}/` (EditSaleHydrator via axios `api`); GET `/ledgers/?outletId=`; GET `/doctors/`; POST `/doctors/` |
| `/billing/[id]` | `app/billing/[id]/page.tsx` | Print view of a saved invoice (A4 or thermal chosen from settings) | `ManavataA4Invoice`, `InvoiceThermal` | `settingsStore`, `authStore`, `billingStore`, `useOutletSettings` | GET `/sales/{id}/?outletId=`; GET `/outlet/settings/` |

##### Dashboard home & modules

| Route | File | Purpose | Key components | Hooks/store | Backend APIs |
|---|---|---|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | KPI home: stat cards, payment pie, hourly sales, top sellers, staff leaderboard, alerts, profit analysis | `DashboardHeader`, `StatCardsRow`, `PaymentPieChart`, `HourlySalesChart`, `TopSellingTable`, `StaffLeaderboard`(dashboard), `AlertsRow`, `ProfitAnalysisCard` | `useDashboardKPI`, `useDashboardAlerts` | GET `/dashboard/daily/?outletId=&date=` (polled every 2 min) |
| `/dashboard/sales` | `dashboard/sales/page.tsx` | Invoice list/search, view, print, e-way bill PDF, retry e-invoice | `SalesList`, `InvoicePreviewModal` | `useSalesList`, `useSaleById` | GET `/sales/`, GET `/sales/{id}/`, GET `/sales/{id}/eway-bill-pdf/`, POST `/sales/{id}/retry-einvoice/` (raw fetch, hard-coded fallback `:8090`) |
| `/dashboard/sales/quotations` | `dashboard/sales/quotations/page.tsx` | Quotation list, convert to invoice | `QuotationsList`, `InvoicePreviewModal` | `useQuotationsList` | GET `/quotations/?outletId=`, GET `/quotations/{id}/`, POST `/quotations/{id}/convert/`, POST `/inventory/batches/availability-check/` |
| `/dashboard/sales/revisions` | `dashboard/sales/revisions/page.tsx` | Org-wide sale revision list + CSV export | (inline) | `authStore`, axios `api` | GET `/revisions/?outletId=`, GET `/sales/revisions/report/`; CSV via `window.open(.../revisions/?outletId=&export=csv)` |
| `/dashboard/sales/revisions/[invoiceId]` | `.../[invoiceId]/page.tsx` | Revision timeline + snapshot preview for one invoice | `InvoicePreviewModal` | `authStore`, `api` | GET `/audit/revisions/sale/{id}/` |
| `/dashboard/inventory` | `dashboard/inventory/page.tsx` | Stock list (TanStack table), expiry & low-stock tabs, stat cards, export | `InventoryStatCards`, `StockTable`, `ExpiryTable`, `LowStockTable`, `StockAdjustmentModal`, `EditProductModal`, `PermissionGate` | `useInventoryFilters`, `useStockPage`, `inventoryStore`(valuation mode), `authStore` | GET `/inventory/`, GET `/reports/batch-wise/export/` (raw fetch), POST `/inventory/adjust/`, GET `/reports/inventory/valuation/`, PUT `/products/{id}/`, `/inventory/outlet-configs/` |
| `/dashboard/inventory/[productId]` | `.../[productId]/page.tsx` | Product detail: batches, edit batch, adjust stock, edit product | `PermissionGate`, `StockAdjustmentModal` | `useOutletId` | GET `/inventory/?productId=`, PUT `/batches/{id}/`, POST `/inventory/adjust/`, PUT `/products/{id}/` |
| `/dashboard/stockledger` | `dashboard/stockledger/page.tsx` | Per-batch stock movement ledger (688 L, all inline) | (inline) | `useOutletId` | GET `/inventory/stockledger/?...`, GET `/inventory/stockledger/batches/?outletId=` (raw fetch, `API_URL!`) |
| `/dashboard/purchases` | `dashboard/purchases/page.tsx` | Tabs: Purchases list, New Purchase (grid form, OCR scan), Distributors, Purchase Orders | `PurchasesList`, `NewPurchaseForm`, `DistributorsTab`, `PurchaseOrdersList` | `authStore`, `usePurchasesList`, `useCreatePurchase`, `useUpdatePurchase`, `useConfirmDraft`, `useDeleteDraft`, `useDistributors`, `usePurchaseOrders` | GET/POST `/purchases/`, PUT `/purchases/{id}/`, POST `/purchases/{id}/confirm/`, DELETE `/purchases/{id}/`, GET `/purchases/check-invoice/`, POST `/purchases/scan/upload/`, GET `/purchases/{id}/ocr-status/`, POST `/purchases/{id}/ocr-retry/`, `/purchases/distributors/*`, `/purchases/orders/*`, POST `/purchases/payments/` |
| `/dashboard/purchases/orders/[id]` | `.../orders/[id]/page.tsx` | Purchase order detail, suggestions, Excel/PDF export | `PODetailView` | `useDistributorList`, `useOutletId` | GET `/purchases/orders/{id}/`, `/purchases/orders/{id}/export/excel/`, `/export/pdf/`, GET `/purchases/orders/suggestions/` (raw fetch) |
| `/dashboard/purchases/revisions/[invoiceId]` | `.../[invoiceId]/page.tsx` | Purchase revision timeline | - | `authStore`, `api` | GET `/audit/revisions/purchase/{id}/` |
| `/dashboard/customers` | `dashboard/customers/page.tsx` | Customer list (table/grid), filters, refill alerts, create/edit | `CustomerStatCards`, `CustomerFiltersBar`, `CustomerTable`, `CustomerGrid`, `CustomerForm`, `RefillAlertsBanner` | `useCustomerList`, `useCreateCustomer`, `useUpdateCustomer`, `useRefillAlerts` | GET/POST `/customers/`, PUT `/customers/{id}/`, GET `/customers/refill-alerts/` |
| `/dashboard/customers/[id]` | `.../[id]/page.tsx` (788 L) | Customer 360: purchase history, items, chronic meds, credit payment, reorder into billing | `CustomerForm`, `InvoicePreviewModal`, `RecordCreditPaymentModal` | `useCustomerById`, `useCustomerInvoices`, `useInvoiceItems`, `useCreditAccounts`, `billingStore` | GET `/customers/{id}/`, `/customers/{id}/purchase-history/`, `/sales/?customerId=`, `/sales/{id}/items/`, POST `/inventory/batches/availability-check/` |
| `/dashboard/credit` | `dashboard/credit/page.tsx` | Credit (udhaar) accounts, aging buckets, record payment, edit limit, bulk WhatsApp reminders | `AgingSummaryCards`, `CreditAccountsList`, `CustomerCreditDetail`, `EditCreditLimitModal`, `BulkReminderModal`, `RecordCreditPaymentModal` | `useCreditAccounts`, `useCreditAgingSummary`, `useCreditTransactions`, `useRecordCreditPayment`, `useUpdateCreditLimit` | GET `/credit/?outletId=&pageSize=500`, GET `/credit/{id}/transactions/`, POST `/credit/payment/`, PATCH `/credit/{customerId}/limit/`, POST `/credit/{id}/reminder/` |
| `/dashboard/staff` | `dashboard/staff/page.tsx` | Staff list + leaderboard, add/edit/delete | `StaffTable`, `StaffFormModal`, `StaffLeaderboard`(staff), `StaffPerformanceModal`, `PermissionGate(manage_staff)` | `useStaffList`, `useCreateStaff`, `useUpdateStaff`, `useDeleteStaff`, `useStaffLeaderboard`, `useStaffPerformance` | GET `/staff/`, POST `/staff/create/`, PATCH/DELETE `/staff/{id}/`, GET `/staff/{id}/performance/`, GET `/staff/leaderboard/` |
| `/dashboard/attendance` | `dashboard/attendance/page.tsx` | Tabs: Summary, Today, Monthly; smart check-in | `AttendanceSummaryTab`, `TodayAttendanceTab`, `MonthlyAttendanceTab`, `SmartCheckInAction`, `ManualAttendanceModal` | `useTodayAttendance`, `useMonthlyAttendance`, `useMonthlySummaries`, `useKioskCheckIn/Out`, `useMarkManualAttendance` | GET `/attendance/today/`, `/attendance/`, `/attendance/summary/`, POST `/attendance/check-in/`, POST `/attendance/manual/`, GET `/attendance/my-ip/` |
| `/dashboard/attendance/mark` | `.../mark/page.tsx` | Placeholder: "coming soon in Phase 2". `KioskMode` component exists but is not mounted here | - | - | - |
| `/dashboard/chain` | `dashboard/chain/page.tsx` | Multi-outlet (organization) dashboard, switch outlet, add outlet | `AddOutletModal` | `authStore`, `settingsStore`, `billingStore` | GET `/organizations/dashboard/?orgId=`, POST `/auth/switch-outlet/`, POST `/organizations/{id}/outlets/` |
| `/dashboard/settings` | `dashboard/settings/page.tsx` | Sidebar-nav settings with unsaved-change guard: outlet, GST, printer, billing, billing-pricing, attendance, notifications, preferences, data mgmt | `SettingsSidebar`, `*SettingsSection` (9) | `usePermissions`, `settingsStore`, `useOutletSettings` | GET/PATCH `/outlet/settings/`, GET `/attendance/my-ip/` |

##### Accounts (`/dashboard/accounts/*`)

| Route | File | Purpose | Key components | Hooks | Backend APIs |
|---|---|---|---|---|---|
| `/dashboard/accounts` | `accounts/page.tsx` | `redirect('/dashboard/accounts/vouchers')` | - | - | - |
| `/dashboard/accounts/overview` | `overview/page.tsx` | Finance command-center | `TopSummaryStrip`, `AgingOverview`, `PriorityActionPanel`, `AuditAndReconciliationWatch`, `QuickActionsBar` | `useDashboardKPIs/Aging/UrgentActions/AuditAlerts` | GET `/dashboard/kpis/`, `/dashboard/aging/`, `/dashboard/urgent/`, `/dashboard/audit-alerts/` |
| `/dashboard/accounts/payables` | `payables/page.tsx` | Distributor outstanding + pay | `PayablesWorkspace`, `PayDistributorSheet`, `LedgerDrawer` | `useDistributorOutstanding`, `useCreatePayment`, `useUnpaidInvoices` | GET `/outstanding/distributors/`, GET `/purchases/distributors/{id}/outstanding/`, POST `/purchases/payments/` |
| `/dashboard/accounts/receivables` | `receivables/page.tsx` | Customer outstanding + receive payment | `ReceivablesWorkspace`, `ReceivePaymentSheet`, `LedgerDrawer` | `useCustomerOutstanding`, `useCreateReceipt`, `useCustomerUnpaidInvoices` | GET `/outstanding/customers/`, GET `/customers/{id}/outstanding/`, POST `/receipts/` |
| `/dashboard/accounts/expenses` | `expenses/page.tsx` | Expense entry/list | `ExpensesTab` | `useExpenses`, `useCreateExpense` | GET/POST `/expenses/` |
| `/dashboard/accounts/vouchers` | `vouchers/page.tsx` | Voucher list/search | `VoucherDetailModal` | `useDebounce` | GET `/vouchers/?outletId=&type=`, GET `/vouchers/{id}/` |
| `/dashboard/accounts/voucher-entry` | `voucher-entry/page.tsx` | Create/edit voucher (payment, receipt, journal, contra) | `VoucherForm` (776 L), `VoucherLinesGrid`, `LedgerPicker`, `BillAdjustmentModal` | `useOutletId` | GET `/ledgers/next-no/`, POST/PUT `/vouchers/`, GET `/ledgers/{id}/pending-bills/` |
| `/dashboard/accounts/voucher-entry/revisions/[id]` | `.../revisions/[id]/page.tsx` | Voucher revision timeline (contains a `console.log`) | - | `useOutletId`, `api` | GET `/audit/revisions/voucher/{id}/` |
| `/dashboard/accounts/ledgers` | `ledgers/page.tsx` | Ledger list/sync/create | `CreateLedgerModal` | `useOutletId` | GET `/ledgers/`, POST `/ledgers/sync/`, GET `/ledger-groups/` |
| `/dashboard/accounts/ledgers/[id]` | `ledgers/[id]/page.tsx` (487 L) | Ledger statement w/ drill-down to purchase/voucher | `PurchaseDetailModal`, `VoucherDetailModal` | `useOutletId` | GET `/ledgers/{id}/statement/`, GET `/purchases/{id}/` |
| `/dashboard/accounts/sale-returns` | `sale-returns/page.tsx` | Sale-return list | `SaleReturnDetailModal` | - | GET `/sales/returns/?outletId=`, GET `/sales/returns/{id}/` |
| `/dashboard/accounts/sale-returns/new` | `.../new/page.tsx` (573 L) | Create credit note vs invoice | `SaleReturnItemsGrid` | `useSaleReturnCart`, `useProductSearch` | GET `/customers/`, GET `/sales/invoices/search/`, GET `/sales/{id}/`, POST `/sales/return/`, PUT `/sales/returns/{id}/` |
| `/dashboard/accounts/sale-returns/[id]/edit` | `.../[id]/edit/page.tsx` | Edit sale return | `SaleReturnItemsGrid` | `useSaleReturnCart` | GET `/sales/returns/{id}/`, PUT `/sales/returns/{id}/` |
| `/dashboard/accounts/sale-returns/revisions/[id]` | `.../revisions/[id]/page.tsx` | Revision timeline | - | `authStore`, `api` | GET `/audit/revisions/sale_return/{id}/` |
| `/dashboard/accounts/purchase-returns` | `purchase-returns/page.tsx` | Purchase-return (debit note) list | `PurchaseReturnDetailModal` | - | GET `/debit-notes/` |
| `/dashboard/accounts/purchase-returns/new` | `.../new/page.tsx` (483 L) | Create debit note | `PurchaseReturnItemsGrid` | `usePurchaseReturnCart` | GET `/purchases/distributors/`, GET `/purchases/invoices/search/`, POST `/debit-notes/`, PUT `/debit-notes/{id}/` |
| `/dashboard/accounts/purchase-returns/[id]/edit` | `.../[id]/edit/page.tsx` | Edit debit note | `PurchaseReturnItemsGrid` | `usePurchaseReturnCart` | GET/PUT `/debit-notes/{id}/` |
| `/dashboard/accounts/purchase-returns/revisions/[id]` | `.../revisions/[id]/page.tsx` | Revision timeline | - | `authStore`, `api` | GET `/audit/revisions/debit_note/{id}/` |
| `/dashboard/accounts/payments` | `payments/page.tsx` | **Stub**: "Work in Progress" | - | - | - |
| `/dashboard/accounts/reconciliation` | `reconciliation/page.tsx` | **Stub**: "Work in Progress" | - | - | - |
| `/dashboard/accounts/audit` | `audit/page.tsx` | **Stub**: "Work in Progress" | - | - | - |

##### Reports (`/dashboard/reports/*`)

| Route | File | Purpose | Key components | Hooks | Backend APIs |
|---|---|---|---|---|---|
| `/dashboard/reports` | `reports/page.tsx` (306 L) | Report directory (categories: Sales & Revenue, Inventory, Compliance...); locked cards gated by `usePermissions` | inline `REPORT_DIRECTORY` | `usePermissions` | - |
| `/dashboard/reports/daily` | `reports/daily/page.tsx` | Daily snapshot, cash close, partner profit split, fixed expenses | `DailyReportClient` (858 L), `DateRangePicker`, `FixedExpensesModal`, `PartnerSettingsModal` | `authStore` | GET `/reports/daily-snapshot/`, GET `/reports/daily-snapshot/export/`, POST `/reports/daily-snapshot/cash/`, POST `/reports/daily-snapshot/fixed-expenses/`, CRUD `/partners/` |
| `/dashboard/reports/sales-summary` | `sales-summary/page.tsx` | Sales summary by day/payment | `ReportPageLayout`, `SalesReportTab` | `useSalesReport` | GET `/reports/sales/daily/` |
| `/dashboard/reports/sales-book` | `sales-book/page.tsx` (524 L) | Bill-by-bill sales book (defaults to "detailed") | `ReportPageLayout` | `useQuery` + `useOutletId` | GET `/reports/erp/sales-book/`, GET `/reports/erp/sales-book/export/` (xlsx blob) |
| `/dashboard/reports/erp-sales-book` | `erp-sales-book/page.tsx` (524 L) | "Consolidated Sales Book" (defaults "summarised"); **near-identical copy** of sales-book | `ReportPageLayout` | same | same |
| `/dashboard/reports/erp-gross-profit` | `erp-gross-profit/page.tsx` | ERP gross profit | `ReportPageLayout` | same | GET `/reports/erp/gross-profit/` (+ `/export/`) |
| `/dashboard/reports/erp-sales-return-book` | `erp-sales-return-book/page.tsx` | Sales return book | `ReportPageLayout` | same | GET `/reports/erp/sales-return-book/` (+ `/export/`) |
| `/dashboard/reports/erp-gross-loss-return` | `erp-gross-loss-return/page.tsx` | Gross loss on returns | `ReportPageLayout` | same | GET `/reports/erp/gross-loss-return/` (+ `/export/`) |
| `/dashboard/reports/purchase-book` | `purchase-book/page.tsx` | Purchase Book: bill-by-bill register of posted purchase invoices (Detailed/Summarised, Less Returns toggle, Excel) | `ErpPurchaseRegisterReport kind=purchase-book` → `ReportPageLayout` | `useOutletId` | GET `/reports/erp/purchase-book/`, export `/reports/erp/purchase-book/export/` |
| `/dashboard/reports/consolidated-purchase-book` | `consolidated-purchase-book/page.tsx` | Consolidated Purchase Book (defaults to Summarised + Less Returns) | `ErpPurchaseRegisterReport kind=consolidated-purchase-book` | same | same (+`variant=consolidated` on export) |
| `/dashboard/reports/purchase-return-book` | `purchase-return-book/page.tsx` | Purchase Return Book (debit notes) | `ErpPurchaseRegisterReport kind=purchase-return-book` | same | GET `/reports/erp/purchase-return-book/`, export `.../export/` |
| `/dashboard/reports/stock-valuation` | `stock-valuation/page.tsx` | Stock valuation | `ReportPageLayout`, `StockValuationTab` | `useStockValuation` | GET `/reports/inventory/valuation/` |
| `/dashboard/reports/expiry-report` | `expiry-report/page.tsx` | Expiry report | `ReportPageLayout`, `ExpiryReportTab` | `useExpiryReportData` | GET `/reports/expiry/` |
| `/dashboard/reports/schedule-drugs` | `schedule-drugs/page.tsx` | Schedule H/H1/X register | `ReportPageLayout`, `ScheduleReportTab` (727 L) | `useOutletId` | GET `/reports/schedule/` |
| `/dashboard/reports/trial-balance` | `trial-balance/page.tsx` (845 L) | Trial balance with ledger drill-down | inline | `authStore`, `settingsStore`, `useOutletId` | GET `/trial-balance/?outlet_id=`, GET `/ledgers/{id}/statement/` |
| `/dashboard/reports/balance-sheet` | `balance-sheet/page.tsx` (1342 L) | Balance sheet w/ drill-down | inline | same | GET `/balance-sheet/?outlet_id=`, GET `/ledgers/{id}/statement/` |
| `/dashboard/reports/profit-loss` | `profit-loss/page.tsx` (1370 L) | P&L w/ drill-down | `VoucherDetailModal` | same | GET `/profit-loss/?outlet_id=`, GET `/ledgers/{id}/statement/` |

Reports with NO page route: `BatchReportTab`, `GSTReportTab`, `PurchaseReportTab`, `StaffReportTab`, `ExportButton`, `ErpReportModal` (see F).

##### GST (`/gst/*`, outside `/dashboard`)

| Route | File | Purpose | Key components | Hooks/store | Backend APIs |
|---|---|---|---|---|---|
| `/gst` | `gst/page.tsx` | GST overview | `GSTDashboard`, `GSTPeriodSelector` | `gstStore` | GET `/gst/periods/`, `/gst/summary/` |
| `/gst/gstr1` | `gst/gstr1/page.tsx` | GSTR-1 invoices, validate, export | `ValidationPanel`, `ReportFilterRibbon` | `use-toast` | GET `/gst/summary/`, GET `/gst/gstr1-invoices/`, GET `/gst/export/{fp}/{type}/`, GET `/gst/validate/{mmyyyy}/gstr1/` |
| `/gst/gstr2a` | `gst/gstr2a/page.tsx` | GSTR-2A warning/stub view | `ReportFilterRibbon` | - | GET `/gst/periods/{p}/gstr2a-warning/` |
| `/gst/gstr3b` | `gst/gstr3b/page.tsx` | GSTR-3B summary/export | `ValidationPanel`, `ReportFilterRibbon` | `gstStore` | GET `/gst/summary/`, GET `/gst/export/...` |
| `/gst/reconciliation` | `gst/reconciliation/page.tsx` | GSTR-2B reconciliation + exports | `ReportFilterRibbon` | `gstStore` | GET `/gst/periods/{fp}/gstr2b-reconciliation/`, GET `/gst/periods/{p}/export/reconciliation/`, POST `/gst/sandbox/reconciliation/run/` |
| `/gst/sandbox` | `gst/sandbox/page.tsx` (475 L) | Sandbox.co.in OTP session + GSTR-2B sync | inline | `gstStore` | GET `/gst/sandbox/status/`, POST `/gst/sandbox/request-otp/`, POST `/gst/sandbox/verify-otp/`, POST `/gst/sandbox/gstr2b/sync/`, GET `/gst/sandbox/gstr2b/status/` |
| `/gst/history` | `gst/history/page.tsx` | GST export audit history | inline | - | GET `/gst/audit/?page=` |

##### Admin

| Route | File | Purpose | Key components | Hooks | Backend APIs |
|---|---|---|---|---|---|
| `/admin/audit` | `admin/audit/page.tsx` (298 L) | System audit log viewer + CSV export; client-side role check (admin/super_admin) | inline | `authStore`, `useDebounce` | GET `/audit/logs/`, GET `/audit/logs/export/`, GET `/staff/` |

PWA: `app/manifest.ts` (name "MediFlow ERP", landscape, standalone, icons 192/512) and `app/sw.ts` (Serwist, `defaultCache`). `public/manifest.json` and `public/sw.js` also exist; root layout links `/manifest.json` (static) not the generated `/manifest.webmanifest`.

### 6.2 Key components

#### B.1 `components/billing/` (POS)
| Component | Purpose | Notable props | Used by |
|---|---|---|---|
| `MainInvoiceWorkspace` (1015 L) | Product search + editable cart grid, keyboard-driven | `searchRef` | `/billing` |
| `RightBillingRail` (786 L) | Totals, payment method/split, extra discount, margin, checkout, revision-reason | - | `/billing` |
| `BillingHeaderStrip` | Customer/doctor/hospital pickers, sale type, document mode | `customerRef doctorRef medicineSearchRef` | `/billing` |
| `InlineRowEditor` | Per-row batch/qty/discount editor, uses `calculateRowTotals` | `item saleType onSave onCancel onRemove` | MainInvoiceWorkspace |
| `ActiveBillsTabs` | Multiple draft tabs (max 10) | - | `/billing` |
| `StaffPinEntry` | PIN gate -> `activeStaff` | - | `/billing` |
| `EditSaleHydrator` | Loads `?edit=<id>` sale into a draft (axios `api`), maps rates/discount fields | - | `/billing` |
| `BillSuccessScreen` | Post-save screen: print / WhatsApp / new bill | `invoice onNewBill onPrint onViewInvoice` | `/billing` |
| `InvoicePreviewModal` | Invoice preview with print, edit, history | `isOpen onClose invoice onNewBill onEdit onViewHistory` | billing, sales list, quotations, customer detail, revisions |
| `InvoiceThermal` | 58/80mm thermal template | `invoice config` | preview modal, `/billing/[id]` |
| `RevisionReasonModal` | Reason for editing a saved bill | `open onOpenChange onSubmit` | RightBillingRail |
| `LedgerPicker` / `CustomerSearch` | Party-ledger search/create | `currentLedger onSelect defaultGroupName` | header strip, voucher grid, purchase form |
| `DoctorPicker` / `CreateDoctorModal` | Doctor search + quick create | `currentDoctor onSelect` | header strip |
| `PaymentBreakdownCell` | Colour-coded payment chips | `paymentMode cashPaid upiPaid cardPaid creditGiven ...` | SalesList, PurchasesList |
| Unused: `TransactionStrip`, `DoctorSearch`, `CustomerSearch` (only tests) | | | none |

#### B.2 `components/purchases/`
| Component | Purpose | Props | Used by |
|---|---|---|---|
| `NewPurchaseForm` (1304 L) | Purchase entry: header, spreadsheet-style item grid, OCR upload/retry polling, draft confirm, landing-cost calc | (none) | `/dashboard/purchases` |
| `PurchaseItemRow` (734 L) | One grid row; product autocomplete, pack/qty/free/discount/GST/MRP/PTR/PTS, landing rate (`calculateLandingRate`) | `index value onChange onRemove onSelectProduct onOpenAddProduct outletId errors` | NewPurchaseForm |
| `AddNewProductDrawer` | Create product from within purchase | `open onOpenChange initialName onSuccess` | NewPurchaseForm |
| `PurchasesList` (626 L) | List with filters, drafts, OCR scan upload | - | purchases page |
| `PurchaseDetailModal` | Read-only/edit launcher for invoice | `invoice open onOpenChange onEdit` | PurchasesList, ledger detail |
| `PurchaseSummaryCards` | KPI strip | `invoices` | PurchasesList |
| `DistributorsTab` (761 L) | Distributor CRUD + ledger drawer | - | purchases page |
| `PurchaseOrdersList`, `NewPurchaseOrderModal`, `PODetailView` | Purchase order list/create/detail | - | purchases page, `/purchases/orders/[id]` |
| `PODetailWorkspace` | Older PO detail | - | **unused** |

#### B.3 `components/reports/`
`ReportPageLayout` (title, description, breadcrumbs, parameterBar, exportActions) used by 10 report pages. Tab-style data components: `SalesReportTab`, `StockValuationTab`, `ExpiryReportTab`, `ScheduleReportTab` (used); `BatchReportTab`, `GSTReportTab`(+`GSTR1View`,`GSTR3BView`), `PurchaseReportTab`, `StaffReportTab`, `ExportButton`, `ErpReportModal` (**unused**). `ReportSummaryCards`, `DateRangePicker` (shared). `daily-report-client` + `fixed-expenses-modal` + `partner-settings-modal` back `/reports/daily`.

#### B.4 `components/accounts/`
Workspaces: `PayablesWorkspace`, `ReceivablesWorkspace`, `OutstandingTab`, `ExpensesTab`, `LedgerDrawer` (statement side-panel, `entityType entityId open onClose onPayNow`). Sheets: `PayDistributorSheet`, `ReceivePaymentSheet`. Voucher: `VoucherForm`, `VoucherLinesGrid`, `VoucherDetailModal`, `BillAdjustmentModal`, `LedgerPicker` (`voucherType filterGroup group value onChange showOutstanding variant`), `CreateLedgerModal` (633 L; props `initialName outletId ledgerToEdit defaultGroupName isQuickCustomerMode`). Returns: `SaleReturnItemsGrid` (723 L), `PurchaseReturnItemsGrid`, `SaleReturnDetailModal`, `PurchaseReturnDetailModal`, `SaleReturnEditModal`/`PurchaseReturnEditModal` (**unused**; pages edit via route). `overview/*` (TopSummaryStrip, AgingOverview, PriorityActionPanel, AuditAndReconciliationWatch), `QuickActionsBar`. Unused: `AccountsPage`, `PaymentHistoryList`, `AccountsSummaryCards` (only via unused AccountsPage/OutstandingTab).

#### B.5 Other feature folders
| Folder | Components |
|---|---|
| `attendance/` | `TodayAttendanceTab`, `MonthlyAttendanceTab`, `AttendanceSummaryTab`, `SmartCheckInBanner` (mounted in dashboard layout; IP/geo check-in), `SmartCheckInAction`, `ManualAttendanceModal`, `KioskMode` (615 L, **unmounted**), `AttendanceTodaySummary` (**unused**) |
| `credit/` | `AgingSummaryCards`, `CreditAccountsList`, `CustomerCreditDetail`, `EditCreditLimitModal`, `RecordCreditPaymentModal`, `BulkReminderModal` |
| `customers/` | `CustomerStatCards`, `CustomerFiltersBar`, `CustomerTable`, `CustomerGrid`, `CustomerForm`, `RefillAlertsBanner` |
| `dashboard/` | `DashboardHeader`, `StatCardsRow`/`StatCard`, `PaymentPieChart`, `HourlySalesChart`, `TopSellingTable`, `StaffLeaderboard`, `AlertsRow`/`AlertCard`, `ProfitAnalysisCard` |
| `inventory/` | `StockTable` (629 L, TanStack), `ExpiryTable`, `LowStockTable`, `InventoryStatCards`, `StockAdjustmentModal`, `EditProductModal` (525 L), `ProductSearchDropdown`, `BatchLedgerDrawer`, `BatchDetailDrawer` (**unused**) |
| `sales/` | `SalesList` (836 L), `QuotationsList` (449 L) |
| `settings/` | `SettingsSidebar` + 9 sections (props `onDirty onSaved discardKey`), `SettingsToggleRow`, `SettingsSectionHeader`, `BillingPricingSettingsSection` (landing-cost-includes-GST / freight toggles via `useOutletSettings`) |
| `staff/` | `StaffTable`, `StaffFormModal` (role is only what the admin picks; edits send only changed fields; logic in `staffPermissions.ts`), `StaffPerformanceModal`, `StaffLeaderboard` (duplicate of `dashboard/StaffLeaderboard`) |
| `chain/` | `AddOutletModal` |
| `gst/` | `GSTDashboard`, `ReportFilterRibbon`, `GSTPeriodSelector`, `ValidationPanel`; **unused**: `GSTR1SummaryCard`, `GSTR3BSummaryCard`, `KPIRibbon`, `ReconciliationWidget` |
**Keyboard shortcuts (replaced the old Ctrl-K command palette `CommandMenu` / `config/commands.ts` / `update_commands.js`, all deleted).**
Single source of truth: `apps/frontend/config/shortcuts.ts` (`SHORTCUTS`, `BROWSER_RESERVED`, `SCOPE_ROUTES`, `LEADER='Alt+G'`). Pure matching in `lib/shortcutEngine.ts` (`eventToStep` uses `event.code`; `matchNext`, `nextOptions`, `findConflicts`); billing/help command implementations in `lib/shortcutCommands.ts`; components can subscribe to `event`-type shortcuts with `hooks/useShortcutHandler.ts` (`mediflow:shortcut` window event, id from the registry).
- **Go leader** `Alt+G`, then mnemonic keys (Alt may stay held): `D` dashboard, `B` billing, `S I/Q/R/N/H` sales, `I I/L` inventory, `P P/R/N` purchases, `C` customers, `U` credit, `A D/G/V/N/E/P/R/M/T/B/L` accounts, `G G/1/3/2` GST, `R R/D/S/P/G/E/V/H` reports, `T T/A/M` staff & attendance, `O O/G/P/B/R/A/N/F/D` settings tabs (`?tab=`), `H` chain, `L` audit logs, `N L/D/R/S/A` create modals (page-scoped except ledger). 5 s timeout / Esc cancels; letters may be typed as capitals (Shift ignored).
- **Billing chords** (only under `/billing`, work while typing, inert while the PIN lock is up): `Alt+N` new bill, `Alt+W` close bill (confirm if it has items; never the last), `Alt+]`/`Alt+[` next/prev, `Alt+Shift+1…0` jump to bill 1–10, `Alt+M` medicine search, `Alt+P` customer search (targets `data-shortcut-target`), `Alt+L` lock terminal. Existing local: `Ctrl+Enter` collect, `Ctrl+M` margin.
- Other: `Alt+/` cheat sheet; `Ctrl+S` save purchase draft (purchases, event bridge); voucher form keeps `F4-F7`/`Ctrl+S`; `Alt+C` in `LedgerPicker`. Settings page now honours `?tab=` (`SettingsPageContent` under `Suspense`).
- Guard tests: `tests/unit/shortcuts.registry.test.ts` (collisions per overlapping scope, hard/soft browser-reserved keys, no bare-letter shortcuts, every route/modal/command/event exists), `shortcuts.engine.test.ts`, `GlobalShortcuts.test.tsx`.

| `layout/` | `GlobalNavigation` (top nav built from `lib/navConfig.ts`, outlet switcher, logout) |
| `print/` | `ManavataA4Invoice` (613 L; A4 invoice template; `invoice config outlet template saleType billedBy`) |
| `shared/` | `GlobalShortcuts` (single window `keydown` listener + "next key" hint panel; keys come from `config/shortcuts.ts`), `ShortcutHelpModal` (Alt+/ cheat sheet generated from the registry), `GlobalModalManager` (dynamic modals driven by `modalStore`; 5 are reachable: create-ledger, add-doctor, bulk-reminder, staff-form, manual-attendance), `PermissionGate`, `OfflineBanner`, `ErrorBoundary`, `DashboardSkeleton`, `RoleBadge`, `Sidebar` (used only by GlobalNavigation), `Breadcrumb`, `Header` (**unused**), `GlobalOverlays` (empty stub) |
| `ui/` (34) | shadcn/Radix primitives: alert, alert-dialog, avatar, badge, button, calendar, card, collapsible, command, date-range-picker, dialog, drawer(vaul), dropdown-menu, form, input, label, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toast/toaster, tooltip; custom: `Calculator.tsx`, `SortDropdown.tsx` |

### 6.3 State management & data fetching

#### C.1 Zustand stores (`store/`)

| Store | File | Persistence | State / actions |
|---|---|---|---|
| `useAuthStore` | `authStore.ts` | localStorage `mediflow-auth`; partialize `{user, outlet, isAuthenticated}`; `skipHydration` (manual `persist.rehydrate()` in `Providers`) | `user: AuthUser`, `outlet`, `isAuthenticated`, `isLoading`, `error`, `_hasHydrated`; `setUser` (also sets isAuthenticated), `setOutlet`, `setLoading`, `setError`, `logout`, `setHasHydrated`. JWT itself is **not** in the store; it lives in cookie `access_token` + module var in apiClient. |
| `useBillingStore` | `billingStore.ts` (741 L) | localStorage `mediflow-billing-drafts`; partialize `{drafts, activeDraftId, activeStaff, isPinVerified, showMarginInfo, landingCostIncludeGst, billsToday}`; `skipHydration`; no `version`/`migrate` | `drafts: Record<id, DraftBill>` (max 10), `activeDraftId`, `activeStaff`, `isPinVerified`, transient `lastInvoice`, `editingSaleId`, `editingReturnInfo`, revision context (`revisionAction/ReasonCode/ReasonText`), `backendRateErrors`, `showMarginInfo`, `landingCostIncludeGst`, `billsToday`. Actions: `createDraft`, `switchDraft`, `replaceDraftId` (local-uuid -> server id), `closeDraft`, `updateDraftHeader`, `setDraftDocumentMode` (invoice/quotation, +7d `validUntil`), `setSaleType` (RETAIL/WHOLESALE reprices cart: wholesale rate = pts > ptr > mrp, retail = mrp), `setCustomer/CustomerLedger/Doctor/HospitalName/Payment/ScheduleHData/ExtraDiscountPct`, `addToCart/removeFromCart/updateCartItem/applyDiscountToItem/clearCart` (keyed by `batchId`), `getDraftTotals(id)` (computed: see C.6), `hasScheduleHItems`, `cartCount`, `setActiveStaff/clearPin`, `resetBilling`, `setDrafts`. `window.useBillingStore` is exposed globally (for Playwright). |
| `useSettingsStore` | `settingsStore.ts` (248 L) | localStorage **per outlet**: `mediflow-settings-<outletId>` (fallback `-default`); `version: 3` with `migrate` (thermal width split; re-derive `outletStateCode` from `outletState`); `rehydrateSettingsForOutlet(outletId)` re-keys on outlet switch | Flattened union of `OutletSettings`, `GSTSettings`, `PrinterSettings`, `BillingSettings`, `AttendanceSettings`, `NotificationSettings`, `AppPreferences` + legacy `selectedOutletId`, `isSidebarCollapsed`; grouped `update*Settings`, `resetToDefaults`. Uses `STATE_CODES` from workspace package `@mediflow/constants`. Server-side source of truth is `/outlet/settings/` via `useOutletSettings`; store is a local cache (can drift). |
| `useGSTStore` | `gstStore.ts` | none | `periods`, `selectedPeriod`, `loading`, `error`; `fetchPeriods` (GET `/gst/periods/`), `setSelectedPeriod` |
| `useInventoryStore` | `inventoryStore.ts` | none | `valuationMode: PURCHASE\|LANDING\|MRP` |
| `useModalStore` | `modalStore.ts` | none | `activeModal` (8 string ids), `modalProps: any`, `openModal`, `closeModal`. Callers: `GlobalShortcuts` (Alt+G, N, …). |

`useOutletId()` (hook): non-super-admin -> `user.outletId`; super_admin -> `settingsStore.selectedOutletId || user.outletId`. Used in 54 files; the effective outlet for every query.

#### C.2 React Query (`lib/queryClient.ts`)
Defaults: `staleTime` 5 min, `retry` 2 (queries) / 0 (mutations), `refetchOnWindowFocus: false`. All query keys include `outletId` where outlet-scoped; mutation `onSuccess` invalidates by prefix.

#### C.3 Hooks (`hooks/`, 28 files)

| Hook(s) | Endpoint (via apiClient) | Query key(s) | Notes |
|---|---|---|---|
| `useDashboardKPI`, `useDashboardAlerts` (`useDashboard.ts`) | `dashboardApi.getDailySummary` | `['dashboard','kpi',outlet,start,end]` | Both share one key; refetch 2 min |
| `useSalesList`, `useSaleById`, `useCustomerInvoices`, `useInvoiceItems`, `useUpdateSale` (`useSales.ts`) | `/sales/`, `/sales/{id}/`, `/sales/{id}/items/`, PUT `/sales/{id}/` | `['sales','list'/'detail'/'customer',...]`, `['sale-items',...]` | `useUpdateSale` invalidates sales, inventory, dashboard |
| `useQuotationsList` | `/quotations/` | `['quotations',outlet]` | |
| `useSaveBill` | `salesApi.create/update/revise/createQuotation/updateQuotation` | invalidates `sales, inventory, dashboard, ledger, accounts, profit-loss, pl-ledger-stmt, products/search, quotations` | Builds payload with `utils/payloadBuilders.buildSalePayload`; not a React Query hook, plain async |
| `useCheckout` | (local) | - | Validation for checkout: Schedule-H, tender/split sums, credit requires customer, loss-sale prevention via `calculateLineMargin/TotalMargin`; wraps `useSaveBill` |
| `useAutosaveDraft` / `useLoadDrafts` | raw `fetch` GET/POST `/sales/drafts/`, PUT `/sales/drafts/{id}/` | - | 2 s debounce; payload is **snake_case** (`hospital_name`, `draft_status`, `grand_total`...) unlike other calls |
| `useProductSearch` | `/products/search/?context=` or `/products/catalog/search/` (context `procurement`) | `['products','search',q,outlet,context]` | min 2 chars, 300ms debounce (`useDebounce`), 1 min stale, abortable |
| `useStockPage`, `useStockList`, `useProductBatches`, `useStockLedger`, `useExpiryReport`, `useLowStockReport` (`useInventory.ts`) | `/inventory/*` | `['inventory',...]` | |
| `useInventoryFilters` | local URL/filter state | - | |
| `usePurchasesList/PurchaseList`, `usePurchaseById`, `useCreatePurchase`, `useUpdatePurchase`, `useConfirmDraft`, `useDeleteDraft`, `useRecordPayment`, `useDistributors/DistributorList`, `useCreateDistributor`, `useUpdateDistributor`, `useDistributorHistory`, `useCheckDuplicateInvoice`, `usePurchaseOrders`, `usePurchaseOrderSuggestions`, `useBulkCreatePurchaseOrders` (`usePurchases.ts`) | `/purchases/*`, `/purchases/distributors/*`, `/purchases/orders/*` | `['purchases',...]`, `['distributors',outlet]`, `['purchaseOrders',...]`, `['check-invoice',...]` | |
| `useCustomerList/ById/PurchaseHistory`, `useRefillAlerts`, `useCreateCustomer`, `useUpdateCustomer`, `useDoctorList` | `/customers/*`, `/doctors/` | `['customers',...]`, `['doctors',outlet]` (30 min) | |
| `useCreditAccounts`, `useCreditTransactions`, `useCreditAgingSummary`, `useRecordCreditPayment`, `useUpdateCreditLimit` | `/credit/*` | `['credit','accounts'/'transactions'/'aging',...]` | Aging computed client-side from `/credit/?pageSize=500` (apiClient.ts:702-750) |
| `useStaffList`, `useCreateStaff`, `useUpdateStaff`, `useDeleteStaff`, `useStaffPerformance`, `useStaffLeaderboard` | `/staff/*` | `['staff',...]` | |
| `useTodayAttendance` (60 s poll), `useMonthlyAttendance`, `useMonthlySummaries`, `useKioskCheckIn/Out`, `useMarkManualAttendance` | `/attendance/*` | `['attendance',...]` | |
| `useDistributorOutstanding`, `useCustomerOutstanding`, `useUnpaidInvoices`, `useCustomerUnpaidInvoices`, `useCreatePayment`, `usePaymentHistory`, `useCreateReceipt`, `useReceiptHistory`, `useExpenses`, `useCreateExpense`, `useDistributorLedger`, `useCustomerLedger`, `useDashboardKPIs/Aging/UrgentActions/AuditAlerts` (`useAccounts.ts`) | `/outstanding/*`, `/receipts/`, `/expenses/`, `/purchases/payments/`, `/dashboard/{kpis,aging,urgent,audit-alerts}/` | `['outstanding',...]`, `['payments']`, `['receipts']`, `['expenses']`, `['ledger','distributor'/'customer',id]`, `['accounts-dashboard',...]` | |
| `useSalesReport`, `useGSTReport`, `useStockValuation`, `useExpiryReportData`, `useStaffReport`, `usePurchaseReport`, `useBatchReport`, `useGSTR1Report`, `useGSTR3BReport`, `useLockGSTReport`, `useUnlockGSTReport` (`useReports.ts`) | `/reports/*`, `/purchases/` (purchase report) | `['reports',...]` | Contains defaulters `getDefaultDateRange`, `getDateRangeForPeriod`. Note: `useGSTR1Report` calls `reportsApi.getGSTR1Report(outletId, from, to)` while `getGSTReport` takes `(outletId, filters)` (signature differences, inferred mismatch) |
| `useOutletSettings` | GET/PATCH `/outlet/settings/` | `['outlet','settings',outlet]` (15 min) | returns query + update helpers; invalidates after PATCH |
| `usePermissions` | none | - | thin wrapper over `lib/access.ts`: `hasPermission/hasAnyPermission/hasAllPermissions(name)` read `user.permissions` (server-computed). Permission names: view_outlet, create_bills, create_purchases, view_purchases, edit_purchases, edit_sales, view_purchase_rates, view_reports, export_reports, view_audit_history, manage_partners, view_accounts, override_credit, manage_products, manage_staff, manage_settings, view_all_outlets, manage_outlets. Unknown names/roles are denied. |
| `useSaleReturnCart`, `usePurchaseReturnCart` | local cart reducers (+ `calcItemTotal`, `calcItemUnits`, `calcPurchaseItemTotal`) | - | return-line math duplicated from backend |
| UI helpers | `useDebounce`, `useEnterNavigation`, `useGridNavigation` (spreadsheet arrow/enter), `useMagicSubmit` (Ctrl+Enter submit), `usePageTitle`, `use-toast` (Radix toast reducer) | | |

`useCheckout`, `useAutosaveDraft`, `useLoadDrafts`, `useSaveBill` have unit tests in `hooks/__tests__/`.

#### C.4 `lib/apiClient.ts` (2228 L) — the single typed API facade

* **Base URL**: `NEXT_PUBLIC_API_URL` (fallback `http://localhost:8000/api/v1`). In the browser, if the configured host is localhost/127.0.0.1/10.x/192.168.x/172.x and differs from `window.location.hostname`, hostname is rewritten to the page host (LAN-access trick). Throws at import if URL does not start with `http`.
* **Auth**: Bearer token read from module var `authToken` (set on login/switch-outlet/refresh) else from cookie `access_token` via `document.cookie` on every request (`getStoredToken`, `getHeaders`). Cookie is JS-readable (not HttpOnly) and written by `LoginForm`.
* **401 handling (apiClient/fetch)**: `assertOk` -> `handle401()` clears `access_token` + `mediflow_mock_auth` cookies and hard-redirects to `/login`. **No refresh-token flow**: `authApi.refresh` is defined but never called; `refresh_token` is never stored. Access token lifetime 8 h (backend `base.py`), cookie 24 h.
* **Error handling**: `assertOk` parses JSON error body and **throws the raw body object** (DRF shape, e.g. `{detail}`/field errors); non-JSON (HTML 5xx) -> throws `{detail, status, isHtmlError:true}` with friendly 502/503/504 text; `code === 'OTP_REQUIRED'` toasts + redirects to `/gst/sandbox`. Callers must handle untyped `any` errors.
* **Case conversion**: none generic. Server returns camelCase; response mappers are hand-written per method (e.g. `productsApi.search` maps ~25 fields, back-fills `ptr = mrp*0.80`, `pts = ptr*0.90 or mrp*0.72` when absent; some code reads both `landingRate` and `landing_rate`).
* **Second client** `lib/api.ts`: axios instance (`baseURL` same logic, `withCredentials`, 10 s timeout, Bearer from cookie, FormData content-type fix). Response interceptor on 401 does ONE retry after `POST /auth/refresh/` with empty body + cookies (backend refresh expects `{refresh}` in body, so this path likely always fails and logs the user out `(inferred)`); other errors reshaped to `{error:{code,message,details}}` — a **different error contract** from `apiClient`. Used by: `EditSaleHydrator`, `NewPurchaseForm`, `PurchasesList`, `VoucherForm`, and all 6 `*/revisions/*` pages.
* **Offline**: `lib/offline-db.ts` is a stub (no-ops; Dexie queue removed, "bills must be confirmed by backend"). `OfflineBanner` only shows a red "cannot save bills" banner on `navigator.onLine === false`. `Providers` unregisters every service worker and deletes all caches on each load, and `next.config.js` has Serwist `disable: true` -> **no PWA/offline capability is active** despite manifest + `app/sw.ts`.
* **Raw fetch bypassing apiClient** (with `process.env.NEXT_PUBLIC_API_URL` directly): `SalesList`, `ScheduleReportTab`, `ExportButton`, `inventory/page.tsx`, `customers/[id]/page.tsx`, `stockledger/page.tsx`, `PODetailView`, `PODetailWorkspace`, `QuotationsList`, `EditProductModal`, `useAutosaveDraft`, `useLoadDrafts`, `daily-report-client`, `partner-settings-modal`, `fixed-expenses-modal`, `sales/revisions/page.tsx` (these lack the hostname rewrite and `assertOk`/401 handling in places).

API objects exported (method names -> endpoints):

| Export | Methods and endpoints |
|---|---|
| `authApi` | `login` POST `/auth/login/`; `logout` (client only); `switchOutlet` POST `/auth/switch-outlet/`; `refresh` POST `/auth/refresh/` (unused); `me` GET `/auth/me/`; `changePin` PATCH `/auth/me/pin/` |
| `settingsApi` | `getSettings` GET `/outlet/settings/?outletId=`; `updateSettings` PATCH `/outlet/settings/` |
| `productsApi` | `search` GET `/products/search/?q&outletId&context`; `catalogSearch` GET `/products/catalog/search/`; `create` POST `/products/`; `update` PUT `/products/{id}/`; `getStock` GET `/inventory/?search=` |
| `inventoryApi` | `getProductDetail`, `getStock`, `getBatches`, `getExpiryReport` (`expiringSoon=true`), `getLowStock` (`lowStock=true`) all GET `/inventory/`; `getStockLedger` GET `/inventory/stockledger/`; `getAlerts` GET `/inventory/alerts/`; `adjustStock` POST `/inventory/adjust/`; `updateBatch` PUT `/batches/{id}/` |
| `salesApi` | `create` POST `/sales/`; `update` PUT `/sales/{id}/`; `list`/`getById`; `getPdf` GET `/sales/{id}/print/`; `createReturn` POST `/sales/return/`; `listByCustomer`; `getItems` `/sales/{id}/items/`; `getSalesReturns`/`getReturnById`/`getReturnPdf` `/sales/returns/...`; `revise` POST `/sales/{id}/revise/`; quotations: `listQuotations`, `createQuotation`, `updateQuotation`, `getQuotationById`, `convertQuotation` under `/quotations/` |
| `creditApi` | `getAccountsList`/`list`/`getAgingSummary` GET `/credit/`; `getTransactions` `/credit/{id}/transactions/`; `getLedger` `/credit/{id}/ledger/`; `recordPayment` POST `/credit/payment/`; `updateCreditLimit` PATCH `/credit/{customerId}/limit/`; `sendReminder` POST `/credit/{id}/reminder/` |
| `dashboardApi` | `getDailySummary`, `getAlerts` both GET `/dashboard/daily/` |
| `staffApi` | `list`, `lookupByPin` POST `/staff/lookup-by-pin/`, `getPerformance`, `getLeaderboard`, `create` POST `/staff/create/`, `update` PATCH, `delete` DELETE |
| `purchasesApi` | orders: `getOrders`, `getOrderSuggestions`, `bulkCreateOrders` (`/purchases/orders/...`); `list`, `getById`, `create`, `update`, `confirmDraft`, `deleteDraft`, `createPurchase`(alias), `recordPayment` POST `/purchases/payments/`, `checkInvoice` |
| `distributorsApi` | `list`, `getById`, `getLedger`, `create`, `update` under `/purchases/distributors/` |
| `customersApi` | `list`, `getById`, `getPurchaseHistory`, `getRefillAlerts`, `getChronicMedicines`, `create`, `update`, `getDoctors`, `createDoctor` |
| `doctorsApi` | `search` GET `/doctors/`; `create` POST `/doctors/` |
| `attendanceApi` | `getMonthlyRecords`, `getTodayRecords`, `getMonthlySummaries`, `checkIn` POST `/attendance/check-in/`, `checkOut` (**also** POST `/attendance/check-in/`, same URL as check-in `(inferred: distinguished by payload)`), `markManual`, `getMyIp` |
| `reportsApi` | `getSalesReport` `/reports/sales/daily/`; `getGSTReport`/`getGSTR1Report` `/reports/gst/gstr1/`; `getGSTR3BReport` `/reports/gst/gstr3b/`; `getGSTR2Report`; `getStockValuation` `/reports/inventory/valuation/`; `getSalesSummary`; `getExpiryReport` `/reports/expiry/`; `getInventoryMovement`; `getStaffReport` `/reports/staff/performance/`; `getPurchaseReport` (GET `/purchases/`); `getBalanceSheet` `/reports/balance-sheet/`; `reconcileGSTR2A` POST `/reports/gstr2a/`; `getScheduleReport`; `getTaxReport` `/reports/tax/`; `getBatchReport` `/reports/batch-wise/`; `lockGSTReport`/`unlockGSTReport` POST `/reports/gst/lock|unlock/`; ERP: `getErpSalesBook`, `getErpGrossProfit`, `getErpSalesReturnBook`, `getErpGrossLossOnReturn`, `exportErpReport` (xlsx blob, picks `/reports/erp/<name>/export/`); also re-exported as named exports |
| `accountsApi` | `getDistributorOutstanding`/`getCustomerOutstanding` `/outstanding/...`; `getUnpaidInvoices`; `createPayment`/`getPayments` `/purchases/payments/`; `createReceipt`/`getReceipts` `/receipts/`; `getExpenses`/`createExpense` `/expenses/`; ledgers; `getTrialBalance` `/trial-balance/`, `getGSTSummary` `/gst-summary/`, `getBalanceSheet` `/balance-sheet/`, `getProfitLoss` `/profit-loss/` (query param is `outlet_id` here vs `outletId` elsewhere); dashboard KPIs |
| `chainApi` | `listOrganizations`, `getOrganization`, `getChainDashboard`, `createOutlet`, `getOrgOutlets`, `getAllOutlets` under `/organizations/` |
| `voucherApi` | ledger groups/ledgers CRUD (`/ledger-groups/`, `/ledgers/`, `/ledgers/{id}/statement|outstanding|pending-bills/`, `/ledgers/sync/`, `/ledgers/next-no/`), vouchers (`/vouchers/`, `/{id}/history/`), debit notes (`/debit-notes/`), credit notes (`/credit-notes/`), invoice search (`/purchases/invoices/search/`, `/sales/invoices/search/`), `createSalesReturn` POST `/sales/return/`, `updateSalesReturn` PUT `/sales/returns/{id}/` |
| `auditApi` | `getLogs` `/audit/logs/`, `exportLogs` `/audit/logs/export/` |
| `gstApi` | `/gst/periods/`, `/gst/summary/`, `/gst/reconciliation/{fp}/`, `/gst/validate/{mmyyyy}/gstr1/`, `/gst/gstr1-invoices/`, `/gst/periods/{fp}/gstr2b-reconciliation/`, `/gst/export/{fp}/{type}/`, `/gst/periods/{p}/export/reconciliation/`, `/gst/audit/`, `/gst/sandbox/{status,request-otp,verify-otp,gstr2b/sync,gstr2b/status,reconciliation/run}/`, `/gst/periods/{p}/gstr2a-warning/` |

Other lib: `lib/auth.ts` `handleLogout` (clears stores, cookies, `mediflow-auth`, `window.location.replace('/login')`), `lib/logger.ts` (JSON console logger), `lib/whatsapp.ts` (message templates + `wa.me` links), `lib/export.ts`/`lib/reportExport.ts` (CSV/JSON exports for reports incl. GSTR-1/3B), `lib/GSTReportPDF.tsx` (@react-pdf/renderer), `lib/purchaseUtils.ts` (`getPurchaseStatus`), `lib/utils.ts` (`cn`, `toIST`, `formatQty`, `formatDecimalQty`, `isChromium`), `utils/expiry.ts` (`getExpiryStatus`), `utils/productUtils.ts` (`inferPackUnit`), `constants/productBehavior.ts`, `constants/scheduleTypes.ts`.

#### C.5 `utils/payloadBuilders.ts` (488 L)
Pure builders mapping UI state to API payloads: `buildSalePayload` (re-runs `distributeSmartDiscounts` to attach per-line `finalTaxable/finalRowAmount`, converts CGST/SGST to IGST when customer state != outlet state, sends outlet/party ledger/customer ids), `buildScheduleHPayload`, `buildPurchasePayload` (+ `normalizeExpiryDate`), `buildReturnPayload`, `buildVoucherPayload`, `buildPurchaseReturnPayload`, `buildCustomerPayload`. Tests: `hooks/__tests__/payloadBuilders.test.ts`.

#### C.6 Billing math (must mirror backend)

| File / function | Computes | Backend counterpart |
|---|---|---|
| `lib/cartUtils.ts` `calculateRowTotals` (overloaded: CartItem or Batch+raw strings) | Per-row qty (strips + loose/packSize as fractional packs), discount (% or amount) off `rate*qty`, then **RETAIL**: sellAmount = rate*qty, GST **inclusive** (taxable = sell/(1+g)); **WHOLESALE**: GST **exclusive** (taxable = rate*qty, gst added). Cost floor: WHOLESALE purchaseRate > pts > landing > ptr; RETAIL landing > ptr > purchase. Flags: `isNegativeMargin` (net unit price < cost-0.005), `isLowMargin` (<10%), `exceedsStock`, `isDiscountInvalid`, `isValid`. Outputs rounded with `bankersRound`. | `apps/backend/apps/billing/sale_services.py` `atomic_sale_save` (cost floor ~L360-411), `billing/pricing_engine.py`, `billing/utils/pricing.py` `get_landing_cost_for_batch`; tests `billing/tests/test_discount_math.py` |
| `lib/billingMarginUtils.ts` (551 L) `getMaxAllowableBillDiscount`, `calculateLineMargin`, `distributeSmartDiscounts`, `calculateTotalMargin` | Bill-level "extra discount %" distributed over lines proportionally with **smart capping**: a line is capped at its tax-inclusive cost floor (`landingCostIncludeGst` toggle decides whether floor is multiplied by (1+GST)), unabsorbed discount is redistributed to lines with headroom; marks `isLossSale`. `getMaxAllowableBillDiscount` = sum of headroom (UI ceiling for extra-discount input). | `sale_services.py` Smart Cap block (`final_taxable` capped at `line_cost_floor` if base legal; raises "Loss Sale Prevented"). **Backend strips GST from the floor when toggle ON; frontend skips multiplying instead** — equivalent only if rounding matches (see F). |
| `store/billingStore.ts` `getDraftTotals` | Grand totals: iterates cart; with extra discount uses `distributeSmartDiscounts` allocations (`finalRowAmount`, `finalTaxable`), else retail-inclusive / wholesale-exclusive fallback; CGST = SGST = gst/2 (no paise floor-split); `grandTotal = Math.round(exact)` for retail, **unrounded for wholesale**; `roundOff = grand - exact`; `itemDiscountAmount = max(0, ΣMRP*qty - preExtraNet)`. | Backend recomputes totals on save in `sale_services.py` using `Decimal` and `ROUND_FLOOR` for CGST/SGST split |
| `lib/gst.ts` `calculateBillTotals`, `calculateItemTotals` | Older total calculator (quantise taxable to 2 dp, floor-based CGST/SGST split to match backend; round-off to rupee) | **Dead code** — only `formatCurrency`, `formatGSTIN`, `isInterState` are imported elsewhere. Its CGST/SGST rule differs from `getDraftTotals` (risk if revived). |
| `lib/purchase-calculations.ts` | `calculatePurchaseItem/Totals` (taxable = qty*rate*(1-disc); GST on taxable); `calculateBaseLandingRate` = qty*rate*(1-trade%)*(1-cash%)/(qty+free); `calculateLandingRate` (+GST+cess if `includeGst`, +freight if `includeFreight`, + other); `applyGstAndFreightToBaseRate`. Only `calculateLandingRate` is imported (PurchaseItemRow). | `apps/backend/apps/purchases/models.py` `PurchaseItem.get_landing_cost(include_gst)` (L305); `CreatePurchasePayload` totals are pre-computed client-side and stored as-is (no server re-derivation `(inferred)`) |
| `utils/mathUtils.ts` `bankersRound` | Half-to-even rounding to 2 dp with 1e-8 epsilon | Backend uses `Decimal.quantize`; GST sandbox uses `ROUND_HALF_EVEN` |
| `hooks/useSaleReturnCart.ts` `calcItemTotal/calcItemUnits`, `usePurchaseReturnCart.ts` `calcPurchaseItemTotal` | Return line totals/qty units | Backend return services (`sale_return_update_service.py`, accounts debit-note service) |

### 6.4 Types & schemas

#### E.1 `types/index.ts` (1823 L, hand-written; the contract used everywhere)
Enums/unions: `StaffRole`, `DrugSchedule`, `DrugType`, `PaymentMode` (`cash|upi|card|credit|split|ledger|cheque|bank_transfer`), `SaleMode`, `PurchaseType`, `GodownLocation`, `CreditStatus`, `ReportPeriod`, `DraftStatus`, `ExpenseHead`, `LedgerEntityType`. Generic: `ApiResponse<T>`, `ApiError`, `PaginatedResponse<T>`.

| Type | Main fields |
|---|---|
| `Outlet`, `Organization`, `AuthUser`, `AuthResponse` | user: `id name phone role maxDiscount canEditRate canViewPurchaseRates canCreatePurchases canAccessReports outletId organizationId isSuperAdmin outlet` |
| `MasterProduct` / `ProductSearchResult` / `CreateProductPayload` | `id name composition manufacturer category drugType scheduleType hsnCode gstRate packSize packUnit packType barcode isFridge isDiscontinued mrp saleRate minQty reorderQty`; search adds `outletProductId totalStock stockDisplayText nearestExpiry isLowStock batches: Batch[] totalQtyStrips totalQtyLoose` |
| `Batch` | `id outletId outletProductId batchNo mfgDate expiryDate mrp ptr pts landingRate purchaseRate saleRate qtyStrips qtyLoose packSize packUnit packType rackLocation isActive` |
| `Customer` / `CustomerFull` / `Doctor` / `RegularMedicine` / `RefillAlert` | Customer: `id outletId name phone address dob gstin state stateCode customerType dlNo20b dlNo21b dlExpiry fixedDiscount creditLimit outstanding totalPurchases isChronic ledgerId` |
| `CartItem` | `batchId productId name packSize packUnit batchNo expiryDate scheduleType mrp ptr pts saleRate landingRate rate qtyStrips qtyLoose totalQty saleMode discountPct discountType discountAmount gstRate gstPct taxableAmount gstAmount totalAmount freeQtyStrips/Loose purchaseRate landingCost freight batchAvailabilityStatus availableStock` (note dual `gstRate`/`gstPct`) |
| `DraftBill` | `id localSessionId documentMode saleType billingBasis transporter/vehicle fields placeOfSupply customer customerLedger doctor hospitalName prescriptionNo scheduleHData cart payment extraDiscountPct status validUntil quotationId saveStatus lastSavedAt invoiceDate` |
| `PaymentSplit`, `BillTotals` | totals: `subtotal discountAmount extraDiscountAmount preExtraNet taxableAmount cgstAmount sgstAmount cgst sgst igst roundOff grandTotal amountPaid amountDue itemCount totalQty hasScheduleH requiresDoctorDetails` |
| `SaleInvoice` | `id outletId invoiceNo invoiceDate quotationNo placeOfSupply customer doctor* subtotal discountAmount taxableAmount cgst/sgst/igst(+Amount) roundOff grandTotal paymentMode cashPaid upiPaid cardPaid bankPaid chequePaid creditGiven amountPaid amountDue payments[] isReturn saleType billingBasis transport fields irn qr_code eway_bill_no eway_bill_status billedBy billedByName items: CartItem[] isModified revisionCount` (mixes snake_case `qr_code`, `eway_bill_*` with camelCase) |
| `Quotation`, `QuotationItem`, `SaleInvoiceSummary`, `SaleItemDetail` | list/detail variants |
| `CreditAccount`, `CreditTransaction`, `CreditAgingSummary`, `RecordCreditPaymentPayload` | credit module |
| `Distributor`, `DistributorLedgerEntry` | |
| `PurchaseItemFormData` (form row), `PurchaseItem`, `PurchaseInvoice`, `PurchaseInvoiceFull` | PurchaseItem: `masterProductId customProductName isCustomProduct hsnCode batchNo expiryDate pkg qty actualQty freeQty purchaseRate discountPct cashDiscountPct gstRate cess mrp ptr pts saleRate taxableAmount gstAmount cessAmount totalAmount`; Invoice: `distributorId invoiceNo invoiceDate dueDate subtotal discountAmount invoiceDiscount taxableAmount gstAmount cessAmount roundOff ledgerAdjustment grandTotal paymentStatus partyLedger ocrData status(draft/confirmed)` |
| `CreatePurchasePayload`, `CreatePurchaseItemPayload` | client-computed totals + `baseLandingRate`, `freightPerUnit`, `otherCostPerUnit` per item |
| `StaffMember`, `StaffPinVerifyResponse`, `StaffPerformance`, `AttendanceRecord/Summary`, `KioskCheckPayload` | |
| `DashboardKPI`, `DashboardAlerts`, report row types (`SalesReportRow`, `GSTReportRow`, `GSTSummary`, `StockValuationRow`, `ExpiryReportRow`, `StaffReportRow`, `PurchaseReportRow`, `DateRangeFilter`), `BalanceSheet`, `GSTR2A*`, `Chain*` | |
| Settings: `OutletSettings`, `GSTSettings`, `PrinterSettings`, `BillingSettings`, `AttendanceSettings`, `NotificationSettings`, `AppPreferences`, `Print*Config` | |
| Accounts: `LedgerGroup`, `Ledger`, `PendingBill`, `BillAdjustment`, `VoucherLine`, `Voucher`, `DebitNote(+Item)`, `CreditNote(+Item)`, `LedgerStatement`, `LedgerTransaction`, `PaymentEntry/CreatePaymentPayload`, `ReceiptEntry/CreateReceiptPayload`, `ExpenseEntry`, `DistributorOutstanding`, `CustomerOutstanding`; const `INDIAN_STATES` |

`src/types/api.ts` (6233 L): auto-generated by `openapi-typescript` from drf-spectacular (`npm run sync-api`). **Not imported anywhere** — dead duplicate of the hand-written types.

#### E.2 Zod schemas
* `lib/validations/` (used by forms via `@hookform/resolvers`): `auth.ts` `loginSchema`; `attendance.ts` `manualAttendanceSchema`; `billing.ts` `scheduleHSchema`; `credit.ts` `creditPaymentSchema`; `customers.ts` `customerSchema`; `inventory.ts` `adjustmentSchema`; `purchases.ts` `purchaseItemSchema`, `createPurchaseSchema`, `distributorSchema`; `settings.ts` `outletSettingsSchema`, `gstSettingsSchema`, `printerSettingsSchema`, `billingSettingsSchema`, `attendanceSettingsSchema`, `notificationSettingsSchema`; `staff.ts` `staffPinSchema`, `staffSchema`. Imported by: LoginForm, ManualAttendanceModal, StockAdjustmentModal, Outlet/Billing/Notifications/GST/Attendance settings sections. `purchases.ts`, `staff.ts`, `credit.ts`, `customers.ts`, `billing.ts` schemas appear unused by UI (inferred from import grep).
* `schemas/payloadSchemas.ts`: `SalePayloadSchema`, `ScheduleHPayloadSchema`, `PurchasePayloadSchema`, `ReturnPayloadSchema`, `VoucherPayloadSchema`. **Imported nowhere**; and they are wrong against the real payloads (integer ids vs UUID strings, `supplierId` vs `partyLedgerId`).

---

## 7. Config and environment (names only — no secret values)


### 7.1 Backend / infra variables

Settings load order: `apps/backend/mediflow/settings/base.py` reads `apps/backend/.env` via `environ.Env.read_env(BASE_DIR / '.env')` (base.py:6-7; `BASE_DIR`=`apps/backend`). Default `DJANGO_SETTINGS_MODULE=mediflow.settings.dev` in `manage.py:6`, `mediflow/wsgi.py:4`, `asgi.py:4`, `celery.py:4`, `pytest.ini:2`. Names only below (values deliberately not recorded).

#### D.1 Backend variables

| Name | Purpose | Default | Where read |
|---|---|---|---|
| `SECRET_KEY` | Django secret; also JWT signing key (no SIGNING_KEY override) and source of key for Fernet encryption of `SandboxConfiguration` secrets | none (REQUIRED, `ImproperlyConfigured` if absent) | settings/base.py:9; apps/core/models.py:259 (`_get_fernet`) |
| `FERNET_KEY` | intended Fernet key | a literal key committed in code | settings/base.py:10 (grep shows it is read nowhere else: effectively unused) |
| `DEBUG` | debug flag | base False; dev True; prod forced False | base.py:11, dev.py:4, prod.py:3 |
| `ALLOWED_HOSTS` | comma list | base `['backend']`; dev `['*']` (and '*' appended if DEBUG); prod `[]` | base.py:12, dev.py:7, prod.py:4 |
| `DATABASE_URL` | primary Postgres (`env.db`) | none (REQUIRED) | base.py:77 |
| `QA_DATABASE_URL` | second DB alias `qa` (used by `GSTR1Builder(db=...)`/`.using(db)`) | `postgres://mediflow:mediflow@localhost:5432/mediflow_qa` (default carries credentials) | base.py:85 |
| `REDIS_URL` | Celery broker + result backend (db /0 default) AND Django cache (db /1 default); same variable feeds all three, so setting it makes broker and cache share one DB index | `redis://redis:6379/0` (broker/result), `redis://redis:6379/1` (cache); `memory://` value switches cache to LocMemCache | base.py:158,159,166; also direct `redis.from_url(os.getenv('REDIS_URL',...))` in purchases/views.py:1138 and billing/views.py:2991 (legacy-id map lookup) |
| `CORS_ALLOWED_ORIGINS` | CORS whitelist (comma list) | `http://localhost:3000`, `http://127.0.0.1:3000` | base.py:141 (dev.py:240 sets `CORS_ALLOW_ALL_ORIGINS=True`) |
| `CELERY_TASK_ALWAYS_EAGER` | run tasks inline, in-memory broker (also forced when `'test' in sys.argv`) | unset | base.py:154,214; set by reproduce_stock_bug.py:7 |
| `DJANGO_SETTINGS_MODULE` | settings module | `mediflow.settings.dev`; compose sets `mediflow.settings.dev`; scripts hard-code `.prod`, `.base`, bare `mediflow.settings` (invalid) | manage.py:6, wsgi/asgi/celery, docker-compose.yml:61,121 |
| `SANDBOX_API_KEY`, `SANDBOX_API_SECRET` | Sandbox.co.in (GSP) API credentials | None | settings/base.py:221-222; also raw `os.environ` in gst/services/sandbox_auth.py:25-26; used via settings in integrations/sandbox/client.py:19-20,30-31 |
| `SANDBOX_BASE_URL` | Sandbox API host | settings default `https://test-api.sandbox.co.in` (base.py:224) but `gst/services/sandbox_auth.py:27` defaults to the PRODUCTION host `https://api.sandbox.co.in`, and `integrations/sandbox/client.py:33` also falls back to production host | base.py:224; sandbox_auth.py:27; client.py:33 |
| `SANDBOX_PROVIDER_MODE` | `test` or `live` (anything else raises) | `test` | base.py:223; gst/provider/sandbox.py:19; gst/views.py:97,136,167; diagnose_gst_config.py:12 |
| `ENABLE_GST_SANDBOX_LIVE_MODE` | must be true to allow `live` mode | False | base.py:225; provider/sandbox.py:24; gst/views.py:98 |
| `SANDBOX_NIC_USERNAME`, `SANDBOX_NIC_PASSWORD` | NIC e-invoice portal creds | None | base.py:226-227; compliance/services/sandbox_auth.py:58-59,99-100 (orphan app, see H) |
| `GSTIN` | default taxpayer GSTIN (a literal sandbox GSTIN is the default) | hard-coded sandbox GSTIN | base.py:228; seed_gst_sandbox_demo.py:101 |
| `GST_PROVIDER` | provider selector (only `sandbox` implemented, any value falls back to sandbox) | `sandbox` | gst/provider/__init__.py:17 |
| `GST_ENV` | DEPRECATED, logs a warning | - | gst/provider/sandbox.py:15-17 (present in current .env) |
| `MOCK_SANDBOX_DATA` | force mock responses | 'False' | gst/views.py:216,252; gst/provider/sandbox.py:204 |
| `ENVIRONMENT` | `development` gate for dev-only endpoints/seeders | `development` | gst/views.py:96; seed_gst_sandbox_demo.py:71 |
| `SANDBOX_GSTIN` | sandbox GSTIN for status view | None | gst/views.py:112 |
| `GST_USERNAME` | taxpayer GST portal username | `mock_gst_user` (taxpayer_auth), '' (seed) | gst/services/taxpayer_auth.py:32; seed_gst_sandbox_demo.py:105 |
| `GST_SANDBOX_TEST_PHONE` | phone of sandbox test staff user | '' | seed_gst_sandbox_demo.py:106 |
| `GSTR2B_TOLERANCE` | recon tolerance (rupees) | 1.0 | gst/services/reconciliation.py:41 |
| `DEFAULT_POS` | fallback place-of-supply state code | '27' | reports/gstr_builders.py:60 |
| `GEMINI_API_KEY` | Google Gemini for invoice OCR; if unset, local RapidOCR path is used | unset | purchases/ocr_engine.py:1081 |

Not env, but fixed in settings: `AUDIT_V2_WRITE_ENABLED=True`, `AUDIT_V2_READ_ENABLED=True` (base.py:217-218), `CELERY_TIMEZONE='Asia/Kolkata'`.

#### D.2 Variables in `apps/backend/.env` (names only, read off the file): 
`SECRET_KEY, DEBUG, DATABASE_URL, REDIS_URL, DJANGO_SETTINGS_MODULE, CORS_ALLOWED_ORIGINS, ALLOWED_HOSTS, ENVIRONMENT, GST_ENV, SANDBOX_API_KEY, SANDBOX_API_SECRET, SANDBOX_BASE_URL, MOCK_SANDBOX_DATA, SANDBOX_PROVIDER_MODE, ENABLE_GST_SANDBOX_LIVE_MODE, GST_USERNAME, GSTIN, SANDBOX_NIC_USERNAME, SANDBOX_NIC_PASSWORD`. Absent but used by code: `GEMINI_API_KEY`, `FERNET_KEY`, `QA_DATABASE_URL`, `GST_PROVIDER`, `SANDBOX_GSTIN`. There is no `.env.example` anywhere in the repo.

#### D.3 Root `.env` (used by docker-compose interpolation): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (docker-compose.yml:9-11,15). Both `.env` files are git-ignored (.gitignore).

#### D.4 Docker / compose-level
| Name | Purpose | Where |
|---|---|---|
| `TZ=Asia/Kolkata` | container timezone for postgres, redis, backend, celery, frontend, nginx | docker-compose.yml:8,31,60,92,119,137 |
| `NODE_ENV=development` | frontend container | docker-compose.yml:93 |
| `env_file ./apps/backend/.env` | backend + celery | docker-compose.yml:56-57,115-116 |
| `env_file ./apps/frontend/.env.local` | frontend (names: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCK`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`) | docker-compose.yml:88-89 |
| `ARG NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`) baked at `next build` | frontend image | docker/frontend.Dockerfile:27-28 |

#### D.5 Frontend env names encountered
- `NEXT_PUBLIC_API_URL`: lib/api.ts:4, lib/apiClient.ts:16 (fallback `http://localhost:8000/api/v1`), components/reports/ExportButton.tsx:109 (no fallback), components/reports/ScheduleReportTab.tsx:86, app/dashboard/inventory/page.tsx:80,145 (no fallback), app/dashboard/customers/[id]/page.tsx:31 and stockledger/page.tsx:8 (non-null assertion), components/sales/SalesList.tsx:228,259 (fallback port 8090 = nginx). Inconsistent fallbacks: 8000 vs 8090.
- `NEXT_PUBLIC_USE_MOCK`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`: defined in `.env.local`; no `process.env` reference found in app code (inferred unused).
- `PLAYWRIGHT_TEST` (next.config.js:11 switches distDir to `.next-test`), `BASE_URL` and `CI` (playwright.config.ts:11,18).

#### D.6 Other config files
- `netlify.toml` (7 lines): `base=apps/frontend`, `command=npm run build`, `publish=.next`, plugin `@netlify/plugin-nextjs`. No env vars declared; the frontend deploy also needs the backend URL (`NEXT_PUBLIC_API_URL`) set in Netlify UI (inferred).
- `.github/workflows/playwright.yml`: no `env:` for backend (no SECRET_KEY/DATABASE_URL); only `CI`, `BASE_URL` for the Playwright step.
- `nginx/nginx.conf`: hard-coded admin allow-list IP (`allow` directives at lines 56-57, `deny all` at 58), server_name `_`, no TLS.
- root `package.json`: no env vars; scripts `dev/build/lint/type-check` via `turbo run`.
- `scripts/sync_contracts.sh`: sets `DJANGO_SETTINGS_MODULE=mediflow.settings.base`.

### 7.2 Frontend env & build config

#### D.1 Environment variables (names only)
| Variable | Where (file:line) | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `lib/apiClient.ts:16`; `lib/api.ts:4`; `components/sales/SalesList.tsx:228,259` (fallback `:8090`); `components/reports/ScheduleReportTab.tsx:86`; `components/reports/ExportButton.tsx:109`; `app/dashboard/inventory/page.tsx:80,145`; `app/dashboard/customers/[id]/page.tsx:31` (`!`); `app/dashboard/stockledger/page.tsx:8` (`!`); `app/dashboard/sales/revisions/page.tsx:47`; tests | Backend REST base (incl. `/api/v1`). Inconsistent fallbacks: `:8000` (most), `:8090` (SalesList), `:8001` (api_port.spec) |
| `NEXT_PUBLIC_USE_MOCK`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION` | defined in `.env.local` (gitignored) | **Not referenced** by any source file (stale; mock mode removed, only `mediflow_mock_auth` cookie remnant in middleware/apiClient/auth.ts) |
| `PLAYWRIGHT_TEST` | `next.config.js:11` | switches `distDir` to `.next-test` |
| `CI` | `playwright.config.ts:11` | retries 2 |
| `BASE_URL` | `playwright.config.ts:18` | Playwright baseURL (default `http://localhost:3000`) |
| `DATABASE_URL_TEST` | `tests/e2e/global-setup.ts:14` | test DB for e2e setup (default includes credentials literal; do not copy) |
| `BACKEND_URL` | `e2e/wholesale-supply-chain.spec.ts:140` | backend for e2e API seeding |

#### D.2 Config
* `next.config.js`: Serwist wrapper (`swSrc app/sw.ts`, `swDest public/sw.js`, **`disable: true`**); `optimizeFonts: false`; `typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true` (type/lint errors never fail a build); `transpilePackages: ['@mediflow/constants']`; webpack `resolve.modules` adds monorepo root `node_modules`; 2 redirects (`/dashboard/billing`).
* `tailwind.config.ts`: `darkMode: ['class']`, content `app/**` + `components/**` only (**`lib/`, `hooks/`, `utils/` not scanned** — classes defined there would be purged), shadcn CSS-var colours + `success/warning/danger`, fonts Sansation (sans) / JetBrains Mono. `postcss.config.js` standard. `components.json` = shadcn config.
* `tsconfig.json`: strict, target es5, `moduleResolution: bundler`, `paths {"@/*": ["./*"]}`, `baseUrl "."`, includes `.next-test/types`.
* `.eslintrc.json`: `next/core-web-vitals` only.
* `package.json` scripts: `dev` (`next dev -H 0.0.0.0`), `build`, `start`, `lint` (`next lint`), `type-check` (`tsc --noEmit`), `test` (`jest`), `test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:e2e:critical` (7 named specs, `--workers=1`), `test:e2e:legacy`, `test:e2e:all`, `sync-api` (`scripts/sync_contracts.sh`: backend `manage.py spectacular` -> `schema.yml` -> `openapi-typescript` -> `src/types/api.ts`). Workspace dep `@mediflow/constants` (monorepo package; `STATE_CODES`).
* Jest: `jest.config.js` via `next/jest`, jsdom, `jest.setup.js` (jest-dom), alias `@/`. **No `testPathIgnorePatterns`** -> default testMatch will also pick up `tests/e2e/**/*.spec.ts` and `e2e/*.spec.ts` Playwright files `(inferred)`. Unit tests: `__tests__/billingMarginUtils.test.ts`, `__tests__/purchases/POList.test.tsx`, `tests/unit/*` (CartRepricing, CashierQuickSwitch, LossSaleLock, MarginVisibility, PaymentBreakdownCell, PurchaseGridUX, SortDropdown, inferPackUnit, billingMarginUtils), `tests/revisionsList.test.tsx`, `hooks/__tests__/*` (payloadBuilders, useAutosaveDraft, useLoadDrafts, useSaveBill, return carts), `store/__tests__/billingStore.test.ts` + `store/billingStore.test.ts` (duplicate), co-located component tests (BillSuccessScreen, CustomerSearch, DoctorPicker, InvoiceThermal, MainInvoiceWorkspace, ManavataA4Invoice x2 (duplicate), SaleReturnItemsGrid, VoucherLinesGrid).
* Playwright: `playwright.config.ts` `testDir: ./e2e` (4 wholesale/PO specs) but project `chromium` uses `storageState ./tests/e2e/.auth/admin.json` and `setup` project matches `global-setup.ts` which lives in `tests/e2e/`; `package.json` e2e scripts point at `tests/e2e/*`. `testDir` therefore does not contain the setup/most specs `(inferred; scripts work only if run with explicit paths and the setup project can't find global-setup)`. E2E suites: `tests/e2e/` (smoke, billing, create/edit-sale-bill, quotation, GST engine, inventory, purchases, returns, Schedule H, voucher, wholesale e-way bill, margin-visibility, `modification-tracking/*` x9, `regression/cross-module-smoke`, `page-objects/`, `fixtures/`), `e2e/` (4).

### 7.3 Django settings highlights

- Installed apps (base.py:14-39): django admin/auth/contenttypes/sessions/messages/staticfiles, `rest_framework`, `rest_framework_simplejwt`, `corsheaders`, `django.contrib.postgres`, `django_filters`, local `apps.core, apps.accounts, apps.inventory, apps.billing, apps.purchases, apps.attendance, apps.reports, apps.audit, apps.gst`, then `rest_framework_simplejwt.token_blacklist`, `import_export`, `drf_spectacular`. NOT installed though present on disk: `apps.integrations` (no models, imported as a plain package), `apps.compliance`.
- `AUTH_USER_MODEL = 'accounts.Staff'` (phone-based login; fields incl. role, `can_access_reports`, `can_export_gst`, `staff_pin`). Roles: super_admin > admin > manager > billing_staff > view_only (core/permissions.py:1-10).
- Middleware (base.py:41-53): GZip, CORS, Security, Session, Common, CSRF, Authentication, `apps.audit.middleware.AuditContextMiddleware` AND `apps.audit.core.middleware.AuditContextMiddleware` (two audit middlewares, same class name), Messages, XFrameOptions.
- DRF (base.py:128-139): authentication `apps.audit.authentication.AuditJWTAuthentication`; default permission `rest_framework.permissions.IsAuthenticated`; pagination `PageNumberPagination` PAGE_SIZE 50 (only affects generic views, not the reports APIViews); schema `drf_spectacular.openapi.AutoSchema`; `COERCE_DECIMAL_TO_STRING=True`. No renderer/parser overrides (JSON + Browsable API by default), no throttling classes (rate limiting only in nginx).
- JWT (base.py:121-126): access 8 h, refresh 7 d, `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`; algorithm/key defaults (HS256 with SECRET_KEY).
- CORS: `CORS_ALLOWED_ORIGINS` from env (localhost:3000 default), `CORS_ALLOW_CREDENTIALS=True`, `CORS_EXPOSE_HEADERS=['Content-Disposition']` (needed for file downloads). dev.py sets `CORS_ALLOW_ALL_ORIGINS=True`; prod.py sets False.
- Database: PostgreSQL via `DATABASE_URL`, session option `-c TimeZone=Asia/Kolkata`; second alias `qa`. No `CONN_MAX_AGE`, no read replica router.
- Time: `TIME_ZONE='Asia/Kolkata'`, `USE_TZ=False` (naive local datetimes everywhere), `LANGUAGE_CODE='en-in'`. Celery timezone Asia/Kolkata.
- Cache: Redis (`django.core.cache.backends.redis.RedisCache`, db /1 default, TIMEOUT 600, KEY_PREFIX `mediflow`); `memory://` REDIS_URL -> LocMemCache.
- Templates: `DIRS=[apps/backend/templates]` (only `reports/batch_report.html`).
- Static/media: `STATIC_URL='static/'`, `STATIC_ROOT=apps/backend/staticfiles`, `MEDIA_URL='/media/'`, `MEDIA_ROOT=apps/backend/media`; `DEFAULT_AUTO_FIELD=BigAutoField`.
- Logging: only logger `audit.fallback` configured (ERROR, console). No file handler, no root logger config (many modules call `logger.info`, which is dropped below WARNING by default). `apps/backend/logs/` exists (git-ignored).
- Password validators: the 4 standard Django validators.
- Security-related absences: no `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_*`, `CSRF_TRUSTED_ORIGINS` in any settings file, including prod.py (prod.py is only 7 lines: DEBUG False, ALLOWED_HOSTS from env, CORS_ALLOW_ALL_ORIGINS False, STATIC_ROOT `/app/staticfiles`).
- OpenAPI schema at `/api/schema/` uses `SpectacularAPIView`; with no `SPECTACULAR_SETTINGS` defined, drf-spectacular's own default `SERVE_PERMISSIONS` (AllowAny) applies, so the schema is public (inferred from library defaults).
- Root URL conf also exposes `/admin/`, `/api/v1/health/` (public function view), `/api/v1/migrate/marg/` (`MargMigrationView`, billing.views), `/api/v1/notifications/low-stock/`.
- GST constants (`apps/gst/conf.py`): `B2CL_THRESHOLD=100000` (effective 2024-08-01), recon tolerances (value/tax Rs1, date 2 days, rate 1%), GSTR-3B tolerances (Rs100 shortfall/excess/mismatch, 50% reversal spike).

---

## 8. External services and integrations

| Service | Purpose | Files:lines | How configured |
|---|---|---|---|
| PostgreSQL 17 | primary DB (+ `qa` alias) | docker-compose.yml:2-20; settings/base.py:75-90; `django.contrib.postgres` installed (base.py:24) | `DATABASE_URL`/`QA_DATABASE_URL`; session `TimeZone=Asia/Kolkata`; compose uses EXTERNAL named volume `mediflow_main_postgres_data` (must pre-exist) |
| Redis 7 | Celery broker/result backend, Django cache, ad-hoc `redis` client | docker-compose.yml:21-38; settings/base.py:153-182; purchases/views.py:1137; billing/views.py:2991 | `REDIS_URL`; `redis-server --save 60 1`; external volume `mediflow_main_redis_data`. Cache backend `django.core.cache.backends.redis.RedisCache`, KEY_PREFIX `mediflow`, default TTL 600 |
| Celery worker | async tasks: audit log write, invoice OCR, GSTR-2B sync | mediflow/celery.py; docker-compose.yml:99-123; tasks: apps/audit/tasks.py:10 (`create_audit_log_async`, routed to queue `audit` via CELERY_TASK_ROUTES base.py:183-185), apps/purchases/tasks.py:8 (`purchases.process_invoice_ocr`), apps/gst/tasks.py:19 (`sync_gstr2b_job`, bind, max_retries=3), apps/billing/tasks.py:5 (`send_whatsapp_reminder`, stub) | JSON serializer, tz Asia/Kolkata; no beat schedule; no `-Q audit` on the worker command |
| Sandbox.co.in GST platform (GSP) | GSTR-2B fetch, taxpayer OTP auth, e-invoice (IRN), e-way bill | apps/gst/provider/{__init__,base,sandbox}.py; apps/integrations/sandbox/{client,einvoice,ewaybill}.py; apps/gst/services/{sandbox_auth,taxpayer_auth,reconciliation,export_service}.py; consumers apps/billing/sale_services.py:37-39,55-133,605, sale_update_service.py:95 | Env/ settings `SANDBOX_*`, DB fallback model `core.SandboxConfiguration` (Fernet-encrypted key/secret/e-invoice creds, derived from SECRET_KEY, core/models.py:255-275). Endpoints used (see below). `requests.Session` with `Retry(total=3, backoff 1.5, 429/5xx, incl. POST)` (client.py:43-55) |
| E-invoice (IRN) via Sandbox | generate/get/cancel IRN | integrations/sandbox/einvoice.py:130 (`POST /gst/compliance/e-invoice/tax-payer/invoice`), :167 (GET `.../invoice/details?docNo=&docTyp=INV`), :197 (`POST .../invoice/cancel`) | gated by `OutletSettings.enable_einvoice` (core/models.py:197; checked billing/sale_services.py:55) |
| E-way bill via Sandbox | generate EWB, fetch PDF | integrations/sandbox/ewaybill.py:76 (`POST {base}/gst/compliance/e-way-bill/consignor/bill`), :124 (PDF fetch, endpoint guessed per comment) | triggered in a bare `threading.Thread` after sale (billing/sale_services.py:97-105,605) |
| Sandbox GSTR-2B | monthly 2B JSON | gst/provider/sandbox.py:157-197 (`GET /gst/compliance/tax-payer/gstrs/gstr-2b/{year}/{month}`); OTP `POST /gst/compliance/tax-payer/otp` :77 and `/otp/verify` :117; platform auth `POST {base}/authenticate` client.py:70 | taxpayer session cached in `core.GstTaxpayerAuth`; mode guard: test key vs prod URL mismatch raises (provider/sandbox.py:30-48); `file_gstr1`/`file_gstr3b` are stubs (:248-252) |
| GST filing | not implemented | provider/sandbox.py:248-252 | exports are offline Excel/JSON only; user uploads to portal manually |
| Google Gemini (google-genai) | OCR/structure of purchase invoice images | apps/purchases/gemini_ocr.py:6-9,55-93 (model string `gemini-flash-lite-latest`), routed from ocr_engine.py:1081-1090 | `GEMINI_API_KEY`; fallback local OCR |
| RapidOCR + OpenCV headless + rapidfuzz | local invoice OCR, fuzzy product/distributor matching | apps/purchases/ocr_engine.py; requirements.txt; docker/backend.Dockerfile:6-8 (replaces `opencv-python` with `opencv-python-headless==5.0.0.93`) | in-process |
| Auth (JWT + PIN) | `rest_framework_simplejwt` access 8 h / refresh 7 d, rotation + blacklist; custom `AuditJWTAuthentication` | settings/base.py:121-139; apps/accounts/views.py:50 (`LoginView`, AllowAny), :100-120; auth_urls.py:6-11 (`login/ logout/ refresh/ me/ me/pin/ switch-outlet/`); PIN endpoints `staff/lookup-by-pin/` (views.py:912), `staff/{id}/verify-pin/` (:1078) | Login accepts phone + (password OR the literal "password" OR the phone number OR hashed `staff_pin`) (accounts/views.py:110-116). PIN lookup brute-forces all active outlet staff with cached `check_password` (7-day cache key includes hash and plaintext PIN) |
| Payment gateway | none found (UPI/card/cash are recorded manually as payment modes) | n/a | n/a |
| Email / SMS | none configured (no EMAIL_* settings) | n/a | n/a |
| WhatsApp | stub only; `OutletSettings.enable_whatsapp`, `whatsapp_api_key` (plaintext CharField, returned by settings API core/views.py:53-54); `send_whatsapp_reminder` is a TODO stub; the `.delay()` call is commented out (billing/views.py:4071) | billing/tasks.py:5-11; billing/models.py:750 (NotificationLog) | none |
| Media / file storage | local filesystem `apps/backend/media` (invoice images, `purchase_invoices/`); served by nginx `/media/` alias in compose and by Django `re_path(r'^media/...', serve)` (mediflow/urls.py:50, no auth) | settings/base.py:114-115; nginx.conf:46-49 | shared docker volume `media_files`; no S3/cloud storage |
| Static files | `STATIC_ROOT=apps/backend/staticfiles` (prod: `/app/staticfiles`); nginx serves `/static/` | base.py:112-113; prod.py:7; nginx.conf:41-44 | no whitenoise; relies on nginx |
| PDF engines | WeasyPrint (batch-wise report PDF), ReportLab (CA working paper), Pillow | reports/services/batch_wise_report_service.py:487; reports/exports/ca_working_paper.py:11-14 | Dockerfile installs only `libpq-dev gcc`, no pango/cairo libs WeasyPrint needs (inferred runtime failure in container) |
| Excel | openpyxl 3.1.2 (all exports), xlrd 1.2.0 (legacy .xls import), django-import-export | requirements.txt | |
| OpenAPI | drf-spectacular schema at `/api/schema/` (mediflow/urls.py:20); `scripts/sync_contracts.sh` -> `schema.yml` -> `apps/frontend/src/types/api.ts` via openapi-typescript | | |
| Sentry / APM | none found | | |
| Netlify | frontend hosting config (`@netlify/plugin-nextjs`) | netlify.toml | |
| Playwright | e2e tests (CI) | .github/workflows/playwright.yml; apps/frontend/playwright.config.ts | |

---

## 9. Dependency map and "change X → also check Y"

### 9.1 Module dependency overview

- **Root router** `mediflow/urls.py` includes: accounts (auth/customers/partners/staff/doctors/voucher), audit, attendance, reports (+ `reports.gst_urls`), core (outlet, organizations), gst, inventory, purchases, billing (+ `accounts_urls`). `billing.views` also supplies `LowStockAlertView`/`MargMigrationView` mounted in the root.
- **Billing** → writes `inventory.Batch`/`StockLedger`, `accounts` ledgers/journals/`Customer`, `audit` revisions; reads `core.Outlet` settings. **Purchases** → creates `inventory.MasterProduct`/`Batch`, posts to accounts ledgers (payments path has no journal — see risks). **Reports/GST** → read-only over billing/purchases/inventory + own `GstTransactionSnapshot`-style models.
- **Auth/outlet scoping** is cross-cutting: `core.permissions` (`check_outlet_access`), `audit.authentication.AuditJWTAuthentication`, `audit` middleware (two classes with same name in settings).
- **Frontend → backend:** `lib/apiClient.ts` (`*Api` groups, fetch) and `lib/api.ts` (axios) → `/api/v1/*`; stores (`authStore` etc.) persist to localStorage; `middleware.ts` gates routes via `access_token` cookie.

**Change X → also check Y (most important couplings)**

| If you change… | Also check… |
|---|---|
| A `billing` model field (`SaleInvoice`, `SaleItem`) | serializers/`build_sale_response_payload`; `reports/*` services & GSTR builders; `gst_snapshot_service`; frontend `types/` + `lib/apiClient.ts` mappers; `docs/MODEL_FIELDS.md`; migrations |
| Sale create/edit logic (`SaleCreateView`, `SaleUpdateView`, `SaleReviseView`) -> also `utils/item_amounts.py`, `utils/pricing.line_cost_floor`, `frontend/__tests__/billingPayloadContract.test.ts` (POS must stay within `MAX_ROUND_OFF`) | stock deduction (`Batch.qty_strips`, `StockLedger`), journal posting, `audit` revision writes, `EditSaleHydrator`, `payloadBuilders`; note `atomic_sale_save` is dormant (tests only) |
| GST/tax or discount/margin math | **three-plus copies:** backend `billing/sale_services.py`/`pricing_engine.py`, frontend `lib/billingMarginUtils.ts`, `cartUtils`, `billingStore.getDraftTotals`, `payloadBuilders`; `reports` GST builders. Rounding rules differ — verify all |
| `MasterProduct`/`Batch` fields or landing-cost logic | `purchases` save/update, `inventory.pricing`, `reports` stock valuation & gross profit, `NewPurchaseForm`/`PurchaseItemRow`, OCR product matching |
| Permission/role flags on `Staff` | `LoginView` payload (`user{can*}`), `core/permissions.py`, `authStore` `AuthUser` type, `PermissionGate` components, staff admin UI |
| URL paths / response shapes | `docs/API_REFERENCE.md`, frontend `lib/apiClient.ts`, hooks (`hooks/*`), `scripts/sync_contracts.sh`, drf-spectacular schema |
| Purchase OCR flow | `purchases/tasks.py` (Celery queue config in compose — no `-Q`), `GEMINI_API_KEY` env, frontend polling in purchases pages |
| Ledger/journal posting | `accounts/journal_service.py` (`_guard_double_posting`), `audit_journals` / `backfill_journals` mgmt cmds, receivables/payables pages |
| GST dashboard / GSTR | `gst/views.py`, `reports/gstr_builders.py`, `reports/exports/gstr1_excel.py`, `reports.GSTTransactionSnapshot`/`GSTExportAudit`/`ITCReconciliation*` models (see 5.4), `apps/gst/conf.py` tolerances |
| Settings module | Docker/compose/celery/wsgi/asgi all default to `mediflow.settings.dev`; `prod.py` is unused |



### 9.2 Billing business-logic map

#### C0. Shared integrity rules for create AND revise (added after the billing audit)
- `billing/utils/item_amounts.py` — `resolve_item_amounts()` is the single resolver for a payload row's `gst_rate/taxable/gst/total` (derives whatever the client omitted: total->taxable/gst via the product's GST rate; nothing sent -> `rate x billed qty x (1-discount%)`, WHOLESALE adds GST). `split_amounts()` apportions a row over FEFO batches (parts always sum to the line). `MAX_ROUND_OFF = 2.00` = largest allowed |grandTotal - sum(line totals)|.
- `billing/utils/pricing.py::line_cost_floor()` — canonical loss-sale floor (RETAIL: landing/ptr/purchase rate; WHOLESALE: purchase rate; GST on top unless `landing_cost_include_gst`; free-only lines exempt). Used by `sale_update_service` (revise/cancel-reissue path). `SaleCreateView` still carries its own inline copy of the same rule (views.py ~1013-1075): change both together.
- Create (`SaleCreateView.post`): persists the SERVER row amount (`final_row_amt`: client total if already discounted, else base x extra-discount, smart-capped to cost floor), keeping the POS's own taxable/GST split when it already agrees; rejects with 400 `INVALID_ROUND_OFF` when |grandTotal - sum(lines)| > `MAX_ROUND_OFF` (was warning-only). FEFO-split rows are priced per batch.
- Revise (`atomic_sale_update`): same resolver + same limit; now also enforces the loss-sale floor (previously only the MRP ceiling).
- `LedgerStatementView` description precedence is `line.description or entry.narration` (per-payment text now reaches customer statements).
- Tests: `billing/tests/test_sale_integrity.py` (unit + API, DB-backed), `frontend/__tests__/billingPayloadContract.test.ts` (POS payload vs the server limit).


#### C1. File roles (what is live vs dormant)
- LIVE sale-create path: `SaleCreateView.post` (views.py:289-1423). It is a ~1,130-line inline implementation. It uses `services.py` helpers: `fefo_batch_select` (:35), `schedule_h_validate` (:140), `generate_invoice_number` (:199).
- DORMANT: `sale_services.atomic_sale_save` (sale_services.py:145-607). It is a parallel re-implementation. Only tests call it. It is the only place that uses `pricing_engine.calculate_line_item`/`TaxCalculatorService`, `credit_controls.*`, `create_sale_snapshots`, free-qty/trade-discount handling, and `SaleItem.hsn_code`/`trade_discount_*`. The live route does none of that (see D).
- LIVE from `sale_services.py`: `process_pending_irn` (:50), `process_pending_ewaybill` (:104), `threaded_process_pending_ewaybill` (:97), `validate_unit_integrity` (:136).
- `sale_update_service.py`: `atomic_sale_update` (:157), `cancel_invoice` (:79), `get_sale_modification_constraints` (:38), `rebuild_customer_ledger` (:18).
- `sale_return_update_service.py`: `atomic_sale_return_update` (:19).
- `payment_services.py`: `create_receipt_payment` (:91), `create_expense_entry` (:217), `create_sales_return` (:258), `generate_return_number` (:60).
- `utils/pricing.py`: `get_landing_cost_for_batch` (:13), `validate_sale_price` (:38, only blocks `rate > MRP + 0.005`).
- `camel_case_helper.py`: `snake_to_camel`, `convert_dict_to_camel_case` (quotations only).
- `tasks.py`: Celery `send_whatsapp_reminder` (stub, not wired).
- `management/commands`: `sync_credit_accounts` (`sync_all_credit_accounts`, also called from `CreditAccountListView`), `import_marg_sales`, `export_missing_sales_items`.

#### C2. Sale CREATE (`POST /sales/`, views.py:289)
1. **Pre-transaction validation** (no DB writes except implicit customer creation):
   - Customer resolution (l.393-568), in order: `customerId` UUID, then fall back to treating it as a `Ledger.id` (and `partyLedgerId`), then `partyLedgerId`. Each branch creates and links a `Customer` and syncs GSTIN.
   - A new `Customer` (plus `Ledger` in `LedgerGroup` 'Sundry Debtors') is created only if `createNewCustomer` or a credit tender with a valid 10-digit mobile (`^[6-9]\d{9}$`). Credit sale with no customer -> 400. These creations happen outside `atomic`.
   - `billed_by` = `billedBy` or `request.user` (l.571-578).
   - Per-staff `max_discount` check (H5, l.580-592).
   - GST slab check per line `TaxSlab.is_rate_active(rate, transaction_date)` -> `DEACTIVATED_GST_RATE` (l.594-629).
   - Loss-sale / margin lock (l.631-728) is described in C5.
2. `transaction.atomic()` (l.733):
   - `schedule_h_validate` (G/H/H1/X/C/Narcotic need patientName/Address/doctorName/doctorRegNo/patientAge>=1).
   - `generate_invoice_number` (locks the Outlet row `select_for_update`; format `INV-YYYY-NNNNNN`, from the highest existing `invoice_no` for the year).
   - Payments: either `payments[]` (method->cash/upi/card/credit buckets) or legacy scalars or `paymentMode` fallback. Sum must equal `grandTotal` (tolerance 0.01). Mode is `split` if more than one tender.
   - `SaleInvoice.objects.create` with GST placeholders = 0. `irn_status='PENDING'` only if WHOLESALE and customer GSTIN has length 15. `eway_bill_status='PENDING'` if transporterId/vehicleNo.
   - One `InvoicePayment` row per tender.
   - Per item:
     - `validate_unit_integrity` (loose only for strip/blister).
     - If `batchId`: plain `Batch.objects.get` with **no row lock** (see D). Else `fefo_batch_select` (`select_for_update`, expiry>today, is_active, strips or loose > 0, ordered by expiry).
     - Stock check in loose units using the **batch** `pack_size`.
     - Deduct `qty_strips`/`qty_loose`; borrow strips when loose < 0; `batch.save()`.
     - `validate_sale_price` (rate must be <= MRP).
     - Second inline loss-sale check.
     - `SaleItem` create (snapshots pack_size/unit from batch, `sale_rate=batch.mrp`, `rate=proposed_rate`, taxable/gst/total taken from the client).
     - `post_stock_ledger_entry(txn_type='SALE_OUT', qty_out=strips + loose/pack_size)`.
     - `ScheduleHRegister` for controlled schedules.
   - Server GST re-derivation (C3).
   - Credit: if `credit_given>0`, `CreditAccount.get_or_create`, `total_outstanding += x`, `total_borrowed += x`, `CreditTransaction(debit)`. **No credit-limit check** (see D).
   - `Customer.total_purchases += grand_total`.
   - `LedgerEntry` rows (customer sub-ledger): `sale` debit grand_total, then one `receipt` credit per non-credit tender. `running_balance` = previous latest entry (by date, created_at) +/- amount.
   - `accounts.journal_service.post_sale_invoice(invoice)` (journal_service.py:654). Debits are Cash/UPI Collections/Card-POS Settlement/customer ledger per tender. Credits are Sales Account at taxable, CGST/SGST/IGST Payable (rate-specific ledgers), and Round Off. There is **no COGS/inventory journal**. A failure re-raises and rolls back everything (guarded by `_guard_double_posting`).
3. **After commit:** the replacement `Quotation` is marked converted if `quotationId` was sent (errors swallowed). `process_pending_irn` runs synchronously inside the request (Sandbox call; failures swallowed -> `irn_status='FAILED'`). E-way bill runs in a plain `threading.Thread` (not Celery).
4. Response = `build_sale_response_payload` (views.py:140).
5. Idempotency: **none**. No idempotency key; retries create a new invoice number and deduct stock again. Invoice-number uniqueness is protected by the Outlet row lock plus `unique_together(outlet, invoice_no)`.
6. Error mapping: `InsufficientStockError`/`UnitIntegrityError`/`ValueError`/DRF `ValidationError` -> 400; anything else -> generic 500 `Internal server error` (details only in logs).

#### C3. GST / tax computation (live path, views.py:1153-1242)
- Prices are treated as GST-inclusive. For each `SaleItem`:
  - `discounted_total` = client `total_amount` if > 0, else `rate * (strips + loose/pack_size) * (1 - extra_discount_pct/100)`.
  - `taxable = round(discounted_total*100/(100+gst_rate), 2)`, `gst = discounted_total - taxable`.
  - Intrastate: `cgst = floor(gst/2, 2)`, `sgst = gst - cgst`.
  - Interstate: `igst = gst` (flag from comparing `customer.state` and `outlet.state` as lowercase **names**).
- Item rows are saved with the server-derived `taxable/gst/cgst/sgst/igst` amounts.
- Invoice: `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount` are sums. `cgst`/`sgst` rate = max line rate / 2; `igst` rate always 0.
- `round_off = client_grand_total - (taxable+cgst+sgst+igst)`. A value above 1.00 only logs a warning (no rejection).
- Update path (`atomic_sale_update` :587-635) does NOT re-derive GST. It trusts client item `taxable/gst/total` after a `taxable+gst ~= total` (0.05) check, caps round_off at 2.00, always sets `igst_amount=0`, and does not write item-level cgst/sgst/igst.
- `pricing_engine.TaxCalculatorService.calculate_line_tax` and `calculate_line_item` (MRP-inclusive vs PTR/PTS-exclusive, trade discount, `net_rate`) are only used by the dormant `atomic_sale_save`.
- `SaleInvoice.clean()` sets `is_interstate` by `state_code` (a different rule from the name comparison above).

#### C4. Discount capping
- Per-staff cap: `Staff.max_discount` vs each item `discountPct` (create views.py:580, update sale_update_service.py:244).
- Cart-level `extraDiscountPct` applied multiplicatively: `final = base_row * (1 - extra/100)`.
- "Smart cap" (live path, twice at l.708-710 and l.1064-1066): if the line was legal before the bill discount (`base_row >= cost_floor_incl_gst - 0.005`) but the discounted amount falls below the floor, the line is **raised to the floor**. This is reconciled with the client total; if `client_total < base_row - 0.01` the client total is respected "to avoid double discounting".
- Same math is duplicated inline in the pre-check and in the per-item loop, and again in `atomic_sale_save`.
- Commits `763de0d`/`1ee525c` (git log) show recent fixes for double-discount on edit.

#### C5. MRP vs landing cost vs profit
- MRP ceiling: `utils/pricing.validate_sale_price` (rate > MRP+0.005 -> block).
- Cost floor (loss-sale prevention, `LOSS_SALE_PREVENTED`):
  - RETAIL: `batch.landing_rate`, else `ptr`, else `purchase_rate`. Label "landing cost".
  - WHOLESALE: `batch.purchase_rate`, else `pts`, else `landing_rate/ptr`. Label "purchase rate".
  - Floor is multiplied by `(1+gst)` unless `OutletSettings.landing_cost_include_gst` is true (then the floor is treated as already GST-inclusive).
  - Billed quantity excludes free quantity; 100% free-scheme lines are exempt.
- `get_landing_cost_for_batch` (utils/pricing.py:13) uses `PurchaseItem.get_landing_cost(include_gst)` of the latest purchase item for the batch, else `ptr`/`landing_rate`, else `purchase_rate`. This is a different priority from the loss-sale floor above (which uses `Batch` fields directly). It is used by `SaleItemsView` (`landingCost`) and `validate_sale_price` (returned only, not enforced).
- Profit shown in `SaleListView` (views.py:1647-1702):
  - Per invoice: `invoiceProfit = grand_total - sum(batch.purchase_rate * (strips + loose/pack_size))`. This is GST-inclusive revenue minus an ex-GST purchase rate (inflated profit).
  - Aggregate: `totalProfit = (sum grand_total - returns) - sum(purchase cost)`.
  - Exposed to every authenticated role.

#### C6. Stock deduction / FEFO / returns restoring
- Units: batch holds `qty_strips` + `qty_loose` with a **frozen `batch.pack_size`**. Sale and return math use `batch.pack_size`, not product pack size. `SaleItem.qty_returned` is in loose units.
- Deduction: inline in `SaleCreateView`; `StockLedger` SALE_OUT is posted via `inventory.services.post_stock_ledger_entry`.
- `inventory.services.rebuild_stock_ledger` (inventory/services.py:177) recomputes running_qty and overwrites `Batch.qty_strips/qty_loose` from the ledger. The ledger is therefore the source of truth after edits and return updates.
- Edit (`atomic_sale_update`): locks all old+new batches sorted by id, restores old quantities, deletes old `StockLedger` SALE_OUT rows, re-deducts, then `rebuild_stock_ledger` for each affected batch.
- Return (`create_sales_return` :488-539): adds returned units into `batch.qty_loose`, rolls to strips, then posts `SALE_RETURN` ledger rows.
- Cancel (`cancel_invoice` :79): restores batch qty, deletes SALE_OUT rows (no rebuild).

#### C7. Sale EDIT / REVISE
- `PUT /sales/<id>/` (`CanEditSalesInvoice`) and `POST /sales/<id>/revise/` both call `check_revision_allowed` + `revision_state_block` (`sale_update_service.py`) and then `atomic_sale_update`, so both need the per-action right (`REVISION_ACTION_FLAGS`; PUT infers the action via `infer_revision_action`). `GET /sales/<id>/modification-options/` returns `allowed_revision_actions` (same rules). The billing screen (`EditSaleHydrator`) picks its action from it.
- Edit-integrity rules added in the modification audit: invoice date parsed with `parse_client_datetime` (no UTC shift); `billing_basis` normalised; `billed_by` kept; customer ledger rebuilt from the earliest affected date (old + new customer); credit reversal via `_undo_credit_effect`; Schedule H uses the catalogue (`schedule_cart_from_catalogue`), not the client label.
- Purchase edit (`atomic_purchase_update`): batches keyed by (product, batch no, expiry) on create AND edit; expiry parsed once (`parse_purchase_expiry`); refuses empty items / negative qty / changing type or lowering total below allocated payments; old distributor ledger rebuilt on distributor change; stock rebuild rounds half-up. `@transaction.atomic` must stay directly on the function.
- Family accounts (shared mobile + shared credit; any customer can own an account, `is_family_account` = optional shared record): `Customer.account_holder / is_family_account / relationship / gender`, `SaleInvoice.patient` (accounts 0029, billing 0029). Logic in `apps/accounts/family_accounts.py` (`resolve_bill_parties`, `attach_member`, `detach_member`, `customer_for_ledger`); endpoints `customers/<id>/members/`, `customers/<id>/account/`; billing `LedgerPicker expandFamilyMembers`, `BillingFor`, `NewCustomerModal`, `NonValuedCustomerDialog`, `AddFamilyMemberDialog`, `CustomerLookup`, `FamilyAccountCard`, customer form `FamilyFields`. Non-valued customer = `SaleInvoice.walk_in_name`; `Customer.email`; shortcuts Alt+C (counter bill) / Alt+J (non-valued). Details: `docs/FAMILY_ACCOUNTS.md`.
- Purchase orders (rewritten): lifecycle Shortbook -> Draft(SAVED) -> Sent -> Partial -> Completed (+Cancelled/Expired) in `apps/purchases/po_services.py` (`transition`, `mint_po_number`, `recompute_receipts`, `on_order_map`, shortbook + expiry), API in `po_views.py` (orders list/detail/send/cancel/close-short/duplicate/open/items/by-distributor, shortbook, settings/po, public/po/<token>), models `POSequence/POEvent/ShortbookItem` + `PurchaseOrder` lifecycle fields + `PurchaseInvoice.purchase_order`, `OutletSettings.po_*`; frontend `lib/poApi.ts`, `hooks/usePO.ts`, `components/purchases/{PurchaseOrdersList,PODetailView,ShortbookTab,POSettingsTab}.tsx` (settings shown by `components/settings/PurchaseOrderSettingsSection.tsx`), `po/*`, public page `app/po/[token]`. Shortbook loads as paged groups (`?view=groups`, `?distributorId=`, `?countsOnly=1`; see docs). Details: `docs/PURCHASE_ORDERS.md`. (The older notes above that say "PO status never advances" / "PO endpoints are IsAuthenticated" / "PODetailWorkspace unused" no longer apply.)
- Navigation: `lib/navConfig.ts` is the single source for the top bar (`GlobalNavigation`) and the sidebar. Groups use `subItems`, each with its own optional `permission`; `visibleNavItems(has)` drops entries the user may not open, hides empty groups and turns a group left with one entry into a plain link; `activeSubHref` picks the most specific active entry. **Staff** is one group: *Staff List* (`manage_staff`) + *Attendance* (`view_outlet`), so cashiers still see a plain "Attendance" tab. `StaffSectionTabs` switches between the two pages.
- Sales stale-edit guard: `SaleInvoice.updated_at` (billing migration 0028, nullable) -> `check_not_stale` / `touch` in `sale_update_service.py`; PUT, `/revise/` and cancel-and-reissue return 409 on a stale `expectedUpdatedAt`. `check_correction_scope` enforces `can_correct_customer/quantities/rates_discounts` (accounts migration 0028 grants them to existing editors). Revision list (`SaleRevisionListView`) is sales-only and rows carry `document_no` / `resulting_document_id`. Purchase detail API now returns `freightPerUnit` / `otherCostPerUnit`.
- Debit-note edit recomputes the bill's `outstanding` from facts (`_recompute_invoice_outstanding`); cap is per batch across lines. Sale-return edit refuses empty/unlinked lines and advances `updated_at` (stale-edit 409 works). Receipt vouchers now lower `SaleInvoice.amount_due` and only accept this outlet's invoices.
- `get_sale_modification_constraints` (sale_update_service.py:38) blocks edits when returns exist (unless action `return_aware_correction`/`header_correction`), when `receipt_allocations` exist (unless `header_correction`/`paid_bill_correction`), or when a fully paid credit invoice exists.
- `atomic_sale_update` (select_for_update on the invoice):
  - `header_correction` only touches customer/doctor/date/billed_by/sale_type/billing_basis (grand total change blocked) and returns early.
  - Otherwise it reverts old accounting, then re-applies.
  - Reverts: stock, `Customer.total_purchases`, `CreditTransaction` (deleted, `CreditAccount` totals reversed), the SALE `JournalEntry` (reversed by hand and **deleted** via `LedgerService.update_balance`, not contra-posted).
  - Re-applies: items matched to old rows by `batch_id`, `SaleItem` update/create, `ScheduleHRegister.update_or_create`, `SALE_OUT` ledger rows, header totals, `InvoicePayment` recreated, `CreditTransaction`, `Customer.total_purchases`.
  - Customer `LedgerEntry` sale/receipt rows are modified in place with queryset `.update()` and their date shifted to **today**. `rebuild_customer_ledger` recomputes running balances with `.update()`.
  - Re-posts the journal via `post_sale_invoice`.
- Both views wrap in `transaction.atomic` and record `orchestrator.record_revision` + `record_activity` (apps/audit). Snapshots from `SnapshotBuilderRegistry`.
- `cancel_and_reissue`:
  - `cancel_invoice` (reverses stock, `total_purchases`, journal via `reverse_journal`, CreditTransactions with contra rows, cancels IRN via Sandbox if inside 24h, sets `is_cancelled` fields).
  - Then calls `SaleCreateView.post` **in-process** by monkey-patching `request._full_data`.
  - A non-200/201 result raises `SaleServiceError` -> rollback of the whole outer atomic.
- Quotation convert uses the same in-process trick (`request._full_data/_data = payload`).

#### C8. Sale RETURN / credit note
- `POST /sales/return/` (`IsManagerOrAbove`) -> `create_sales_return` (payment_services.py:258, `@transaction.atomic`).
- Original invoice must belong to the outlet; **only one return per invoice** (second -> "already has an active return, modify instead"). No `originalSaleId` -> `manual_override=True`, role must be exactly `admin` or `manager` and a reason is required. A Daybook `JournalEntry` id is also allowed as the "original".
- Per line: `qty_returned` units (explicit or `strips*packSize+loose`), guard `qty_returned + SaleItem.qty_returned <= original units`, return batch must equal the original batch, value = `returnRate * qty / pack_size` (rate from the client, not capped to the sold rate). Optional `deductionAmount`: `net_refund = max(0, gross - deduction)` stored in `SalesReturn.total_amount`.
- Effects: `generate_return_number` (RTN-YYYY-NNNNNN, locks the year's returns), stock back to the batch, `SaleItem.qty_returned += qty`, `StockLedger` SALE_RETURN, optional `credit_note` ledger/outstanding update, `reverse_journal('SALE', original_sale.id)`.
- `refundMode='credit_note'` (the only "credit note" concept in billing): `Customer.outstanding -= gross total` and `LedgerEntry(entry_type='credit_note', credit=gross)`. `cash`/`upi` produce no billing row; only the journal reversal. There is no separate CreditNote or DebitNote model in billing. `BillRevision.linked_credit_note_id/linked_debit_note_id` are unused. A debit note exists only for purchases (`journal_service.post_debit_note`).
- Return edit (`PUT /sales/returns/<id>/` -> `atomic_sale_return_update`): OCC by `expectedUpdatedAt`; settled (cash/upi) returns need admin or `can_modify_settled_returns`; mandatory reason code+text; reverses old stock-ledger rows, `qty_returned`, credit-note ledger; recreates items, re-posts stock ledger and ledger, runs `rebuild_stock_ledger`; `audit.orchestrator.record_mutation`. It does not touch the GL journal.

#### C9. Receipts, expenses, credit payments
- `create_receipt_payment` (:91): allocations must sum to `totalAmount` (tolerance 0.01) and each must be <= `invoice.amount_due`. Writes `ReceiptEntry`, `ReceiptAllocation`, updates `SaleInvoice.amount_paid/amount_due`, `Customer.outstanding` (floored at 0), a `LedgerEntry(receipt)`. **No journal posting and no CreditAccount update.**
- `create_expense_entry` (:217): inserts an `ExpenseEntry` only. **No journal and no ledger.**
- `POST /credit/payment/`: builds a `receipt` Voucher (Dr Cash/UPI/Card ledger, Cr customer ledger) through `accounts.VoucherService.create_voucher`, which (per the comment) updates `CreditAccount`. It does NOT update `SaleInvoice.amount_due` or `ReceiptEntry`.
- Result: three parallel accounting representations of customer dues, which can drift:
  1. `Customer.outstanding` (field)
  2. `CreditAccount.total_outstanding`
  3. accounts `Ledger.current_balance` (`Customer.outstanding_balance` property prefers this)
  - Also `billing.LedgerEntry.running_balance`.

#### C10. Quotation flow
- Create/Update (`quotation_views.py`): camelCase->snake_case mapping by hand; snapshots `medicine_name,batch_no,expiry_date,pack_size,mrp`; RETAIL forces `rate=sale_rate=batch.mrp`, WHOLESALE keeps the client rate/PTR/PTS. Numbering via `generate_quotation_number` (services.py:262: `QT-YYYY-NNNNNN`, `select_for_update` on the latest quotation row, resets yearly). Totals are taken from the client (no server re-computation). `valid_until` and `expired` status are never enforced.
- Convert (:306): builds a SaleCreate payload from the stored quotation (`paymentMode` default cash, `cashPaid` default = grand_total) and calls `SaleCreateView.post` in-process. On 201: `status='converted'`, `converted_at`, `converted_to_invoice_id`. The payload does not forward `saleType`/`billingBasis`/`freeQty`/`billedBy` (see D).

#### C11. E-invoice / E-way bill
- `process_pending_irn` (sale_services.py:50): feature flag `OutletSettings.enable_einvoice`; needs a 15-char customer GSTIN; `request_einvoice` (Sandbox); on error 2150 recovers via `get_irn_by_document_details`; stores `irn,ack_no,ack_date,qr_code,eway_bill_no`; sets `GENERATED` / `FAILED`.
- `process_pending_ewaybill` (:104): feature flag `enable_eway_bill`, `request_ewaybill`.
- Retry: `POST /sales/<id>/retry-einvoice/`. Cancel IRN: only inside `cancel_invoice`, and only within 24h (`is_irn_cancelable`).

#### C12. Atomicity and locking summary
| Operation | Atomic | Row locks |
|---|---|---|
| Sale create | `with transaction.atomic()` around everything after validation; customer auto-creation, IRN and EWB are outside | Outlet row (invoice no.), `Batch` only on FEFO path |
| Sale update / cancel | `@transaction.atomic` + view-level atomic | invoice, all old+new batches (sorted); `cancel_invoice` locks only the invoice |
| Sales return create | `@transaction.atomic` | return numbers only; **no lock on Batch/SaleItem** |
| Sales return update | `@transaction.atomic` | return row, each SaleItem |
| Receipt / expense | `@transaction.atomic` | none |
| Credit payment | view has no atomic; delegates to `VoucherService` | none |
| Marg import | `@db_transaction.atomic` | none |

#### C13. "Change X -> also check Y" couplings
- Change create-path GST/discount math (views.py:594-728, 1004-1081, 1153-1242) -> mirror in `sale_update_service.py:587-635` (update path, trusts client), `sale_services.atomic_sale_save` (dormant copy), and `frontend/lib/billingMarginUtils.ts` (client cap logic; see recent commits to billing margin/discount).
- Change `SaleItem` quantity semantics -> `SaleItem.qty_returned` is in loose units; `has_return`, `SaleItemsView.totalQty`, `create_sales_return`, `atomic_sale_return_update`, `atomic_sale_update` (the "cannot reduce below returned" guard) all depend on it.
- Change anything that writes `LedgerEntry` -> create path, `payment_services` (receipt, credit note), `sale_update_service` (in-place `.update()` + rebuild), `sale_return_update_service` (own `_last_ledger_balance` using `-id`).
- Change journal posting (`accounts.journal_service.post_sale_invoice`) -> create, update (manual reversal + re-post), cancel (`reverse_journal`), return (`reverse_journal` of the whole sale). `reverse_journal` idempotency is keyed on `(RETURN, source_id)`.
- Change stock deduction -> `inventory.services.post_stock_ledger_entry` / `rebuild_stock_ledger` (they overwrite `Batch.qty_*`), `fefo_batch_select`, return and cancel paths.
- Change invoice numbering -> `generate_invoice_number` (INV-YYYY-NNNNNN; filter `startswith` INV-year) used by NextInvoiceNumberView preview and create. Return numbers use a separate generator; quotation numbers a third.
- Change `SaleInvoice` fields -> `build_sale_response_payload` (views.py:140), `SaleListView` row builder, `SaleDetailView.get`, `SaleInvoiceSerializer` (`__all__`), `reports/*` (GST snapshots/GSTR-1, daily snapshot, ERP reports), seeder, audit `SnapshotBuilderRegistry`.
- Change IRN statuses -> model choices (`NOT_REQUIRED`) vs code values (`NOT_APPLICABLE`).
- Change credit semantics -> `CreditAccount`, `Customer.credit_limit/outstanding`, `credit_controls.*` (dormant), `sync_credit_accounts`, `VoucherService` hooks, `CreditAccountListView` auto-sync.

### 9.3 Inventory / purchases / OCR logic map

#### C1. Purchase invoice CREATE (manual or OCR-confirmed)
Entry: `PurchaseCreateView.post` views.py:459 (or `InvoiceDraftConfirmView.post` :2464) -> `services.atomic_purchase_save(payload, outlet_id, staff_id)` services.py:30 (`@transaction.atomic`).
Key payload fields: outletId, partyLedgerId* (required; accounts Ledger), invoiceNo, invoiceDate, dueDate, purchaseType, godown, subtotal, discountAmount, invoiceDiscount, taxableAmount, gstAmount, cessAmount, freight, roundOff, ledgerAdjustment, ledgerNote, grandTotal, notes, items[]. Item: masterProductId|productId, ocrOriginalName, customProductName, isCustomProduct, hsnCode, batchNo, expiryDate (ISO or `MM/YY`), pkg, qty, freeQty, actualQty, qtyLoose(must be 0), purchaseRate, baseLandingRate, discountPct, cashDiscountPct, gstRate, cess, mrp, ptr, pts, freightPerUnit, otherCostPerUnit, taxableAmount, gstAmount, cessAmount, totalAmount.
Steps:
1. Outlet fetch; `partyLedgerId` -> `Ledger.select_for_update()`; if ledger has no `linked_distributor`, auto-creates a Distributor from ledger fields and links it (services.py:60-83).
2. Duplicate guard: same outlet+distributor+invoice_no with status POSTED => PurchaseServiceError (:96-103). Case-sensitive here, but `CheckPurchaseInvoiceView` uses `iexact`.
3. Date sanitising (:112-119): 2-digit years 20-99 -> 2000+; years <2000 or > current+1 are forced to current year.
4. PurchaseInvoice created; cash => amount_paid=grand_total, outstanding=0; credit => outstanding=grand_total; due_date defaults to invoice_date + distributor.credit_days. `invoice_discount = max(payload, subtotal - taxable - discountAmount)` (:140-143).
5. Per item (:167-345): OCR alias learning (`MasterProductAlias.get_or_create` when ocrOriginalName differs from product name, :175-190); expiry parse; reject qtyLoose>0 (:229); `total_strips = qty + freeQty`; batch resolve: in-transaction `batch_cache[(batch_no, expiry)]` else `Batch.get(outlet, batch_no, expiry_date, product)` (merge: `qty_strips += total_strips`, overwrite mrp/ptr/pts/purchase_rate/pack_size) else create new Batch (purchase_rate = `baseLandingRate` or `purchaseRate`; pack_size from item.pkg/product; `Batch.landing_rate` left NULL).
6. Landing cost per item (services.py:292-330): `gst_per_unit = gstAmount/qty`; `base_rate = qty*purchaseRate*(1-trade%)*(1-cash%) / (qty+freeQty)`; `include_gst = not OutletSettings.gst_registered or landing_cost_include_gst`; `landing_rate = base_rate [+ base_rate*(gst%+cess%)/100 if include_gst] + freightPerUnit + otherCostPerUnit` stored on PurchaseItem.landing_rate. `pkg` stored = batch.pack_size.
7. `PurchaseItem.bulk_create`; for each item `inventory.services.post_stock_ledger_entry(PURCHASE_IN, qty_in=qty+free_qty (strips), rate=purchase_rate, source_object=PurchaseItem)` (:370-388).
8. billing.LedgerEntry (entity_type 'distributor', entry_type 'purchase', debit=grand_total, running_balance = last + grand_total) (:393-413).
9. `accounts.journal_service.post_purchase_invoice` (journal_service.py:892): Dr Purchase Account(subtotal), Dr GST Input (rate-snapped CGST/SGST or IGST by `_is_interstate(distributor state, outlet state)`, `_build_purchase_gst_lines` :546), Dr Cess, Dr Freight Inward, Cr Discount Received, Dr/Cr Round Off, Dr/Cr Ledger Adjustment, Cr party Ledger(grand_total); balance check 0.01; guarded by `_guard_double_posting`. Cash: second JournalEntry `PURCHASE_PAYMENT` Dr party ledger / Cr 'Cash' ledger (services.py:427-455).
10. Audit v2 snapshot via `apps.audit.core.orchestrator.record_mutation(action CREATE)` only if `flags.is_v2_write_enabled()` (:462-476).
Error mapping: any non-PurchaseServiceError exception is wrapped into `PurchaseServiceError("Unexpected error: ...")` => HTTP 400 PURCHASE_ERROR (not 500).
Coupling: change item payload fields => also `PurchaseCreateView._serialize_purchase_item` (views.py:~600), `atomic_purchase_update` (duplicate body), `InvoiceDraftConfirmView`, frontend `NewPurchaseForm.tsx` / `lib/apiClient.ts` (createPurchase), OCR review mapping in NewPurchaseForm.tsx:~300-345.

#### C2. Purchase invoice EDIT
`PurchaseDetailView.put` views.py:1264 (CanEditPurchaseInvoice + redundant role check) -> `atomic_purchase_update` services.py:694. Requirements: `revisionReasonCode` and `revisionReasonText` (>=10 chars); if `outstanding <= 0` (fully paid) requires admin or `staff.can_modify_paid_purchases`; `partyLedgerId` must have a linked distributor.
Order: lock invoice -> old audit snapshot (SnapshotBuilderRegistry) -> over-consumption check (new qty per (batch_no, expiry) must be >= purchased - current_stock, keyed by strips, :~745-770) -> delete old PURCHASE_IN StockLedger rows by PurchaseItem content_type (:~773-780) -> delete old PurchaseItems -> reverse old journals (SOURCE 'PURCHASE' and, for cash, 'PURCHASE_PAYMENT') via `LedgerService.update_balance` reverse + delete -> overwrite invoice header fields (created_by := editor) -> rebuild items: batch re-found by old PK map, else by key; existing batch gets rates/pack_size/product updated but qty_strips NOT incremented (only brand-new batch gets qty; within-transaction duplicate keys do `+=`) -> bulk_create items -> post new PURCHASE_IN ledger rows -> `rebuild_stock_ledger(batch_id, from_date)` per touched batch (this recomputes `Batch.qty_strips/qty_loose` from ledger running_qty, so the ledger is the source of truth for stock after an edit) -> update/recreate billing.LedgerEntry matched by `reference_no == old_invoice_no` then `rebuild_distributor_ledger` (:672) -> re-post journals -> `record_mutation(action UPDATE)` (always, unlike create).
Coupling: any new stock-moving flow (sale, return, adjustment, import) MUST write a StockLedger row or an edit/rebuild will reset Batch qty (see D). Edit ledger/journal logic duplicated from create (see D).

#### C3. Payment (bill-by-bill) flow
`DistributorPaymentView.post` views.py:1019 -> `services.bill_by_bill_payment_allocate` services.py:487 (`@transaction.atomic`). Validates: each allocation invoice in outlet and `allocatedAmount <= invoice.outstanding`; sum(allocations) == totalAmount within 0.01; creates billing.PaymentEntry, PaymentAllocation snapshots (invoice_no/date/total/current_outstanding), decrements `invoice.outstanding`, increments `amount_paid`, adds billing.LedgerEntry credit (running_balance = last - total). NO JournalEntry/JournalLine posted by this path and no row locks on invoices.
A second payment path exists via accounts vouchers (accounts/voucher_update_service.py:144 mutates PurchaseInvoice.outstanding, accounts.post_voucher journal). Frontend calls `/purchases/payments/` from `lib/apiClient.ts:962` (recordPayment) and `:1580` (createPayment).
Read side: `PaymentListView` (:1327), `DistributorOutstandingView` (:1377), `PurchaseListView._serialize_purchase` derives paymentMode/cash/bank/cheque/upi split from PaymentAllocation rows (views.py:~900-960).
Rule 37 (ITC reversal after 180 days unpaid): `Rule37TrackerService.evaluate_invoices(run_date)` services.py:1171 reads `PurchaseInvoice.outstanding`/PaymentAllocation and creates `Rule37Adjustment` rows (REVERSAL_DUE / REAVAILMENT_ELIGIBLE). No caller, no beat schedule, no management command (grep).

#### C4. OCR / AI invoice scanning pipeline
Provider selection (ocr_engine.py:1061 `process_invoice_image`): env `GEMINI_API_KEY` set => Google Gemini path `gemini_ocr.process_with_gemini` (gemini_ocr.py:~70), model string `gemini-flash-lite-latest` (:~58; logs/warnings still say "Gemini 1.5 Flash"), structured output via pydantic `GeminiInvoice` schema, temperature 0, `tenacity` retry 5x exponential (2-30s) on ANY Exception, image uploaded with `client.files.upload`. Key unset => local pipeline: OpenCV preprocess (`preprocess_image` :119, `_deskew` :183) -> RapidOCR (`extract_text_blocks` :221, `rapidocr_onnxruntime`) -> `split_zones` :300 -> `parse_header` :332 -> `match_distributor` :890 -> `detect_column_map` :513 (uses `Distributor.ocr_column_map` learned synonyms + `COLUMN_SYNONYM_MAP` :32) -> `extract_line_items` :636 -> `_clean_item` :792 / `_validate_item_math` :831 -> `match_medicine` :985 -> `parse_footer` :852 -> `_calculate_confidence` :1187. No fallback from Gemini to local on Gemini failure (error is returned as OCR_PROCESSING_FAILED).
Async flow:
1. `POST /purchases/scan/upload/` (views.py:2121) creates SAVED PurchaseInvoice (blank invoice_no, zero amounts, `created_by=request.user`) and calls `process_invoice_ocr.delay(draft_id)`; returns 202 + draftId. Broker failure => `ocr_processing_error='OCR_QUEUE_UNAVAILABLE'`, 503.
2. Celery task `purchases.process_invoice_ocr` (purchases/tasks.py:9; `@shared_task`, no retry/time_limit, default queue; docker-compose `celery` service concurrency 2, no `-Q`): loads invoice, missing image => `OCR_IMAGE_MISSING`; runs `process_invoice_image(invoice.invoice_image.path, outlet_id)`; on `result['error']` stores code in `ocr_processing_error`; else stores `ocr_raw_data`, `ocr_confidence`, `ocr_distributor_{name,gstin,phone,dl,address}`, and `distributor_id` if matched (tier 1 fuzzy name >=0.82 via RapidFuzz token_sort_ratio; tier 2 GSTIN exact; tier 3 phone/DL 20B/21B). Exceptions => `OCR_PROCESSING_FAILED`.
3. Status polling: frontend `NewPurchaseForm.tsx:~301` GETs `/purchases/{id}/ocr-status/` every 2s, gives up after 90 attempts (~3 min) client-side. Server states: processing (both raw_data and error NULL) / error (code mapped through `OCR_FAILURE_MESSAGES` views.py:2091; unknown => OCR_PROCESSING_FAILED) / ready (review payload; normalises expiry to YYYY-MM-01, resolves linked party Ledger).
4. Retry: `POST .../ocr-retry/` clears error and re-enqueues only if error is set and raw_data is NULL.
5. Review/confirm: frontend fills `PurchaseItemFormData` from `items[].medicineMatch` then user posts to `POST .../{id}/confirm/` (apiClient.ts:942). Server optionally merges `_learnedColumnMap` into `Distributor.ocr_column_map`, runs `atomic_purchase_save` (same as manual), moves invoice_image to the new POSTED invoice, deletes the SAVED draft. Draft deletion alternative: `DELETE /purchases/{id}/` (SAVED only).
Medicine matching (`match_medicine` :985): tier 1 per-outlet `MasterProductAlias` iexact; tier 2 fuzzy across WHOLE MasterProduct catalogue (0.4*token_set + 0.6*token_sort; accept if set>=0.85, sort>=0.78, lead over runner-up >=0.05). Learning loop: confirmed `ocrOriginalName` -> alias saved in atomic_purchase_save.
Environment: requirements.txt (apps/backend) lists rapidocr-onnxruntime, opencv-python-headless==5.0.0.93, rapidfuzz==3.6.1, google-genai, pydantic, reportlab, openpyxl; `tenacity`, `numpy` are implicit transitive deps. Dockerfile (docker/backend.Dockerfile) was modified in working tree (not inspected here).

#### C5. Batch / stock creation and stock ledger
- Batches are created ONLY by: atomic_purchase_save / atomic_purchase_update (purchases/services.py:236-290, 930-987), management commands (import_marg_data, fresh_tally_migration, backfill), and billing returns (outside scope). Stock quantity changes: purchases (+), sales (billing/sale_services.py, FEFO), adjust (`InventoryAdjustView` :1237), edit/rebuild.
- `inventory.services.post_stock_ledger_entry` services.py:9: locks last ledger row for (outlet, product, batch) with `select_for_update()` (does NOT lock the Batch row), computes running_qty/value, writes row incl. generic source (content_type/object_id), snapshot batch_no/expiry; if `txn_type == 'ADJUSTMENT_OUT'` calls `_auto_create_stock_adjustment` :84.
- `_auto_create_stock_adjustment`: creates StockAdjustment (always type 'EXPIRED', PROPOSED) and FIFO-allocates the written-off quantity across PurchaseItems of the batch (ordered by invoice_date) into StockAdjustmentAllocation rows with proportional taxable/GST/CESS reversal (intra vs inter-state by comparing distributor.state vs outlet.state strings); on any shortfall it returns leaving adjustment `NEEDS_REVIEW` without allocations.
- `rebuild_stock_ledger(batch)` :178: recompute running_qty/value from `from_date` (or opening_qty fallback when no prior row) and overwrite Batch.qty_strips/qty_loose from the final running_qty.
- `reverse_stock_ledger_entry(outlet, txn_type, source_object, ...)` :241: delete matching ledger rows and rebuild; used by other apps (billing).
- `inventory/utils.py:quantity_to_pack_display(raw_qty, pack_size)` converts fractional strips to `{strips, loose, text}` for display.
- `InventoryAdjustView` (views.py:1237): auth by staff PIN (`check_password` against ANY active Staff of the outlet, :1275-1288); strips mode (`qty_strips += qty`) or loose mode (breaks/consolidates strips); writes ADJUSTMENT_IN (qty>0) or ADJUSTMENT_OUT (qty<=0) ledger rows at `batch.purchase_rate`; `log_activity`; then `cache.delete_pattern("mediflow:inventory:list:{outlet}:*")` swallowed in try/except.
- Inventory list cache: `inventory:list:{outlet}:{md5}` 120s (django RedisCache with KEY_PREFIX `mediflow`); invalidated only by adjust (and maybe elsewhere).
- Management commands (inventory/management/commands): `backfill_stock_ledger` (deletes ALL StockLedger rows for all outlets then rebuilds OPENING/PURCHASE_IN/SALE_OUT with phantom OPENING for legacy batches), `reconcile_inventory` (ledger sum vs `Batch.total_stock`, report only), `rebuild_bottle_stock` (`--dry-run`; recompute qty for pack_unit 'bottle'), `find_skeleton_products` (list products missing HSN/GST/MRP), `import_marg_data` (`--outlet --item-master --stock --party [--stock-skip --dry-run]`; creates products, batches with OPENING ledger), `fresh_tally_migration` (`--dry-run|--execute --xml-dir`; destructive reset of outlet data + Tally XML import, outlet UUIDs hard-coded in docstring). purchases has NO management commands (dir empty).

#### C6. Landing cost
Three separate computations (must stay in sync):
1. Persisted at purchase time: `PurchaseItem.landing_rate` (services.py:292-330, post-discount, optional GST+cess, + freight + other) per pack.
2. On-demand: `PurchaseItem.get_landing_cost(include_gst)` (purchases/models.py:305; raw purchase_rate, no discounts, no cess) used by `billing/utils/pricing.py:get_landing_cost_for_batch` (:14) and `BatchLandingCostView`; `include_gst` there = `OutletSettings.landing_cost_include_gst` only (ignores the `not gst_registered` branch used in services). Falls back to batch.ptr, batch.landing_rate, then purchase_rate if no PurchaseItem.
3. `Batch.landing_rate` (manual override via `BatchDetailUpdateView`), consumed by billing sale floor logic (billing/sale_services.py:373-377, billing/views.py:653/1024/3014) and reports (reports/services/erp_report_service.py:371/432/738, reports/views.py:645-689) as `batch.landing_rate or batch.purchase_rate`.
Change X -> also check: landing formula => services.py create (:292-330) AND update (:991-1030) AND models.py:305 AND billing/utils/pricing.py AND ERP profit reports (EXTRACTED_LANDING_COST_DRIFT.md / EXTRACTED_PROFIT_MATH.md in repo root describe prior drift).

#### C7. Product master, drug schedule and GST slabs
- `MasterProduct.schedule_type` choices in models.py:30-41; `drug_type` derived server-side from schedule via duplicated dicts (`schedule_to_drug` ProductListView :243-249, `SCHEDULE_TO_DRUG` ProductDetailView :314-319; 'Surgical'->allopathy, 'Cosmetic'->fmcg).
- Sale-time enforcement of scheduled drugs (G,H,H1,X,C,Narcotic) lives in billing (`sale_services.py:~481` creates ScheduleHRegister); purchases do not check schedule.
- GST slab validation: `core.TaxSlab.is_rate_active(rate, transaction_date)` (core/models.py:~455): rates before 2025-09-01 any known slab; afterwards only `is_active` TaxSlab rows (GST 2.0: 12%/28% deactivated; fixture `core/migrations/0015_activate_pharma_tax_slabs.py` untracked). Enforced ONLY on product create (views.py:229) and product PUT (:339); NOT enforced on PurchaseItem.gst_rate, so historical/legacy rates pass through purchases, and journal GST rate is inferred as gst_amount/taxable snapped to {5,12,18,28,40} (`_snap_to_standard_rate`).
- New product from purchase UI: `POST /products/` (requires hsnCode, packUnit, mrp>0; category hard-coded 'general').
- Purchase interstate GST: determined from `Ledger.state` / `Distributor.state` vs `Outlet.state` (accounts/journal_service.py `_is_interstate`).

#### C8. Purchase orders (procurement)
`PurchaseOrderSuggestionsView` (views.py:1483) computes low-stock candidates: products with active batches or `OutletProductConfig.min_qty>0`; `available = effective_strips + on_order`(SENT/PARTIAL PO lines) <= min_qty; suggested `deficit = reorder_qty - available` (fallbacks), price = last PurchaseItem.purchase_rate -> latest batch purchase_rate -> batch ptr -> MasterProduct.mrp. `PurchaseOrderBulkCreateView`/`ListView.post` create SAVED POs numbered `PO-YYYYMMDD-NNN` from a same-day count (no lock/unique). PUT replaces all items. Exports: Excel (`openpyxl`), PDF (`reportlab`). The PO lifecycle after SAVED is not implemented (see D).

#### C9. Change X -> also check Y (quick couplings)
- Stock units (strips vs units) => inventory/services.py (ledger, rebuild, auto adjustment), purchases/services.py, billing/sale_services.py:462-478, reports, `reconcile_inventory.py`, `quantity_to_pack_display`.
- New stock-moving feature => must call `post_stock_ledger_entry` AND be safe against `rebuild_stock_ledger` (it overwrites Batch qty from ledger).
- Purchase item field added => PurchaseItem model+migration, services create+update item dicts, `PurchaseCreateView._serialize_purchase_item`, `PurchaseDetailView.get` item dict (:~1190), `PurchaseInvoiceSearchView`, audit SnapshotBuilderRegistry (apps/audit), frontend types (`frontend/src/types/api.ts`, `lib/apiClient.ts`, PurchaseItemRow.tsx, NewPurchaseForm.tsx).
- Permission changes on `/purchases/` or `/purchases/payments/` => remember the MRO-merged view classes in urls.py:63-79.
- OCR model/provider change => `process_invoice_image` return contract: `{header, items[{name,batch_no,expiry,qty,free_qty,mrp,rate,discount,gst_pct,amount,hsn_code,pack_size,_medicine_match,_validation_ok}], totals{subtotal,cgst,sgst,igst,grand_total,round_off}, distributor_match{distributor_id,match_tier,confidence,is_new}, confidence, warnings, column_map}` consumed by tasks.py:9-39 and `InvoiceOCRStatusView` (views.py:2300+); error contract `{error: OCR_NO_TEXT|OCR_ENGINE_UNAVAILABLE|OCR_PROCESSING_FAILED}` must exist in `OCR_FAILURE_MESSAGES`.
- Distributor create/update => accounts.Ledger sync (views.py:150-170, 296-300), `ocr_column_map`, `dl_no_20b/21b` matching (no API sets them).
- Cache keys: `prod_search:v2:*` and `prod_catalog_search:v2:*` (60s) are not invalidated on purchase/stock change.

### 9.4 Reports logic map

#### C.1 Marg-style ERP reports (`R/services/erp_report_service.py`, `R/services/erp_excel_service.py`, views `R/erp_views.py`)
Service class `ErpReportService` (erp_report_service.py:14), all classmethods, pure Python in-memory bucketing with `prefetch_related`.
- Common: dates parsed `_parse_date` (:21, bad input silently becomes today; start/end swapped if reversed). Invoices: `SaleInvoice(outlet, invoice_date__date__range, is_cancelled=False, is_return=False)`.
- `get_consolidated_sales_book` (:34): per invoice sums item `taxable_amount` and `gst_amount` (fallback cgst+sgst+igst) and buckets GST into 5/12/18/28 slabs using `abs(rate-X)<0.5`; rate<=0.01 goes to `exempted` (taxable value). **Any other rate (e.g. 3%, 0.25%, 1.5%, 40%) is counted in `total_gst` but in no slab column.** `round_off` and `net_total=grand_total` taken from the invoice. If `less_returns`, SalesReturn rows (credit notes) are appended with negative values (is_return=True). Summarised mode groups by date. Output formats: JSON (API) and Excel via `ErpExcelService.generate_sales_book_excel` (erp_excel_service.py:168).
- `get_gross_profit_report` (:317): `net_sales=grand_total` (tax-inclusive!), COGS = sum over items `(batch.landing_rate or batch.purchase_rate)/pack_size * (qty_strips*pack_size + qty_loose)`; `gross_profit = sales - cogs`; `profit_pct = gp/sales*100`. Returns (SalesReturn by `return_date` range) subtract refund and reverse COGS (`qty_returned_*`). Excel: `generate_gross_profit_excel` (:437).
- `get_sales_return_book` (:506): credit-note register by `SalesReturn.return_date`, same slab buckets from SalesReturnItem. Excel: `generate_sales_return_book_excel` (:572).
- `get_gross_loss_on_return_report` (:694): `gross_loss = refund - cogs_reversed` per return; `loss_pct = gross_loss/refund*100`. Zero strips/loose fall back to `qty_returned`. Excel: `generate_gross_loss_on_return_excel` (:338).
- Excel styling: `ErpExcelService` (erp_excel_service.py:13) openpyxl, dark-blue "Marg" palette, pharmacy header from Outlet (`_write_pharmacy_header` :75), autofit. Exports built by views by `wb.save(BytesIO)` -> `HttpResponse` (`.xlsx`).
- Frontend: pages `apps/frontend/app/dashboard/reports/erp-*` (other agent).

#### C.2 Daily snapshot ("Daily Reporting" sheet) (`R/daily_snapshot_views.py`)
`get_daily_snapshot_data(outlet_id, start, end)` (:21) - one big function returning the JSON in A.1; used by both snapshot GET and Excel export.
- Opening cash: `DailyCashReport.opening_cash`, else walks back 5 prior reports (`next_day_opening` > `actual_cash` > `opening_cash`) (:34-43).
- Sales: `SaleInvoice` in `[start 00:00, end 23:59:59]`, `is_cancelled=False` (includes return invoices if any; subtracts SalesReturn separately). Payment split from `cash_paid/upi_paid/card_paid/credit_given`, else from `payment_mode`.
- COGS (headline): items `(strips*pack + loose) * batch.purchase_rate/pack` (NOTE purchase_rate, not landing_rate as in C.1). `gross_profit = (sales - returns) - (cogs - returns_cogs)` (:150-200). `net_profit = gross_profit - fixed_expense.per_day * days_in_range`.
- Cash required (formula at ~:440): `opening + gross sales - returns - credit - upi - card - cash expenses - cash payments - cash purchases + cash received + cash income`; `extraShort = actual_cash - cash_required`.
- Vouchers: posted `Voucher`s in range; cash portions of payment vouchers split proportionally across debit lines and classified expense vs payment by LedgerGroup name/nature; receipt vouchers split into income vs received. Plus legacy POS `ReceiptEntry` (cash) and manual `carton_sale`.
- Stock value: `Batch` (active, qty>0) `qty_strips*purchase_rate + qty_loose*purchase_rate/pack`.
- Partners: loops day by day (O(days x queries)), applying `PartnerShareHistory` percentage valid on each day to that day's net profit (re-computed with a Python item loop); only partners with pct>0 or share!=0 returned.
- **Ledger statement** (`GET /ledgers/<id>/statement/`, `LedgerStatementView`): builds every entry (manual voucher lines + auto-posted journal lines, oldest first, with the true running balance), THEN applies `ordering` (`desc` reverses the whole list), THEN server-side `search` (voucher no, description, type, amount; totals of the matches in `filteredDebit/filteredCredit`), THEN cuts the page (`page`, `page_size` 50-2000; `totalEntries` = all entries in range). The old code cut the oldest page and reversed only that page, so on a busy ledger (Cash, ~1,500 rows) "latest first" never reached the newest entries. A voucher line with no narration gets "Contra: <other ledger>". Screens: `accounts/ledgers/[id]/page.tsx` (200 per page, First/Previous/Next/Last), trial balance and balance sheet drill-downs use `voucherApi.getLedgerStatementAll` (all pages), profit & loss uses "Load more".
- **Bank deposit / contra**: posted `contra` vouchers in range are read in the same loop. Cash credited against a `Bank Accounts` ledger debit = `bankDeposit` (listed in `details.bankDeposit`); cash debited against a bank credit = `cashFromBank`. The cash formula is now `... - cash purchases - bankDeposit + cashFromBank + cash received + cash income`. A contra between two cash ledgers, or two banks, moves nothing in the till. A deposit is recorded with `POST /reports/daily-snapshot/bank-deposit/` (`BankDepositView`, `CanEditVouchers`): it builds a contra voucher (Dr bank, Cr cash) through `VoucherService.create_voucher` (amounts passed as strings: the service writes its input to the audit log as JSON), refuses bad amounts/dates/other outlets' ledgers, and ignores an identical deposit repeated within 10 s. The snapshot also returns `bank: {accounts, cashLedger}` for the form. UI: `components/reports/BankDepositModal.tsx` (button on the "(-) Bank Deposit" row, gated by `edit_vouchers`).
- Exports: JSON, Excel (`DailySnapshotExportView`). No PDF.

#### C.3 GST suite (snapshot driven)
Pipeline: transaction -> `GSTTransactionSnapshot` -> builders -> JSON -> validators -> exports.
- Snapshot creation `R/gst_snapshot_service.py`: `create_sale_snapshots` (:35; delete+recreate by document_id; interstate if outlet state code != customer GSTIN/state prefix; supply class B2B / B2CL (interstate, unregistered, total > `B2CL_THRESHOLD`=100000 from `apps/gst/conf.py:5`) / B2CS; HSN keyed `hsn_rate_uqc` with UQC hard-coded `PAC`), `create_sales_return_snapshots` (:135), `create_purchase_snapshots` (:263), `create_purchase_return_snapshots` (:366). **Only `create_sale_snapshots` is invoked by production code** (`billing/sale_services.py:598`, lazy calls in `dashboard_views.py:~60` and `exports/gstr1_excel.py:~70`, mgmt command `sync_missing_snapshots`). The other three are only referenced by seeders/tests (grep of non-test code) so purchase/return snapshots must come from seed commands (see H).
- `GSTR1Builder` (`R/gstr_builders.py:32`): filters snapshots by `outlet__gstin`, `transaction_type in (sale, sales_return, credit/debit notes)`, period or `document_date` range. Sections: `build_b2b` (:62), `build_b2cs` (:108, aggregated by rate+POS), `build_b2cl` (:166), `build_hsn` (:208), `build_cdnr` (:310), `build_cdnur` (:348), `generate_json` (:388) returns GST-portal-shaped dict (`gstin, fp, b2b, b2cl, b2cs, cdnr, cdnur, hsn`) plus `_metadata{validation_warnings, blocking_errors, info, is_valid_for_export}` from `GSTR1Validator` (`R/validators.py:18`). Date format `DD-Mon-YYYY` via `format_gst_date` (:16). Default POS = outlet.state_code else env `DEFAULT_POS` ('27').
- `GSTR3BBuilder` (`R/gstr_builders.py:418`, `generate_json` :445): Table 3.1 (osup_det / osup_zero / osup_nil_exmp / isup_rev), 3.2 unregistered inter-state by POS, Table 4A ITC from **purchase snapshots** (import goods, RCM, all-other), plus claimed `DeferredITCEntry` (status CLAIMED, claimed_period==period), 4B reversals from `StockAdjustment` (`gstr_reason_code='SECTION_17_5_H'`, approved, month match) and `Rule37Adjustment` (REVERSAL_DUE), 4D re-claims from Rule 37 `reclaim_period`. Returns/credit notes multiply by `BUSINESS_DIRECTION_SIGN` (-1). Reversal/reclaim block is wrapped in a bare `except Exception: pass` (:~598). Validated by `GSTR3BValidator` (`R/validators.py:143`, tolerances from `apps/gst/conf.py:GSTR3BValidationConfig`).
  - Note: ITC is taken from purchase snapshots regardless of 2B match; withholding of unmatched ITC is handled only by `DeferredITCEntry` rows, which are created by the reconciliation but NOT subtracted from 4A (only claimed ones are added) (inferred from code reading).
- `GSTR2BService` (`R/gstr2b_service.py:23`): `fetch_gstr2b_data` -> `get_active_provider().fetch_gstr2b(...)` (Sandbox) using taxpayer session token; `reconcile` (:41, `@transaction.atomic`) deletes + reinserts `GSTR2BData` for the period (b2b only; CDN/ISD ignored), matches purchase snapshots by `GSTIN_invoice` exact, then fuzzy (alnum-only, leading zeros stripped, flagged `INVOICE_FORMAT_MISMATCH`), `_evaluate_match` (:206) tolerance checks VALUE/TAX/DATE/PERIOD/TAX_RATE/SUPPLIER_FLAGGED (tolerances `apps/gst/conf.py`), unmatched purchases -> `MISSING_IN_2B` + create/update `DeferredITCEntry(DEFERRED)`; matched -> mark entries CLAIMED. On sandbox auth failure it logs a warning and reconciles against empty 2B data (everything "missing").
- Normalisers `R/normalizers.py` (`normalize_gstr2b_record`:57, `parse_date`:7, `extract_monetary`:15) are used by the gst app sync task, not by `GSTR2BService`.
- Exports: `R/exports/gstr1_excel.py` (official template via `OOXMLInjector` `R/exports/ooxml_injector.py:31` raw-XML injection to preserve macros/validations; preflight `ExporterPreflightValidator` R/validators.py:36), `gstr3b_excel.py` (xlsm), `ca_working_paper.py` (ReportLab PDF), `reconciliation_excel.py`, `gstr2b_json.py`; JSON/CSV in `dashboard_views.GSTExportView`. Audit rows written to `GSTExportAudit` with SHA-256 of output (+ source JSON hash, template checksum).
- Legacy live (non-snapshot) GST endpoints: `GSTR1ReportView`, `GSTR2ReportView`, `GSTR3BReportView`, `GSTR2AReconciliationView` in `R/views.py` (see A.1). They duplicate logic with different results.

#### C.4 Other reports in `R/views.py`
| Report | Function | Source models | Key calc | Formats |
|---|---|---|---|---|
| Daily sales | `SalesDailyReportView.get` :55 | SaleInvoice | sums of grand_total/discount/cgst+sgst+igst for `is_return=False`; returns separate; net = gross - returns; payment breakdown by `payment_mode` (not by split paid fields) | JSON |
| Sales summary | `SalesSummaryReportView.get` :359 | SaleInvoice, SaleItem | range aggregates, by-day (TruncDate), top 10 products (by line total) and top 10 staff | JSON |
| Stock valuation | `InventoryValuationView.get` :624 | Batch | `eff_qty = qty_strips + qty_loose/pack_size`; value at purchase_rate, landing_rate (fallback purchase), mrp; grouped per product; 10-min Redis cache | JSON (frontend page `stock-valuation`) |
| Inventory movement | `InventoryMovementReportView.get` :738 | Batch, PurchaseItem, SaleItem | "opening" = current total strips (NOT historical opening), then running balance over movements in range; ignores sale returns, adjustments, loose units | JSON |
| Expiry | `ExpiryReportView.get` :849 | Batch | active batches, qty_strips>0, `expiry_date <= today+days` (includes already expired); value at risk = strips x purchase_rate | JSON, cache 10 min |
| Staff performance | `StaffPerformanceReportView.get` :925 | Staff, SaleInvoice | per staff counts/sales/discount avg/day series | JSON, cache 2 min |
| Balance sheet | `BalanceSheetView.get` :1008 | Batch, Ledger/LedgerGroup | assets = stock (purchase value) + receivables + cash/bank + other; liabilities = payables + other; negative-balance reclassification | JSON |
| Schedule drugs (H/H1/X/G/...) | `ScheduleReportView.get` :1227 | SaleItem, ScheduleHRegister, PurchaseItem, Doctor | line-item sales + purchases per schedule, doctor/patient/Rx details from register, smart doctor lookup by name (`iexact`) | JSON, CSV |
| Batch-wise | `BatchWiseReportService.get_batch_wise_report` R/services/batch_wise_report_service.py:23 | Batch, StockLedger (txn types PURCHASE_IN, SALE_OUT, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT_IN/OUT), PurchaseItem | fractional qty annotate, first-supplier subquery, last-sale subquery, opening = ledger sum before `date_from` (falls back to Batch.opening_qty), closing = opening + in - out; exports `export_csv`:319, `export_xlsx`:361, `export_pdf`:487 (WeasyPrint) | JSON, CSV, XLSX, PDF |
| GSTR-2A recon | `GSTR2AReconciliationView.post` :1102 | PurchaseInvoice | compares to 2 hard-coded mock rows | JSON |

Frontend report pages (e.g. `sales-book`, `sales-summary`, `expiry-report`, `schedule-drugs`, `stock-valuation`, `erp-*`) consume the endpoints above (other agent maps them).

#### C.5 Cache usage
`make_cache_key` (R/views.py:22) produces `mf:...` keys (md5 if >200 chars); Django `KEY_PREFIX='mediflow'` adds a second prefix. TTLs: valuation 600, expiry 600, batch-wise 300, staff perf 120. No explicit invalidation on sales/stock changes, so valuation/expiry can be up to 10 min stale.

#### C.6 Management commands (reports)
- `python manage.py sync_missing_snapshots` (`R/management/commands/sync_missing_snapshots.py`): creates missing sale snapshots for ALL non-return SaleInvoices across all outlets (despite comment about "today only").
- `python manage.py seed_gst_dashboard` (`R/management/commands/seed_gst_dashboard.py`): deletes and reseeds GST snapshots/recon data for the first "SEED-" outlet (or first outlet). Destructive on that outlet's GST data.

---

## 10. Conventions and how to add things

### 10.1 Observed conventions

- **API:** prefix `/api/v1/`; JSON **camelCase** both directions (hand-serialized dicts or `camel_case_helper.py`), except frontend draft autosave (`snake_case`) and a few `outlet_id` query params. Response envelope is *not* uniform: bare objects/arrays, `{data, meta}`, `{success, data}`, `{detail}`, `{error:{code,message}}` all occur. Mostly `APIView` classes (not ViewSets), one URL file per app, mounted in `mediflow/urls.py`.
- **Auth:** phone + password → JWT (access 8h / refresh 7d, rotate + blacklist); staff PIN for POS actions. Frontend keeps token in `access_token` cookie (not HttpOnly) and Authorization Bearer.
- **Scoping:** every outlet-scoped view should resolve `outletId` (query/body/header `OutletId`) and call `check_outlet_access` — enforcement is inconsistent (see risks), so **always verify scoping in new views**.
- **Permissions:** role classes in `core/permissions.py` (`IsAdminStaff`, `IsManagerOrAbove`, `IsBillingStaffOrAbove`) and flag classes (`CanEditVouchers`, …) that bypass for admin/super_admin.
- **Layering:** thin-ish views + `services.py` / `*_service.py` for business logic; `@transaction.atomic` on money/stock mutations; ledger entries append-only by convention (not enforced at queryset level).
- **Naming:** Python snake_case models (singular PascalCase), UUID PKs on most business entities (inferred from `uuid:` URL converters); frontend files: `PascalCase.tsx` components, `useThing.ts` hooks, `thingStore.ts`, route folders kebab-case; `*Api` groups in `lib/apiClient.ts`.
- **Tests:** backend `test_*.py` under each app's `tests/` (pytest + Django runner with `@tag("smoke"|"regression")`); note files named `tests_*.py` aren't collected by pytest. Frontend Jest under `__tests__`/co-located `*.test.ts`; Playwright specs in `tests/e2e`.
- **Management commands** live in `<app>/management/commands/` (seeders, backfills, imports).
- **Docs:** `docs/MODEL_FIELDS.md` and `docs/API_REFERENCE.md` are hand-maintained and may lag; this file should be updated alongside code changes.

### 10.2 How to add things (follow the existing pattern)

**New endpoint (backend)**
1. Put logic in `<app>/services.py` (or an existing `*_service.py`); keep `@transaction.atomic` for writes.
2. Add an `APIView` in `<app>/views.py` with explicit `permission_classes` (pick from `core/permissions.py`; do **not** inherit from a list view that sets a weaker class — MRO shadowing has bitten `SalesView`/`PurchasesView`). Resolve `outletId` and call `check_outlet_access`/filter by `request.user.outlet_id`.
3. Register the route in `<app>/urls.py`; confirm the app's urls file is included in `mediflow/urls.py` (note `accounts/urls.py` is *not* included — its routes are dead).
4. Return camelCase JSON; add a serializer or hand-built dict consistent with neighbours.
5. Add a test in `<app>/tests/test_*.py` (tag `smoke`/`regression`), a hook/`*Api` method on the frontend, and update section 4 of this file + `docs/API_REFERENCE.md`.

**New model**
1. Add to `<app>/models.py` with `outlet` FK (tenant scoping), UUID pk if the app uses UUIDs, `created_at/updated_at` as neighbours do.
2. `python manage.py makemigrations <app>` → review → commit migration (`apps/backend/apps/<app>/migrations/`).
3. Register in `admin.py` if neighbours do; add serializer; update section 5 and `docs/MODEL_FIELDS.md`.
4. If it feeds GST/reports, update snapshot services/builders.

**New frontend page**
1. Create `apps/frontend/app/dashboard/<area>/<name>/page.tsx` (client component with `"use client"` as neighbours); wrap with `ReportPageLayout` for reports.
2. Fetch via a hook in `hooks/` (TanStack Query) calling a `*Api` method in `lib/apiClient.ts`; use `useOutletId()` for outlet param; gate with `PermissionGate` where role-sensitive.
3. Add nav link (dashboard layout/sidebar component) and types in `types/`.
4. Add Jest/Playwright coverage and update section 6.



---

## 11. Risks and gaps (reported only — nothing was fixed)

### 11.1 Highest-priority items (cross-cutting summary)

Reported by the research pass; **none were fixed**. "(inferred)" = reasoned from code, not executed.

**Security / access control**
1. `LoginView` accepts the literal password `'password'`, the staff's own phone, or the PIN as a valid password (`accounts/views.py:110-116`).
2. Outlet isolation is inconsistent: many by-id views skip `check_outlet_access`; `OutletId` header and `outlet_id` params are never validated; daily-snapshot endpoints expose other outlets' data (ERP report `outlet_id` bypass FIXED in `BaseErpReportView`); super_admin chain endpoints check role only, not organization.
3. Permission shadowing via MRO: `SalesView` (`POST /sales/`) → plain `IsAuthenticated`; `PurchasesView`/`PaymentListCreateView` inherit list permission (inferred). `PatchEwbView` has `permission_classes=[]`.
4. `staffPin` hashes are returned by staff list/lookup/verify endpoints; `admin` can create/promote `super_admin`.
5. GST JSON/CSV exports skip `can_export_gst`; `/reports/gstr2a/` returns hard-coded mock data as real.
6. Frontend: JWT in non-HttpOnly cookie; middleware only checks cookie presence; leftover `mediflow_mock_auth` cookie honoured; no working refresh flow.
7. `prod.py` is unused; all entrypoints default to `dev` settings; no HTTPS hardening settings anywhere; OpenAPI schema public (inferred).

**Correctness / data integrity**
8. Dormant business rules: `atomic_sale_save`, `credit_controls`, `pricing_engine` are called only by tests, so the live sale create path does **no** credit-limit/aging/licence checks, no free-qty deduction, no GST snapshots; explicit-`batchId` stock deduction has no row lock (oversell risk); FEFO-split items may double GST (inferred).
9. Broken endpoints that will 500: `LowStockAlertView` (NameError), `SendReminderView` (kwarg mismatch), `create_sales_return` (missing imports), `GSTR1ValidationView` (imports nonexistent module), GSTR-1 Excel error paths (missing imports), inventory Excel export (`min_qty`) (inferred).
10. Accounting gaps: payments path writes no journal; receipts/expenses don't post to GL; `cancel_invoice` doesn't reverse `LedgerEntry`; partial sales return reverses the entire journal; credit-note amounts differ create vs update; `LedgerEntry` append-only bypassable via queryset `.update()`.
11. Stock: strips vs loose-unit mismatch in stock-ledger adjustment/reconcile; purchase edit relies on `rebuild_stock_ledger`; landing cost computed three different ways; PO status never advances.
12. Only `create_sale_snapshots` runs in production code; purchase/return GST snapshots depend on seeds → GSTR-3B ITC/2B recon unreliable (inferred). Three divergent GST computations across reports.

**Repo hygiene / ops**
13. **Tracked in git:** `apps/backend/venv/` (~9,500 files), root `venv/` (~9,383 files), `apps/backend/prod_dump.json` (~36 MB), `live_data.json`, `partial_dump.json`, and Playwright `.auth/*.json` session files (JWT cookies). Production-data dumps in history should be treated as sensitive.
14. CI cannot pass as written (bad lockfile path, no `SECRET_KEY`/`DATABASE_URL`/DB service, deprecated actions); no `turbo.json`; Celery worker lacks `-Q audit` so audit tasks may never run (inferred); no beat schedule; Dockerfile lacks WeasyPrint system libs (inferred).
15. Frontend: `ignoreBuildErrors` + `ignoreDuringBuilds` on; ~747 `any`; duplicated billing math (4 copies) and duplicated pages (`sales-book` vs `erp-sales-book`); dead PWA/offline layer (Serwist off, Dexie unused); ~25 unused components, 4 stub pages; stray debug files with hard-coded dev credentials (`apps/frontend/test-revise.js`, etc.); `GlobalModalManager` likely broken.
16. Dead/unrouted code: `accounts/urls.py` (10 dashboard routes never included), `core/signals.py` never imported, `Rule37TrackerService` no caller, `BillRevision` model never written, `DebitNoteRevisionDetailView`, `CustomerLedgerView`, `SaleRevisionDetailView` unrouted; ~dozens of root-level one-off scripts in `apps/backend/` and repo root.



### 11.2 accounts / attendance / audit / core / gst — detail

#### Business rules enforced in code
1. Auth: phone + password login against Staff (`LoginView`). The billing-counter PIN (`staff_pin`, hashed) is a separate secret used for kiosk/bill verification (`verify-pin`, `lookup-by-pin`) and as an extra accepted login password. PIN rules: 4-6 digits on change; unique per outlet among active staff (enforced by looping `check_password` over staff, O(n) hashing).
2. Outlet isolation: only via `core.permissions.check_outlet_access` (camelCase `outletId` param only) on core permission classes; super_admin bypass. Several views do ad-hoc `request.user.outlet_id` checks instead.
3. Staff CRUD: only admin/super_admin; super_admin may act across outlets of the same organization; deletion is soft. Staff.phone is globally unique.
4. Audit: `log_activity` -> Celery `create_audit_log_async` (never raises into business flow; falls back to `/app/logs` file logger). V1 `ActivityLog` is written for LOGIN/LOGIN_FAILED/LOGOUT/PIN change. V2 (`ActivityEvent`, `DocumentRevisionV2`) is written only through the orchestrator helpers. Reading logs = super_admin only; revisions = `can_view_audit_history`.
5. Vouchers: Dr must equal Cr, non-zero; directional guards for receipt/payment; contra = cash/bank only; editing a `posted` voucher needs reason code + >=10-char reason; editing a voucher that has bill adjustments needs admin or `can_modify_settled_vouchers`; creation is atomic and rolls back if the journal posting fails. Debit-note edit uses optimistic concurrency (`stale_edit_conflict` -> 409).
6. Journals: `JournalEntry` unique per (outlet, source_type, source_id) + `_guard_double_posting`; statements merge VoucherLine and JournalLine but exclude JournalEntry(source VOUCHER) to avoid double counting.
7. Attendance: staff can mark only their own check-in (id from JWT); security gate = allowed public IP OR GPS radius, default-allow if nothing configured; non-admins see only their own attendance rows; manual marking admin-only.
8. GST: sandbox endpoints gated by `is_sandbox_allowed` (dev env or explicit LIVE mode flag, outlet name must not start with "test", optional `SANDBOX_GSTIN` match, active SandboxConfiguration); OTP cooldown 60s; session validity 6h (mock); GSTR-2B sync one in-progress job per (outlet,gstin,period); GST 2.0 slab validation in `TaxSlab.is_rate_active`; B2CL threshold 1,00,000.
9. Tax-rate masks: `mask_gstin`, `mask_username` used in GST status responses.

#### RISKS / GAPS (report only)
Security
- accounts/views.py:110-116 `LoginView` accepts `password == 'password'`, `password == staff.phone`, or the PIN as a valid password for ANY staff (in addition to the real password). Effectively anyone who knows a staff phone number can log in. Also accounts/views.py:93-95 hard-coded phone typo fallback (`8999205205` -> `8999205207`). No throttling/lockout on login or on PIN endpoints (only DRF default).
- accounts/views.py:2058 `ChangePinView`: `staff.set_password(make_password(new_pin))` double-hashes the app password (hash-of-hash), so after a PIN change the staff cannot log in with the "password" they know except through the PIN-as-password branch above; also silently overwrites the login password with the PIN.
- accounts/views.py:951-956,1138-1143 PIN check results are cached in Django cache for 7 days under key `pin_check:{staff_pin_hash}:{pin}` (stores the stored hash and guessed PIN in the cache key; stale after PIN change is avoided only because the hash changes). 4-digit PIN space + 7-day cache + no rate limit = brute-forceable via `lookup-by-pin`.
- `staffPin` (password hash) is returned to clients by `StaffListView` (:1031), `lookup-by-pin` (:987), `verify-pin` (:1168). Hashes should not leave the server.
- accounts/views.py:1401 stray `print("DEBUG PATCH PAYLOAD:", request.data)` in `StaffDetailView.patch` prints request body (may include `password`/`pin`) to stdout.
- accounts/views.py:2110 `LogoutView` subclasses `TokenBlacklistView`, which is unauthenticated, so `user` in the LOGOUT audit log is usually None.
- Cross-tenant (IDOR) gaps: `GSTSummaryView` (voucher_views.py:896) has no outlet ownership check; `LedgerStatementView`/`LedgerOutstandingView` (:256,:715) fetch ledger by id with no outlet filter; `DebitNoteDetailView.get` (:1812) fetches by id only; all `outlet_id` (snake_case) report params bypass `check_outlet_access`; `UnifiedRevisionDetailView` accepts `HTTP_OUTLETID` header (audit/views.py:163) which `check_outlet_access` never inspects.
- core/chain_views.py:65-160,202: super_admin endpoints authorise only by role, not by organization: `OrganizationListView` lists ALL organizations, and `OrganizationDetailView`, `OrganizationOutletListView` (GET/POST), `ChainDashboardView?orgId=` accept any org id, so a super_admin of org A can read/create in org B. Uses DRF `IsAuthenticated` (no outlet isolation).
- accounts/views.py:~1309/1322 `StaffCreateView` can create a `super_admin` (valid_roles includes it) when caller is admin (only `super_admin` callers should); `role` field on PATCH (:1500) is also unvalidated -> an admin can promote any staff in own outlet to `super_admin` (privilege escalation).
- Dashboard views (accounts/views.py:2133-2155) use DRF IsAuthenticated and unchecked `outletId` (currently unreachable, see below).
- gst/views.py: every GST sandbox/GSTR endpoint is any-authenticated-role (even `view_only`), including request-OTP, verify-OTP and GSTR-2B sync; `GSTExportAuditView` (:29-35) computes a `reports.export_gst` check then discards it (`pass`); `Staff.can_export_gst` flag exists but is never consulted here.
- gst/views.py:~205-221 (request-otp mock) and :235-262 (verify-otp): `MOCK_SANDBOX_DATA=true` env makes OTP verify accept any code and write a fake session token; must never be set in production.
- core/models.py (`_get_fernet`): encryption key derived from `SECRET_KEY[:32]` zero-padded; rotating SECRET_KEY silently makes all stored sandbox credentials/session tokens decrypt to '' (swallowed exception). `whatsapp_api_key` stored and returned in plaintext (core/views.py `_serialize`).
- integrations/sandbox/client.py:~21-24,~80-86 logs (warning level) whether API key/secret loaded and masked key/secret/username prefixes on every auth attempt.
- audit/middleware.py + audit/core/middleware.py: `get_client_ip`/`X-Forwarded-For` trusted for IP in audit (spoofable), whereas attendance deliberately uses REMOTE_ADDR only; behind nginx/Docker REMOTE_ADDR may be the proxy IP, which would break the IP-allowlist attendance check (inferred).

Dead / broken code
- `accounts/urls.py` is not included by `mediflow/urls.py`: duplicate login/switch-outlet/customer routes and the four `dashboard/*` routes are dead; the dashboard KPIs are therefore not served at all (frontend may 404; inferred).
- `core/signals.py` `on_outlet_created` (auto-seed ledgers for new outlets) is never imported (`core/apps.py:ready` only re-imports models twice); new outlets via `/organizations/{id}/outlets/` get no LedgerGroups/Ledgers/OutletSettings until seeded manually (inferred from absence of any import).
- gst/views.py `GSTR1ValidationView`: `from apps.core.utils import get_user_outlet` but `apps/core/utils.py` does not exist -> ImportError => HTTP 500 on `/gst/validate/{mmyyyy}/gstr1/`; and it reads `snap.transaction_number`, a field that does not exist on `GSTTransactionSnapshot` (model has `document_number`).
- accounts/audit_service.py `AuditService`: filters `DocumentRevision` on `timestamp`, `document_type`, `previous_state`, `new_state` -- none exist on the model (fields are `modified_at/created_at`, `content_type`, `old_snapshot_json`, `new_snapshot_json`); also `SaleReturn`/`PurchaseReturn` names/`refund_status` unverified. Placeholders (`'unbalancedJournals': 0`, "dummy"). Only caller is the dead dashboard path.
- `voucher_views.py:1773 DebitNoteRevisionDetailView` unrouted; `VoucherRevisionDetailView` (:1745-1760) repeats the `flags.is_v2_read_enabled()` branch inside its own else branch (unreachable duplicate code).
- `VoucherDetailView.get` handles non-UUID voucher_no, but the route is `<uuid:voucher_id>` so that branch is unreachable.
- `compliance/` and `integrations/` and `apps/apps/gst/` are not Django apps (not installed, no `__init__.py` at root for the first two; the third is an empty stray directory).
- `audit/drf_permissions.AuditContextPermission` and `audit/core` `reset_audit_context` not wired by default; two `AuditContextMiddleware` classes are both active (duplicate context setup; `audit/core/middleware.py` never resets context after the request, risk of context leakage across requests in threaded servers, inferred).
- `Customer.credit_days`, `is_credit_blocked`, `Ledger.freeze_upto`, `Attendance.early_leave_minutes`, `AttendanceRecord.marked_by`, `Staff.shift_start_time/shift_end_time/weekly_off_day`, `OutletSettings.opening_time/closing_time/grace_period_minutes` are stored/edited but never enforced: check-in lateness uses hard-coded 09:00 + 10 min (`attendance/views.py:82-84,186-191`), ignoring Staff shift and Outlet hours; no credit block or ledger freeze checks found.
- `PostDatedCheque` + `pdc_services.py`: no API/view/caller (admin only).
- `RegularMedicine`: read-only via API (no create/update endpoint found in this scope).
- `core/fields.py`, `core/services.py`, `core/urls.py`, `core/serializers.py`, `core/admin.py`, `attendance/{services,serializers,admin,apps}.py` are empty files.

Inconsistencies / validation gaps
- Query-param naming: `outletId` (most) vs `outlet_id` (trial-balance, gst-summary, balance-sheet, profit-loss); body keys mix camelCase (customers/staff/doctors) and snake_case (vouchers `voucher_type`, notes `distributor_id`, partners `profit_percentage`, org outlets `drug_license_no`); GST endpoints return snake_case JSON while the rest is camelCase.
- Response envelopes vary (see top). Doctors return duplicate alias keys (`registrationNo`/`regNo`, `specialty`/`specialization`).
- Wrong docstring paths: voucher_views reports claim `/api/v1/accounts/...`; actual mount is `/api/v1/` (no `accounts/`).
- Unvalidated input: `LedgerGroup`/`Ledger` create wrap everything in `except Exception -> 400 str(e)` (leaks internals); `DoctorListCreateView.post` no name validation; `OutletSettingsView.patch` setattr without type/range validation (e.g. lat/long, radius, ips) and without logging an audit entry; `AttendanceManualView` does not validate `status` against choices and `strptime` errors on bad time strings raise 500; `AttendanceCheckOutView` swallows all exceptions to a bare 500 and trusts `staffId` from the body (any authenticated user can check out any staff; contradicts the "own attendance only" rule used in check-in).
- `CustomerDetailView.put` computes an old/new `changes` diff then `pass` -- the audit log call was removed (also `pass` placeholders in `CustomerListView.post` :883, `StaffCreateView` :1391, `StaffDetailView` :1560, :1580). Customer/staff create/update/delete are therefore NOT audit-logged although `log_activity` exists.
- `VoucherListView` requires `CanEditVouchers` even for GET while `VoucherDetailView.get` only needs `IsManagerOrAbove` -- a manager without `can_edit_vouchers` cannot list but can read single vouchers.
- `Customer.phone` is not unique (only a soft duplicate check on name+phone on create); `LedgerListView.post` auto-creates Customers with fake phone `TMP-xxxxxxxx` which then fail the 10-digit rule in `CustomerDetailView.put`.
- `Customer.outstanding` (stored) and the Sundry Debtors Ledger `current_balance` are two sources of truth; `CreditNoteService` mutates `Customer.outstanding` directly (services.py ~:700) while ledgers are updated via journals.
- `Customer.save()` runs `clean()` always, so any `save()` on a WHOLESALE customer without DL numbers raises ValidationError (e.g. admin edits, background updates).
- `OutletFilteredManager` is defined in two places (`accounts/models.py:9` and `core/models.py:60`).
- N+1 patterns: `StaffLeaderboardView` (query per staff), `CustomerPurchaseHistoryView` (count per invoice), `RefillAlertsView` (query per customer x medicine), `ChronicMedicinesView.last_refill_date` use; `LedgerStatementView` loads all lines in memory and sorts in Python, walking rows again to compute running balance per page.
- Time handling: project runs `USE_TZ=False`, `TIME_ZONE='Asia/Kolkata'` (per `core/fields.py` docstring); attendance uses naive `datetime.now()`; `outstanding` etc. mix `date.today()` and `timezone.now()` (inferred from usage).
- `audit` V2 read mode (`AUDIT_V2_READ_ENABLED=True`, base.py:218): `/audit/logs/` reads `ActivityEvent`, but login/logout/PIN-change events are written to `ActivityLog` via `log_activity` (V1 only) so they will not appear in the UI unless dual-written (inferred). `ActivityEventLegacyAdapterSerializer` maps `changes_json` from `payload_json`, a field that exists on `SystemEvent`, not `ActivityEvent` (falls back to default {}, inferred). `ordering_fields=['timestamp','occurred_at']` but ActivityEvent has no `timestamp`.
- `cleanup_audit_logs` only prunes `ActivityLog` (not V2 tables).
- `AttendanceRecord` stores base64 selfies in `Text` columns (and returns them in every list response: `checkInPhoto`/`checkOutPhoto`), which will bloat `/attendance/` month listings.
- `accounts/admin.py` Customer fieldset lists `email`, which is not a field on `Customer` (admin page would error; inferred, not executed).
- TODO/FIXME markers: none found via grep in accounts/core/gst/attendance; however comments such as "dummy", "Placeholder", "For this MVP" appear in `accounts/audit_service.py` and `gst/views.py:~40-44`.

### 11.3 billing — detail

Severity tags: [H] likely production bug or integrity/security risk, [M] inconsistency, [L] hygiene.

#### Security / access control
- [H] `PatchEwbView` (views.py:94-111): `permission_classes = []`, no outlet scoping. With an empty permission list, DRF enforces no authentication at all, so an unauthenticated caller can set `eway_bill_no` and force `irn_status='GENERATED'` on any invoice by UUID. Docstring says "Dev/test endpoint" but it is routed in production (urls.py).
- [H] `SalesView(SaleListView, SaleCreateView)` (urls.py:32): MRO picks `SaleListView.permission_classes=[IsAuthenticated]`, so `POST /sales/` runs with `IsAuthenticated`, not `IsBillingStaffOrAbove`. A `view_only` user can create bills. `SaleCreateView`'s own permission is only used when it is instantiated directly (quotation convert / cancel_and_reissue, which bypass permissions entirely).
- [H] `SaleReviseView` accepts `revisionAction='standard_correction'` with no `has_bill_revision_permission` check (views.py:3320-3322, "added for test coverage"). Any authenticated user can revise any unpaid/unreturned bill. The cancelled/returns/later-payment guards still apply.
- [H] Cross-tenant reads/writes where outlet is not enforced:
  - `check_outlet_access` only inspects `outletId` in query or body. Views that look up by URL id only: `SaleItemsView` (:2054), `CreditAccountDetailView` (:2820), `RetryEinvoiceView` (:114), `PatchEwbView`, `QuotationDetailView`/`QuotationConvertView` (`Quotation.objects.get(pk)`), `DraftInvoiceDetailView.get_queryset` (no `outletId` returns all outlets' drafts, :4660), `QuotationListCreateView` (no `outletId` returns all outlets).
  - `SaleDetailView.get` without `outletId` fetches by id only (:2977-2985).
  - `SaleReviseView`/`SaleModificationOptionsView`/revision views take outlet from the `OutletId` **header**, which `check_outlet_access` never validates. A user can supply another outlet's id there.
- [M] Several mutating endpoints accept any role incl. `view_only`: receipts, expenses, credit payment, credit-limit PATCH, reminders, Marg import, draft/quotation (quotations are billing-staff+).
- [M] Cost data exposed to all roles: `SaleDetailView` returns `purchaseRate/landingRate/ptr/pts` (views.py:3044-3047); `SaleListView` returns `invoiceCost/invoiceProfit`. `CanViewPurchaseRates` exists in core but is not used here.
- [L] `SaleReviseView.post` and `SaleDetailView.put` return `str(e)` of arbitrary exceptions with 500 (information leak).

#### Correctness bugs (verified by reading)
- [H] `LowStockAlertView` (views.py:4102) uses `models.F(...)` but `models` is never imported in views.py (only `from django.db.models import Sum, Count, Q, F`). Endpoint raises `NameError` -> 500. Also a POST for a pure read, and it compares `qty_strips <= product__min_qty` per batch, not per product.
- [H] `SendReminderView` (views.py:4038): the URL kwarg is `id` (`credit/<uuid:id>/reminder/`) but the handler signature is `post(self, request, pk, ...)` -> `TypeError` on every call (endpoint is unusable as routed). Behind that, views.py:4059 uses `credit_account.outstanding`, but `CreditAccount` only has `total_outstanding` (`AttributeError` whenever no `message` is posted). Reminder is never sent (`.delay` commented out); status stays 'pending'.
- [H] `create_sales_return` (payment_services.py:318,321): `timezone` and `date` are not imported (only `from datetime import datetime`). A request without `returnDate`/`return_date` raises `NameError`.
- [H] `create_sales_return` fallback (:377): `from apps.inventory.models import Product`, but only `MasterProduct` exists, so `ImportError` on the "batch missing" fallback branch. Also `expiry_date.replace(year+2)` raises on 29 Feb.
- [H] Partial returns reverse the whole sale journal: `reverse_journal('SALE', original_sale.id)` (payment_services.py:566) contra-posts the entire original sale regardless of the returned amount or deduction. Combined with the "one return per invoice" rule, the GL is wrong after any partial return. The "C8: multiple return transactions" guard in code is unreachable for the same invoice.
- [H] Credit-note amount mismatch: `SalesReturn.total_amount` is net of deduction, but the credit-note `LedgerEntry`/`Customer.outstanding` use the **gross** `total_amount` (payment_services.py:544-558) on create, while the update service uses `net_refund_amount` (sale_return_update_service.py:171-186). Reversal in update uses `sales_return.total_amount` (net). Behaviour differs between create and update.
- [H] `sale_return_update_service._last_ledger_balance` orders by `-id` (UUID, random) (l.15), so the "previous balance" is arbitrary. The other helpers use `(-date,-created_at)`.
- [H] Free quantity not deducted in the live create path: `SaleItem.free_qty_strips` is stored but only `qtyStrips/qtyLoose` are deducted from the batch (views.py:1085-1131). Only dormant `atomic_sale_save` includes free qty in the deduction (sale_services.py:298). Also `free_qty_loose`, `hsn_code`, `trade_discount_*`, `applied_ptr/pts`, `unit_rate`, `cgst_rate/sgst_rate/igst_rate` are never populated by live create, so GST/e-invoice/HSN reports depending on them are empty (inferred).
- [H] FEFO split rows duplicate totals (inferred): when `fefo_batch_select` splits one cart line across several batches, every resulting `SaleItem` receives the full client `qty_loose`, `freeQtyStrips`, `taxableAmount`, `gstAmount`, `totalAmount` (views.py:1085-1107), and the GST re-derivation sums `si.total_amount` per row -> doubled taxable/GST and a large `round_off` (only warned at >1.00). Also the FEFO path only deducts strips (loose ignored: `loose_to_deduct` absent).
- [H] No credit-limit, credit-block, aging, or wholesale drug-licence enforcement in the live route. `credit_controls.validate_credit_exposure/validate_invoice_aging/validate_statutory_compliance` are called only by dormant `atomic_sale_save`. `UpdateCreditLimitView` sets `Customer.credit_limit`, which nothing in live create reads. (Also `credit_controls` reads `customer.outstanding_balance`, a different source than the `Customer.outstanding` field.)
- [H] Dormant duplicate: `atomic_sale_save` (sale_services.py:145-607, ~460 lines) diverges from the live view (GST snapshots via `create_sale_snapshots`, credit controls, free qty, trade discount, `pricing_engine`). Tests exercise this function rather than the route, so they do not test the production behaviour. In production, GST snapshots are created lazily by reports (`reports/dashboard_views.py:58`, `reports/exports/gstr1_excel.py:76`, `sync_missing_snapshots`) (inferred).
- [H] Un-locked stock deduction on the common path: with a `batchId` supplied (the normal UI path), `Batch.objects.get(...)` (views.py:943) has no `select_for_update`, then `batch.save()` writes full-row back. Two concurrent bills on one batch can both pass the stock check and oversell, or overwrite each other (the `.save()` is not an `F()` update). Similarly `create_sales_return` does not lock Batch/SaleItem (over-return race), and `create_receipt_payment` does not lock invoices (over-allocation race). `test_billing_concurrency.py` exists but I did not verify what it covers.
- [H] `cancel_invoice` incomplete (sale_update_service.py:79-154):
  - Does not reverse the billing `LedgerEntry` rows (sale/receipt) or `Customer.outstanding`.
  - Deletes `StockLedger` SALE_OUT rows without `rebuild_stock_ledger` (running_qty of later rows stale) while directly adjusting `Batch` qty.
  - Ignores already-returned quantities (would double-restore if it were ever allowed with returns).
  - Does not cancel an issued e-way bill.
  - `is_cancelled=True` invoices are still counted by `SaleListView` list and analytics, `DashboardDailyView`, `SaleInvoiceSearchView`, `CustomerOutstandingSummaryView` (no `is_cancelled=False` filter in views.py). The reports app does filter in some places (`daily_snapshot_views`, `erp_report_service`), so numbers can disagree.
- [M] `PUT /sales/<id>/` and `atomic_sale_update` do not check `is_cancelled` (only `SaleReviseView` does).
- [M] `atomic_sale_update` mismatches vs create:
  - Matches old rows to new lines by `batch_id` (`existing_items_by_batch` dict, sale_update_service.py:~392). Two lines for the same batch collapse onto one existing row (the later overwrites) and the extra line is dropped.
  - `resolved_payment_mode` computed but `sale_invoice.payment_mode = payload.get('paymentMode','cash')` is used (:575) -> split/credit mode can be mislabelled.
  - Overpayment silently reduces `credit_given` (can go negative).
  - Never re-evaluates loss-sale prevention or TaxSlab (only MRP ceiling).
  - E-invoice/E-way data are not refreshed or invalidated after financial edits (inferred).
  - Moves customer ledger dates to today (not the invoice date).
- [M] `LedgerEntry` "append-only" is not actually enforced: `.update()` / queryset `.delete()` are used in `sale_update_service.py` (l.36, 680, 700, 712), `sale_return_update_service.py` (credit-note `.delete()`), bypassing `save()`/`delete()` guards. The Meta `permissions` are labels only.
- [M] `IRN_STATUS_CHOICES` has `NOT_REQUIRED` but code writes `'NOT_APPLICABLE'` to `irn_status` (sale_services.py:57,67) and to `eway_bill_status` (:112; choices PENDING/GENERATED/FAILED/CANCELLED). No DB constraint, but admin/serializer validation and filters will not recognise them.
- [M] Interstate determination is inconsistent: `SaleInvoice.clean()` uses `state_code` (also run on every `save()`), while `SaleCreateView` computes IGST from the `state` **name** comparison and never sets `invoice.is_interstate` itself; `igst` rate is always 0 on the header; update path never produces IGST. The `# TODO: use outlet state vs customer state to determine IGST (C9)` comment (views.py:1189) is stale.
- [M] Quotation convert drops commercial context: payload (quotation_views.py:326-361) has no `saleType`, `billingBasis`, `freeQtyStrips`, `billedBy`, `placeOfSupply`, `transporterId`, `vehicleNo`; a WHOLESALE quotation becomes a RETAIL/MRP invoice. `cashPaid` defaults to grand_total even if `paymentMode='credit'`. Converting does not check `status in (expired, cancelled)` or `valid_until`. Also `SaleCreateView` itself marks the quotation converted if `quotationId` is posted (never sent by convert), so the two code paths overlap.
- [M] Draft/Quotation serializers: `DraftInvoiceSerializer.customer` queryset is `Customer.objects.all()` (cross-outlet FKs accepted); client supplies `outlet`. `Quotation.quotation_no` has no unique constraint and the generator locks only the latest row (concurrent first-of-year creates can collide).
- [M] `SaleListView`:
  - `analytics` is described as "for the filtered set" but aggregates only `outlet`, `startDate/endDate`, `saleType` (ignores `customerId`, `search`, `paymentMode`, `isModified`, `doctorId`).
  - Docstring says `pageSize` max 100, code caps at 200.
  - `pageSize`/`page` parse errors (`int()`) -> 500.
  - `CreditAccountListView` pageSize is not capped.
  - Hard-coded `invoiceDate: '2026-04-01T00:00:00'` for synthetic opening-balance rows (views.py:~1858).
- [M] `DashboardDailyView`: `cashCollected` = sum of **debits to every ledger in group 'Cash in Hand'** in the date range (includes receipts, non-sale cash movements), `creditGiven` = **total** current balance of all Sundry Debtors (not the period's credit), UPI/Card split is a pro-rata of bank debits by invoice ratio (views.py:2475-2520). Values are labelled like the invoice-level fields but are not.
- [M] `CustomerOutstandingSummaryView` uses `Customer.outstanding` field and `overdueAmount = amount_due of the oldest unpaid invoice` (not the overdue sum). `DistributorOutstandingSummaryView` is an N+1 loop.
- [M] Receipts and expenses do not post to the GL; `ExpenseEntry` has no ledger/journal at all, so `DashboardDailyView` cash/bank totals (derived from `JournalLine`) never see them.
- [M] `CreditAccountListView.get` has a heavy write side-effect: if the outlet has no `CreditAccount` it runs `sync_all_credit_accounts()` over **all customers of all outlets**.
- [M] `CreditAccount` lacks `unique(outlet, customer)`; both create and update use `get_or_create`.
- [M] Naive datetimes: `datetime.now()` is stored into `DateTimeField` (`credit_account.last_transaction_date`, views.py:1255; update at sale_update_service.py:657). `datetime.now().year` is used for numbering (server-local year).
- [M] `generate_invoice_number` picks `order_by('-invoice_no').first()` (string order) and filters on `INV-<year>-`; once a sequence exceeds 6 digits the lexicographic order breaks. Preview (`NextInvoiceNumberView`) takes the same lock but is only a preview.
- [M] `MargMigrationView`: `MasterProduct.get_or_create(hsn_code=...)` merges unrelated products sharing an HSN into one master product (and fabricates `MARG-<row>` HSN when blank); uses `float()` for money; does not post opening stock ledger or journal; any role can run it; aborts via bare `Exception` -> 500.
- [L] `SaleDetailView.get` uses a hard-coded Redis URL fallback (`REDIS_URL` default `redis://redis:6379/0`) inline in the view and swallows all exceptions.
- [L] `SalesReturnItem.Meta.ordering = ['-id']` (random UUID order); `SalesReturnItem.qty_returned_strips/loose` and `SaleItem.qty_returned_strips/loose` are not populated by `create_sales_return` (only by the update service for items).
- [L] `BillRevision` model/table is effectively dead (read-only references in `isModified` checks and list filters). Fields `linked_credit_note_id/linked_debit_note_id/resulting_invoice_id` unused.
- [L] `CustomerLedgerView` (views.py:3722) and `SaleRevisionDetailView` (views.py:4528) are unrouted. `CustomerLedgerView` is imported in `urls.py` but has no `path()`. `CreditLedgerView` serves almost the same data.
- [L] `SaleRevisionListView` ignores `customerId`/`invoiceNo` filters ("removed in V2"); `SaleRevisionReportView.topModifiers[].name` is hard-coded `'User'`.
- [L] Debug leftovers: `print(...)` at views.py:387, 488, 3451 and quotation_views.py:178 ("Quotation Error:").
- [L] `apps.py` imports models twice and does nothing in `ready()`; `default_auto_field=BigAutoField` while all models define UUID pks. `sale_services.py` imports `create_sale_snapshots` twice and `transaction, connections` twice; `views.py` uses `models.F` without importing `models`; `views.py` has imports mid-file (l.63-67, 4035, 4125, 4641); `services.py` imports are unused (PaymentEntry, LedgerService, JournalEntry...).
- [L] `build_sale_response_payload` mixes camelCase with `sale_type`/`billing_basis` snake_case keys (views.py:225-226), and `SaleListView` returns `eway_bill_no`, `irn`, `qr_code`, `irn_status` snake_case alongside camelCase.
- [L] Duplicate URL naming/prefix confusion: docstrings advertise `/api/v1/billing/...` (NextInvoiceNumberView, EwayBillPdfDownloadView, SaleModificationOptionsView, SaleRevisionListView, SaleRevisionReportView, SaleReviseView) but the real mount is `/api/v1/` with no `billing/`; `NextInvoiceNumberView` doc also says `next-invoice-number/` while the route is `invoice-number/`; revision report docs say `/revisions/report/`, route is `/sales/revisions/report/`. `CreditLedgerView` docstring says `/credit/{id}/ledger/` where id is a customer id.
- [L] Profit math inconsistency (C5): `SaleListView` profit uses ex-GST `purchase_rate` against GST-inclusive `grand_total`; the loss-sale floor uses `landing_rate`/`ptr` with a GST toggle; `get_landing_cost_for_batch` uses yet another priority. Reports/ERP profit code (`apps/reports/services/erp_report_service.py`, EXTRACTED_PROFIT_MATH.md at repo root) should be checked for a single definition.
- [L] Untested/unverified: concurrency test file `tests/test_billing_concurrency.py`; the live route is exercised by `tests/test_billing_api.py` etc. I did not run any tests.

### 11.4 inventory / purchases — detail

Severity tags: [H]igh, [M]edium, [L]ow.

Auth / access
1. [H] `/purchases/` POST and `/purchases/payments/` POST are guarded by CanAccessPurchases, not CanCreatePurchases / IsManagerOrAbove, because the combined classes in purchases/urls.py:63 and :72 inherit `permission_classes` from the first (list) base in MRO. A user with only `can_view_purchase_rates` can create purchases and record payments (inferred from MRO; verify with a test).
2. [H] `BatchDetailUpdateView.put` (inventory/views.py:53) and `BatchLandingCostView.get` (:26) fetch `Batch.objects.get(id=...)` with no outlet filter; any manager of any outlet can edit/read another outlet's batch (cross-outlet IDOR; `check_outlet_access` has no outletId to compare).
3. [M] Product master edits (`ProductDetailView.put` :310) are global (MasterProduct shared by all outlets) and gated only by IsManagerOrAbove; `cache.clear()` :425 flushes the entire cache (all keys, all users). `ProductListView.post` has no role gate (any authenticated incl. view_only).
4. [M] `PurchaseDetailView` GET and DELETE use `IsAuthenticated` (views.py:1115-1118): view_only users can read purchase rates and delete any SAVED draft. PO endpoints (all `IsAuthenticated`) let any authenticated user create/replace POs.
5. [M] `InventoryAdjustView` accepts the PIN of ANY active staff of the outlet (views.py:1275-1288), not the caller's own PIN; loops bcrypt checks over all staff (slow, timing/DoS) and sets `actor` to the PIN owner. `type` is not validated (any string), and 400 returns inside `transaction.atomic()` (no rollback needed but pattern is fragile). The bare `except Exception` returns 500 with `str(e)` leaking internals.
6. [L] ProductDetailView.get_permissions lists PATCH but no `patch` handler exists (405).

Correctness / data integrity
7. [H] Unit mismatch in stock ledger: ledger qty is in STRIPS (fractional) everywhere (purchase qty+free_qty, sale `deducted_qty`, adjust `ledger_qty`), but `_auto_create_stock_adjustment` (inventory/services.py:84-110) treats `qty_out` as LOOSE units (`qty_out // pack_size`) and compares ledger `running_qty` against `sum(PurchaseItem.actual_qty)` (UNITS = pkg*qty) (:~106-112); `reconcile_inventory.py:22-27` compares ledger totals (strips) to `Batch.total_stock` (units): non-1 pack sizes will always mismatch / FIFO allocation will mis-scale (inferred).
8. [H] Batch stock updates are read-modify-write without row locks: `batch.qty_strips += total_strips; save(update_fields)` in atomic_purchase_save (services.py:236-287) and update path; `Batch.objects.get` is not `select_for_update`. A concurrent sale/purchase on the same batch can lose updates (inferred; tests purchases/tests/test_purchase_create_concurrency.py exist). `post_stock_ledger_entry` locks only the last ledger row.
9. [H] `atomic_purchase_update` comment says old batch quantities are reverted via `F()/Greatest` (services.py:~739-742) but the code never decrements Batch.qty_strips for removed items; correctness depends entirely on `rebuild_stock_ledger` at the end (services.py:1085). `rebuild_stock_ledger` overwrites Batch qty from ledger and, with no prior ledger row, falls back to `opening_qty` (default 0): any batch whose historical movements lack StockLedger rows (legacy batches before ledger introduction, returns/debit-note paths that bypass `post_stock_ledger_entry`, e.g. accounts/debit_note_update_service.py:187 and accounts/services.py:572 create rows directly) can have stock reset on a purchase edit (inferred). `from_date` argument `min(invoice_date.date(), purchase_invoice.invoice_date)` is always equal values (invoice already updated) so a back-dated edit moves the date but rebuilds only from the new date.
10. [H] Payment path creates billing.PaymentEntry/LedgerEntry only, no JournalEntry (services.py:487-668). `DistributorListView.currentBalance` and `DistributorLedgerView` read accounts.Ledger / JournalLine, so payments recorded via `/purchases/payments/` are not reflected there; payments made via accounts vouchers are (dual systems: billing.LedgerEntry vs accounts Journal) (inferred). `rebuild_distributor_ledger` and purchase edit maintain billing.LedgerEntry only.
11. [M] Edit invoice: switching purchase_type cash->credit leaves `amount_paid = old grand_total` so `outstanding = new_total - amount_paid` (services.py:~883-888); lowering `grand_total` below `amount_paid` yields negative outstanding; no uniqueness check on `invoiceNo` during update; billing LedgerEntry lookup by `reference_no == old_invoice_no` has no distributor filter (`.first()` could hit another supplier's entry, services.py:~1100); `created_by` is overwritten by the editor; OCR alias learning is skipped on update; product lookup uses only `masterProductId` (create also accepts `productId`).
12. [M] Create path: `payload['invoiceNo']`, `['invoiceDate']`, `['subtotal']`, `['taxableAmount']`, `['gstAmount']`, `['grandTotal']`, item `['actualQty']`, `['ptr']`, `['pts']` are accessed with `[]` => KeyError wrapped as HTTP 400 "Unexpected error: 'xxx'". No server-side recomputation/verification of totals vs item sums (trusts client; only double-entry balance check in journal). `invoice_no` blank is allowed by model but required by the duplicate guard path only when truthy.
13. [M] Custom products (master_product None): all custom products sharing batch_no+expiry in an outlet merge into one Batch (`Batch.get(... product=None)`); `Batch.objects.get` can raise MultipleObjectsReturned (no DB unique constraint) => surfaced as 400 "Unexpected error". `serialize_batch` (inventory/views.py:187) dereferences `batch.product.id` => 500 for product-less batches (e.g. BatchDetailUpdateView response).
14. [M] Confirm flow is not atomic as a whole: `atomic_purchase_save` commits, then the image move and `draft.delete()` run outside a transaction (views.py:2500-2515); a crash between leaves both POSTED and SAVED invoices. Draft DELETE (`PurchaseDetailView.delete` :1305) does not remove the stored image file.
15. [M] `PurchaseDetailView.get` (:1120-1210) dereferences `invoice.distributor.*` and `invoice.invoice_date.isoformat()` without None guards: a SAVED draft (nullable distributor/invoice_date) returns 500; `PurchaseInvoiceSearchView` (:1423) also calls `inv.distributor.name` and includes SAVED drafts (no status filter) and does N+1 on `item.batch`.
16. [M] `PurchaseItem.batch` is PROTECT and required but `Batch.product` SET_NULL: deleting a MasterProduct orphans batches silently.
17. [M] Landing-cost triple-implementation drift (see C6): `get_landing_cost` ignores trade/cash discounts and cess and uses a different include_gst rule than services.py; `Batch.landing_rate` is never populated by purchases, so reports/billing effectively use `purchase_rate` (which stores `baseLandingRate or purchaseRate` from the client). Inconsistent profit/floor results (matches repo-root EXTRACTED_LANDING_COST_DRIFT.md).
18. [M] StockLedger valuation mixes rates: purchase rows use `purchase_rate` (pre-discount), sale rows use `proposed_rate` (selling price), adjust rows use `batch.purchase_rate`; `running_value` therefore is not a true cost valuation (inferred).
19. [L] `InventoryAdjustView` failure branches `return Response(400)` inside `with transaction.atomic()` after mutating in-memory batch (no save yet, so safe) but ADJUSTMENT_IN/OUT rows are written with `qty<=0` treated as OUT (qty==0 writes a zero OUT row).
20. [L] `GST` not validated on purchase items against TaxSlab (C7); `PurchaseItem.cess` percent vs `cess_amount` separately trusted from client.

Dead / unimplemented functionality
21. [H] Purchase Order lifecycle is unimplemented: nothing sets `status` beyond 'SAVED', `sent_at`, `received_qty`, or `purchase_bill` (grep shows only reads: views.py:1523, 1832); `PurchaseOrderSuggestionsView.on_order` (status SENT/PARTIAL) is therefore always 0 and PO->GRN receiving is not linked. `po_number` uses same-day count + 1 with no uniqueness/lock => duplicates under concurrency or after deletions.
22. [H] `Rule37TrackerService.evaluate_invoices` (services.py:1171) has no caller, scheduler, or management command; `Rule37Adjustment` is only ever written by `seed_gst_dashboard` (reports/management) in this repo. Also crashes on invoices with `distributor` NULL (`inv.distributor.state`) and includes unused first-pass `rev_*` computations overwritten later (:1199-1214).
23. [M] Celery routing: `CELERY_TASK_ROUTES` (settings/base.py:183) only routes the audit task to queue 'audit'; the docker-compose `celery` worker (docker-compose.yml:94-110) has no `-Q`, so it consumes only the default queue (OCR task fine; audit task on 'audit' queue would never be consumed unless another worker runs; out of this scope, flagged).
24. [L] `apps.py` `ready()` in inventory/purchases only duplicates a no-op model import (leftover from removed signals). `MasterProduct.default`-free required fields (`category`, `composition`, `manufacturer`) force placeholders from product create.
25. [L] Unused/odd code: `ProductDetailView.put` sets `product.min_qty` / `product.reorder_qty` attributes (views.py:~391-402) that are not model fields (silently ignored; data goes nowhere; OutletProductConfigView is the real path); `InventoryListView` Excel export reads `p.min_qty` (:1002) which is neither a model field nor an annotation (AttributeError => export 500) (inferred; annotation is `outlet_min_qty`); `export_format=csv` returns xlsx; debug `print(...)` statements at inventory/views.py:425 and :1710.
26. [L] `InventoryAlertsView` ignores per-outlet `OutletProductConfig` (hard-coded threshold `< 10` and `reorderQty: 50`, views.py:1200-1216) while `InventoryListView.isLowStock` uses `outlet_min_qty or 10` and `ProductSearchView.isLowStock` uses hard-coded 10: three different low-stock definitions. `MasterCatalogSearchView` returns `purchaseRate = mrp * 0.8` (placeholder heuristic, :819).
27. [L] Search views run `icontains` against name/composition/manufacturer; comments claim pg_trgm index use — GIN trigram indexes do accelerate ILIKE '%q%' (OK) but `ProductListView.get` returns the whole catalogue unpaginated.

OCR / AI pipeline
28. [H] Privacy/ops: with `GEMINI_API_KEY` set every invoice image (contains supplier/pharmacy GSTIN, DL numbers, prices) is uploaded to Google via `client.files.upload` and never deleted (gemini_ocr.py:~80). Secret is read from env only (value not recorded here). Retry decorator retries on ANY exception 5x up to 30s backoff inside a Celery task with no `time_limit`/`soft_time_limit`.
29. [M] Gemini path loses fields the local path provides: `GeminiHeader` has no `address`, `dl_20b`, `dl_21b`; so tier-3 DL matching and `ocr_distributor_address` never work under Gemini; `_validation_ok` is always True (no math validation); `warnings` text says "Gemini 1.5 Flash" while model is `gemini-flash-lite-latest`; `column_map` always `{}` (the `_learnedColumnMap` learning is irrelevant for Gemini). Prompt interpolates outlet GSTIN even when None.
30. [M] `match_medicine` loads the entire MasterProduct catalogue (`values(...)`) once PER LINE ITEM (ocr_engine.py:~1015) and fuzzy-scores all rows in Python: O(items x catalogue) per invoice. `RapidOCR()` engine is re-instantiated per call (ocr_engine.py:~229).
31. [M] Distributor matcher order checks fuzzy NAME (0.82) before exact GSTIN (ocr_engine.py:~915-946); a similarly-named wrong supplier can win over an exact GSTIN match. Tier-3 uses substring `in` for DL numbers; duplicated condition `ocr_dl_20b and ocr_dl_20b`.
32. [M] Stuck-job handling: a draft with both `ocr_raw_data` and `ocr_processing_error` NULL stays 'processing' forever (worker crash/lost message); retry endpoint refuses to requeue in that state (returns 202 processing, views.py:2225). Only the frontend's 90x2s timeout hides it. No dedupe of repeated uploads; no file type/size validation on upload (`image` accepted as-is by ImageField on save).
33. [L] `process_invoice_ocr.save()` (tasks.py:34) does a full `invoice.save()` (stale-write risk if user edits draft concurrently); task has no `bind/retry`. `result['error']` string is stored raw and relies on `OCR_FAILURE_MESSAGES` mapping at read time.
34. [L] Draft invoices (`SAVED`) appear in `PurchaseListView` only with `status=draft` and include `ocrData` (full raw OCR JSON incl. items) in the list payload (views.py:1001) - large payload.

Validation / API shape inconsistencies
35. [M] Error envelopes are inconsistent across the two apps (`{detail}`, `{error:{code,message}}`, `{errors:{}}`, `{error:'str'}`); `OutletProductConfigView` returns 400 with `str(e)` for any exception, prints request data.
36. [L] `DistributorListView.post` does not validate `name`; wraps every exception as LEDGER_CREATION_FAILED; the auto-created Ledger omits `opening_balance`/`balance_type` so `Distributor.opening_balance` is not carried into accounts (views.py:~140-160) (inferred). `balance_type` labels are inverted (CR="Distributor Owes Us"). `dl_no_20b`, `dl_no_21b`, `mobile`, `state_code`, `contact_person` have no API write path (only used by OCR matching).
37. [L] `DistributorLedgerView` docstring promises `summary`/`ledger` keys but returns `entries/openingBalance/closingBalance`; `referenceNo` always ''; `SOURCE_TYPE_MAP` lacks `PURCHASE_PAYMENT`, so cash-payment lines are labelled 'purchase'.
38. [L] `PurchaseDetailView.get` has a Redis `legacy_purchase_map:{id}` lookup fallback (views.py:1138) that connects directly with `redis.from_url(os.getenv('REDIS_URL'))` (bypasses Django cache config; remnant of a migration).
39. [L] Money handled as `float` in PO views (`qty * ptr` floats) and many serializers; `PurchaseOrder.total_amount` stored from float math.
40. [L] `PurchaseCreateView.post` logs the full incoming payload at INFO (views.py:554), may include commercial pricing; `StockLedger.outlet` is PROTECT (outlet deletion blocked) while all other FKs CASCADE.
41. [L] Management command hazards: `backfill_stock_ledger` deletes every StockLedger row across ALL outlets before rebuilding (backfill_stock_ledger.py:16-18); `fresh_tally_migration --execute` truncates outlet data (Staff preserved) and documents two real outlet UUIDs.

Coverage summary: inventory 15 routes / 7 models; purchases 19 routes / 6 models.

### 11.5 reports & infrastructure — detail

#### H.1 Security / data exposure
1. **Production-like data dumps committed to git**: `apps/backend/prod_dump.json` (36 MB; Django fixtures including core.organization/outlet, ~15k batches, ~1.9k sale invoices, journal lines, GST snapshots; organisation "Manavta Pharma"), `live_data.json` (36 MB, repo root), `partial_dump.json` (11 MB, repo root) are all tracked (`git ls-files`). Also tracked: `apps/backend/NEW STOCK SEP-2026.xls`, `stock_valuation.xls`, `Missing_Products_To_Fill*.xlsx`, `missing_new_products*.{csv,xlsx}`, `testing.jpg` (3 MB), `error.html` (66 KB), `gstr3b_082026_draft_v3.json`, `artifacts/gst_daily_validation/...` (21 files: sales/purchase registers, payment report), `apps/backend/docs/ca_review/...`, `apps/docs/ca_review/gstr1_012025_draft.json`. `.gitignore` covers `*.sql`, `*.dump`, `*.bak`, `*.log` but not `*.json`/`*.xls`.
2. **Auth tokens committed**: `apps/frontend/tests/e2e/.auth/{admin,manager,billing_staff}.json` are tracked and contain `access_token` cookies (JWTs; `.gitignore` ignores `apps/frontend/tests/` but they were force-added). Expiry encoded in the token implies they are stale, but they reveal user ids/roles.
3. **Login backdoors** (apps/accounts/views.py:110-116): password check passes if `password == 'password'` (any staff!) or `password == staff.phone`. Combined with phone-number login this is trivially exploitable for any account; `LoginView` is `AllowAny` (views.py:50). nginx rate limit (5/min) on `/api/v1/auth/login/` is the only brake and exists only when requests come through nginx (port 8090), not port 8000.
4. `dev-health-check.sh:13-15` embeds a real-looking staff phone and password in a committed script.
5. `FERNET_KEY` default literal in code (settings/base.py:10) is unused; `SandboxConfiguration` encryption key is derived from `SECRET_KEY[:32]` padded with `'0'` (core/models.py:259) - changing SECRET_KEY makes stored sandbox secrets undecryptable.
6. `SANDBOX_BASE_URL` default differs by module: test host in settings, production host in `gst/services/sandbox_auth.py:27` and `integrations/sandbox/client.py:33` (risk of calling production Sandbox with test intent). Only `SandboxGstProvider` guards test-key-vs-prod-URL.
7. Django `serve` of `/media/` with no auth (mediflow/urls.py:46-51) and nginx `/media/` alias (no auth): uploaded purchase-invoice images, potentially named predictably, are world-readable. `/admin/` allow-list IP hard-coded in nginx.conf:56-58.
8. `prod.py` is not used by any deployment path: wsgi/asgi/celery default to `dev` (DEBUG True default, `CORS_ALLOW_ALL_ORIGINS=True`, `ALLOWED_HOSTS=['*']`), docker-compose pins `mediflow.settings.dev`, and the Dockerfile CMD relies on the same default. Production safety depends on `.env` setting `DJANGO_SETTINGS_MODULE` and `DEBUG` (the compose `environment:` overrides `.env`, so .env cannot fix it for compose). No HTTPS/cookie hardening in any settings file.
9. `WhatsApp` API key stored plaintext in `OutletSettings.whatsapp_api_key` and returned in the settings GET (core/views.py:53-54).
10. `QA_DATABASE_URL` default embeds a username/password pair in code (base.py:85).

#### H.2 Reports authorization / isolation gaps
11. **Daily snapshot endpoints use only `IsAuthenticated`** (R/daily_snapshot_views.py:559,576,604,631): any authenticated role including `view_only`/`billing_staff` can read profit, partner shares, cash position AND POST `daily-snapshot/cash/` and `daily-snapshot/fixed-expenses/` (writes). `can_access_reports` is not enforced here. Also the GET handler creates `DailyCashReport`/`FixedMonthlyExpense` rows (side-effect on read).
12. **(FIXED) ERP reports outlet isolation**: `BaseErpReportView.extract_params` now rejects (403) any non-super_admin whose resolved outlet (`outletId` *or* `outlet_id`) differs from their own; covers sales and purchase ERP reports. Other views using `outlet_id` (trial-balance, gst-summary, balance-sheet, profit-loss) still rely on `check_outlet_access`, which ignores `outlet_id`.
13. GST dashboard/export views use `request.user.outlet` and ignore `outletId` (safe isolation) but `dashboard_views.GSTPeriodsView/GSTSummaryView/GSTReconciliationView/GSTExportView` do not check `can_export_gst` or `can_access_reports`; any logged-in staff (even `view_only`) can download GSTR-1/3B JSON and reconciliation CSV, while the Excel/PDF exports do enforce `can_export_gst`.
14. `GSTR2AReconciliationView.post` (R/views.py:1103-1113) takes `gstin` from the body and filters `outlet__gstin=gstin` with no check that the GSTIN belongs to the caller's outlet; any outlet's purchase data matching that GSTIN is exposed.
15. `InventoryValuationView` (R/views.py:622) is intentionally open to all authenticated roles, which exposes purchase/landing rates to staff lacking `can_view_purchase_rates` (the product API has a separate flag for rates).

#### H.3 Dead / mock / stubbed code
16. `GSTR2AReconciliationView` returns hard-coded mock GSTR-2A rows (R/views.py:1132-1151) presented as `success: True` data with only a `note` string; there is no real 2A integration.
17. `GSTSummaryView` returns `mom_delta` fixed at 0 ("Mocked for MVP", R/dashboard_views.py:~178); `GSTReconciliationView.deferred_itc.opening_balance` fixed at 0 (:~270).
18. Purchase/return/credit-note snapshot creators `create_sales_return_snapshots`, `create_purchase_snapshots`, `create_purchase_return_snapshots` (R/gst_snapshot_service.py:135,263,366) are not called from any non-test, non-seed code; only `create_sale_snapshots` is wired to billing. Consequently GSTR-1 credit notes (CDNR/CDNUR) and GSTR-3B Table 4 ITC / 2B reconciliation would be empty in a real environment unless seeded (inferred from grep; verify billing/purchases return flows).
19. Orphans: `apps/backend/apps/compliance/` (only `services/sandbox_auth.py` + tests; not in INSTALLED_APPS; duplicates `apps/gst/services/sandbox_auth.py`), `apps/backend/apps/apps/gst/__init__.py` (stray nested package), `GSTR2BService` import in `dashboard_views.py:11` unused there, `apps/backend/apps/reports/views.py` unused imports (`IsAdminStaff`, `Customer`, `Distributor`, `SalesReturn` at :110, `Staff` at :440).
20. `FERNET_KEY` unused; `GST_ENV` deprecated but still in `.env`; `NEXT_PUBLIC_USE_MOCK/APP_NAME/APP_VERSION` unreferenced (inferred).
21. `send_whatsapp_reminder` (billing/tasks.py:5-11) is a stub with TODO; WhatsApp feature flags exist but nothing sends messages.
22. `DailyCashReport.petty_cash_exp` model field is never written by the API (the snapshot computes `pettyCashExp` from vouchers).

#### H.4 Bugs / inconsistencies in reports
23. **Missing imports -> NameError**: `R/exports/gstr1_excel.py` raises `NotFound`/`PermissionDenied` (lines 34, 40, 48, 56) but never imports them from `rest_framework.exceptions` (imports at :1-22 lack them). Any no-outlet / no-permission / missing-template case in the GSTR-1 Excel export yields an unhandled `NameError` (HTTP 500) instead of 403/404. The other four export modules import them correctly.
24. Leftover debug prints in export path: `print("DEBUG PAYLOAD:", payload)` (gstr1_excel.py:116) and `print("DATA MAP:", data_map)` (:556) dump the entire GSTR-1 payload (customer GSTINs, invoice numbers) to stdout/logs on every export; also "Template not found" prints (:47,:54), "Blocking errors" print (:107).
25. Inconsistent export gating: GSTR-1 Excel ignores blocking errors ("Download & Warn", gstr1_excel.py:105-107, 560-562) while GSTR-3B Excel (gstr3b_excel.py:~46) and CA working paper (ca_working_paper.py:~45) return 422 on blocking errors; JSON export never gates.
26. **Three divergent GST computations**: legacy live views (`GSTR1ReportView`, `GSTR2ReportView`, `GSTR3BReportView`) vs snapshot builders (`gstr_builders.py`) vs the `apps/gst` GSTR-1 invoices view. Legacy GSTR-3B treats purchase GST as always intra-state (cgst=sgst=gst/2, igst=0) and has no RCM/reversals; legacy GSTR-1 splits per item via `split_gst` using GSTIN prefix and treats missing customer GSTIN as intra-state. Results will not tie to the snapshot-driven exports.
27. COGS basis differs between reports: ERP gross profit uses `landing_rate or purchase_rate` (erp_report_service.py ~:360), daily snapshot uses `purchase_rate` (daily_snapshot_views.py:174-182, 366-375), stock valuation shows purchase/landing/mrp separately and balance sheet uses purchase rate. Gross profit in ERP uses tax-inclusive `grand_total` as "net sales" (so GP% is overstated vs ex-GST sales).
28. `is_cancelled` filtering inconsistent: ERP reports and daily snapshot filter `is_cancelled=False`; `SalesDailyReportView`, `SalesSummaryReportView`, `GSTR1ReportView`, `GSTR3BReportView`, `StaffPerformance` do not (cancelled invoices would be counted, if the flag is used for cancellations - inferred). Daily snapshot also does not exclude `is_return=True` invoices from "gross sales" while subtracting SalesReturn rows (possible double count if both exist).
29. ERP sales book slab bucketing drops rates other than 5/12/18/28/0 from slab columns but includes them in `total_gst` (R/services/erp_report_service.py ~:110-123); with GST 2.0 style rates or cess this will not reconcile (migration `core/migrations/0015_activate_pharma_tax_slabs.py` suggests slab changes are in flight).
30. `InventoryMovementReportView` computes "opening stock" as current stock and then adds period movements on top (views.py:771-830), ignoring sale returns, adjustments and loose units; the figures are not a true stock ledger (the batch-wise report using `StockLedger` is the accurate one).
31. Input validation: `days`, `expiry_within_days` use bare `int(...)` (views.py:852,1479,1538) -> 500 on bad input; many views silently ignore malformed `from`/`to` dates (views.py:373-380 etc.) returning unfiltered all-time data; `DailyCashReportView/FixedMonthlyExpenseView` assign request values directly to Decimal/Int fields with no validation or serializer (non-numeric -> 500 on save); `date` in cash POST is passed raw to `get_or_create`.
32. `BatchWiseReportView` catches all exceptions and returns `str(e)` to the client (views.py:1518-1520); ERP views do the same (erp_views.py:117-125 etc.), leaking internals.
33. `GSTR2BData.unique_together` includes nullable `import_job` (NULL never conflicts in Postgres), and `GSTR2BService.reconcile` deletes all `GSTR2BData` for the outlet+period before inserting (`.delete()` at gstr2b_service.py:~54) with CASCADE FK from `ITCReconciliationResult.gstr2b_record` being SET_NULL, so past recon results lose their 2B link silently.
34. `GSTR2BService.reconcile` swallows `TaxpayerAuthError` and proceeds with empty 2B data (gstr2b_service.py:49-53), then marks every purchase `MISSING_IN_2B` and creates `DeferredITCEntry` rows; an expired session therefore corrupts ITC deferral state.
35. `gstr_builders.py` 4B/4D block wrapped in `except Exception: pass` (GSTR3BBuilder, ~:598) hides failures, and has duplicated comment lines (`# Phase A2` twice, `# Reclaims` twice).
36. `GSTSummaryView` lazily generates snapshots for every invoice in a date range with swallowed exceptions; both `GSTPeriodsView` and `GSTSummaryView` rebuild full GSTR-1 and GSTR-3B JSON in the request cycle (periods view per period). Potential latency on large datasets; no caching.
37. `StaffPerformanceReportView` loops staff and runs 2 queries each; `daily_snapshot` partner loop runs several queries per day per partner for date ranges (O(days x partners)).
38. Cache invalidation: report caches (`mf:stock_val`, `mf:expiry`, `mf:batch_wise`, `mf:staff_perf`) are never invalidated; `BatchWise` cache key excludes nothing but includes `search` raw string.
39. `ExpiryReportView` includes already-expired batches and labels them with negative `daysToExpiry`; compare `BatchWise near_expiry` which excludes expired (`expiry_date > today`). Naming is consistent with two different semantics.
40. `reports/models.py`: `GSTR2BImportJob.status` and `ITCReconciliationRun.status`/`ITCReconciliationResult.match_status` are free-text with no choices; `GSTExportAudit.export_type` choices don't include the GSTR-2B JSON export type.

#### H.5 Infra / build / CI
41. **CI cannot work as written**: `cache-dependency-path: apps/frontend/package-lock.json` does not exist (the lockfile is at the repo root `package-lock.json`; workspaces), `npm ci` is run inside the workspace dir; the workflow provides no `SECRET_KEY`/`DATABASE_URL` (settings require both -> `migrate` fails), has the Postgres/Redis service commented out, and `actions/upload-artifact@v3` / `checkout@v3` / `setup-node@v3` are deprecated (v3 artifact action stopped working in 2025). Frontend smoke step has `continue-on-error: true`.
42. `pytest`, `pytest-django`, `factory-boy` (if used by `apps/accounts/tests/factories`) are absent from `requirements.txt`; the CI uses `manage.py test --tag=...` while the repo's pytest.ini config implies pytest.
43. `.gitignore` has `**/test_*.py` and `**/*.spec.ts`, `apps/frontend/tests/`: new tests silently stay untracked unless force-added (many `test_*.py` in repo root and `apps/backend/` are untracked/ignored: `test_auth.py`, `test_login.py`, `test_model.py`, `apps/backend/test_einv*.py`). Conversely `apps/backend/live_test.py`, `append_tests.py`, `sync_snapshots.py` are tracked.
44. Docker: `backend.Dockerfile` has no non-root user, no `collectstatic`, installs only `libpq-dev gcc` (WeasyPrint needs pango/cairo/gdk-pixbuf; RapidOCR/ONNX may need libgl/libglib), uses `COPY . .` of `apps/backend` which includes the 36 MB dump, `venv/`, `media/`, `.env` unless `.dockerignore` excludes them (root `.dockerignore` is applied only for root-context builds; the backend build context is `./apps/backend`, so a `.dockerignore` in `apps/backend` would be needed - none found there; inferred).
45. docker-compose runs `runserver` (dev autoreload server), `npm run dev` for the frontend, bind-mounts source over `/app`, and uses `DJANGO_SETTINGS_MODULE=mediflow.settings.dev`; it is a dev compose file also used as the "production" deploy (see `DEPLOYMENT_SUCCESS_REPORT.md`, `PRODUCTION_EDIT_BILL_LOGS.md`). The image CMD (gunicorn, 3 workers) is never used by compose.
46. Celery worker started without `-Q audit`, while `CELERY_TASK_ROUTES` sends `create_audit_log_async` to queue `audit` (settings/base.py:183-185). A worker with no `-Q` consumes only the default `celery` queue, so audit logs enqueued via `.delay` (audit/services.py:71) would never be processed (inferred; verify with `celery inspect active_queues`).
47. `REDIS_URL` single variable feeds broker (db 0 default) and cache (db 1 default); if set explicitly both land in the same database index, so Django `cache.clear()` would also wipe Celery keys.
48. E-way bill generation spawned with `threading.Thread` inside the request (billing/sale_services.py:605) rather than Celery; no retry or persistence if the process dies.
49. `docker-compose.yml` mounts external volumes `mediflow_main_postgres_data` / `mediflow_main_redis_data` (must exist) and publishes backend port 8000 directly alongside nginx 8090; backend is reachable without nginx rate limiting.
50. `turbo` is referenced by root scripts but no `turbo.json` exists; `turbo` pinned to `latest`, `typescript` `5.x`; root `package.json` `"main": "fix.js"` points to a nonexistent file; `npm overrides` pins react 18.2.0.
51. `Dockerfile` for frontend runs `rm -rf apps/frontend/node_modules/react*` hack (documented in file) and `next.config.js` ignores TS/ESLint errors at build, hiding type breakages.
52. `scripts/sync_contracts.sh` writes `src/types/api.ts` and uses `mediflow.settings.base` (works only if `DEBUG` default etc.; base requires `.env`).
53. Repo root clutter (documentation/audit reports and ad-hoc scripts committed): 28 `*_REPORT.md`/`EXTRACTED_*.md` files at root; scripts `append_tests.py`, `parse_skips.js`, `update_commands.js`; in `apps/backend/` ad-hoc one-off scripts (`analyze_marg.py`, `analyze_new_stock.py`, `analyze_stock_valuation.py`, `build_artifacts.py`, `check_data.py`, `demonstrate_a1.py`, `dry_run_backfill.py`, `execute_backfill.py`, `export_missing_data.py`, `extract_errors.py`, `extract_recon_data.py`, `find_duplicate_returns.py`, `format_excel.py`, `get_admins.py`, `get_user_role.py`, `live_ewb_test.py`, `live_test.py`, `merge_returns.py`, `parse_html.py`, `parse_pytest.py`, `patch_sale_services.py`, `patch_tests.py`, `print_rev.py`, `rebuild_stock.py`, `reproduce_stock_bug.py`, `seed_sales.py`, `sync_snapshots.py`, `sync_stock.py`, `validate_accounts.py`, `e2e_test_read_adapters.py`). Several set invalid `DJANGO_SETTINGS_MODULE` values (`mediflow.settings` has no content; `backend.settings` in live_ewb_test.py:5) or hard-code a DB URL on port 5433 with default-looking credentials (`analyze_new_stock.py:7`), and several target `mediflow.settings.prod` against whatever DB the env points to (`get_admins.py`, `sync_stock.py`, `export_missing_data.py`) - risk of accidental runs on production data.
54. **Virtualenvs are committed**: `git ls-files` lists 9,500 files under `apps/backend/venv/` (about 273 MB on disk, Python 3.12 site-packages) and 9,383 under root `venv/`. `.gitignore` ignores only `.venv/`. The Dockerfile and CI use Python 3.10, so the committed venvs are also the wrong interpreter version.
55. Frontend API URL fallbacks inconsistent (8000 vs 8090) and some call sites have no fallback (`ExportButton.tsx:109`, `inventory/page.tsx:80,145`), which yields `undefined/...` URLs if the var is missing at build time.
56. Report-endpoint path naming inconsistency: params vary by endpoint (`from/to`, `startDate/endDate`, `start_date/end_date`, `date_from/date_to`, `outletId` vs `outlet_id`, `export_format` vs `format`), responses vary (`{success,data}` vs bare vs `{rows,summary}`).

### 11.6 frontend — detail

**Auth/session**
1. `access_token` is stored in a non-HttpOnly cookie by `LoginForm.tsx:51` (XSS-readable); middleware only checks presence, never validity/expiry. 401 -> hard logout; no silent refresh (`authApi.refresh` unused, refresh token never persisted). `lib/api.ts:78` refresh call (`POST /auth/refresh/` with `{}`) is incompatible with the body-based refresh (inferred).
2. `middleware.ts` whitelists `/setup` (route missing) and honours a `mediflow_mock_auth` cookie (also cleared in apiClient/auth.ts) — leftover mock-auth bypass: anyone can set that cookie to pass the edge check (APIs still require JWT).
3. Admin routes: `app/admin/layout.tsx` has no role check; only the page does. Most `/dashboard/*` pages rely solely on hiding nav items (`permission` filter); direct URL access is not gated (settings, staff, reports pages mostly).

**Duplicated logic / divergence**
4. Billing math lives in 5 places: `cartUtils.calculateRowTotals`, `billingMarginUtils.*`, `billingStore.getDraftTotals`, `payloadBuilders.buildSalePayload`, dead `lib/gst.calculateBillTotals`, plus the backend (`sale_services.py`). CGST/SGST split differs: `getDraftTotals` halves GST (`gst/2` float), `lib/gst.ts` floors to paise, backend floors via `ROUND_FLOOR`; wholesale `grandTotal` is not rounded to rupee in frontend. Cost-floor GST treatment with `landingCostIncludeGst` is implemented differently on each side. Any change to discounts/GST must be applied to frontend + backend + `backend/apps/billing/tests/test_discount_math.py` + `__tests__/billingMarginUtils.test.ts`.
5. Cost-floor priority chain (RETAIL landing>ptr>purchase; WHOLESALE purchase>pts>landing>ptr) is copy-pasted 3x in the frontend (`cartUtils.ts`, `billingMarginUtils.ts` x2).
6. Default PTR/PTS back-fill (`mrp*0.80`, `ptr*0.90`/`mrp*0.72`) is hard-coded in `apiClient.productsApi.search` (apiClient.ts ~L290) — pricing assumption in the transport layer; not from backend.
7. `pages/reports/sales-book` and `erp-sales-book` are 524-line copies differing in 8 lines (title/default mode). `StaffLeaderboard` exists in both `components/dashboard/` and `components/staff/`. `LedgerPicker` exists in `components/accounts/` (422 L) and `components/billing/` (312 L). Duplicate tests: `ManavataA4Invoice.test.tsx` (components/print and `__tests__`), `billingStore.test.ts` (store and `store/__tests__`), `PurchaseGridUX.test.tsx` (components/purchases/__tests__ and tests/unit), `billingMarginUtils.test.ts` (`__tests__` and `tests/unit`).
8. Two HTTP clients with different error contracts (`apiClient` throws DRF body; `lib/api.ts` throws `{error:{code,message,details}}`) and many raw `fetch` calls with hard-coded env fallbacks (`:8000`, `:8090`) bypassing 401 handling.
9. Query-param naming inconsistent: `outletId` (most) vs `outlet_id` (`/trial-balance/`, `/gst-summary/`, `/balance-sheet/`, `/profit-loss/`); payloads camelCase except autosave drafts (snake_case) and `SaleInvoice.qr_code/eway_bill_*`. Case helpers read both `landingRate`/`landing_rate`.
10. `attendanceApi.checkOut` posts to the same URL as `checkIn` (apiClient.ts ~L1177-1190).

**Dead / stub code**
11. Pages that are stubs: `/dashboard/accounts/payments`, `/reconciliation`, `/audit` ("Work in Progress"), `/dashboard/attendance/mark` ("coming soon").
12. Unused components: `AccountsPage`, `AccountsSummaryCards`, `OutstandingTab`(only via AccountsPage), `PaymentHistoryList`, `PurchaseReturnEditModal`, `SaleReturnEditModal`, `AttendanceTodaySummary`, `KioskMode`, `TransactionStrip`, `DoctorSearch`, `CustomerSearch`, `BatchDetailDrawer`, `GSTR1SummaryCard`, `GSTR3BSummaryCard`, `KPIRibbon`, `ReconciliationWidget`, `BatchReportTab`, `GSTReportTab`/`GSTR1View`/`GSTR3BView` (only via unused GSTReportTab), `PurchaseReportTab`, `StaffReportTab`, `ExportButton`, `ErpReportModal`, `Header`, `ShortcutHelpModal`, `PODetailWorkspace`, `GlobalOverlays` (returns null). The whole "reports as tabs" layer (`useGSTReport`, `useStaffReport`, `usePurchaseReport`, `useBatchReport`, `useGSTR1/3BReport`) has no route.
13. Unused libs: `lib/offline-db.ts` (stub), `lib/gst.ts` `calculateBillTotals/calculateItemTotals`, `lib/purchase-calculations.ts` (all but `calculateLandingRate`), `schemas/payloadSchemas.ts`, `src/types/api.ts`, `dexie` + `@serwist/*` + `serwist` deps (PWA disabled, SW actively unregistered in `app/providers.tsx`), env vars `NEXT_PUBLIC_USE_MOCK/APP_NAME/APP_VERSION`.
14. `GlobalModalManager` (fixed 2026-11-06 for the 5 modals the shortcuts open: `CreateLedgerModal` gets `outletId/onSave/onClose`, `CreateDoctorModal` `onSave/onClose`, `BulkReminderModal` default import + `isOpen/onClose`, `StaffFormModal` `open/onClose`, `ManualAttendanceModal` `isOpen/onClose`). Still mismatched and deliberately NOT reachable by shortcut: `BillAdjustmentModal` (needs ledgerId/totalAmount/onConfirm), `StockAdjustmentModal` (needs a batch + onSubmit; the inventory page mounts it itself) and `AddOutletModal` (self-contained dialog needing `orgId`); their branches in the manager still pass `open/onOpenChange` (3 residual TS errors). The only caller of `openModal` is `GlobalShortcuts`.
15. Layout comments: `dashboard/attendance/mark/layout.tsx` contains a stream-of-consciousness comment ("Wait, ...").

**Type safety**
16. ~747 occurrences of `any` (`: any`, `as any`, `any[]`) across app/components/hooks/lib/store/utils; worst: `lib/apiClient.ts` (101), `utils/payloadBuilders.ts` (24), `NewPurchaseForm.tsx` (19), `ManavataA4Invoice.tsx` (18), `inventory/[productId]/page.tsx` (17), `QuotationsList.tsx` (15). `MasterProduct.batches?: any[]`, `PurchaseInvoiceFull.ocrData?: any`, `modalStore.modalProps: any`. `next.config.js` sets `ignoreBuildErrors` and `ignoreDuringBuilds`, so TS/ESLint errors never block `next build`.
17. Error handling: apiClient throws untyped objects; many `.catch(console.error)` in layouts (`authApi.me()`); `AdminLayout` handles a response shape that `me()` never returns. `api` axios and `fetch` error shapes differ so UI toasts must branch.

**State**
18. `billingStore` persists drafts (customer, cart, PIN-verified staff) in localStorage with no `version`/`migrate` — shape changes can hydrate stale drafts. `window.useBillingStore` is exposed globally. `isPinVerified` persisted: PIN session survives reloads (timeout setting `pinSessionTimeoutMins` not obviously enforced `(inferred)`).
19. `settingsStore` storage key is computed once at import time from `mediflow-auth` in localStorage, then fixed up with `rehydrateSettingsForOutlet`; two sources of truth (store vs `/outlet/settings/` via `useOutletSettings`) can diverge.
20. `useDashboardKPI` and `useDashboardAlerts` share one query key (intentional) but call `getDailySummary` twice in `dashboardApi.getAlerts` path (`getAlerts` hits the same endpoint).

**Build / test hygiene**
21. Tailwind `content` omits `lib/`, `hooks/`, `utils/`, `config/`, `constants/` — any class strings there are purged.
22. `playwright.config.ts` `testDir: ./e2e` vs real suites in `tests/e2e`; jest has no ignore for e2e specs (see D.2). `package.json` has no `format`/`prettier` script; `lucide-react: "latest"` unpinned.
23. `tsconfig` target `es5` with `strict`, `tsconfig.tsbuildinfo` and `playwright-report/`, `test-results/` present in the working tree (gitignore status not verified except `.env.local` which is ignored).

**Stray debug files in `apps/frontend/` root (none in `.gitignore`)**
* `checkout-debug.html` — 1522-line saved Next.js SSR HTML dump (`/_next/static/css/app/layout.css?v=...`); debugging artifact.
* `test-api.js:1-21` — raw `http` GET to `localhost:8000/api/v1/hospitals/` (endpoint does not exist).
* `test-math.js` (56 L) — ad-hoc billing math script.
* `test-revise.js:1-33` — axios script that logs in against `/auth/token/` with hard-coded dev credentials (value not reproduced here) and revises a hard-coded invoice UUID; Jest/Playwright do not run it. Treat as a secret-hygiene issue.
* `tests/test_vouchers.spec.js` (32 L) and `tests/e2e/test_voucher_edit.spec.js` are JS specs in a TS suite; `test:e2e:legacy` references `tests/e2e/smoke2.spec.js`, which does not exist.
* `console.log` remains in `components/billing/MainInvoiceWorkspace.tsx`, `app/dashboard/accounts/voucher-entry/revisions/[id]/page.tsx`; no `TODO/FIXME/HACK` comments found in app/components/hooks/lib/store/utils/types.
