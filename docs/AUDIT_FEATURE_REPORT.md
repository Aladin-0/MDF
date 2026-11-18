# Audit / activity tracking: review of the feature

Reviewed 17 Nov 2026 (`/admin/audit`, the `apps/audit` backend, and everything that writes to it). Method: read the code, ran read-only queries on the dev database, called the audit API as a super admin from a script, and opened the page in the browser as the shop's admin. **Nothing was changed.**

---

## 1. The short version

The audit feature is in poor shape. It looks like it works (the page loads, tests pass) but:

1. **Since 9 Oct 2026 most events are not being recorded.** The background worker that writes them was removed from `docker-compose.yml` that day. The last row in the main log is dated 9 Oct, and it holds only logins (101 rows in total). Today's 122 stock write-offs, batch edits, staff changes and every login since then are missing from it.
2. **The page shows something different from what you would expect.** Because of a feature flag it reads a second, newer table (99 rows: purchases, bill corrections, vouchers). It cannot show the logins at all. **Every filter on the page is ignored** (a nonsense module still returns all 99 rows). The User column says "System" for every human action. "View Diff" never appears. The CSV export prints raw IDs instead of names.
3. **The shop's own admin cannot open it.** I opened it as the admin and it says "Access restricted to super administrators only". Only the 2 super-admin accounts can see the audit trail.
4. **Large parts of the business are not tracked at all**, including creating a sale, changing a customer's credit limit, and changing outlet settings (which include the WhatsApp API key).
5. **The records can be altered or deleted** by the application's own database user. There is no protection at the database level, and no retention is scheduled.
6. **The tests cannot see any of this**, because the audit tests switch the new system off and run background tasks inline.

Fixing 1 and 2 is a day or two of work and gives you a log you can trust again. Section 7 has the plan.

---

## 2. How the feature is built (as found)

There are **six** places where "what happened" is stored:

| Store | Written by | Rows (dev) | Read by |
|---|---|---|---|
| `ActivityLog` ("V1") | `log_activity()`, queued to a background worker | 101 (all logins) | nothing on the page (flag) |
| `ActivityEvent` + `SystemEvent` ("V2") | `orchestrator.record_activity/record_mutation`, inside the transaction | 99 + 1 | the Audit Logs page |
| `DocumentRevision` (legacy) | old bill code | 0 | an old branch of the revisions API |
| `DocumentRevisionV2` | `orchestrator.record_revision` | 100 | bill / purchase / voucher history screens |
| `GSTExportAudit` | GST export views | n/a | `/gst/audit/` |
| `StockLedger` / `StockAdjustment` | inventory code | thousands | ledger screens |

Two middlewares with the **same class name** are both installed (`audit/middleware.py` and `audit/core/middleware.py`), each with its own context object. Two flags decide which system is used: `AUDIT_V2_WRITE_ENABLED` and `AUDIT_V2_READ_ENABLED`; both are `True` in `settings/base.py`.

Pages: `/admin/audit` (the log list, reachable only by a keyboard shortcut and not from any menu) and `/dashboard/accounts/audit` (a stub that says "Audit & Revisions Work in Progress").

---

## 3. Findings

Severity: **P0** = the feature does not do its job now; **P1** = serious; **P2** = should fix; **P3** = polish.

### A. Events are not being recorded

**A1 (P0): the audit worker was removed on 9 Oct.**
- `settings/base.py` routes `create_audit_log_async` to a queue named `audit` (since June). Until 9 Oct, `docker-compose.yml` ran a second worker for it (`celery-audit`, `-Q audit`).
- Commit `9bc8523b` ("restore proper production docker-compose.yml", 9 Oct) deleted that service. The remaining worker runs `celery -A mediflow worker` with no `-Q`, so it only reads the default queue. `celery inspect active_queues` confirms it listens to `celery` only.
- The last `ActivityLog` row is dated 9 Oct. Every `log_activity()` call since then (login, logout, failed login, staff create/edit/delete, batch edit, stock adjustment, expiry write-off, assign supplier, payment, bill print) goes to a queue nobody reads.
- One thing I could not explain: the `audit` list in Redis was empty when I looked. I wanted to test with a harmless probe message, but that was declined, so I stopped. Either way the rows are not in the database. Redis does keep its data on a volume, but it saves only a snapshot (`--save 60 1`, no append-only file), so messages queued in the last minute can be lost if it stops suddenly.

