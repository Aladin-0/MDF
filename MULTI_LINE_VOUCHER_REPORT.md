# MULTI-LINE VOUCHER ENTRY UPGRADE REPORT

## Executive Summary
The manual Voucher Entry system has been upgraded from a legacy 1-to-1 form (single debit and single credit) into a dynamic Multi-Line Double-Entry Grid (Tally/SAP style). 
Users can now input an arbitrary number of Debit and Credit lines with any combination of accounts, with strict atomic balancing (`Total Dr == Total Cr`) enforced both client-side and server-side.

---

## 1. Audit Results

### Backend Models & Architecture
- **Models:** In `apps/backend/apps/accounts/models.py`, `Voucher` and `VoucherLine` already supported a 1-to-N foreign key relationship (`voucher.lines`).
- **Service Layer:** In `apps/backend/apps/accounts/services.py`, `VoucherService.create_voucher` was enhanced to normalize dynamic lines containing `{ ledger_id: UUID, side: 'debit'|'credit', amount: Decimal }` alongside backwards-compatible `debit`/`credit` fields.
- **Journal Posting:** General Ledger double-entry auditing in `apps/backend/apps/accounts/journal_service.py` (`post_voucher`) seamlessly mirrors each `VoucherLine` into a corresponding `JournalLine` under a single `JournalEntry`.

### Frontend Architecture
- **Dynamic State:** The legacy single-pair state (`partyLedger`, `cashBankLedger`, `contraDebitLedger`, `contraCreditLedger`) was superseded by a universal multi-line array `lines: VoucherLineRow[]` initialized with at least one Debit and one Credit line.
- **Components:** Built a dedicated `apps/frontend/components/accounts/VoucherLinesGrid.tsx` component integrated into `apps/frontend/components/accounts/VoucherForm.tsx`.
- **Auto-Balancing Rows:** When "+ Add Row" is clicked, the system computes the exact imbalance (`diff = totalDebits - totalCredits`) and automatically defaults the new row's side and amount to restore balance.

---

## 2. Backend Validation Code

In `apps/backend/apps/accounts/services.py` (`VoucherService.create_voucher`) and `apps/backend/apps/accounts/voucher_update_service.py`:

```python
        raw_lines = data.get('lines', [])

        if not raw_lines:
            raise ValidationError('Voucher must have at least one line.')

        lines_data = []
        for l in raw_lines:
            ledger_id = l.get('ledger_id') or l.get('ledgerId')
            if not ledger_id:
                raise ValidationError('Each line must have a valid ledger.')

            side = str(l.get('side', '')).strip().lower()
            if side in ('debit', 'dr'):
                debit_val = Decimal(str(l.get('amount') or 0))
                credit_val = Decimal('0')
            elif side in ('credit', 'cr'):
                debit_val = Decimal('0')
                credit_val = Decimal(str(l.get('amount') or 0))
            else:
                debit_val = Decimal(str(l.get('debit', 0)))
                credit_val = Decimal(str(l.get('credit', 0)))

            if debit_val < 0 or credit_val < 0:
                raise ValidationError('Line amounts cannot be negative.')

            lines_data.append({
                'ledger_id': ledger_id,
                'debit': debit_val,
                'credit': credit_val,
                'description': l.get('description', ''),
            })

        total_debit = sum(Decimal(str(l['debit'])) for l in lines_data)
        total_credit = sum(Decimal(str(l['credit'])) for l in lines_data)

        if total_debit == 0 and total_credit == 0:
            raise ValidationError('Voucher total amount cannot be zero.')

        if total_debit != total_credit:
            raise ValidationError(
                f"Accounting imbalance error: Total Debits (₹{total_debit}) must equal Total Credits (₹{total_credit}). Imbalance of ₹{abs(total_debit - total_credit)} detected."
            )
```

---

## 3. Frontend Grid & Validation Lock Logic

### Dynamic Lines Grid (`apps/frontend/components/accounts/VoucherLinesGrid.tsx`)

