# SPLIT PAYMENT BREAKDOWN UI REPORT

## Executive Summary
This report documents the architectural audit, API field exposure, and frontend micro-breakdown UI implementation for the **Payment** column across the Sales and Purchases invoice list tables.

---

## 1. System Audit & API Verification

### 1.1 Sales API Verification
- **Endpoint:** `GET /api/v1/sales/` (`SaleListView` in `apps/backend/apps/billing/views.py`)
- **Tender Fields Exposed:**
  - `paymentMode`: string (`cash`, `upi`, `card`, `credit`, `split`, `bank_transfer`, `cheque`)
  - `cashPaid`: float (amount received via cash)
  - `upiPaid`: float (amount received via UPI)
  - `cardPaid`: float (amount received via card / POS)
  - `creditGiven`: float (credit / receivable balance on invoice)
  - `amountPaid`: float (total collected amount)
  - `amountDue`: float (total pending amount)
  - `payments`: array of individual payment tender records from `billing_invoicepayment` (`[{ method, amount, referenceNo }]`)
- **Query Optimization:** Prefetched `payments` relation (`prefetch_related('items__batch', 'payments')`) to prevent N+1 queries.

### 1.2 Purchases API Verification
- **Endpoint:** `GET /api/v1/purchases/` (`PurchaseListView` in `apps/backend/apps/purchases/views.py`)
- **Tender Fields Exposed:**
  - `paymentMode`: string (`cash`, `credit`, `split`, `bank_transfer`, `cheque`, `upi`)
  - `cashPaid`: float (total cash allocated)
  - `bankPaid`: float (total bank transfer allocated)
  - `chequePaid`: float (total cheque allocated)
  - `upiPaid`: float (total UPI allocated)
  - `creditGiven`: float (outstanding / credit due to distributor)
  - `payments`: array of allocated payments from `payment_allocations` (`[{ method, amount, referenceNo }]`)
- **Query Optimization:** Prefetched `payment_allocations__payment` (`prefetch_related('payment_allocations__payment')`).

### 1.3 TypeScript Interface Parity
Updated `SaleInvoice` and `PurchaseInvoice` in `apps/frontend/types/index.ts` with exact breakdown fields:
- `cashPaid`, `upiPaid`, `cardPaid`, `bankPaid`, `chequePaid`, `creditGiven`, and `payments: Array<{ method: string; amount: number; referenceNo?: string }>`.

---

## 2. Reusable Micro-Breakdown Cell Component

A dedicated component `apps/frontend/components/billing/PaymentBreakdownCell.tsx` was developed and integrated into both `SalesList.tsx` and `PurchasesList.tsx`.

### 2.1 The Cell JSX Implementation

