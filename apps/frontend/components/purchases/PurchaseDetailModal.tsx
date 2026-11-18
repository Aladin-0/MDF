'use client';

import { useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit, FileText, History, Printer, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { usePurchaseById } from '@/hooks/usePurchases';
import { getPurchaseStatus, STATUS_CONFIG } from '@/lib/purchaseUtils';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/lib/utils';
import type { PurchaseInvoiceFull } from '@/types';
import { PURCHASE_PAPER_WIDTH_PX, PurchaseInvoiceDocument, type Letterhead } from './PurchaseInvoiceDocument';

interface PurchaseDetailModalProps {
    onEdit?: (invoice: PurchaseInvoiceFull) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: PurchaseInvoiceFull | null;
}

const PRINT_CSS = `
@media print {
    @page { size: A4 portrait; margin: 8mm; }
    html, body { height: auto !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body * { visibility: hidden; }
    #purchase-print-root, #purchase-print-root * { visibility: visible; }
    .purchase-print-dialog { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; width: 100% !important; max-width: none !important; height: auto !important; max-height: none !important; transform: none !important; box-shadow: none !important; border: 0 !important; overflow: visible !important; }
    .purchase-scroll { overflow: visible !important; padding: 0 !important; background: #fff !important; }
    .purchase-scale-box { width: 100% !important; height: auto !important; margin: 0 !important; }
    .purchase-scale-inner { width: 100% !important; transform: none !important; box-shadow: none !important; }
    #purchase-print-root thead { display: table-header-group; }
    #purchase-print-root tr, #purchase-print-root .break-inside-avoid { break-inside: avoid; }
}`;

/**
 * The purchase invoice preview used all over the app (Purchases list, a supplier's ledger, the Stock Ledger). It shows the invoice as the
 * DOCUMENT it prints as (letterhead, supplier, items, GST summary, totals in words, signatures), scaled to fit, with the actions above it.
 * Print / PDF prints exactly this page: choose "Save as PDF" in the print window to download it.
 */
export function PurchaseDetailModal({ open, onOpenChange, invoice, onEdit }: PurchaseDetailModalProps) {
    const { data: fullInvoiceRes, isLoading } = usePurchaseById(open && invoice ? invoice.id : '');
    const { outlet, user } = useAuthStore();
    const settings = useSettingsStore();
    const router = useRouter();
    const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
    const [content, setContent] = useState<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const [height, setHeight] = useState(0);

    // fit the paper to the width it has (a phone shows it small and scrolls the rest; it never shrinks below 55%)
    useLayoutEffect(() => {
        if (!viewport) return;
        const update = () => setScale(Math.min(1, Math.max(0.55, (viewport.clientWidth - 24) / PURCHASE_PAPER_WIDTH_PX)));
        update();
        const ro = new ResizeObserver(update);
        ro.observe(viewport);
        return () => ro.disconnect();
    }, [viewport]);
    useLayoutEffect(() => {
        if (!content) return;
        const update = () => setHeight(content.offsetHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(content);
        return () => ro.disconnect();
    }, [content]);

    if (!invoice) return null;

    const d = (fullInvoiceRes || invoice) as PurchaseInvoiceFull;
    const status = getPurchaseStatus(d);
    const cfg = STATUS_CONFIG[status];
    const canEditPaid = user?.role === 'super_admin' || user?.role === 'admin' || !!user?.canModifyPaidPurchases;
    const showEditBtn = !!onEdit && (d.paymentStatus !== 'paid' || canEditPaid);

    const letterhead: Letterhead = {
        name: settings.outletName || outlet?.name || '',
        address: settings.outletAddress || outlet?.address || '',
        city: settings.outletCity || outlet?.city || '',
        phone: settings.outletPhone || outlet?.phone || '',
        gstin: settings.outletGstin || outlet?.gstin || '',
        drugLicenseNo: settings.outletDrugLicenseNo || outlet?.drugLicenseNo || '',
        state: settings.outletState || outlet?.state || '',
        logoUrl: settings.outletLogoUrl || outlet?.logoUrl,
    };
    const go = (path: string) => { onOpenChange(false); router.push(path); };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="purchase-print-dialog flex h-[94dvh] max-h-[94dvh] w-[98vw] max-w-5xl flex-col gap-0 overflow-hidden border-t-4 border-t-primary p-0 print:border-0">
                <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

                <div className="flex flex-col gap-3 border-b bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 print:hidden">
                    <div className="flex min-w-0 items-center gap-3 max-sm:pr-8">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></div>
                        <div className="min-w-0">
                            <DialogTitle className="text-lg sm:text-xl">Purchase Invoice</DialogTitle>
                            <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2 break-all text-sm">
                                Invoice #{d.invoiceNo}
                                <span className={cn('rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest', cfg.classes)}>{cfg.label}</span>
                            </DialogDescription>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:mr-8">
                        {showEditBtn && (
                            <Button variant="outline" size="sm" data-testid="btn-edit-purchase" onClick={() => onEdit!(d)} disabled={!d.items || !Array.isArray(d.items)}>
                                <Edit className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => go(`/dashboard/purchases/revisions/${d.id}`)}><History className="mr-2 h-4 w-4" aria-hidden="true" /> History</Button>
                        <Button variant="outline" size="sm" onClick={() => go(`/dashboard/accounts/purchase-returns/new?invoiceNo=${encodeURIComponent(d.invoiceNo)}`)}><Undo2 className="mr-2 h-4 w-4" aria-hidden="true" /> Return</Button>
                        <Button size="sm" onClick={() => window.print()} title="Opens the print window: choose “Save as PDF” as the printer to download it">
                            <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> Print / PDF
                        </Button>
                    </div>
                </div>

                {/* the paper, on a grey desk */}
                <div ref={setViewport} className="purchase-scroll min-h-0 flex-1 overflow-auto bg-slate-200/70 p-3 sm:p-6">
                    <div className="purchase-scale-box mx-auto" style={{ width: PURCHASE_PAPER_WIDTH_PX * scale, height: height ? height * scale : undefined }}>
                        <div ref={setContent} className="purchase-scale-inner bg-white p-6 shadow-xl" style={{ width: PURCHASE_PAPER_WIDTH_PX, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                            <PurchaseInvoiceDocument invoice={d} letterhead={letterhead} statusLabel={cfg.label} statusClasses={cfg.classes} loadingItems={isLoading && !d.items?.length} />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
