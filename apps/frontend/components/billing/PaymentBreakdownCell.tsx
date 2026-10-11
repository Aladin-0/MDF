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
    // Collect non-zero tender items
    const tenders: Array<{ label: string; modeKey: string; amount: number }> = [];

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
                tenders.push({ label, modeKey: m === 'bank' ? 'bank_transfer' : m, amount: amt });
            }
        }
        if (creditGiven > 0 && !methodTotals['credit']) {
            tenders.push({ label: 'Credit', modeKey: 'credit', amount: creditGiven });
        }
    } else {
        if (cashPaid > 0) tenders.push({ label: 'Cash', modeKey: 'cash', amount: cashPaid });
        if (upiPaid > 0) tenders.push({ label: 'UPI', modeKey: 'upi', amount: upiPaid });
        if (cardPaid > 0) tenders.push({ label: 'Card', modeKey: 'card', amount: cardPaid });
        if (bankPaid > 0) tenders.push({ label: 'Bank', modeKey: 'bank_transfer', amount: bankPaid });
        if (chequePaid > 0) tenders.push({ label: 'Cheque', modeKey: 'cheque', amount: chequePaid });
        if (creditGiven > 0) tenders.push({ label: 'Credit', modeKey: 'credit', amount: creditGiven });
    }

    const rawMode = (paymentMode || 'cash').toLowerCase();

    // Smart Badge Resolution:
    // If payment_mode is 'split', do not blindly render SPLIT.
    // Only render SPLIT if 2 or more tenders are strictly > 0.
    // If only 1 tender is > 0, resolve to that single tender badge.
    let displayMode = rawMode;
    let isMultiSplit = false;

    if (rawMode === 'split') {
        if (tenders.length >= 2) {
            isMultiSplit = true;
            displayMode = 'split';
        } else if (tenders.length === 1) {
            displayMode = tenders[0].modeKey;
            isMultiSplit = false;
        } else {
            displayMode = creditGiven > 0 ? 'credit' : 'cash';
            isMultiSplit = false;
        }
    }

    const modeKey = displayMode;
    const modeLabel = modeKey === 'bank_transfer' || modeKey === 'bank' ? 'Bank' : displayMode;

    return (
        <div className={cn('flex flex-col gap-0.5', className)}>
            <span
                className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase inline-block w-fit',
                    PAYMENT_COLORS[modeKey] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                )}
            >
                {modeLabel}
            </span>

            {isMultiSplit && tenders.length >= 2 && (
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
