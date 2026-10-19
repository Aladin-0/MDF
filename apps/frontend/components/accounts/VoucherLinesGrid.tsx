'use client';

import React from 'react';
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LedgerPicker } from '@/components/accounts/LedgerPicker';
import { Ledger } from '@/types';
import { cn } from '@/lib/utils';

export type VoucherType = 'receipt' | 'payment' | 'contra' | 'journal';

export interface VoucherLineRow {
    id: string;
    side: 'debit' | 'credit';
    ledger: Ledger | null;
    amount: string;
    description?: string;
}

export interface LineFilter {
    filterGroup?: 'cashbank';
    placeholder: string;
}

/**
 * Standard Accounting Rules for Voucher Lines Filtering:
 * - Payment: Dr allows All (expenses, vendors, liabilities); Cr MUST explicitly allow Cash in Hand and Bank Accounts.
 * - Receipt: Dr MUST allow Cash in Hand and Bank Accounts; Cr allows All (customers, income, debtors).
 * - Contra: Both Dr and Cr strictly Cash in Hand and Bank Accounts.
 * - Journal: Allow All for both Dr and Cr.
 */
export function getLineFilter(voucherType: VoucherType, side: 'debit' | 'credit'): LineFilter {
    switch (voucherType) {
        case 'payment':
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

interface VoucherLinesGridProps {
    lines: VoucherLineRow[];
    onChange: (lines: VoucherLineRow[]) => void;
    voucherType?: VoucherType;
    readOnly?: boolean;
}

export function VoucherLinesGrid({
    lines,
    onChange,
    voucherType = 'journal',
    readOnly = false,
}: VoucherLinesGridProps) {

    const updateLine = (id: string, patch: Partial<VoucherLineRow>) => {
        onChange(lines.map(line => (line.id === id ? { ...line, ...patch } : line)));
    };

    const removeLine = (id: string) => {
        if (lines.length <= 2) return;
        onChange(lines.filter(line => line.id !== id));
    };

    // Calculate totals
    const totalDebits = lines
        .filter(l => l.side === 'debit')
        .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    const totalCredits = lines
        .filter(l => l.side === 'credit')
        .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    const diff = Math.round((totalDebits - totalCredits) * 100) / 100;
    const isBalanced = Math.abs(diff) < 0.01 && totalDebits > 0;

    // Smart UI Behavior: Auto-Balancing Rows
    const handleAddRow = () => {
        let defaultSide: 'debit' | 'credit' = 'debit';
        let defaultAmount = '';

        if (diff > 0) {
            // Deficient in Credits
            defaultSide = 'credit';
            defaultAmount = diff.toFixed(2);
        } else if (diff < 0) {
            // Deficient in Debits
            defaultSide = 'debit';
            defaultAmount = Math.abs(diff).toFixed(2);
        } else {
            // Perfectly balanced: alternate from last line
            const lastLine = lines[lines.length - 1];
            defaultSide = lastLine?.side === 'debit' ? 'credit' : 'debit';
            defaultAmount = '';
        }

        const newLine: VoucherLineRow = {
            id: Math.random().toString(36).slice(2, 9),
            side: defaultSide,
            ledger: null,
            amount: defaultAmount,
            description: '',
        };

        onChange([...lines, newLine]);
    };

    return (
        <div className="space-y-3">
            <div className="border border-border/80 rounded-lg bg-card overflow-hidden shadow-sm">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground select-none">
                            <th className="w-16 py-2 px-2.5 text-center font-semibold">Type</th>
                            <th className="py-2 px-3 text-left font-semibold">Account Ledger</th>
                            <th className="w-40 py-2 px-3 text-right font-semibold">Amount (₹)</th>
                            <th className="w-10 py-2 px-2 text-center font-semibold"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {lines.map((line) => {
                            const filter = getLineFilter(voucherType, line.side);
                            return (
                                <tr 
                                    key={line.id} 
                                    className="group hover:bg-muted/15 transition-colors focus-within:bg-muted/20"
                                >
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

                                    {/* Ghost Ledger Picker */}
                                    <td className="py-1 px-2 align-middle">
                                        <LedgerPicker
                                            voucherType={voucherType}
                                            filterGroup={filter.filterGroup}
                                            value={line.ledger}
                                            onChange={(l) => updateLine(line.id, { ledger: l })}
                                            placeholder={filter.placeholder}
                                            variant="ghost"
                                        />
                                    </td>

                                    {/* Ghost Amount Input */}
                                    <td className="py-1 px-2 align-middle">
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs font-medium pointer-events-none select-none">₹</span>
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

                                    {/* Delete Row Action */}
                                    <td className="py-1 px-2 text-center align-middle">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeLine(line.id)}
                                            disabled={readOnly || lines.length <= 2}
                                            className={cn(
                                                "h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors",
                                                lines.length <= 2 && "opacity-20 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
                                            )}
                                            title={lines.length <= 2 ? "Minimum 2 lines required" : "Delete line"}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
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
                </table>

                {/* Dense Bottom Bar for Totals & Balancing Status */}
                <div className="px-4 py-2.5 bg-muted/30 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="text-muted-foreground text-[11px] font-medium">
                        {lines.length} {lines.length === 1 ? 'line' : 'lines'} • Double-entry balanced
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-2.5 py-1 rounded-md">
                            <span className="font-semibold text-blue-700 dark:text-blue-300">Total Dr:</span>
                            <span className="font-bold font-mono text-blue-900 dark:text-blue-100">
                                ₹{totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-md">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Total Cr:</span>
                            <span className="font-bold font-mono text-emerald-900 dark:text-emerald-100">
                                ₹{totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>

                        {/* Balance Badge */}
                        {isBalanced ? (
                            <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100/70 dark:bg-emerald-950/70 px-2 py-1 rounded-md">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Balanced</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold bg-amber-100/70 dark:bg-amber-950/70 px-2 py-1 rounded-md">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>
                                    Diff: ₹{Math.abs(diff).toFixed(2)} ({diff > 0 ? 'Dr heavy' : 'Cr heavy'})
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
