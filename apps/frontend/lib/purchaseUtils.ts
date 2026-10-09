import { PurchaseInvoiceFull } from '@/types';

export type PurchaseStatus = 'paid' | 'partial' | 'unpaid' | 'overdue' | 'draft';

export function getPurchaseStatus(inv: PurchaseInvoiceFull): PurchaseStatus {
    if (inv.status === 'DRAFT') return 'draft';
    
    const today = new Date().toISOString().split('T')[0];
    if (inv.outstanding <= 0) return 'paid';
    if (inv.dueDate && inv.dueDate < today) return 'overdue';
    if (inv.amountPaid > 0) return 'partial';
    return 'unpaid';
}

export const STATUS_CONFIG: Record<PurchaseStatus, { label: string; classes: string }> = {
    paid:    { label: 'Paid',    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial: { label: 'Partial', classes: 'bg-amber-50  text-amber-700  border-amber-200'   },
    unpaid:  { label: 'Unpaid',  classes: 'bg-slate-100 text-slate-600  border-slate-200'   },
    overdue: { label: 'Overdue', classes: 'bg-red-50    text-red-700    border-red-200'     },
    draft:   { label: 'Draft',   classes: 'bg-blue-50   text-blue-700   border-blue-200'    },
};