```tsx
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export const PAYMENT_COLORS: Record<string, string> = {
    cash: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    upi: 'bg-blue-100 text-blue-700 border-blue-200',
    card: 'bg-purple-100 text-purple-700 border-purple-200',
    credit: 'bg-orange-100 text-orange-700 border-orange-200',
    split: 'bg-slate-100 text-slate-700 border-slate-200',
    ledger: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    cheque: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    bank_transfer: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    bank: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

export interface PaymentBreakdownCellProps {
    paymentMode?: string;
    cashPaid?: number;
    upiPaid?: number;
    cardPaid?: number;
    creditGiven?: number;
    bankPaid?: number;
    chequePaid?: number;
    payments?: Array<{
        method: string;
        amount: number;
        referenceNo?: string;
    }>;
    className?: string;
}

export function PaymentBreakdownCell({
    paymentMode = 'cash',
    cashPaid = 0,
    upiPaid = 0,
    cardPaid = 0,
    creditGiven = 0,
    bankPaid = 0,
    chequePaid = 0,
    payments,
    className,
}: PaymentBreakdownCellProps) {
    const isSplit = paymentMode === 'split';

    // Collect non-zero tender items
    const tenders: Array<{ label: string; amount: number }> = [];

    if (payments && payments.length > 0) {
        const methodTotals: Record<string, number> = {};
        for (const p of payments) {
            const m = (p.method || 'other').toLowerCase();
            methodTotals[m] = (methodTotals[m] || 0) + Number(p.amount || 0);
        }
        for (const [m, amt] of Object.entries(methodTotals)) {
            if (amt > 0) {
                const label = m === 'bank_transfer' || m === 'bank'
                    ? 'Bank'
                    : m === 'upi'
                    ? 'UPI'
                    : m.charAt(0).toUpperCase() + m.slice(1);
                tenders.push({ label, amount: amt });
            }
        }
        if (creditGiven > 0 && !methodTotals['credit']) {
            tenders.push({ label: 'Credit', amount: creditGiven });
        }
    } else {
        if (cashPaid > 0) tenders.push({ label: 'Cash', amount: cashPaid });
        if (upiPaid > 0) tenders.push({ label: 'UPI', amount: upiPaid });
        if (cardPaid > 0) tenders.push({ label: 'Card', amount: cardPaid });
        if (bankPaid > 0) tenders.push({ label: 'Bank', amount: bankPaid });
        if (chequePaid > 0) tenders.push({ label: 'Cheque', amount: chequePaid });
        if (creditGiven > 0) tenders.push({ label: 'Credit', amount: creditGiven });
    }

    const modeKey = (paymentMode || 'cash').toLowerCase();
    const modeLabel = modeKey === 'bank_transfer' || modeKey === 'bank' ? 'Bank' : paymentMode;

    return (
        <div className={cn('flex flex-col gap-0.5', className)}>
            {/* Standard Tender Badge */}
            <span
                className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase inline-block w-fit',
                    PAYMENT_COLORS[modeKey] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                )}
            >
                {modeLabel}
            </span>

            {/* Split Mode Micro-Breakdown */}
            {isSplit && tenders.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-1 text-[11px] text-muted-foreground leading-tight">
                    {tenders.map((t) => (
                        <span key={t.label} className="whitespace-nowrap">
                            <span className="text-slate-500">{t.label}: </span>
                            <span className="font-semibold text-slate-800 tabular-nums">
                                ₹{t.amount.toFixed(2)}
                            </span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default PaymentBreakdownCell;
```

---

## 3. Table Column Integration

### 3.1 Sales Table Integration (`SalesList.tsx`)
```tsx
<td className="px-4 py-3">
    <PaymentBreakdownCell
        paymentMode={inv.paymentMode}
        cashPaid={inv.cashPaid}
        upiPaid={inv.upiPaid}
        cardPaid={inv.cardPaid}
        creditGiven={inv.creditGiven}
        bankPaid={inv.bankPaid}
        chequePaid={inv.chequePaid}
        payments={inv.payments}
    />
</td>
```

### 3.2 Purchases Table Integration (`PurchasesList.tsx`)
```tsx
<td className="px-4 py-3">
    <PaymentBreakdownCell
        paymentMode={inv.paymentMode || inv.purchaseType || 'credit'}
        cashPaid={inv.cashPaid}
        upiPaid={inv.upiPaid}
        cardPaid={inv.cardPaid}
        bankPaid={inv.bankPaid}
        chequePaid={inv.chequePaid}
        creditGiven={inv.creditGiven ?? inv.outstanding}
        payments={inv.payments}
    />
</td>
```

---

## 4. Verification & Testing

1. **Jest Unit Tests (`PaymentBreakdownCell.test.tsx`):**
   - Verified single payment mode renders standard colored badge without micro-breakdown.
   - Verified split payment mode renders `SPLIT` badge with exact amounts (`Cash: ₹20.00`, `UPI: ₹80.00`).
   - Verified 4-tender split payment rendering (`Cash`, `UPI`, `Card`, `Credit`).
   - Verified `payments` array handling for `Bank Transfer` and `Cheque`.
   - **Result:** 8/8 tests passed.

2. **Backend Regression Tests:**
   - Ran `apps.billing.tests.test_sales_omni_search` and `apps.billing.tests.test_sales_payment_filter` in backend container.
   - **Result:** 13/13 tests passed.
