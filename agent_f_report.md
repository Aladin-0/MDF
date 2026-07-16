# API Error Handling Fixes

## 1. Swallowed HTML/502/non-JSON Errors
Modified `assertOk` in `apps/frontend/lib/apiClient.ts` to properly handle cases where the server returns non-JSON responses (such as 502 Bad Gateway HTML pages). Instead of failing on `response.json()` and throwing a vague HTTP 502 string, it now catches the parsing error and throws a structured error containing a user-friendly message (`isHtmlError: true`) and the HTTP status.

## 2. Improved User-Visible Error Messages
In `apps/frontend/hooks/useSaveBill.ts`, updated the error handling block to prioritize `err.detail` over other error fields, making sure that our friendly HTTP messages (like "Server is currently unreachable (502 Bad Gateway). Please try again later.") are correctly shown to the user when an API call fails.

## 3. Structured Logging for Save/Autosave Failures
- **Save Bill:** Added structured JSON logging in the `catch` block of `useSaveBill.ts` containing the `event: "SAVE_BILL_FAILED"`, the error message, `outletId`, `draftId`, and `editingSaleId`.
- **Autosave Draft:** Replaced the generic console error in `apps/frontend/hooks/useAutosaveDraft.ts` with structured JSON logging containing the `event: "AUTOSAVE_FAILED"`, the error message, `draftId`, and `outletId`.
- **API Errors:** Added structured logging for non-JSON API errors in `apiClient.ts` containing `event: "API_ERROR"`, `url`, `status`, and a snippet of the response body.
