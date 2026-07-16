# Crash Hardening Report: Date Parsing & Null Safety

## Overview
Fixed several UI crashes related to unsafe parsing of null or malformed dates across the frontend billing components.

## Changes Made
1. **`MainInvoiceWorkspace.tsx`**:
    - **`expiryDate` `.includes()` crash**: The code previously called `item.expiryDate.includes('-')` without verifying that `item.expiryDate` was a string. This crashed when `item.expiryDate` was an object or null. Fixed by adding a type check (`typeof item.expiryDate === 'string'`) and ensuring it falls back safely.
    - **Unsafe `new Date()` construction**: Found and fixed implicit date parsing in batch expiry checks (e.g. `const isExpired = new Date(b.expiryDate) < new Date();`) where `b.expiryDate` could be null, leading to `isExpired` behaving unpredictably. We now check `batch.expiryDate ? ... : false`.
    - **`format()` on invalid dates**: Wrapped `format(new Date(batch.expiryDate), ...)` in a validation check `!isNaN(new Date(batch.expiryDate).getTime())` to prevent `RangeError: Invalid time value`.

2. **`InlineRowEditor.tsx`**:
    - Addressed identical `batch.expiryDate.includes('-')` typing and formatting issues when rendering the batch expiry date inline editor component.

3. **`InvoiceThermal.tsx` & `BillSuccessScreen.tsx`**:
    - Prevented `RangeError` on malformed or null `invoice.createdAt` strings before passing them to `date-fns` `format()`.
    - Added guards: `{invoice.createdAt && !isNaN(new Date(invoice.createdAt).getTime()) ? format(...) : '—'}`.

4. **Tests**:
    - Added simple test files for rendering with malformed or null date values:
        - `MainInvoiceWorkspace.test.tsx`
        - `InvoiceThermal.test.tsx`
        - `BillSuccessScreen.test.tsx`
    - These test files verify that components correctly render the safe fallback string (e.g., `'—'`) instead of crashing when provided invalid date props.
