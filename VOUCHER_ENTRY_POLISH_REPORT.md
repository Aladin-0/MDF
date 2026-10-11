# VOUCHER ENTRY LEDGER FILTER FIX & UI POLISH REPORT

## Executive Summary
This report documents the architectural fixes and UI enhancements implemented for the Voucher Entry module:
1. **Accounting Filter Fix:** Resolved the bug where Credit (`Cr`) lines on `Payment` vouchers were improperly filtering out `Cash` and `Bank` ledgers, preventing users from selecting where payments were made from.
2. **High-Density Spreadsheet UI:** Replaced the bulky web-form grid with a dense, Tally/SAP-style spreadsheet table utilizing ghost-inputs, compact Dr/Cr toggles, and a dedicated full-width `+ Add Row` footer action.
3. **De-Cluttered Summary Rail:** Streamlined the right-hand summary card by removing the redundant net amount banner and highlighting dynamic colored balance differences and save-lock alerts.

---

## 1. The Accounting Filter Fix

### The Root Cause
Previously, `VoucherLinesGrid` passed `voucherType="payment"` to all ledger pickers regardless of whether the line was Debit (`Dr`) or Credit (`Cr`). 
On the backend, `voucherType=payment` filtered ledgers by `group__nature__in=['liability', 'expense']`, which completely excluded asset accounts such as **Cash in Hand** and **Bank Accounts**. Consequently, users could never pick cash or bank on the Credit line of a payment voucher.

### The Solution
We implemented standard accounting constraint rules via `getLineFilter`:
- **Payment Voucher:**
  - `Dr` line allows All (expenses, creditors, assets) for flexible payment routing.
  - `Cr` line strictly filters to **Cash in Hand** and **Bank Accounts** (`filterGroup: 'cashbank'`).
- **Receipt Voucher:**
  - `Dr` line strictly filters to **Cash in Hand** and **Bank Accounts** (`filterGroup: 'cashbank'`).
  - `Cr` line allows All (customers, income, receivables).
- **Contra Voucher:**
  - Both `Dr` and `Cr` strictly allow only **Cash in Hand** and **Bank Accounts**.
- **Journal Voucher:**
  - Both `Dr` and `Cr` allow All accounts.

### Logic Snippet (`apps/frontend/components/accounts/VoucherLinesGrid.tsx`)

```typescript
export interface LineFilter {
    filterGroup?: 'cashbank';
    placeholder: string;
}

export function getLineFilter(voucherType: VoucherType, side: 'debit' | 'credit'): LineFilter {
    switch (voucherType) {
        case 'payment':
            // Dr: allows All for flexibility; Cr: MUST explicitly allow Cash in Hand and Bank Accounts
            if (side === 'credit') {
                return {
                    filterGroup: 'cashbank',
                    placeholder: 'Select Cash or Bank ledger (Paid From)...',
                };
            }
            return {
                placeholder: 'Select Expense / Party / Ledger (Paid To)...',
            };

        case 'receipt':
            // Dr: MUST allow Cash in Hand and Bank Accounts; Cr: allows All
            if (side === 'debit') {
                return {
                    filterGroup: 'cashbank',
                    placeholder: 'Select Cash or Bank ledger (Deposited To)...',
                };
            }
            return {
                placeholder: 'Select Customer / Income / Ledger (Received From)...',
            };

        case 'contra':
            return {
                filterGroup: 'cashbank',
                placeholder: side === 'debit'
                    ? 'Select Cash / Bank ledger (Destination)...'
                    : 'Select Cash / Bank ledger (Source)...',
            };

        case 'journal':
        default:
            return {
                placeholder: side === 'debit' ? 'Select debit ledger...' : 'Select credit ledger...',
            };
    }
}
```

On the backend in `apps/backend/apps/accounts/voucher_views.py`, `LedgerView` was updated to explicitly recognize `filterGroup=cashbank` and return `group__name__in=['Cash in Hand', 'Bank Accounts']`.

---

## 2. High-Density UI Polish

### Ghost Inputs for the Amount Column & Grid Cells
All standard bordered inputs were replaced with flat spreadsheet cells that only display borders and focus indicators on hover or focus.

#### JSX Snippet: Ghost Input for Amount Column (`apps/frontend/components/accounts/VoucherLinesGrid.tsx`)

```tsx
{/* Ghost Amount Input */}
<td className="py-1 px-2 align-middle">
    <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs font-medium pointer-events-none select-none">
            ₹
        </span>
        <input
            disabled={readOnly}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="w-full h-8 pl-5 pr-2 text-right font-mono text-sm bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-primary focus:bg-background focus:outline-none shadow-none rounded-none transition-colors"
            value={line.amount}
            onChange={(e) => updateLine(line.id, { amount: e.target.value })}
        />
    </div>
</td>
```

### Compact Dr/Cr Minimalist Dropdown (`apps/frontend/components/accounts/VoucherLinesGrid.tsx`)

```tsx
{/* Compact Dr/Cr Minimalist Toggle */}
<td className="py-1 px-2 text-center align-middle">
    <select
        disabled={readOnly}
        value={line.side}
        onChange={(e) => updateLine(line.id, { side: e.target.value as 'debit' | 'credit' })}
        className={cn(
            "h-7 w-12 text-center font-mono text-xs font-bold rounded border transition-colors cursor-pointer focus:outline-none focus:ring-1 select-none",
            line.side === 'debit'
                ? "bg-blue-50 text-blue-700 border-blue-200 focus:ring-blue-400 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                : "bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
        )}
    >
        <option value="debit">Dr</option>
        <option value="credit">Cr</option>
    </select>
</td>
```

### Full-Width Footer Action Row (`apps/frontend/components/accounts/VoucherLinesGrid.tsx`)

```tsx
<tfoot>
    {/* Dedicated Full-Width Table Footer for Add Row */}
    <tr className="border-t border-border bg-muted/10 hover:bg-muted/20 transition-colors">
        <td colSpan={4} className="p-0">
            <button
                type="button"
                disabled={readOnly}
                onClick={handleAddRow}
                className="w-full py-2.5 px-4 text-xs font-semibold text-primary hover:text-primary/90 flex items-center justify-center gap-1.5 transition-colors border-0 outline-none cursor-pointer"
            >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row (Auto-balance difference)</span>
            </button>
        </td>
    </tr>
</tfoot>
```

---

## 3. Summary Card De-clutter

The massive "NET TRANSACTION AMOUNT" header block was eliminated. The right-rail card is now compact and focused on live balance auditing:
- **Total Debits (Dr)**: Bold blue rupee amount.
- **Total Credits (Cr)**: Bold emerald rupee amount.
- **Difference**: Dynamically styled:
  - `text-emerald-600` when `0.00` (Balanced)
  - `text-amber-600 font-extrabold` when imbalanced
- **Save Lock Alert**: Visually prominent guidance specifying the exact tender side and amount required to balance.

---

## 4. Verification & Testing

1. **Frontend Unit Tests:**
   - `apps/frontend/components/accounts/__tests__/VoucherLinesGrid.test.tsx`: 6/6 tests passed.
   - `apps/frontend/hooks/__tests__/payloadBuilders.test.ts`: 11/11 tests passed.
2. **Backend Accounts Suite:**
   - 20/20 Django accounts integration tests passed in 11.52s.
