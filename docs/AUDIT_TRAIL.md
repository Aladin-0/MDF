# Audit trail (super admin only)

Read this before changing `apps/audit/`, adding something that should be on the trail, or touching `/admin/audit`.
Background and research: `AUDIT_FEATURE_REPORT.md` (what was broken), `AUDIT_IMPROVEMENT_PLAN.md` (the design).

## What it is
One store, `ActivityEvent`, written **synchronously** through one function, `apps/audit/recorder.py::record()` (or `safe_record()`).
The page `/admin/audit` has four tabs: Needs attention (flags), Activity (feed), People, Settings. Only the **super admin** can open it
(`view_audit_trail` permission, `audit.permissions.IsSuperAdmin`), and every query is scoped to the super admin's own organisation.

Why synchronous: until 2026-11 events went through a Celery task on a queue (`audit`) that no worker consumed after commit 9bc8523b,
so they were silently lost. There is no audit queue any more. `create_audit_log_async` only drains stale messages.

## Adding something to the trail
1. Add a code to `apps/audit/vocabulary.py::CODES` with its sentence template (`'{actor} cancelled bill {entity}{amount_text}{reason_part}'`).
   Write sentences a shop owner understands; never show a raw field name or id.
2. Call `recorder.safe_record('your.code', actor=request.user, outlet=outlet, request=request, entity=obj, amount=..., reason=..., changes=[...], metadata={...})`
   **after** the action succeeded. `safe_record` can never undo the action (savepoint + swallow + counted failure shown on the Settings tab).
   Use plain `record()` only where the record must commit with the action (the revision orchestrator does).
3. Put the facts a rule needs in `metadata` (`discount_pct`, `days_back`, `value`, `not_expired`, `role_to`, ...).
4. Old call sites still use `services.log_activity(...)`, which is a shim over `safe_record`; give it `code=`.

## What is never stored
Values of anything whose name contains password / token / secret / api_key / authorization / credential, or the whole words `pin` / `otp`
(`recorder.is_sensitive`; `pincode` and `shipping` are not secrets). The event says "changed", the value becomes `HIDDEN`. Phone numbers of failed
sign-ins are masked (`98•••••210`). Never put a secret in `metadata` or `ctx`.

## IP and device
`recorder.client_ip` trusts `X-Real-IP` only when the direct peer is private (our nginx sets it from `$remote_addr`). It never reads the first
`X-Forwarded-For` entry (forgeable). `inside_network` compares with the shop's allowed IP list (Settings, attendance); `null` when no list is set.

## Suspicious-behaviour rules (`apps/audit/rules.py`)
Each rule is plain and explainable, produces a sentence ("Asha cancelled 6 bills today (usual: 1)") plus evidence, and creates an `AuditFlag`
that a person reviews ("I checked this" / "Not a problem" with a note). Rules run after commit (`transaction.on_commit`; in tests wrap the
action in `self.captureOnCommitCallbacks(execute=True)`). One flag per rule + person + day (`dedupe_key`), a spike is one flag that grows.
Thresholds and on/off live in `AuditPolicy.rules_json`, edited on the Settings tab; defaults are `rules.RULES`.
Tune on real data first: `python manage.py audit_rules_dry_run` (writes nothing).
A new rule = a function `r_<rule_code>(event, policy) -> FlagSpec | None`, an entry in `RULES`, in `RULE_FUNCS`, and a test.

## Retention and integrity
* Keep **365 days** by default, a setting (30 to 3650). `policy.purge()` removes older events (+ their flags) and the old `ActivityLog`; it runs by itself
  about once a day after an event write, or `python manage.py purge_audit_events [--apply]` (dry run by default). It does NOT touch
  `DocumentRevisionV2` (bill/purchase revision numbers and the cancel / re-issue link live there).
* Migration `0009_append_only` adds a Postgres trigger: no DELETE, and no UPDATE except `flag_count` / `severity`, unless the transaction says
  `SET LOCAL audit.allow_purge = 'on'` (the purge does; tests use `factories.allow_history_rewrite()`). It stops bugs and ad-hoc ORM calls, not a DBA.
* `python manage.py backfill_audit_events [--apply]` copies old `ActivityLog` rows into the new feed (idempotent, dry run by default).
  Applying it on a real database is a decision for the owner.

## API (all `IsSuperAdmin`)
`GET /audit/events/` (filters: actor, category, code, module, severity, flagged, from, to, hourFrom, hourTo (wraps midnight), amountMin, amountMax, entityType, entityId, q; page, pageSize <= 100),
`GET /audit/events/<id>/`, `GET /audit/flags/`, `POST /audit/flags/<id>/review/`, `GET /audit/summary/`, `GET /audit/people/`, `GET /audit/people/<id>/`,
`GET /audit/export/` (Excel, formula-safe, capped at 20,000, the export is itself recorded), `GET /audit/edit-log/[?export=xlsx]`, `GET|PUT /audit/policy/`.
Bad filter values are a 400 `BAD_FILTER`, never a 500. `/audit/logs/` and `/audit/logs/export/` are kept as aliases.

## Frontend
`lib/audit.ts` (types, filters -> query string, grouping, wording helpers), `lib/auditApi.ts`, `components/audit/*`, `app/admin/audit/page.tsx`.
Gate with `hasPermission('view_audit_trail')`, never a role string. Show the server's `summary` as is.

## Scope notes
* Organisation scope: events with no outlet (a failed sign-in for a number nobody owns) are shown only when the installation has exactly one organisation; with several they are hidden so they cannot leak between organisations.
* "Paid bill" rules read `metadata.was_paid`, set by the revise / PUT paths from the bill's `amount_paid` BEFORE the change. A PUT is recorded as the *effective* action (`effective_revision_action`), so editing a paid bill is `bill.corrected_after_payment` even if the client sent a generic action.
* Cancel-and-reissue is recorded as `bill.reissued` ("cancelled and re-issued bill ..."). `bill.cancelled` is kept for older rows and counts the same in the rules.
* Every `code` a rule reads has an emitter (grep `safe_record('<code>'` / `record_activity`); do not add a rule for a code nothing writes.

## Known limits
* Coverage: sales (create, cancel, revision), payments, credit limit, stock adjust / write-off / ledger repair, staff, settings, sign-in, exports and the
  trail's own actions are recorded. Purchases and vouchers are recorded by the revision orchestrator (their revision history). Anything else still
  using `log_activity` is recorded under an inferred code; add a proper code when you touch it.
* A failed audit write does not block the business action (it is counted and shown red on the Settings tab and logged as `AUDIT WRITE FAILED`).
* The old `/audit/logs/` CSV export is now Excel.
