# Users, Roles & Access Control

One reference for who can do what in MediFlow, where each rule is enforced, and how to change it
without reintroducing the bugs this system used to have.

**Principle: the server decides.** The backend enforces every rule on every API call. It also
computes the list of permissions each user holds (`user.permissions`) with the *same* rules and sends it
with login / `/auth/me` / switch-outlet. The frontend only checks membership in that list. Nothing
in the UI is a security boundary; it just mirrors the server so people don't see things that will fail.

## Roles (the only five that exist)

| Role | Meaning |
|---|---|
| `super_admin` | Everything, across all outlets **of their own organization** |
| `admin` | Everything inside their outlet (bypasses the per-user flags) |
| `manager` | Accounts/ledgers/vouchers, credit limits, catalogue; purchases and reports **only with the flags** |
| `billing_staff` | Billing counter: create bills, customers, doctors |
| `view_only` | Read-only (cannot create bills) |

`cashier` and `custom` are **legacy aliases** of `billing_staff`. They keep working (a `custom` user keeps whatever
per-user flags they have) but can never be assigned again. `custom` was written by an old bug in the staff form, which
turned the role into "custom" whenever the permission switches differed from a preset. `owner` is not a role and gets
nothing. List and repair legacy rows with `python manage.py normalize_staff_roles` (dry run) / `--apply`.

Per-user flags (`can_create_purchases`, `can_edit_sales`, `can_access_reports`, …, set in Staff →
edit) grant individual rights to roles below admin. Admin and super_admin always pass flag checks.

## Permissions

Names are the vocabulary the UI uses (`hooks/usePermissions.ts`). Each maps to the DRF class that
actually protects the API (`apps/core/permissions.py`), and `effective_permissions()` computes it.
A backend test (`EffectivePermissionsMatchTheApi`) checks every role × flag combination against
those classes, so the list cannot disagree with enforcement.

