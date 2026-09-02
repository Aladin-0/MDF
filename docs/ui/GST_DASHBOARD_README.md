# GST Dashboard MVP

## Overview
The GST Dashboard is the central hub for reviewing and exporting GST returns data (GSTR-1 and GSTR-3B) from the Mediflow pharmacy billing system. It is designed to give the pharmacy owner or their CA a quick, actionable summary of their tax liabilities, ITC claims, and validation issues before exporting the data to the GST Portal.

## Location
- Route: `/gst`
- Source code: `apps/frontend/app/gst` and `apps/frontend/components/gst/`
- Backend APIs: `apps/reports/dashboard_views.py`

## Features Implemented in MVP
1. **Period Selection**: View available financial periods and their validation statuses (Ready for Export vs. Action Required).
2. **KPI Ribbon**: Top-level metrics comparing current period to previous (MoM %):
   - Total Sales (B2B + B2C)
   - Outward Tax Liability
   - Eligible ITC (Claimed)
   - Net Cash Payable
3. **Validation Panel**:
   - Displays blocking errors (e.g., negative ITC, missing HSN codes) that prevent JSON export.
   - Displays warnings (e.g., negative tax in B2C) that don't block export but require CA review.
4. **Summary Cards**:
   - GSTR-1: Breakdown of sales (B2B, B2CS, B2CL, Notes) and HSN summary count.
   - GSTR-3B: Breakdown of outward tax, eligible ITC, and final cash payable grouped by IGST, CGST, and SGST.
5. **ITC Reconciliation Widget**:
   - Matches purchase register data against GSTR-2B.
   - Highlights deferred ITC lifecycle (newly deferred, claimed this period, and balance carried forward).
6. **Export Tools**:
   - 1-click download of GSTR-1 and GSTR-3B JSON payloads, strictly conforming to GSTN schema. Export is disabled if blocking errors are present.

## Testing with Mock Data
To evaluate the dashboard locally without connecting to live GSP APIs, use the provided mock data seeder.

```bash
# We use PostgreSQL for local testing. SQLite must NOT be used.
export DJANGO_SETTINGS_MODULE=mediflow.settings.dev

# Migrate local PostgreSQL database
python manage.py migrate

# Seed base data FIRST to create the Organization, Outlets, and Staff login accounts
# (If you have already run this, you do not need to run it again. --hard-reset deletes old data)
python manage.py seeder --hard-reset

# Seed GST dashboard data (generates 4 test scenarios for the seeded outlet)
# This command is idempotent and will not delete your login user.
python manage.py seed_gst_dashboard

# Start the backend server
python manage.py runserver
```

### Test Login Credentials
After running the seeder, verify your test user credentials:
```bash
python manage.py print_test_credentials
```

Use the following credentials to log in to the dashboard frontend:
- **Phone**: `9999999999`
- **PIN/Password**: `Admin123`
- **Role Required**: `admin`

### Generated Scenarios
The seeder generates the following periods to test different states:
1. `052026`: Clean data, fully validated, ready to export.
2. `062026`: Warnings present (liability shortfall, missing in 2B).
3. `072026`: Blocked by errors (negative ITC, missing HSN).
4. `082026`: Deferred ITC and Rule 37 reclaims active.

### Verification
You can verify the data was seeded correctly by checking the API directly:
```bash
python manage.py shell -c "
from django.test import Client; c=Client(HTTP_HOST='localhost')
c.post('/api/v1/auth/login/', {'phone':'9999999999', 'password':'Admin123'}, content_type='application/json')
print(c.get('/api/v1/reports/api/v1/gst/periods/').status_code)
"
```

## Component Architecture
- `GSTDashboard`: Top-level orchestration and state management.
- `GSTPeriodSelector`: Navigation between filing months.
- `KPIRibbon`: Highlights primary numbers and MoM trends.
- `ValidationPanel`: Intelligent alert system based on backend `is_valid_for_export` logic.
- `GSTR1SummaryCard` & `GSTR3BSummaryCard`: Detailed breakdowns of the JSON payload totals.
- `ReconciliationWidget`: GSTR-2B vs. Purchase Register matching display.
