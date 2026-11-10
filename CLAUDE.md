## Project map (read first)

Before any task, read PROJECT_MAP.md and graphify-out/GRAPH_REPORT.md. Use /graphify explain and /graphify path to locate code before opening files. After changing code, update PROJECT_MAP.md if APIs, models, fields, or features changed.

PROJECT_MAP.md is ~2,200 lines: don't read it whole. Read its "How to use this file" TOC, sections 1–3 and 11.1, then only the section you need (use Read offset/limit with the TOC line numbers).

## Users, roles and permissions

Before changing anything about login, roles, staff, permissions, outlet isolation or who-can-see-what, read `docs/ACCESS_CONTROL.md`. The server computes each user's permission list (`apps/core/permissions.py`); the frontend only checks it (`lib/access.ts`). Do not reintroduce hand-written role tables in the UI, `permission_classes = []`, DRF's own `IsAuthenticated`, or merged list+create views without `MethodPermissionMixin`.

## Customers, families and shared credit

Before changing customer / ledger / credit / billing-customer logic, read `docs/FAMILY_ACCOUNTS.md`. A family shares one account (ledger + balance + credit limit); bills go to the account and name the person in `SaleInvoice.patient`. Do not re-key money onto individual family members.

## Purchase orders

Before changing purchase orders, the Shortbook or receiving goods against a PO, read `docs/PURCHASE_ORDERS.md`. Status changes only through `transition()` in `apps/purchases/po_services.py`; received quantities are derived from linked invoices (`recompute_receipts`), never nudged by hand.

## UI consistency

New popups and forms reuse the project's own pieces: `components/shared/ModalShell.tsx` (same look as `CreateLedgerModal`: bordered header, uppercase muted section titles, `Label` + `Input`, footer with a full-width primary button and an outline Cancel) and the `ui/*` components with the theme tokens (`primary`, `muted`, `input`). Billing header fields are 36px (`h-9`) with `text-[11px] font-bold text-slate-600` labels in `h-6` rows so they align. Do not hand-roll a different style.

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
