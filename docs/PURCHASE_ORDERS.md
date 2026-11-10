# Purchase orders: the closed loop

    Shortbook -> Draft PO -> Sent -> Partial -> Completed        (+ Cancelled, Expired)
        ^                                  |
        +----- anything not received ------+   (cancel / expire / close short return it to the Shortbook as Pending)

All of it lives under **Purchases**: tabs *Shortbook · Purchase Orders · Invoices · New Purchase · Distributors*. PO settings live in **Settings > Purchase Orders** (`?tab=purchasing`).

## Rules (all enforced by the server, `apps/purchases/po_services.py`)
- A Draft is stored as `SAVED` and shown as "Draft". **Every status change goes through `transition()`**; nothing else sets `status`.
- Only a **Draft** can be edited (409 `LOCKED` otherwise) and only with the `version` the client loaded (409 `STALE`). Sending locks the lines.

| Status | Edit | Send | Receive | Cancel | Close short | Duplicate | Delete |
|---|---|---|---|---|---|---|---|
| Draft | yes | yes | - | yes | - | yes | yes |
| Sent | - | resend | yes | yes | - | yes | - |
| Partial | - | - | yes | - | yes | yes | - |
| Completed / Cancelled / Expired | - | - | - | - | - | yes | - |

- PO numbers: `PREFIX-YYYYMMDD-NNN` from a per-outlet-per-day counter read under a row lock (`POSequence`) plus a unique constraint.
- Nothing is dropped silently: a quantity under 1, a duplicate product, no distributor or no lines is an error that names the problem.
- **On order** has one definition (`on_order_map`): open Sent/Partial quantity not yet received. Low-stock suggestions, the PO grid and the Shortbook all use it.
- Money is `Decimal` in the database and **strings** in the API (`"1250.00"`). Quantities are whole packs (integers).
- Events (`POEvent`) record created / edited / sent / resent / received / closed_short / cancelled / expired / duplicated: the activity timeline.

## Receiving
Receiving goes through the purchase invoice: `POST /purchases/` (and the edit) accepts `purchaseOrderId`. In the same transaction the invoice is linked
(`PurchaseInvoice.purchase_order`) and `recompute_receipts()` sums the lines of every posted invoice linked to the PO into `received_qty`, then sets
Partial / Completed. It is derived, so editing an invoice down moves the PO back. The invoice must be from the PO's distributor and the PO must be Sent or Partial.
Invoice lines for products not on the PO are allowed. Free goods count only if the outlet setting says so. A PO closed short is not reopened.
The New Purchase tab reads `?tab=new&poId=` and fills the party and the lines still owed; picking a distributor that has open POs offers to link one.

## Shortbook
`ShortbookItem` per outlet and product (one open row per product: adding again raises the quantity). Sources: low stock, billing, customer request, manual.
Status: Pending -> In draft PO -> Ordered -> Received (or Removed). **Create POs** makes one Draft per distributor and links the lines back.
Cancel / expire / close short return what was not received to Pending. Low-stock items are synced in when the Shortbook is opened (only if the automatic rules are on).
**Loading (kept light on purpose).** The screen never loads the whole Shortbook. `GET shortbook/?view=groups&page=` returns a page of distributor groups (10 per page; name and counts only, "no distributor" first).
`GET shortbook/?distributorId=<id|none>&page=&pageSize=` returns one group's items, 25 per page (max 100). A group's rows are fetched only while it is open (the first group opens by default). `?countsOnly=1` is the tab badge.
"Select all" on a group sends `distributorIds` to `create-pos` / `bulk`, which act on every pending item of that distributor across all pages, so a group of 300 is one request.
The low-stock sync runs at most once a minute per outlet, and only products with a minimum above 0 count as low. The PO editor's "Add from Shortbook" asks for just that distributor's pending items. Keep new Shortbook code to these patterns:
no unbounded list, no query per row (`line_insights` is one query for any number of rows; `test_po_extended.py` has tests that fail if the query count grows with rows).

