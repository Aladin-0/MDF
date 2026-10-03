# E-WAY BILL SYSTEM READINESS & PIPELINE AUDIT

## 1. EXECUTIVE READINESS SCORE: 40% (Not Production Ready)
While the foundational authentication (`SandboxAuthService`) and basic payload scaffolding exist, the system is fundamentally not ready for production E-Way Bill generation. Hardcoded NIC parameters, missing database fields, and a lack of dedicated asynchronous error-handling will cause immediate compliance rejections in a live environment.

---

## 2. DATA CAPTURE & SCHEMA GAP ANALYSIS
**Frontend & POS Capture:**
- [x] **`transporter_id`**: Successfully captured in `BillingHeaderStrip.tsx` and passed via `payloadBuilders.ts`.
- [x] **`vehicle_no`**: Successfully captured and dispatched to the API.
- [ ] **`trans_distance`**: MISSING. The UI does not capture this, nor does it allow the user to select PIN-to-PIN auto-calculation.
- [ ] **`trans_mode`**: MISSING. No UI exists to select Road vs. Rail/Air/Ship.
- [ ] **`vehicle_type`**: MISSING. No UI exists to toggle between Regular and ODC (Over Dimensional Cargo).

**Backend Payload Schema (`generate_ewb_payload`):**
- [ ] **Pincode Violation**: `toPincode` is dangerously hardcoded to `400001`. The NIC API strictly validates PIN codes against the `toStateCode`. This will cause immediate API rejection for any customer outside Maharashtra.
- [ ] **Distance Violation**: `transDistance` is hardcoded to `0`. While NIC allows `0` for auto-calculation, this often requires exact valid PIN codes, which currently fail due to the hardcoded `400001`.
- [ ] **State Code Fallback**: `actualToStateCode` and `toStateCode` fallback to the `outlet.state_code` if customer data is missing. This is risky for B2C interstate transport.
- [x] **Math Formatting**: Values are cleanly formatted to 2 decimal places using `_quantize()` and `ROUND_HALF_EVEN`.

---

## 3. API & PERSISTENCE VERIFICATION
**Database Persistence (`SaleInvoice` model):**
- [x] `eway_bill_no`: Exists as a `CharField`.
- [x] `transporter_id` & `vehicle_no`: Exist.
- [ ] **`eway_bill_date`**: MISSING.
- [ ] **`valid_until`**: MISSING. Required for transporters to know when the E-Way bill expires.
- [ ] **`eway_bill_status`**: MISSING. There is an `irn_status` for E-Invoicing, but no equivalent state machine tracking for E-Way Bills (e.g., PENDING, GENERATED, FAILED).

**API Execution & Error Handling (`sale_services.py`):**
- [ ] **Orchestration Missing**: While there is a robust `process_pending_irn()` function running asynchronously, there is no equivalent `process_pending_ewaybill()` task. `request_ewaybill()` exists but isn't safely wired into the checkout transaction hook. 
- [ ] **UI Feedback**: Because there is no `eway_bill_status`, the UI cannot show "Retry E-Way Bill" if it fails due to a NIC business validation error (e.g., invalid vehicle format).

---

## 4. CRITICAL BLOCKERS (Must Fix Before Go-Live)
1. **Hardcoded `toPincode`**: Must be replaced with the actual customer's PIN code.
2. **Missing Database Status**: Without `eway_bill_status` and `valid_until`, the system cannot handle API timeouts, retries, or display expiration times.
3. **Missing E-Way Bill Slip**: The GST rules require a Part A/Part B summary slip for the driver. Currently, `ManavataA4Invoice.tsx` only prints the raw number (`{invoice.eway_bill_no}`) in the header of the tax invoice.

---

## 5. ACTIONABLE COMPLETION PLAN
1. **Database Update (Migration):** Add `eway_bill_status` (Choices), `eway_bill_date` (DateTimeField), and `eway_bill_valid_until` (DateTimeField) to the `SaleInvoice` model.
2. **Frontend UI Expansion:** Add a "Transport Details" modal to the checkout flow to capture `trans_distance`, `trans_mode`, `vehicle_type`, and the destination PIN code.
3. **Payload Refactor:** Remove the `400001` hardcoding in `ewaybill.py` and map it strictly to the new frontend payload.
4. **Async Task Hook:** Write `process_pending_ewaybill()` in `sale_services.py` alongside the IRN logic, wrapped in a `try/except` block that updates `eway_bill_status = 'FAILED'` so the POS can offer a retry button.
5. **Print Engine Upgrade:** Build a dedicated `EWayBillSlip.tsx` component that retrieves the raw JSON response and formats it into the standard NIC-compliant transport slip.
