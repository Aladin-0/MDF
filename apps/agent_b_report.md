# Autosave Concurrency Fix Report

## Overview
Fixed the autosave race condition in `useAutosaveDraft` that caused duplicate orphaned drafts during rapid typing and slow network conditions. Additionally, removed redundant effect churn that was causing unnecessary `JSON.stringify` calls and debounce timer resets. 

## Technical Details

### 1. In-flight Create Lock (Race Condition Fix)
- Introduced an `isSavingRef` boolean to act as a mutex lock during active API calls (POST/PUT).
- When the 2000ms debounce timer fires, if an autosave request is already in-flight (`isSavingRef.current === true`), the hook will **abort the current timer execution**, but crucially clears `lastQueuedStringRef.current`.
- When the inflight save completes (whether successful or error), it updates the Zustand store (`setDraftSaveStatus`, `replaceDraftId`), triggering a natural React re-render.
- On this re-render, the hook observes that the newly pending payload string does not match `lastQueuedStringRef` (since it was cleared), and immediately queues the updated data for saving. 
- **Preventing Redundant PUTs**: When a POST successfully completes and replaces a local ID with a UUID, `lastSavedStringRef` and `lastQueuedStringRef` are proactively updated with the newly assigned ID. This prevents the hook from firing a redundant PUT request simply because the ID in the payload changed.

### 2. Eliminating Redundant Effect Churn
- Previously, any change to `draft.saveStatus` triggered the `useEffect`, forcing a payload stringification and resetting the debounce timer, leading to infinite loops in some error states and excessive churn.
- Added `lastQueuedStringRef` to track the exact payload string that has already been queued for debouncing. 
- If a re-render evaluates a payload that is identical to what is already sitting in the debounce timer (e.g. only `saveStatus` changed), the effect returns early. 
- **Effect Cleanup Modification:** Removed the `clearTimeout` from the main dependency-driven `useEffect` cleanup. Clearing the timeout is now strictly handled only when the component unmounts. This allows the debounce timer to persist uninterrupted across unrelated state updates.

### 3. Testing
- Added `apps/frontend/hooks/__tests__/useAutosaveDraft.test.tsx`.
- The test verifies that during a simulated slow network (inflight POST) combined with rapid typing (cart updates), the hook correctly defers the second save until the POST resolves.
- It asserts that the hook subsequently issues a correct `PUT` request with the updated UUID and merged data, avoiding a duplicate `POST`.

## Conclusion
The `useAutosaveDraft` hook is now robust against rapid user input over high-latency connections, guaranteeing single-draft integrity and optimal React rendering performance.
