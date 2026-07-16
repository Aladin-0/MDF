# Billing State Ownership Refactoring Report

## 1. Modifications in `RightBillingRail.tsx`
- Removed local `useState` for `localPaymentMethod` and `cashReceived`.
- Made `useBillingStore` the authoritative source for the payment state by referencing `draft.payment.method` and `draft.payment.cashTendered`.
- Refactored `handleCheckout` to no longer pass `payment` state as an argument to `saveBill`. Instead, it explicitly pushes final updates (such as `grandTotal` and `cashReturned`) to `useBillingStore.getState().setPayment()` right before invoking `saveBill()`.

## 2. Modifications in `useSaveBill.ts`
- Removed the `payment: PaymentSplit` argument from the `saveBill` hook execution.
- Configured the payload to read `draft.payment.method` directly from `useBillingStore`.
- Set `cashPaid` to map gracefully from `draft.payment.cashTendered` or default to `totals.grandTotal`.

## 3. Autosave Updates
- Verified that `useAutosaveDraft.ts` is already properly reading from the global store's `draft.payment.method` (and defaulting to 'cash'). Since `RightBillingRail` now modifies the store actively on payment method clicks, the autosave will naturally and consistently trigger with the user's selected values.

## 4. Tests
- Created `apps/frontend/store/billingStore.test.ts` with assertions verifying that `setPayment({ method: 'upi' | 'card' | 'cash' | 'credit' })` accurately sets and persists these fields in the active draft instance, including `cashTendered`.
