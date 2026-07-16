# Empty Items Validation Bug Report

## Root Cause
The `SaleCreateView` and `SaleReviseView` endpoints did not have explicit checks for an empty `items` array or missing `items` key in the request payload. As a result, the views would either process empty item lists successfully (creating an invoice with 0 items) or fail unexpectedly later in the code.

## Files Changed
- `apps/backend/apps/billing/views.py`: 
  - Added a check in `SaleCreateView.post()` to return a `400 BAD REQUEST` with the message `'Invoice must contain at least one item.'` when `items_data` is empty or missing.
  - Added a similar check in `SaleReviseView.post()` to enforce the same constraint during invoice revisions, preserving consistency across all invoice creation workflows.
- `apps/backend/apps/billing/tests/test_empty_items_validation.py`: 
  - Created a new test module `EmptyItemsValidationTestCase` containing regression tests for both invoice creation (`sale-list-create`) and direct revisions (`sale-revise`), specifically checking payloads with `items: []` and payloads missing the `items` key entirely.

## Test Results
All four added regression tests passed successfully.
- `test_create_sale_with_empty_items_returns_400`: Passed (Expected 400 Bad Request)
- `test_create_sale_with_no_items_key_returns_400`: Passed (Expected 400 Bad Request)
- `test_revise_sale_with_empty_items_returns_400`: Passed (Expected 400 Bad Request)
- `test_revise_sale_with_no_items_key_returns_400`: Passed (Expected 400 Bad Request)