**Adding by hand** (`AddToShortbook`): the medicine list opens by itself; the popup shows the product's stock, minimum, on-order and last rate (`GET shortbook/product-info/`), warns when it is already in the Shortbook, suggests a quantity that reaches the minimum, and has "Add & next" for entering several in a row. Every distributor field in the purchase screens is the searchable `DistributorCombobox` (contains-matching, best match first). Floating layers (lists, selects, menus) must stay above `ModalShell`'s overlay (`z-[120]` vs its `z-[100]`; `tests/unit/floatingLayers.test.ts` guards it).
A cashier can add an item (billing's "No stock available" message has an **Add to Shortbook** button); reading the whole Shortbook needs a purchase right.

## Sending and the distributor page
`POST orders/<id>/send/` with channel `whatsapp_link | pdf_whatsapp | email | manual`. `manual` ("already ordered by phone") just records it. Otherwise a secret
`share_token` is created and a `wa.me` link with the message is returned. The public read-only page is **`/po/<token>`** (no login; the Next middleware lets `/po/` through;
`GET /purchases/public/po/<token>/`, throttled 60/min). It shows products, packs, quantities and MRP; rates and the total only if "Show rate to distributor" is on.
It 404s for a Draft and a week after the PO closed, and shows "cancelled" / "expired" when it is.

## Settings (Settings > Purchase Orders, owners/admins; saving asks for the account password)
Automatic rules on/off (with a plain-words explainer), expiry days (default 3), default channel, WhatsApp message template (`{store} {po_no} {link} {distributor}`),
number prefix, show rate to distributor, count free goods as received. Stored on `OutletSettings` (`po_*`).
**Expiry**: a Sent PO with nothing received past `expires_at` becomes Expired and its items return to the Shortbook. It runs lazily whenever POs are read
(no scheduler is configured here) and from `python manage.py expire_purchase_orders` for a cron.

## Permissions (named like the plan; mapped onto the existing flags)
`view_purchases` (read), `create_purchases` (shortbook edits, drafts, duplicate, delete, receive), `send_purchase_orders` (= `can_create_purchases`),
`cancel_purchase_orders` (cancel + close short, = `can_edit_purchases`), `manage_po_settings` (= admin). The PO detail returns `allowedActions` (status table AND the user's rights);
the screens show only those. Split a flag later by giving `CanSendPurchaseOrders` / `CanCancelPurchaseOrders` their own field.

## Deployment
Migrations (all additive except the renumbering/normalising data steps): `core 0016`, `purchases 0016-0019`. `0017` renumbers any duplicate PO numbers (suffix `-D2`) before `0018` adds the unique
constraint; `0019` turns the old `DRAFT` status into `SAVED`. The dev stack only migrates on container start: run `docker exec mediflow_backend python manage.py migrate`.

## Tests (what covers what, how to run)
| Layer | Where | Covers |
|---|---|---|
| Backend rules + API | `apps/backend/apps/purchases/tests/test_po_lifecycle.py`, `test_po_extended.py`, `test_purchase_orders.py` | numbering, the status table, receiving through invoices, close short / cancel / expiry, Shortbook merge/return, outlet isolation, delete/duplicate/timeline, low-stock sync and on-order, the expiry command, items/by-distributor/open/suggestions, public page exposure, settings access, permissions |
| Screens (Jest) | `apps/frontend/components/purchases/__tests__/PurchaseOrders.test.tsx`, `PurchaseOrderFlows.test.tsx`, `__tests__/purchases/POList.test.tsx`, `PurchasesHub.test.tsx`, `tests/unit/BillingAddToShortbook.test.tsx` | list, editor validation, Shortbook grouping, Send / confirm / New PO popups, settings form (explainer + password), the distributor page, Purchases tabs and deep links, Inventory and billing "Add to Shortbook" |
| Real browser (Playwright) | `apps/frontend/e2e/po-lifecycle.spec.ts` + `e2e/support/fakePoBackend.ts` | the whole loop with a fake in-memory API and a fake login: no database, no seeded user, nothing real is written |

- Backend, quick (SQLite): `DJANGO_SETTINGS_MODULE=mediflow.settings.test_sqlite_tz REDIS_URL=memory:// CELERY_TASK_ALWAYS_EAGER=True venv/bin/python -m pytest apps/purchases`
  The SQLite settings cannot run Postgres-only tests (fuzzy product search, row-lock concurrency, reconciliation formatting): 9 tests fail there by design and pass on Postgres.
- Backend, full (Postgres; pytest-django makes its own `test_mediflow` database, never the real one): use the dev settings with `DATABASE_URL` pointing at the postgres container's IP
  (`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' mediflow_postgres`), then `pytest --create-db apps`.
- Frontend: `cd apps/frontend && npx jest`. Browser: `npx playwright test e2e/po-lifecycle.spec.ts` (needs the frontend on :3000).
- `test_*.py` is git-ignored in this repo: add new backend test files with `git add -f`.
