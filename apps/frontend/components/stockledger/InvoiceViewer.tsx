'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/shared/ModalShell';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';
import { PurchaseDetailModal } from '@/components/purchases/PurchaseDetailModal';
import { usePurchaseById } from '@/hooks/usePurchases';
import { useSaleById } from '@/hooks/useSales';
import { apiErrorMessage } from '@/lib/apiError';
import type { InvoiceRef } from '@/lib/stockLedger';

/**
 * Opens the sale or purchase invoice a stock movement came from, in the same preview the Sales and Purchases pages use (with
 * its Print and "Save as PDF"). Nothing is edited from here. A small "opening…" box shows while it loads, and the reason if it cannot.
 */
export function InvoiceViewer({ target, onClose }: { target: InvoiceRef; onClose: () => void }) {
    return target.kind === 'sale' ? <SaleViewer id={target.id} onClose={onClose} /> : <PurchaseViewer id={target.id} onClose={onClose} />;
}

function Waiting({ title, loading, error, onRetry, onClose }: { title: string; loading: boolean; error: unknown; onRetry: () => void; onClose: () => void }) {
    return (
        <ModalShell open onClose={onClose} title={title} size="sm" footer={<Button type="button" variant="outline" className="flex-1" onClick={onClose}>Close</Button>}>
            {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Opening the invoice…</p>}
            {!!error && (
                <p role="alert" className="text-sm text-destructive">
                    {apiErrorMessage(error, 'The invoice could not be opened.')} It may have been deleted, or you may not have access to it.{' '}
                    <button type="button" className="underline" onClick={onRetry}>Try again</button>
                </p>
            )}
        </ModalShell>
    );
}

function SaleViewer({ id, onClose }: { id: string; onClose: () => void }) {
    const sale = useSaleById(id);
    if (sale.data) return <InvoicePreviewModal isOpen onClose={onClose} invoice={sale.data as any} />;
    return <Waiting title="Sale invoice" loading={sale.isLoading} error={sale.error} onRetry={() => sale.refetch()} onClose={onClose} />;
}

function PurchaseViewer({ id, onClose }: { id: string; onClose: () => void }) {
    const purchase = usePurchaseById(id);
    if (purchase.data) return <PurchaseDetailModal open onOpenChange={(o) => { if (!o) onClose(); }} invoice={purchase.data as any} />;
    return <Waiting title="Purchase invoice" loading={purchase.isLoading} error={purchase.error} onRetry={() => purchase.refetch()} onClose={onClose} />;
}
