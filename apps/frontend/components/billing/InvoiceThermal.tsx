'use client';

import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { SaleInvoice, PrintSettingsConfig } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { formatQty } from '@/lib/utils';

interface InvoiceThermalProps {
    invoice: SaleInvoice;
    config?: PrintSettingsConfig;
}

const DEFAULT_RETAIL: PrintSettingsConfig = {
    template: 'Thermal_80mm',
    columns: [
        { id: "sn", label: "Sn.", isVisible: true, order: 1, width: "10%" },
        { id: "productName", label: "Item", isVisible: true, order: 2, width: "40%" },
        { id: "qty", label: "Qty", isVisible: true, order: 3, width: "15%" },
        { id: "mrp", label: "M.R.P", isVisible: true, order: 4, width: "15%" },
        { id: "amount", label: "Amt", isVisible: true, order: 5, width: "20%" },
    ],
    header: { showLogo: true, showDrugLicense: false, showGstin: true, customText: "" },
    footer: { bankDetails: "", terms: "1. Goods once sold will not be taken back." }
};

export const InvoiceThermal = forwardRef<HTMLDivElement, InvoiceThermalProps>(({ invoice, config }, ref) => {
    const { outlet, user } = useAuthStore();
    
    const isQuotation = invoice.invoiceNo?.startsWith('QT-');

    const activeConfig = config || DEFAULT_RETAIL;
    const sortedColumns = [...activeConfig.columns].filter(c => c.isVisible).sort((a, b) => a.order - b.order);

    const renderCell = (item: any, columnId: string, idx: number) => {
        const qtyDisplay = formatQty(item.qtyStrips ?? 0, item.qtyLoose ?? 0, item.packSize ?? 1, item.packType, item.packUnit);
        const qty = Number(item.b_qty ?? item.totalQty ?? item.qtyStrips ?? 0);
        const mrp = Number(item.mrp ?? 0);
        const ptr = Number(item.ptr ?? item.rate ?? 0);
        const pts = Number(item.pts ?? 0);
        const amount = item.totalAmount ?? (qty * ptr * (1 - (item.discountPct ?? 0) / 100));

        switch (columnId) {
            case 'sn': return idx + 1;
            case 'productName': return <div className="font-bold whitespace-normal">{item.name || item.productId} ({(item.batchNo || 'B').slice(0, 8)})</div>;
            case 'batch': return item.batchNo;
            case 'mrp': return <div className="text-right">{mrp.toFixed(2)}</div>;
            case 'ptr': return <div className="text-right">{ptr.toFixed(2)}</div>;
            case 'pts': return <div className="text-right">{(pts || ptr).toFixed(2)}</div>;
            case 'qty': return <div className="text-center text-[9px] leading-tight whitespace-pre-wrap">{qtyDisplay}</div>;
            case 'amount': return <div className="text-right">{amount.toFixed(2)}</div>;
            case 'hsn': return item.hsnCode || '3004';
            default: return '—';
        }
    };
    
    return (
        <div ref={ref} className="bg-white text-black w-[80mm] mx-auto p-4 font-mono text-[11px] leading-snug print:m-0 print:p-2 shadow max-w-[80mm]">
            
            <div className="text-center mb-4">
                <h1 className="font-bold text-[14px] uppercase">{activeConfig.header.customText || outlet?.name || 'MediFlow Pharmacy'}</h1>
                <p>{outlet?.address || '123 Health St, City'}</p>
                <p>Ph: {outlet?.phone || '+91 0000000000'}</p>
                {activeConfig.header.showGstin && <p>GSTIN: {outlet?.gstin || ''}</p>}
                {activeConfig.header.showDrugLicense && <p>DL: MH-MZ3-315174</p>}
            </div>

            {isQuotation && (
                <div className="text-center font-bold text-[13px] border-y border-black py-1 mb-2">
                    ESTIMATE (NOT A BILL)
                </div>
            )}

            <div className="border-t border-b border-black border-dashed py-2 mb-3">
                <div className="flex justify-between">
                    <span>{isQuotation ? 'EST' : 'INV'}: {invoice.invoiceNo ?? '—'}</span>
                    <span>{invoice.createdAt && !isNaN(new Date(invoice.createdAt).getTime()) ? format(new Date(invoice.createdAt), 'dd.MM.yy') : '—'}</span>
                </div>
                <div className="flex justify-between mt-1">
                    <span>Staff: {user?.name?.split(' ')[0] || 'Admin'}</span>
                    <span>{invoice.createdAt && !isNaN(new Date(invoice.createdAt).getTime()) ? format(new Date(invoice.createdAt), 'hh:mm a') : '—'}</span>
                </div>
            </div>

            <table className="w-full text-left table-fixed text-[10px]">
                <thead>
                    <tr className="border-b border-black">
                        {sortedColumns.map((col) => (
                            <th key={col.id} className="py-1" style={{ width: col.width }}>
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(invoice.items ?? []).map((item, index) => (
                        <tr key={index} className="border-b border-gray-200 border-dashed">
                            {sortedColumns.map((col) => (
                                <td key={col.id} className="py-1 align-top">
                                    {renderCell(item, col.id, index)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="border-t border-black border-dashed mt-3 pt-2">
                <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{(invoice.subtotal ?? 0).toFixed(2)}</span>
                </div>
                {(invoice.discountAmount ?? 0) > 0 && (
                    <div className="flex justify-between font-bold">
                        <span>Discount:</span>
                        <span>-{(invoice.discountAmount ?? 0).toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between">
                    <span>Taxable:</span>
                    <span>{(invoice.taxableAmount ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>CGST+SGST:</span>
                    <span>{((invoice.cgst ?? 0) + (invoice.sgst ?? 0)).toFixed(2)}</span>
                </div>
                {(invoice.roundOff ?? 0) !== 0 && (
                    <div className="flex justify-between">
                        <span>Round Off:</span>
                        <span>{(invoice.roundOff ?? 0).toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="border-t border-b border-black py-2 mt-2 font-bold text-[14px]">
                <div className="flex justify-between">
                    <span>GRAND TOTAL:</span>
                    <span>Rs.{(invoice.grandTotal ?? 0).toFixed(2)}</span>
                </div>
            </div>

            <div className="mt-2 mb-4">
                <div className="flex justify-between">
                    <span>Paid ({invoice.paymentMode ?? 'cash'}):</span>
                    <span>{(invoice.amountPaid ?? 0).toFixed(2)}</span>
                </div>
                {(invoice.amountPaid ?? 0) > (invoice.grandTotal ?? 0) && (
                    <div className="flex justify-between font-bold">
                        <span>Change:</span>
                        <span>{((invoice.amountPaid ?? 0) - (invoice.grandTotal ?? 0)).toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="text-center mt-6">
                {activeConfig.footer.bankDetails && <p className="mb-2 whitespace-pre-wrap">{activeConfig.footer.bankDetails}</p>}
                {activeConfig.footer.terms && <p className="mb-2 whitespace-pre-wrap">{activeConfig.footer.terms}</p>}
                <p>*** Thank You / Get Well Soon ***</p>
                <p className="mt-4">Software by MediFlow</p>
            </div>
            
            {/* Some thermal printers need empty space at the end to cut cleanly */}
            <div className="h-10"></div>
        </div>
    );
});
InvoiceThermal.displayName = 'InvoiceThermal';
