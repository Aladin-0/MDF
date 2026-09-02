# GST Sandbox Local Data Diagnostic Report

**Generated:** 2026-08-19T19:01 IST (13:31 UTC)
**Environment:** Development (local)
**Executed by:** Antigravity diagnostic scan — read-only

---

## 1. Database Configuration

| Field | Value |
|---|---|
| Django settings module | `mediflow.settings.dev` |
| Environment | **Development** (`DEBUG=True`) |
| Database engine | `django.db.backends.postgresql` |
| Database name | `mediflow` |
| Database host | `localhost` |
| Database password | *(not inspected — never printed)* |

**Migration state:**
- Migrations applied: **121**
- Last migration applied: `reports.0004_gstexportaudit` at **2026-08-16 13:56:46 UTC**
- All expected app migrations appear to be current.

**Assessment:** The database is the PostgreSQL `mediflow` instance on `localhost`. It was last migrated on 2026-08-16 and is **not** a fresh/empty database. The database contains existing data and export audit records dated as recently as 2026-08-19.

---

## 2. Current Data Counts (Read-Only Inspection)

| Entity | Count |
|---|---|
| Staff (users) | **1** |
| Active staff | **1** |
| Superuser staff | **1** |
| Organizations | **2** |
| Outlets | **3** |
| `SandboxConfiguration` records | **0** |
| `GstTaxpayerAuth` records | **0** |
| `GSTExportAudit` records | **30** |
| `ITCReconciliationRun` records | **6** |
| `GSTR2BData` records | **0** |

### Staff Records

| Field | Value |
|---|---|
| Staff ID | `8e15638a-2183-495a-8545-00761ed786d1` |
| Phone | `999****999` (9 digits, starts/ends 999) |
| Email | none |
| Role | admin |
| Is active | True |
| Is superuser | True |
| Outlet assigned | `1293bd99-df6f-4f72-a088-210ae59594a7` ("Test Outlet") |
| Created at | 2026-08-16 11:59 UTC |

### Outlet Records

| ID | Name | Masked GSTIN | State | State Code | Active | Created |
|---|---|---|---|---|---|---|
| `1293bd99-...` | Test Outlet | `***M1Z2` | *(empty)* | *(empty)* | True | 2026-08-16 17:08 |
| `41574f71-...` | SEED-Ahmedabad Outlet | `***B1Z5` | GJ | *(empty)* | True | 2026-08-16 11:59 |
| `a1c03b48-...` | SEED-Mumbai Outlet | `***L2ZX` | MH | *(empty)* | True | 2026-08-16 11:59 |

> [!NOTE]
> The SEED outlets were created by the `seeder.py` management command. Their `state_code` fields are empty — the `save()` hook that derives `state_code` from `state` uses the full state name (e.g. `"Maharashtra"`), but the seeder sets the state shorthand (e.g. `"MH"`) which does not match any key in `_STATE_CODES`, leaving the field blank.

### Recent Export Audit Records (last 5)

All 30 export audit records belong to outlet `1293bd99-...` ("Test Outlet"), all of type `GSTR1_EXCEL`, periods `092026` and `102026`, most recently at 2026-08-19 18:05 UTC. This is the outlet the only superuser is linked to.

---

## 3. Root-Cause Identification

**Conclusion: C — Test user and outlet exist but are misconfigured / mismatched for sandbox GST integration.**

### Evidence

1. **Login failure is not due to a missing user.** One active superuser (`Staff`) exists with phone `9999999999` and the `admin` role. The `print_test_credentials` command even documents this phone number as the expected test user.

2. **The user is assigned to the wrong outlet for sandbox testing.** The superuser is linked to outlet `"Test Outlet"` (GSTIN `27AADCB2230M1Z2`). The sandbox GSTIN configured in `.env` is `GSTIN=27AAPCM1753L2ZX`, which belongs to the `"SEED-Mumbai Outlet"` (`a1c03b48-...`). **No staff member is linked to the sandbox outlet.**

3. **The sandbox outlet (`SEED-Mumbai Outlet`) has zero associated staff users.** Any GST sandbox API flow that resolves the outlet from the authenticated user's `outlet_id` will therefore resolve the wrong GSTIN, or fail if it explicitly checks the user's outlet against the sandbox GSTIN.

4. **`SandboxConfiguration` table is empty (0 records).** The `SandboxConfiguration` model exists (table `core_sandboxconfiguration`) and is designed to store per-outlet sandbox credentials. No record has been created. The `check_sandbox_auth` management command and `sandbox_auth.py` service will find no configuration to work with.

5. **`GstTaxpayerAuth` table is empty (0 records).** This means no OTP session exists, which is expected for a fresh start — but it also confirms the entire GST auth flow has never been exercised for the sandbox outlet in the current DB state.

6. **The "Test Outlet" has blank `state` and `state_code` fields,** and no `drug_license_no`, which suggests it was created manually or by a script that bypassed field validation. This outlet is incomplete for a real GST workflow.

7. **The `seeder.py` creates SEED outlets with dummy GSTINs** (`27AAAAA0000A1Z5`, `24BBBBB0000B1Z5`), not the actual sandbox GSTIN. The existing `SEED-Mumbai Outlet` has the real sandbox GSTIN (`27AAPCM1753L2ZX`) — suggesting it was either corrected manually or by a previous seed pass that was DB-aware.

8. **30 export audit records exist for the wrong outlet.** All GSTR-1 exports from prior sessions targeted `Test Outlet` (GSTIN `27AADCB2230M1Z2`), not the sandbox GSTIN outlet.

### Most likely login failure cause

