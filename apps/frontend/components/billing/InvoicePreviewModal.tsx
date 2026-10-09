'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Download, FileText, Edit, History, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SaleInvoice } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { InvoiceThermal } from './InvoiceThermal';
import { ManavataA4Invoice } from '@/components/print/ManavataA4Invoice';
import { cn } from '@/lib/utils';
import { useOutletSettings } from '@/hooks/useOutletSettings';

interface InvoicePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: SaleInvoice | null;
    onNewBill?: () => void;
    onEdit?: (invoice: SaleInvoice) => void;
    onViewHistory?: (invoice: SaleInvoice) => void;
}

// A4 landscape at 96dpi: 297mm x 210mm
const A4_LANDSCAPE_WIDTH_PX = 1123;

export function InvoicePreviewModal({ isOpen, onClose, invoice, onNewBill, onEdit, onViewHistory }: InvoicePreviewModalProps) {
    const { printerType } = useSettingsStore();
    const { settings } = useOutletSettings();
    const printRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // --- auto-fit (scale) logic for A4 preview ---
    const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
    const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const [contentHeight, setContentHeight] = useState(0);

    const isThermal = !!printerType?.startsWith('thermal');

    useLayoutEffect(() => {
        if (isThermal || !viewportEl) return;
        const update = () => {
            const available = viewportEl.clientWidth - 32; // padding
            setScale(Math.min(1, Math.max(0.3, available / A4_LANDSCAPE_WIDTH_PX)));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(viewportEl);
        return () => ro.disconnect();
    }, [viewportEl, isThermal]);

    useEffect(() => {
        if (isThermal || !contentEl) return;
        const update = () => setContentHeight(contentEl.offsetHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(contentEl);
        return () => ro.disconnect();
    }, [contentEl, isThermal]);

    const handlePrint = () => {
        if (typeof window !== 'undefined') {
            window.print();
        }
    };

    if (!invoice) return null;

    const isQuotation = invoice.invoiceNo?.startsWith('QT-') || !!(invoice as any).quotationNo;
    const isWholesale = invoice?.saleType?.toUpperCase() === 'WHOLESALE';
    const documentNumber = invoice.invoiceNo || (invoice as any).quotationNo;
    const activeConfig = isWholesale
        ? (settings?.printSettingsWholesale || { columns: [], header: {}, footer: {} })
        : (settings?.printSettingsRetail || { columns: [], header: {}, footer: {} });

    return (
        <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className={cn(
                "invoice-print-container flex flex-col p-0 gap-0 overflow-hidden print:max-h-none print:overflow-visible print:border-none bg-slate-100/50 print:bg-white text-black",
                !isThermal
                    ? "w-[96vw] max-w-[1200px] sm:max-w-[1200px] h-[92vh]"
                    : "max-w-md max-h-[95vh]"
            )}>
                <style dangerouslySetInnerHTML={{
                    __html: `
                        @media print {
                            @page {
                                size: ${!isThermal ? 'A4 landscape' : printerType === 'thermal_80mm' ? '80mm auto' : '57mm auto'};
                                margin: 0mm;
                            }
                            html, body {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                            body * { visibility: hidden; }
                            .invoice-print-container, .invoice-print-container * { visibility: visible; }
                            .invoice-print-container {
                                position: absolute !important;
                                left: 0 !important;
                                top: 0 !important;
                                margin: 0 !important;
                                width: 100% !important;
                                max-width: none !important;
                                height: auto !important;
                                max-height: none !important;
                                overflow: visible !important;
                                transform: none !important;
                                box-shadow: none !important;
                            }
                            .invoice-scroll-area {
                                overflow: visible !important;
                                padding: 0 !important;
                                height: auto !important;
                            }
                            .a4-scale-box {
                                width: 100% !important;
                                height: auto !important;
                            }
                            .a4-scale-inner {
                                transform: none !important;
                                width: 100% !important;
                            }
                            .invoice-print-container .print\\:hidden, .invoice-print-container .print\\:hidden * {
                                display: none !important;
                            }
                        }
                    `}} />

                <DialogHeader className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-row flex-wrap items-center justify-between gap-3 shrink-0 print:hidden space-y-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="whitespace-nowrap truncate">
                                {isQuotation ? 'Estimate / Quotation' : 'Invoice'} {documentNumber}
                            </DialogTitle>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Preview generated for {isThermal ? 'Thermal Receipt' : 'A4 Landscape'}
                                {!isThermal && scale < 1 && ` · fit to ${Math.round(scale * 100)}%`}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mr-6">
                        {onViewHistory && (
                            <Button variant="outline" size="sm" onClick={() => onViewHistory(invoice)}>
                                <History className="w-4 h-4 mr-2" /> History
                            </Button>
                        )}
                        {!isQuotation && (
                            <Button variant="outline" size="sm" onClick={() => { onClose(); router.push(`/dashboard/accounts/sale-returns/new?invoiceId=${invoice.id}`); }}>
                                <Undo2 className="w-4 h-4 mr-2" /> Return
                            </Button>
                        )}
                        {onEdit && (
                            <Button variant="outline" size="sm" onClick={() => onEdit(invoice)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => { }}>
                            <Download className="w-4 h-4 mr-2" /> PDF
                        </Button>
                        <Button size="sm" onClick={handlePrint}>
                            <Printer className="w-4 h-4 mr-2" /> Print
                        </Button>
                    </div>
                </DialogHeader>

                {/* Plain scroll container (min-h-0 is required so flex child can shrink and scroll) */}
                <div
                    ref={setViewportEl}
                    className="invoice-scroll-area flex-1 min-h-0 overflow-auto p-4 sm:p-6 bg-slate-100/50 print:bg-white text-black"
                >
                    {isThermal ? (
                        <div className="mx-auto bg-white shadow-xl min-h-[500px] print:shadow-none print:m-0 w-full">
                            <div id="print-section" className="w-full bg-white text-black">
                                <InvoiceThermal ref={printRef} invoice={invoice} config={activeConfig} />
                            </div>
                        </div>
                    ) : (
                        <div
                            className="a4-scale-box mx-auto print:m-0"
                            style={{
                                width: A4_LANDSCAPE_WIDTH_PX * scale,
                                height: contentHeight ? contentHeight * scale : undefined,
                            }}
                        >
                            <div
                                ref={setContentEl}
                                className="a4-scale-inner bg-white shadow-xl print:shadow-none"
                                style={{
                                    width: A4_LANDSCAPE_WIDTH_PX,
                                    transform: `scale(${scale})`,
                                    transformOrigin: 'top left',
                                }}
                            >
                                <div id="print-section" className="w-full bg-white text-black">
                                    <ManavataA4Invoice ref={printRef as any} invoice={invoice} config={activeConfig} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="px-6 py-3 bg-white border-t border-slate-200 shrink-0 sm:justify-between items-center print:hidden">
                    <p className="text-xs text-slate-500 hidden sm:block">Press <kbd className="bg-slate-100 border px-1 rounded-sm">Ctrl+P</kbd> to quick print</p>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
                            Close Preview
                        </Button>
                        {onNewBill && (
                            <Button type="button" onClick={() => { onClose(); onNewBill(); }} className="flex-1 sm:flex-none">
                                Start New Bill
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}