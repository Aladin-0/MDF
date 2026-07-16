# Revisions API Repair Report

## Issues Fixed

### 1. `/api/v1/revisions/` 500 Error
- **Cause**: Passing an invalid UUID string as the `outletId` query parameter caused Django's ORM to throw a `ValidationError` when executing `.filter(outlet_id=outlet_id)`. Since DRF does not automatically catch `django.core.exceptions.ValidationError` raised directly in views (unless it's within a serializer), this resulted in a 500 server error.
- **Fix**: Wrapped the `.filter()` call in `SaleRevisionListView` with a `try-except` block to catch `ValidationError` and explicitly return a `400 Bad Request` with a JSON payload (`{"detail": "Invalid outletId"}`).

### 2. `/api/v1/sales/<uuid>/revisions/` 404 HTML Response
- **Cause**: If the client requested the endpoint with an invalid UUID format (e.g. `not-a-uuid`), the Django URL router failed to match the `<uuid:sale_id>` pattern. Because the route didn't match any DRF view, Django fell back to its default global `404` handler, which returned an HTML page. 
- **Fix**: Added global `handler404` and `handler500` functions in `apps/backend/mediflow/urls.py` to ensure all unhandled routes and server exceptions return standard JSON responses. Additionally, added `ValidationError` handling in `SaleRevisionDetailView` to ensure `get_object_or_404` doesn't leak unhandled exceptions if an invalid UUID somehow bypasses the route regex.

### 3. Route Ordering Corrections
- **`apps/backend/mediflow/urls.py`**: Reordered the URL includes to place specific path prefixes (like `api/v1/audit/`, `api/v1/auth/`, etc.) *before* generic `api/v1/` catch-all includes (such as `apps.billing.urls` and `apps.inventory.urls`). This prevents generic routers from shadowing explicit sub-paths and guarantees proper URL resolution priority.
- **`apps/backend/apps/audit/urls.py`**: Reordered the routes so that `logs/export/` comes before `logs/`. This ensures that more specific paths are evaluated first, eliminating potential prefix shadowing issues if the URL patterns are ever modified to use regex matching or permissive routing.
- **`apps/backend/apps/billing/urls.py`**: Removed a stray `path` object declaration on line 87 which would trigger Django resolving errors when exhaustively traversing routes.

### 4. Regression Tests
- Added `apps/backend/apps/billing/tests/test_revisions_regression.py` containing three dedicated tests to prevent these issues from recurring. The tests verify that passing invalid UUIDs correctly returns `400 JSON` for the list endpoint and `404 JSON` for the detail endpoint instead of crashing with `500 HTML` or `404 HTML`.

All fixes have been implemented and verified.