The login endpoint authenticates by **phone number**. The test user phone `9999999999` exists and is active, so login itself should succeed via the API. The failure is most likely one of:
- A UI/frontend form pointing at a different port or origin
- The authenticated user's outlet not matching what GST sandbox routes expect
- A direct test against a GST-restricted endpoint using the wrong outlet context

---

## 4. Safe Recovery Sources Available

The following **existing** recovery resources were found (read-only audit):

| Resource | Path | Relevance |
|---|---|---|
| `seeder.py` | `apps/core/management/commands/seeder.py` | Creates SEED orgs/outlets/products/staff — does NOT create a sandbox-linked staff |
| `seed_local_gst_test_data.py` | `apps/core/management/commands/seed_local_gst_test_data.py` | Wraps `seeder.py` — same limitation |
| `print_test_credentials.py` | `apps/core/management/commands/print_test_credentials.py` | Confirms expected test phone `9999999999` |
| `reset_test_db_state.py` | `apps/core/management/commands/reset_test_db_state.py` | **Truncates entire DB** — destroys existing data; use with caution |
| `check_sandbox_auth.py` | `apps/gst/management/commands/check_sandbox_auth.py` | Verifies sandbox credentials — safe post-fix validation tool |
| `SandboxConfiguration` model | `apps/core/models.py` | Exists, table present, 0 records |
| `.env` non-secret vars | `.env` | `GSTIN=27AAPCM1753L2ZX`, `GST_USERNAME=Manavata_062025`, `SANDBOX_BASE_URL=https://api.sandbox.co.in` |

**No fixture files** (`.json` Django fixtures) containing outlet/user seed data were found.

**No `seed_gst_sandbox_demo` command** exists yet. The nearest equivalent is `seed_local_gst_test_data` which does not cover the sandbox-user linkage.

---

## 5. Proposed Deterministic Fix

### Diagnosis Summary

The three specific gaps to close are:

| Gap | Fix Required |
|---|---|
| No staff linked to sandbox outlet | Reassign the existing superuser to sandbox outlet, OR create a dedicated sandbox staff user in that outlet |
| No `SandboxConfiguration` record | Create one, linked to the sandbox outlet, reading credentials from `.env` (non-secret fields only) |
| Sandbox outlet missing `state_code` | Populate `state_code = '27'` (Maharashtra, per GSTIN prefix `27`) |

### Proposed `seed_gst_sandbox_demo` management command design

**File:** `apps/gst/management/commands/seed_gst_sandbox_demo.py`

**Behavior:**
1. **Guard:** Refuse to run unless `DEBUG=True` and database name is not `mediflow_prod` (or if `ENVIRONMENT` env var is `production` or `staging`). Print clear warning and exit.
2. **Read config** from environment variables (already in `.env`):
   - `GSTIN` → sandbox outlet GSTIN (non-secret)
   - `GST_USERNAME` → gst_username field (non-secret)
   - `SANDBOX_BASE_URL` → base_url (non-secret)
3. **Outlet (idempotent):** `get_or_create` outlet with `gstin=GSTIN`. If it exists (the `SEED-Mumbai Outlet`), update its `state="Maharashtra"`, `state_code="27"`, add marker `gst_username=GST_USERNAME`. Never delete.
4. **SandboxConfiguration (idempotent):** `get_or_create` for the outlet. Set `base_url`, `active=True`. Do NOT set encrypted credentials — those require the user to populate through the secure admin flow.
5. **Staff user (idempotent):** `get_or_create` a `Staff` with `phone="9999999999"`. If it exists, reassign `outlet` to the sandbox outlet if not already assigned. **Never set or print password.**
6. **Post-run output (safe):**
   ```
   Environment:    development
   Outlet name:    SEED-Mumbai Outlet
   Outlet ID:      a1c03b48-...
   Sandbox GSTIN:  27AAPCM175****ZX
   Staff phone:    999****999
   State code:     27 (Maharashtra)
   SandboxConfig:  created/already exists
   
   *** PASSWORD RESET REQUIRED ***
   If you need to set/reset the password, run:
       python manage.py reset_user_password --phone 9999999999
   Do NOT store the password in code or documentation.
   ```
7. **Audit log:** Create one `ActivityLog` entry (if the model supports it) recording that this local seed was run.

> [!IMPORTANT]
> This proposal does not create or print any password. Password setup must go through the project's local admin flow (`createsuperuser`, `changepassword`, or `reset_user_password` if it exists).

> [!WARNING]
> Do not run `reset_test_db_state.py` — it truncates the entire database including all existing export audit records, migration history, and 30 GSTR-1 export logs.

---

## 6. Login Recovery Rule

**Current status of the test user:**
- Staff with phone `9999999999` → **exists and is active**
- The `print_test_credentials` command documents this user with role `admin`

**To reset the password locally without exposing it:**
```bash
cd /home/asta/coding/MDF/apps/backend
venv/bin/python manage.py changepassword 9999999999
```
This is the safe, standard Django flow. Do not store the result in code or documentation.

---

## 7. Approval Required

**Before any modification is made**, explicit approval is required for:

| Action | Requires Approval |
|---|---|
| Create `seed_gst_sandbox_demo` management command | ✅ Yes |
| Reassign existing staff user (`9999999999`) to sandbox outlet | ✅ Yes |
| Create `SandboxConfiguration` record (no credentials, non-secret fields only) | ✅ Yes |
| Fix `state_code` on SEED-Mumbai Outlet | ✅ Yes |
| Any password reset | ✅ Yes — done manually by user, never by agent |

**Nothing has been modified.** This is a read-only diagnostic report.
