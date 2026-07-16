# Bug Fix Report: `useLoadDrafts` Stale Lockout

## Issue
Users entering the billing page through edit/revise links (which pre-filled a local draft) were unable to fetch and load their other active drafts from the server. This occurred because `useLoadDrafts` had short-circuit logic: it returned early if `Object.keys(currentDrafts).length > 0`, thus never initiating a backend fetch for the remaining drafts.

## Fix Applied
1. Removed the short-circuit `return` when `currentDrafts` are present.
2. Modifed the fetch logic to merge new server drafts with the pre-existing local drafts (`currentDrafts`).
3. Ensured that server-loaded drafts do not overwrite existing local drafts (useful for edits/pre-fills that may not be synced to the backend yet).
4. Retained the existing `activeDraftId` as the active draft instead of shifting focus, ensuring smooth UX when loading additional drafts in the background.

## Tests Added
A suite of regression tests has been added to `apps/frontend/hooks/__tests__/useLoadDrafts.test.tsx` to verify that drafts are fetched properly even when the store already has active pre-fills, preventing regressions of the stale lockout bug.