**A2 (P0): nothing would have caught A1.** `apps/audit/tests/conftest.py` forces both V2 flags to `False`, and the tests run background tasks inline (`CELERY_TASK_ALWAYS_EAGER`). So the tests exercise an old path with a worker that is never needed. The path that production actually uses (V2 read) has no test of the list endpoint.

**A3 (P1): the old path is fire-and-forget.** If publishing fails, the code writes a line to a log file and moves on: no retry, no alert, nothing in the UI. The timestamp stored is when the worker ran, not when the action happened. The new path (V2) writes inside the business transaction, so the two systems give different guarantees for the same kind of event.

### B. What the page shows

**B1 (P0): it reads the wrong table.** With `AUDIT_V2_READ_ENABLED = True` the list view returns `ActivityEvent`. The 101 login rows in `ActivityLog` are invisible. The page shows 99 events.

**B2 (P0): every filter does nothing.** In that mode the view sets `filterset_class = None`. I called the API as a super admin: `module=zzz-no-such-module`, `search=zzz-no-such-text` and `timestamp__gte=2099-01-01` each returned all 99 rows. Even in the old mode the date filters could not work: the page sends `startDate`/`endDate`, the backend expects `timestamp__gte`/`timestamp__lte`.

**B3 (P1): the User column says "System" for every human action.** The page shows `user_email || 'System'`. Only 1 of 13 staff accounts has an email address (people log in with a phone number), so everything shows "System". A deleted staff member also becomes "System".

**B4 (P1): the change diff never shows.** The V2 adapter reads a field that does not exist (`payload_json`), so `changes_json` is always empty and the "View Diff" button never appears. (Bill and purchase diffs do exist, but in the revision screens, not on this page.)

**B5 (P1): the CSV export.**
- User and Outlet columns contain raw IDs (V2 mode), not names.
- Text cells that start with `=`, `+`, `-` or `@` (entity labels, descriptions) are written as they are, so Excel can read them as formulas.
- No row limit; the whole file is built in memory.
- Exporting the audit log is not itself recorded.

**B6 (P1): access.** The page code lets `admin` in, but the API only accepts `super_admin`, so an admin sees an "Access Denied" card. There is no menu link, only the shortcut `L` for super admins.

**B7 (P2): page quality.**
- The table header has two columns called "Action", and the empty and loading rows span 7 of 8 columns.
- Export errors use `alert()`.
- The module drop-down is hard-coded and does not match the data: V2 has both `BILLING` and `billing` as modules, and the list lacks `inventory` and `attendance` events that exist elsewhere.
- Filters are not in the URL, there is no event detail view, and an entity is not a link to the document.
- `/dashboard/accounts/audit` is a stub.
- The dashboard calls `/api/v1/dashboard/audit-alerts/`, which returns 404 (the route is defined in a URL file that is not mounted).

**B8 (P2): slow pages.** Building one page of 50 events takes **102 SQL queries**: the adapter looks up the staff member and the outlet for every row. The search box uses a contains-match on unindexed text.

### C. Design

**C1 (P1): too many overlapping systems** (table in section 2), two middlewares with one name, two permission rules (log list = super admin only, revisions = `CanViewAuditHistory`), and no shared vocabulary: module `BILLING` vs `billing`, actions `CREATE`, `UPDATE`, `ADJUST`, `paid_bill_correction`.

### D. Coverage: what is tracked

Found by scanning every write endpoint (82) for an audit call in the view or its service. 13 views mention one. Please treat the "missing" list as "I found no audit call", and check each before relying on it.

| Tracked | Not found |
|---|---|
| Login, logout, failed login (old system, currently lost) | **Creating a sale** (`SaleCreateView`) |
| Staff create / update / delete | Creating a sale return |
| Batch and product edits, stock adjustment, expiry write-off, assigning a supplier (old system, currently lost) | Customer create / edit, **credit-limit change** |
| Payment create, bill print | **Outlet settings** (including the WhatsApp API key, GST settings) and PO settings |
| Purchase create / update, bill corrections and cancels, voucher update, debit-note update, sale-return update (new system) | Voucher create, ledger create / edit, distributor edit and payments, expenses |
| | Bulk data import (Marg), product create, attendance manual edits, PIN lookup / verify |

### E. Integrity and privacy

**E1 (P1): not tamper-proof.** No database triggers, and the application's database user has UPDATE and DELETE on the audit tables. The test suite already documents this as a "known gap". Only `ActivityLog` has a read-only admin; the V2 tables have none.

**E2 (P1): the actor is not preserved.** The old table keeps the user as a link that becomes empty when the person is deleted. The new tables keep only an id string. In the dev data 4 of the 5 people who appear as actors no longer resolve to a staff row. Store the name and role at the time.

