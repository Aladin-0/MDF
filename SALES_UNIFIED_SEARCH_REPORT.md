# Sales Invoice Unified Omni-Search Consolidation Report

## 1. Overview
Previously, the Sales Invoices page displayed **three fragmented search/filter inputs**:
1. Top row: General search bar (`Search invoice, customer, staff...`)
2. Bottom row: Doctor filter input (`Filter by Doctor ID/Name...`)
3. Bottom row: Hospital filter input (`Filter by Hospital Name...`)

This fragmented the search experience, created visual clutter, and lacked critical search criteria like customer mobile numbers, doctor registration numbers, and hospital details on doctor profiles.

We have merged all three fields into a **single, responsive Omni-Search bar** on the frontend and enhanced the backend API to search across all customer, doctor, hospital, invoice, and staff attributes simultaneously.

---

## 2. API & Field Mapping Analysis

The unified `search` query parameter on `GET /api/v1/sales/` now evaluates against all of the following database fields:

| Category | Model Fields Checked | Match Type |
|---|---|---|
| **Invoice Identification** | `SaleInvoice.invoice_no`<br>`SaleInvoice.prescription_no`<br>`SaleInvoice.irn`<br>`SaleInvoice.eway_bill_no` | `icontains` |
| **Customer Details** | `SaleInvoice.customer.name`<br>`SaleInvoice.customer.phone` (Mobile #)<br>`SaleInvoice.customer.gstin` | `icontains` |
| **Doctor Details** | `SaleInvoice.doctor.name`<br>`SaleInvoice.doctor.phone`<br>`SaleInvoice.doctor.registration_no` (Reg / ID) | `icontains` |
| **Hospital Details** | `SaleInvoice.hospital_name`<br>`SaleInvoice.doctor.hospital_name` | `icontains` |
| **Staff / Cashier** | `SaleInvoice.billed_by.name` | `icontains` |
| **UUIDs (Direct ID lookup)** | `SaleInvoice.id`<br>`SaleInvoice.customer_id`<br>`SaleInvoice.doctor_id` | Exact UUID match |

---

## 3. Key Changes

### Backend: `SaleListView` (`apps/backend/apps/billing/views.py`)
```python
# ── Optional omni-search filter (invoice #, customer, doctor, hospital, staff) ───
search_q = request.query_params.get('search', '').strip()
if search_q:
    from django.db.models import Q
    search_filter = (
        Q(invoice_no__icontains=search_q) |
        Q(prescription_no__icontains=search_q) |
        Q(irn__icontains=search_q) |
        Q(eway_bill_no__icontains=search_q) |
        Q(customer__name__icontains=search_q) |
        Q(customer__phone__icontains=search_q) |
        Q(customer__gstin__icontains=search_q) |
        Q(doctor__name__icontains=search_q) |
        Q(doctor__phone__icontains=search_q) |
        Q(doctor__registration_no__icontains=search_q) |
        Q(hospital_name__icontains=search_q) |
        Q(doctor__hospital_name__icontains=search_q) |
        Q(billed_by__name__icontains=search_q)
    )
    # If search_q looks like a UUID, match exact UUID fields as well
    try:
        import uuid
        uuid_obj = uuid.UUID(search_q)
        search_filter |= Q(id=uuid_obj) | Q(customer_id=uuid_obj) | Q(doctor_id=uuid_obj)
    except (ValueError, AttributeError):
        pass

    invoices = invoices.filter(search_filter)
```

### Frontend: `SalesList.tsx` (`apps/frontend/components/sales/SalesList.tsx`)
1. Removed `filterDoctorId` and `filterHospital` states and the second row of input fields.
2. Unified into a single search input:
   - **Placeholder:** `"Search by invoice #, customer name / mobile, doctor, hospital, staff..."`
   - Positioned alongside the `<SortDropdown />` with active search indicators and clear button.
3. Kept backwards compatibility in `apiClient.ts` if `doctorId` or `hospitalName` are explicitly passed by other modules.

---

## 4. Test Verification
1. **Backend Tests:** Added `apps/backend/apps/billing/tests/test_sales_omni_search.py` verifying:
   - Search by Invoice # (`OMNI01`) -> **Passed**
   - Search by Customer Name (`Rajesh`) -> **Passed**
   - Search by Customer Mobile No. (`9988776655`) -> **Passed**
   - Search by Doctor Name (`Aryan`) -> **Passed**
   - Search by Doctor Registration No. (`MH-8888`) -> **Passed**
   - Search by Hospital Name (`City Care`) -> **Passed**
   - Search by Prescription No. (`RX-777`) -> **Passed**
   - Backwards compatibility for `doctorId` & `hospitalName` params -> **Passed**
   - Ran `test_sales_omni_search` + `test_split_payments` (14 tests) -> **14/14 Passed**.
2. **Frontend Tests:** Ran `SortDropdown.test.tsx` and `inferPackUnit.test.ts` -> **22/22 Passed**.
