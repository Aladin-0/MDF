# Audit trail: research and improvement plan

Plan only. Nothing here is built yet. It follows `docs/AUDIT_FEATURE_REPORT.md` (what is wrong today).

**Decisions already made by you:** only the **super admin** can see the audit trail; keep data for **1 year**, then remove it; the goal is a trail that is **easy to understand** and shows **suspicious behaviour**, so you always know **what changed, when, and who did it**.

---

## 1. What the research says

### How other systems do it
| Source | What to copy |
|---|---|
| **TallyPrime "Edit Log"** (the accountants' standard in India) | Every voucher or master that is created, changed, resaved or **deleted** stays in the log. Each entry shows version, activity, user and date/time. A **user-wise summary** (how many each person created / altered / deleted) with drill-down, and a **side-by-side comparison of two versions**. A deleted or cancelled voucher is never really gone. [Edit Log](https://help.tallysolutions.com/edit-log/tracking-modifications), [Edit Log Summary](https://tallysolutions.com/tally/edit-log-summary-report/), [audit trails for auditors](https://tallysolutions.com/business-guides/tallyprime-audit-trails-and-controls-to-satisfy-external-auditors/) |
| **OWASP logging guidance** | Every event answers *when, where, who, what*; log authentication successes and failures; use synchronised time; keep audit logs apart from technical logs. [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) |
| **Tamper-evident design** | Capture at the point of action (a missing event cannot be detected from inside the log); the app's database user should only be able to **insert**; optionally chain each row to the previous one with a hash and anchor it outside the database. Tamper-**evident**, not tamper-proof. [Tamper-evident audit trails](https://appmaster.io/blog/tamper-evident-audit-trails-postgresql), [system design notes](https://techinterview.org/system-design-audit-log/) |
| **Retail POS exception reports** | The same few signals catch most trouble: **voids/cancellations, refunds, manual discounts, price overrides, sales below cost, activity outside opening hours**, one person far above their peers. Score events by amount, frequency and time of day. Honest limit: vendors report that automated monitoring catches only a small share of theft; tips and routine review matter as much. So: few, high-signal rules, clear wording, a habit of looking. [POS exception reporting](https://blog.agilenceinc.com/pos-exception-reporting-how-lp-teams-use-transaction-data-to-detect-fraud), [red flags](https://www.lifelongpos.com/resources/blog/employee-theft-red-flags-pos) |

### Rules that may apply to you (please confirm with your accountant)
*These come from secondary sources, not the official notifications.*
- **Companies (Accounts) Rules (audit trail / edit log):** if SAI Medical is a **company**, accounting software must keep an edit log of every change that cannot be switched off. Commentary advises keeping it for **8 years**. Not applicable to a proprietorship or partnership. [ClearTax](https://cleartax.in/s/audit-trail-applicability), [Deloitte note](https://www2.deloitte.com/content/dam/Deloitte/in/Documents/risk/in-ra-mandatory-accounting-audit-trail-feature.pdf)
- **GST:** books and records for **72 months** from the due date of the annual return (these are the invoices themselves, which stay in the database whatever the audit log does). [Masters India](https://www.mastersindia.co/books/advanced-topics-in-gst-compliance-and-procedures/accounts-and-records-section-35-36/)
- **Drugs and Cosmetics Rules:** sale memos for about **3 years** (sources differ; some say 2). [rule text excerpt](https://future.indiankanoon.org/doc/170557774/)

**What this means for "keep 1 year, then remove":** the *bills, purchases and stock* are kept far longer (they are the records). Only the **change history** is removed after 1 year, so after a year you will still see the bill but not who edited it. That is fine for a proprietorship or partnership. **If the business is a company, the law commonly advised is 8 years for the edit log.** Storage is not the reason to shorten it: one year is about 50 MB per outlet, so 8 years is about 400 MB. I will build retention as a **setting (default 365 days)** so changing it later is one number, not a code change.

---

## 2. What you will get

One screen for the super admin with four parts, all in plain language.

```
Audit                                     [Needs attention 3] [Activity] [People] [Settings]
─────────────────────────────────────────────────────────────────────────────────────────────
NEEDS ATTENTION
 ● CRITICAL  Sainath removed 122 batches from stock in one go (₹40,194), 14 of them not yet expired.
             Today 9:52 pm · from the shop network · Remove from stock        [Open] [Reviewed] [Not a problem]
 ● WARNING   Asha edited 4 paid bills in one day (usual: 0 or 1).
             13 Nov · bills INV-2026-001720, ...                              [Open] [Reviewed] [Not a problem]

ACTIVITY    [Everyone ▾] [Everything ▾] [Today | 7 days | 30 days | custom] [₹ any ▾] [flagged only ☐] [search]
 10:42  Asha        changed the rate of Dolo 650 on bill INV-2026-001754 from ₹30.00 to ₹35.00      ⚑ below cost
 10:31  Ramesh      signed in from a new phone (Android, 192.168.1.40)                              ⚑ new device
 09:58  Asha        cancelled bill INV-2026-001751 (₹1,240, paid by cash)  Reason: "customer left"
```
Click a line: a side panel shows **before → after** for every field, who/when/from where (name, role, outlet, phone or browser, IP, and whether it was inside the shop network), the reason, other events on the same bill, and **Open the bill** (the same preview as elsewhere).

### The one sentence rule
Every event is stored with a ready-made sentence in the form **"who did what to what, how much, why"**, plus the structured before/after list. People read the sentence; the data stays exact. Example sentences are written once, in one file (`audit/vocabulary.py`), so wording is the same everywhere.

---

## 3. Design

### 3.1 One store, one vocabulary
- Keep **`ActivityEvent`** (the newer table, written inside the transaction so the action and its record succeed or fail together) as the single list. Extend it additively with: actor name, role and outlet (**snapshot** at the time), a stored sentence, a `changes` list (field label, before, after), an amount, `occurred_at` (the real event time), device summary, `inside_shop_network`, and `flags`.
- **Backfill** the 101 old login rows into it. Keep `DocumentRevisionV2` (full before/after snapshots for bills, purchases and vouchers; already used by the bill history screens).
- Turn `log_activity()` into a thin wrapper that writes `ActivityEvent` synchronously, so the 15 existing call sites keep working and **nothing depends on a background worker any more** (this alone fixes the 9 Oct problem). Remove the separate `audit` queue.
- One controlled list of actions (examples): `bill.created`, `bill.edited`, `bill.cancelled`, `bill.printed`, `price.overridden`, `discount.given`, `return.created`, `stock.written_off`, `stock.adjusted`, `batch.edited`, `credit_limit.changed`, `staff.created`, `staff.role_changed`, `staff.pin_changed`, `settings.changed`, `login.succeeded`, `login.failed`, `login.new_device`, `data.exported`, `data.imported`, `audit.exported`. One spelling for modules (the `BILLING` / `billing` split disappears).

### 3.2 What gets tracked (by risk)
| Group | Events |
|---|---|
| **Money** | sale created / edited / cancelled / deleted, discount, price or rate override, sale below cost, sale return, payment received, credit limit, credit write-off, vouchers, ledgers, expenses, distributor payments |
| **Stock** | stock adjustment and write-off (single and bulk), batch edit and the Edit-all grid, product edit, expiry removal, supplier assignment, stock ledger repair, imports |
| **People and access** | sign-in, failed sign-in, new device or place, sign-in outside working hours, staff created, role or permission change, PIN or password change (never the value), deactivate / reactivate |
| **Settings** | outlet, GST, print, attendance IPs, WhatsApp key (recorded as "changed", never the key), expiry days |
| **Data** | every export (including of the audit log), imports, backups |
| **Documents** | print and reprint of a bill |

How: one mixin / decorator for write endpoints (`@audited(...)`) plus one helper `audit.record(...)`, and a **redaction list** (passwords, PINs, tokens, API keys are recorded as "changed", never as values). A test lists every write endpoint and fails if one is neither audited nor on an explicit "not needed" list, so new features cannot silently skip it.

### 3.3 Suspicious behaviour (explainable rules, no black box)
Each rule creates a **flag** that says in words *why*, shows the *evidence* (the linked events) and can be **reviewed or dismissed with a note**. Thresholds are visible and adjustable by the super admin. Start with these (from the research, matched to a pharmacy):

| # | Rule | Example wording |
|---|---|---|
| 1 | **Paid bill edited or cancelled** (after payment, after day close, or after N days) | "Asha edited 4 paid bills in one day (usual: 0 or 1)" |
| 2 | **Back-dated bill** (date earlier than today by more than N days) | "Bill INV-… dated 9 days ago, entered today" |
| 3 | **Big discount** (above the person's limit, or far above peers) | "12% discount on a ₹2,400 bill; Ramesh's limit is 5%" |
| 4 | **Price changed at billing / sold below cost** | "Dolo 650 sold at ₹22, cost ₹26" |
| 5 | **Many cancellations or returns by one person** (count or share of their bills, compared with others) | "Ramesh cancelled 6 bills today; others: 0 to 1" |
| 6 | **Bulk or odd stock write-off** (large quantity or value, at night, not expired, written off then sold) | "122 batches (₹40,194) removed at 9:52 pm, 14 not yet expired" *(this really happened on 17 Nov)* |
| 7 | **Negative stock or a ledger correction** | "Balance of batch X went below zero" |
| 8 | **Credit limit raised, or sale over the limit** | "Credit limit of Mr. Patil raised from ₹5,000 to ₹50,000" |
| 9 | **Staff and access changes** (new admin, role up, someone else's PIN changed, reactivated account) | "A new Admin was created by Ramesh" |
| 10 | **Sign-in signals** (several failures, new device, outside hours or outside the shop network) | "5 wrong passwords for Asha in 10 minutes" |
| 11 | **Settings changes** (GST, WhatsApp key, attendance IPs) | "Attendance IP list changed" |
| 12 | **Big exports or imports, audit-log export** | "Customer list exported (1,240 rows)" |
| 13 | **Purchase edited after posting, or purchase rate jumped** | "Rate of Amoxil up 40% on the new invoice" |
| 14 | **Out-of-hours high-value action** (uses the opening and closing time in settings) | "₹18,000 bill edit at 1:10 am" |

Severity: **info / notice / warning / critical**, from amount, how unusual it is, and time of day. To avoid alert fatigue the first release ships a **small set (about 8)** that are tuned on your own history, then you add more.

How they run: single-event rules are checked at the moment of the action; "compared with peers / per day" rules run every 15 minutes from a scheduler (the project has **no scheduler today**, so a small `celery-beat` service is added; the retention purge uses it too). A **daily summary** goes to the super admin (screen badge first; WhatsApp or email later, using the existing WhatsApp setting).

### 3.4 Screens
1. **Needs attention** (home): flags newest and most severe first; each has the sentence, who, when, amount and three buttons (Open, Reviewed, Not a problem + note). A badge with the count on the Audit menu item.
2. **Activity**: the plain-language feed above. Filters use words, not codes (Everything, Money, Stock, People, Settings, Data), person, date and **time of day**, amount range, flagged only, search. Filters live in the URL. Phone layout is cards.
3. **People**: one person at a time: last sign-in and devices, what they did this week by category, how they compare with the others (the Tally "user-wise summary" idea), flags about them.
4. **History tab on documents**: on a bill, purchase, customer, product and batch (super admin only), the same events for just that document.
5. **Edit log report** for your accountant: per person, how many records were created, altered, deleted, with drill-down, as Excel/PDF (formula-safe, names not IDs, capped, and the export itself is logged).
6. **Settings**: keep data for N days (default 365), working hours, rule thresholds, who receives the daily summary.

### 3.5 Integrity and retention
- **Append-only:** take UPDATE and DELETE away from the application's database user on the audit tables; the purge job uses its own limited role. (Today the app can edit or erase history.)
- **Server-side truth:** the outlet comes from the signed-in user, not from a request header; the IP is read through the trusted proxy setting (today a client can forge it by sending its own `X-Forwarded-For`).
- **Optional later:** a daily hash of the day's events kept outside the database, so tampering is detectable.
- **Retention:** nightly job removes events older than the setting (default 365 days) in small batches and records one "purge" event with the counts. The old and new tables are both covered.
- **Time:** the event time is stored when the action happens, not when a worker gets round to it.

### 3.6 Fixes folded in (from the report)
Working filters; names instead of "System" and IDs; real diffs on the page; the Access Denied wording explains that this is for the super admin; one "Action" column; no `alert()`; 2 queries per page instead of 102; the stub page and the dead `/dashboard/audit-alerts/` call removed; the module list comes from the data.

---

## 4. Phases

| Phase | What you get | Size |
|---|---|---|
| **0. Stop the bleeding** | `log_activity()` writes straight to `ActivityEvent`; remove the `audit` queue; Redis append-only saving; a test that fails if an audit write needs a worker | hours |
| **1. Understandable feed** | extended table + backfill + vocabulary and sentences + actor snapshot; new Activity page (filters, drawer with before→after, document links); fixed, names-based, capped export | 2 to 3 days |
| **2. Coverage** | the `@audited` mixin on all write endpoints, the full event list in 3.2, redaction, and the "every write endpoint is audited" test | 3 to 4 days |
| **3. Suspicious behaviour v1** | flags table, about 8 rules, Needs attention screen with review workflow, scheduler, badge | 3 to 4 days |
| **4. People and history** | People view, History tabs on documents, Edit log report for the accountant | 2 to 3 days |
| **5. Integrity and retention** | append-only permissions, trusted IP and outlet, retention setting and nightly purge, daily summary | 2 days |
| **6. Tests and rollout** | audit tests with the new system ON, an integration test with a real (not inline) worker or no worker at all, and a dry run of every rule on your own data before alerts go live | 1 to 2 days |

About **2.5 to 3 weeks** of focused work in total. You get a trustworthy, readable "who changed what and when" after **Phases 0 and 1 (about 3 days)**. Each phase is shippable on its own and changes no existing business behaviour (only adds records and screens).

### Risks and how they are handled
- **Audit failure blocking a sale:** the audit write is inside the transaction for money, stock and staff changes (so there is never an action without a record), but it is a single local insert; if you prefer sales never to be blocked, we can make an exception for billing only (please tell me).
- **Too many flags:** start with about 8 rules, dry-run on your history first, dismissals teach what to tune.
- **Privacy:** the trail is super-admin only; secrets are never stored; phone numbers of customers appear only where a bill already shows them.
- **Old data:** the 101 login rows and 99 events are kept and shown in the new feed.

## 5. What I still need from you
1. **Retention:** confirm 1 year is right for your business type (see the legal note in section 1).
2. **Who gets the daily summary:** just on screen, or WhatsApp/email to a number too?
3. **Billing exception:** should a failed audit write ever stop a sale? (I recommend no exception.)
4. **Working hours** to use for "outside hours": the opening and closing time already in Settings?
