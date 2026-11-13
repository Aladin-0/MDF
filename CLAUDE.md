## Project map (read first)

Before any task, read PROJECT_MAP.md and graphify-out/GRAPH_REPORT.md. Use /graphify explain and /graphify path to locate code before opening files. After changing code, update PROJECT_MAP.md if APIs, models, fields, or features changed.

PROJECT_MAP.md is ~2,200 lines: don't read it whole. Read its "How to use this file" TOC, sections 1–3 and 11.1, then only the section you need (use Read offset/limit with the TOC line numbers).

## Users, roles and permissions

Before changing anything about login, roles, staff, permissions, outlet isolation or who-can-see-what, read `docs/ACCESS_CONTROL.md`. The server computes each user's permission list (`apps/core/permissions.py`); the frontend only checks it (`lib/access.ts`). Do not reintroduce hand-written role tables in the UI, `permission_classes = []`, DRF's own `IsAuthenticated`, or merged list+create views without `MethodPermissionMixin`.

## Customers, families and shared credit

Before changing customer / ledger / credit / billing-customer logic, read `docs/FAMILY_ACCOUNTS.md`. A family shares one account (ledger + balance + credit limit); bills go to the account and name the person in `SaleInvoice.patient`. Do not re-key money onto individual family members.

## Pack size, unit and type

Before changing pack size / unit / type, loose selling (`qty_loose`), or the product / batch edit screens, read `docs/PACK_DEFINITIONS.md`. One rule lives in `apps/inventory/pack_rules.py` and the API sends it as `allowsLoose`; billing sells from the **batch's** copy of the pack, and editing a product must keep its batches in step. Do not add another `packType === 'strip'` / `packSize > 1` check or a "runtime correction" of bad data.

## Inventory

Before changing the Inventory page, `GET /inventory/` or stock adjustment, read `docs/INVENTORY.md`. Low stock, expiring and nearest-expiry each have one rule on the server; counts come from `useInventorySummary`; an adjustment needs `type`, signed `qty` and a PIN (`buildAdjustPayload`); never ask for more than 100 rows a page or use `cache.delete_pattern`. The medicine search box (`L+23.50`, `C,salt`, barcode, substitutes) is parsed only by `apps/inventory/search_query.py`; see "Medicine search" in that doc before changing it.

## Purchase orders

Before changing purchase orders, the Shortbook or receiving goods against a PO, read `docs/PURCHASE_ORDERS.md`. Status changes only through `transition()` in `apps/purchases/po_services.py`; received quantities are derived from linked invoices (`recompute_receipts`), never nudged by hand.

## UI consistency

New popups and forms reuse the project's own pieces: `components/shared/ModalShell.tsx` (same look as `CreateLedgerModal`: bordered header, uppercase muted section titles, `Label` + `Input`, footer with a full-width primary button and an outline Cancel) and the `ui/*` components with the theme tokens (`primary`, `muted`, `input`). Billing header fields are 36px (`h-9`) with `text-[11px] font-bold text-slate-600` labels in `h-6` rows so they align. Do not hand-roll a different style.

## Mobile layout

Before adding or changing a page, table, popup or form, read `docs/MOBILE_LAYOUT.md`. Everything must work on a 360px phone. Billing and the New Purchase entry screen each have a dedicated phone layout (`components/billing/mobile/`, `components/purchases/mobile/`); read `docs/MOBILE_BILLING_DESIGN.md` before touching billing and `docs/MOBILE_PURCHASE_DESIGN.md` before touching New Purchase, and put their rules in the shared store / hooks / `lib/` (`hooks/usePurchaseEntry.ts`, `lib/purchaseEntry.ts`, `lib/purchaseLine.ts`, `lib/purchaseChecks.ts`), never in one of the two layouts: mobile-first Tailwind, daily lists become cards below `md`, wide report tables scroll inside their own wrapper, popups use `ModalShell` / `ui/dialog`. Do not add a fixed pixel width without a `w-full sm:` fallback.

## Deploying to production

Before any server/deploy task, read `docs/DEPLOYMENT_GUIDE.md` (server layout, shared-server safety rules, backup, deploy, verify and rollback steps). ALWAYS use the server's own configuration files (`docker-compose.yml`, `.env`, `apps/backend/.env`, `apps/frontend/.env.local`, `settings/base.py`, `nginx/nginx.conf`) exactly as they are on the server — they differ from git on purpose and production runs correctly with them; never overwrite them, and take a backup before every deploy. The server also hosts the separate saudapakka project — never touch it. Never store the SSH password in files; ask the user.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
