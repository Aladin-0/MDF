# Quotation Convert Contract Audit

## Findings
During the audit of `QuotationConvertView` (`apps/backend/apps/billing/quotation_views.py`), we compared the quotation conversion payload contract against the `SaleCreateView` expectation contract and identified critical gaps in how Schedule H drugs, doctors, and patient data were handled during conversion:
1. **Missing `doctorId`**: `QuotationConvertView` synthesized a payload for `SaleCreateView` but completely ignored the `doctorId` provided in the conversion request. This resulted in converted sales missing their associated doctor references.
2. **Missing `scheduleHData`**: The frontend conversion request contains `scheduleHData` (e.g., `patientName`, `patientAddress`, `doctorRegNo`, `prescriptionNo`). This was dropped during payload synthesis, leading to `ScheduleHRegister` entries being created with null or empty values.
3. **Missing `scheduleType` in items**: `QuotationItem` instances store batch snapshots but not the product's `schedule_type`. When synthesized into `items`, the `scheduleType` defaulted to `OTC` inside `SaleCreateView`, bypassing `schedule_h_validate` validation entirely even for Schedule H drugs!

## Remediation Applied
We have produced immediate safe fixes directly into `QuotationConvertView`:
- **Synthesize `doctorId`**: Added `doctorId` to the forwarded payload directly from `request.data`.
- **Synthesize `scheduleHData` & `prescriptionNo`**: Extracted these fields from `request.data` and added them to the forwarded payload.
- **Resolve `scheduleType` for items**: Adjusted the item synthesis loop to dynamically resolve `scheduleType` via the `item.batch.product` relationship. If a batch exists, it resolves its product's `schedule_type` (fallback to "OTC"), re-enabling Schedule H compliance checks in `SaleCreateView`.

## Tests Added
A new contract test `test_convert_quotation_with_schedule_h` has been added to `apps/backend/apps/billing/tests/test_quotation_api.py`.
- Generates a valid Schedule H product (`schedule_type='H'`) and a `Doctor` instance.
- Creates a quotation with the Schedule H product.
- Invokes the convert endpoint with `doctorId`, `scheduleHData`, and `prescriptionNo`.
- Asserts that the resulting `SaleInvoice` correctly links the `doctor_id` and `prescription_no`.
- Asserts that a `ScheduleHRegister` entry is created successfully and contains the correct `patient_name` and `doctor_name`.