| Permission | Who has it | Enforced by |
|---|---|---|
| `view_outlet` | everyone | `IsAuthenticated` |
| `create_bills` | super_admin, admin, manager, billing_staff | `IsBillingStaffOrAbove` |
| `create_purchases` | admin, or flag `can_create_purchases` | `CanCreatePurchases` |
| `view_purchases` | manager+, or any purchase flag | `CanAccessPurchases` |
| `edit_purchases` / `edit_sales` | admin, or the matching flag | `CanEditPurchaseInvoice` / `CanEditSalesInvoice` |
| `view_purchase_rates` | admin, or flag | `CanViewPurchaseRates` |
| `view_reports` | admin, or `can_access_reports` | `CanAccessReports` (also all `/gst/` endpoints) |
| `export_reports` | admin, or `can_export_gst` | GST export views |
| `view_audit_history` | admin, or flag | `CanViewAuditHistory` |
| `manage_partners` | admin, or `can_manage_partners` | `CanManagePartners` (partners, fixed expenses) |
| `edit_vouchers` | admin, or flag `can_edit_vouchers` | `CanEditVouchers` (create/change vouchers; the Daily Report's "Deposit to bank") |
| `view_accounts`, `override_credit` | manager+ | `IsManagerOrAbove` |
| `edit_inventory` | manager+ | `IsManagerOrAbove` (`PUT /batches/<id>/` and `PUT /products/<id>/`: edit a batch's dates/prices/rack, edit a product; NOT `manage_products`, which also lets purchase-flag staff create products) |
| `adjust_stock` | manager+ | `IsManagerOrAbove` (`InventoryAdjustView`: damage, theft, correction, patient return; needs a staff PIN) |
| `manage_products` | manager+, or purchase flags | `CanManageProducts` (create catalogue products) |
| `manage_staff`, `manage_settings` | admin, super_admin | `IsAdminStaff` |
| `send_purchase_orders` | admin, or flag `can_create_purchases` | `CanSendPurchaseOrders` |
| `cancel_purchase_orders` | admin, or flag `can_edit_purchases` | `CanCancelPurchaseOrders` |
| `manage_po_settings` | admin, super_admin | `IsAdminStaff` (+ password re-confirm) |
| `view_all_outlets`, `manage_outlets` | super_admin | outlet-isolation bypass |

## Rules that are easy to get wrong

**Outlet isolation.** `check_outlet_access` looks at *every* outlet id a request names (query and body,
`outletId` **and** `outlet_id`). Regular staff may only use their own outlet; a super_admin only outlets of
their own organization. For views that load a record by id, call `assert_outlet_access(request.user, obj.outlet_id)`
after the lookup: the request-level check cannot know what a URL id belongs to.

**Merged list+create views.** Python takes `permission_classes` from the first base class only. A view like
`class SalesView(SaleListView, SaleCreateView)` silently used the *list* permission for POST. Use
`MethodPermissionMixin` with `method_permissions = {...}` (see `billing/urls.py`, `purchases/urls.py`).

**Import the project's `IsAuthenticated`**, never `rest_framework.permissions.IsAuthenticated`: the DRF one has no
outlet check, and re-importing it lower in a module silently replaces the right one for every class defined after it.
Never write `permission_classes = []` — in DRF that means *no authentication*.

**Staff management** (`can_assign_role`, `can_manage_staff_member`): only a super_admin can create or promote a
super_admin; an admin cannot edit, reset the password of, or deactivate a super_admin; nobody can change their own
role or deactivate themselves; a role must be one of the five. Every create/update/deactivate is written to the
audit log (credentials are logged as `***`, never as values).

**Login.** Only the account's real password or real staff PIN works. Five wrong attempts per phone (or 30 per IP)
in 15 minutes locks that phone for the rest of the window (HTTP 429). PIN lookup/verify/change allow 10 wrong guesses per
user per 5 minutes. PIN hashes are never sent to the client, and PIN checks never put the plaintext PIN in a cache key.

## Editing a saved bill (revision actions)

Every edit of a sale goes through ONE rule set, `check_revision_allowed` in `billing/sale_update_service.py`, whether it
arrives as `POST /sales/<id>/revise/` or `PUT /sales/<id>/`. The kind of edit needs its own right:

| Action | Right needed | Bill state |
|---|---|---|
| `direct_revise` | `can_modify_draft_bill` | unpaid, no returns |
| `commercial_correction` | `can_modify_unpaid_bill` | unpaid |
| `paid_bill_correction` | `can_modify_paid_bill` | paid |
| `return_aware_correction` | `can_modify_bill_with_return` | has a sales return |
| `header_correction` | `can_correct_header_fields` | any |
| `cancel_and_reissue` | `can_cancel_and_reissue_bill` | any |

When a PUT names no action the server infers it from the bill (returns → return-aware, paid → paid-bill, else commercial).
`GET /sales/<id>/modification-options/` returns exactly what the user may do (`allowed_revision_actions`), and the billing
screen picks its action from that. There is no generic "standard_correction" any more. It used to skip every check.
Beyond the action right, **what the edit changes** needs a finer right (`check_correction_scope`): changing the customer needs
`can_correct_customer`, any item quantity (change, add, remove) needs `can_correct_quantities`, and an item rate / discount or
the whole-bill extra discount needs `can_correct_rates_discounts`. Admins bypass them. A migration (`accounts 0028`) gave these
three to everyone who could already edit bills, so nobody is locked out; narrow them per person in Staff -> Edit.

**Stale edits.** `SaleInvoice.updated_at` is the bill's version stamp. `GET /sales/<id>/` returns it as `updatedAt`, the billing
screen sends it back as `expectedUpdatedAt`, and an edit / cancel-and-reissue made from an out-of-date copy is refused with
**409** (`code: stale_edit_conflict`). No stamp sent, or a legacy bill never edited since the column was added, skips the check.

Admin and super_admin pass all of them. **Upgrade note:** users who could edit paid bills, or bills with returns, only because
they held `can_edit_sales` now need the specific right above. Sale-return edits need `can_modify_settled_returns` once the
refund has been paid out.

## The staff form (Staff → Add / Edit)

The role is **only** what the admin picks (Admin / Manager / Billing Staff / View Only); the permission switches never
change it. "Customised" is just a hint shown when the switches differ from the role's defaults, with a *Reset to
defaults* button. All the logic is in `components/staff/staffPermissions.ts` (tested). Rules:

- Picking a role loads that role's default switches; toggling a switch never touches the role.
- **An edit sends only the fields the admin changed** (react-hook-form `dirtyFields`). Six switches stand for several
  backend flags (e.g. *View Audit History* = `canViewAuditHistory` + `canViewBillRevisionHistory`); they are only
  written when that switch is touched, so saving a name change cannot rewrite permissions.
- The phone is the login id: set at creation, read-only afterwards. Joining date is read-only (set by the server).
- Not editable when the server would refuse: your own role, and a Super Admin account (unless you are one).
- Server error messages are shown (`lib/apiError.ts`); success/error toasts use sonner, whose `<Toaster/>` is mounted in
  `app/layout.tsx` (it was missing, so those messages were invisible).

## Frontend pieces

| File | Job |
|---|---|
| `lib/access.ts` | `hasPermission(user, name)`: server list first; local mirror only for sessions cached before the list existed |
| `lib/authMapper.ts` | one lossless mapper for login / me / switch-outlet (it used to drop ~25 of ~30 flags) |
| `lib/routeAccess.ts` + `RouteGuard` | which permission each page needs; blocks typed URLs; waits for the first server refresh before denying |
| `components/shared/SessionSync.tsx` | refreshes the stored user on load, tab focus, every 3 min and right after any API 403 |
| `hooks/useAuthGate.ts` | the login redirect shared by the dashboard / billing / gst / admin layouts |
| `lib/permission-matrix.fixture.json` | generated from the backend; the frontend fallback is tested against it |

## How to add or change a permission

1. Backend: add/adjust the rule in `apps/core/permissions.py` (class **and** `effective_permissions`).
2. Add the class → name pair to `CLASS_FOR` in `apps/accounts/tests/test_access_control.py`.
3. `python manage.py dump_permission_matrix` (rewrites `apps/frontend/lib/permission-matrix.fixture.json`).
4. Frontend: mirror the rule in `fallbackPermissions` (`lib/access.ts`), add the name to the `Permission` type, and run
   `npx jest tests/unit/access.test.ts` — it fails until the mirror agrees with the fixture.
5. Gate the page in `lib/routeAccess.ts` and/or the nav (`lib/navConfig.ts`) if it needs one.

Run the backend tests with the in-memory cache: `REDIS_URL=memory:// CELERY_TASK_ALWAYS_EAGER=True
DJANGO_SETTINGS_MODULE=mediflow.settings.test_sqlite pytest apps/accounts/tests/test_access_control.py`.

## Known limits (decisions, not bugs)

- **Cashier-switch PIN is verified on the server but not *bound* to the bill.** The billing terminal looks a PIN up, then
  sends `billedBy=<staff id>` with the sale. The server now requires that staff to be active and in the same outlet, but a
  logged-in billing user could still claim a colleague's id (and that colleague's higher discount limit). Closing this
  needs a short-lived signed token from the PIN lookup that the sale must present: a coordinated frontend + backend change.
- `POST /receipts/` and `POST /expenses/` are open to any signed-in user because cashiers collect payments there. Restrict them
  only if that is not how your counters work.
- The 4-digit staff PIN doubles as a login password (rate-limited, but still a small space). Consider requiring the real
  password for login and keeping the PIN for the counter only.

## Switching outlets (super admin)

The server owns "which outlet am I in": `switch-outlet` saves it on the staff record (only to an **active**
outlet of the caller's own organization) and login, `/auth/me` and switch-outlet all report it. The browser
must never keep its own, separately saved copy.

* Switch only through `switchOutlet()` in `apps/frontend/lib/outletContext.ts`; never hand-copy the store updates
  (the header and the chain dashboard each did, in a different order, and each missed something). Callers then do
  a full page load.
* `settingsStore.selectedOutletId` is in memory only. It used to be saved inside the per-outlet settings bucket,
  so A -> B -> A loaded "B" while the server said "A" and every `?outletId=` call hit the wrong outlet. Do not
  add it back to the persisted state.
* Org ids sent by the browser (`orgId`) are checked against the caller's own organization with
  `own_organization_or_404` (`core/chain_views.py`); never `get_object_or_404(Organization, id=<from request>)`.
* A malformed `outletId` is answered 403 by `check_outlet_access`, not 500.