**E3 (P1): the context is trusted from the client.** The outlet (`tenant_id`) comes from the `X-Tenant-ID` header or the `outletId` query parameter. The IP comes from the first value of `X-Forwarded-For`, but nginx appends to that header (`$proxy_add_x_forwarded_for`), so a client can supply the first value. Both can therefore be forged.

**E4 (P2): sensitive values.** There is no central redaction. The tests for hiding password and PIN changes are skipped with "GAP: Staff model not registered for audit". Settings changes (API keys) are not logged at all today.

**E5 (P2): outlet is empty on all 101 old rows**, so those rows cannot be scoped to an outlet.

**E6 (P2): no organisation scoping.** The list is not filtered by the super admin's organisation. In the dev data both outlets belong to one organisation, so I could not show a leak, but the code has no check.

**E7 (P2): no retention.** `cleanup_audit_logs` only handles the old table, and nothing schedules it (there is no beat). The new tables have no retention at all.

### F. Smaller points
- Two serializers duplicate the same mapping (`ActivityLog` and `ActivityEvent`).
- `UnifiedRevisionDetailView` mixes both systems depending on record type and the flag.
- Revision snapshots are small today (about 870 bytes each), so size is not a problem yet.

---

## 4. What works well

- Access control is strict and tested for the old path; admin staff really cannot read the log API.
- Bill / purchase / voucher **revisions** (V2) store old and new snapshots and a computed diff, and the bill-history screens use them.
- The write path of V2 is transactional, so a bill correction and its audit record succeed or fail together.
- Login attempts are recorded with IP and user agent (when the worker is running), and failed logins are rate-limited elsewhere.
- Immutability from the API side: there are no edit or delete endpoints.

---

## 5. What I could not check
- The page as a **super admin** in the browser (I only have the shop admin's session, and I do not enter passwords). I called the same API as a super admin from a script instead.
- Production. Everything above is the dev stack and dev database; compare `docker-compose.yml` on the server before assuming it matches.
- A live end-to-end probe of the audit queue (declined).

---

## 6. Decisions I need from you
1. **Who may read the audit trail?** Today: 2 super admins only. Options: let each outlet's admin see their own outlet (recommended), keep super admin for all outlets.
2. **One store or two?** Recommended: keep `ActivityEvent` (V2, written inside the transaction) as the single list and migrate the 101 login rows into it. The alternative is to switch the read flag back and keep the async log, which brings back A3.
3. **How long to keep audit data?** Common choices are 1, 2 or 7 years. Needed before any clean-up is scheduled.
4. **Should a failed audit write block the business action?** (Recommended for money, stock and staff changes.)

## 7. Suggested plan

| Phase | What | Size |
|---|---|---|
| 0 (now) | Restore the audit consumer: either re-add `celery-audit` or, simpler, remove the `audit` routing so the normal worker reads it. Turn on Redis append-only saving (it already has a volume). Add a start-up check and a test that fails if the audit queue has no consumer. | hours |
| 1 | Make the page honest: one source, working filters (module, action, user, dates, search), names instead of "System" and IDs, real diffs from the stored snapshots, formula-safe and capped CSV (exports audited), fix the double "Action" and `colSpan`, fix the N+1 queries, link to the document, add to the menu, let outlet admins in (decision 1). | 1 to 2 days |
| 2 | Coverage: one decorator / mixin for write endpoints; add the missing events (sales, returns, customers and credit limit, settings, vouchers and ledgers, imports, attendance edits); a redaction layer; store actor name and role; one module / action vocabulary. | 3 to 5 days |
| 3 | Integrity: take UPDATE / DELETE away from the application's database user on audit tables (or add triggers); outlet from the logged-in user, not a header; trusted-proxy handling for the IP; organisation scoping; scheduled retention. | 2 to 3 days |
| 4 | Tests: turn the V2 flags on in the audit tests, test the list endpoint filters, add a non-inline worker check. | 1 day |

## 8. Evidence (re-run any time)
- Row counts: `select count(*), min(timestamp), max(timestamp) from audit_activitylog;` and `... from audit_activity_event;`
- Worker queues: `docker exec mediflow_celery celery -A mediflow inspect active_queues` (only `celery`).
- What changed on 9 Oct: `git show 9bc8523b -- docker-compose.yml` (removes `celery-audit`).
- Filters ignored: as a super admin, `GET /api/v1/audit/logs/?module=nonsense` returns the same count as no filter.
- Staff with an email: `select count(*) from accounts_staff where email <> ''` (1 of 13).