```tsx
<div className="divide-y divide-border">
    {lines.map((line) => (
        <div key={line.id} className="grid grid-cols-[80px_1fr_150px_44px] gap-3 px-4 py-2.5 items-center">
            {/* Dr / Cr Selector */}
            <select
                value={line.side}
                onChange={(e) => updateLine(line.id, { side: e.target.value as 'debit' | 'credit' })}
                className={cn(
                    "w-full h-9 rounded-md text-xs font-bold px-2 py-1 border transition-all cursor-pointer",
                    line.side === 'debit'
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}
            >
                <option value="debit">Dr (Debit)</option>
                <option value="credit">Cr (Credit)</option>
            </select>

            {/* Searchable Ledger Picker */}
            <LedgerPicker
                voucherType={voucherType}
                value={line.ledger}
                onChange={(l) => updateLine(line.id, { ledger: l })}
                placeholder={line.side === 'debit' ? "Select debit ledger..." : "Select credit ledger..."}
            />

            {/* Amount Input */}
            <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">₹</span>
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="h-9 pl-6 text-right font-mono text-sm"
                    value={line.amount}
                    onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                />
            </div>

            {/* Delete Row Button */}
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeLine(line.id)}
                disabled={lines.length <= 2}
                className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
            >
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    ))}
</div>
```

### Auto-Balancing Logic on "+ Add Row"

```tsx
const handleAddRow = () => {
    let defaultSide: 'debit' | 'credit' = 'debit';
    let defaultAmount = '';

    if (diff > 0) {
        defaultSide = 'credit';
        defaultAmount = diff.toFixed(2);
    } else if (diff < 0) {
        defaultSide = 'debit';
        defaultAmount = Math.abs(diff).toFixed(2);
    } else {
        const lastLine = lines[lines.length - 1];
        defaultSide = lastLine?.side === 'debit' ? 'credit' : 'debit';
    }

    onChange([...lines, {
        id: Math.random().toString(36).slice(2, 9),
        side: defaultSide,
        ledger: null,
        amount: defaultAmount,
    }]);
};
```

### Validation Lock on Save Button (`apps/frontend/components/accounts/VoucherForm.tsx`)

```tsx
const totalDebits = lines.filter(l => l.side === 'debit').reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
const totalCredits = lines.filter(l => l.side === 'credit').reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
const diff = Math.round((totalDebits - totalCredits) * 100) / 100;
const isBalanced = Math.abs(diff) < 0.01 && totalDebits > 0;
const hasMinLedgers = lines.filter(l => l.ledger && (parseFloat(l.amount) || 0) > 0).length >= 2;
const canSave = isBalanced && hasMinLedgers && !saving;

// Save Button is strictly disabled until balanced
<Button 
    onClick={() => handleSave()} 
    disabled={!canSave} 
    className={cn(
        "w-full flex justify-between items-center h-12 rounded-lg transition-all",
        !canSave && "opacity-60 cursor-not-allowed"
    )}
>
    <div className="flex items-center text-sm">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <span className="font-semibold">Save Voucher</span>
    </div>
    <span className="text-[10px] uppercase bg-primary-foreground/20 px-1.5 py-0.5 rounded font-bold">Ctrl+S</span>
</Button>
```

---

## 4. Automated Verification Results

1. **Backend Tests:**
   - `apps/backend/apps/accounts/tests/test_multiline_vouchers.py`:
     - `test_create_multiline_balanced_voucher` ➔ **PASSED** (1 Dr + 2 Cr split lines create voucher & 3 journal lines)
     - `test_imbalanced_multiline_voucher_raises_400` ➔ **PASSED** (HTTP 400 with imbalance error)
     - `test_zero_amount_multiline_voucher_raises_400` ➔ **PASSED**
   - Full suite `test_voucher_bills.py` & `test_voucher_mod.py`: 16 tests ➔ **ALL PASSED** in 4.22s.
2. **Frontend Tests:**
   - `apps/frontend/hooks/__tests__/payloadBuilders.test.ts`: 11 tests ➔ **ALL PASSED**.
