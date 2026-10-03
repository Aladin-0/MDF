import React, { forwardRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { SaleInvoice, PrintSettingsConfig, CartItem } from '@/types';

interface InvoicePreviewProps {
    invoice: SaleInvoice;
    config?: PrintSettingsConfig;
}

const DEFAULT_WHOLESALE: PrintSettingsConfig = {
    template: 'A4',
    columns: [
        { id: "sn", label: "Sn.", isVisible: true, order: 1, width: "5%" },
        { id: "productName", label: "Product Name", isVisible: true, order: 2, width: "25%" },
        { id: "batch", label: "Batch", isVisible: true, order: 3, width: "10%" },
        { id: "ptr", label: "PTR", isVisible: true, order: 4, width: "10%" },
        { id: "pts", label: "PTS", isVisible: true, order: 5, width: "10%" },
        { id: "qty", label: "QTY", isVisible: true, order: 6, width: "10%" },
        { id: "hsn", label: "HSN", "isVisible": true, order: 7, width: "10%" },
        { id: "amount", label: "AMOUNT", isVisible: true, order: 8, width: "10%" }
    ],
    header: { showLogo: true, showDrugLicense: true, showGstin: true, customText: "S.P.S MANAVATA PHARMA" },
    footer: { bankDetails: "Bank: HDFC, A/C: 1234...", terms: "1. Goods once sold will not be taken back." }
};

// ─── Amount in words (Indian format) ──────────────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function toWords(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
    if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '');
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '');
    return toWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + toWords(n % 10000000) : '');
}

function amountInWords(amount: number): string {
    const intPart = Math.floor(amount);
    const decPart = Math.round((amount - intPart) * 100);
    let words = toWords(intPart) || 'Zero';
    if (decPart > 0) words += ' and ' + toWords(decPart) + ' Paise';
    return 'Rs. ' + words + ' Only';
}

function fmtAmt(n: number) {
    return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtExpiry(dateStr?: string) {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'MM/yy'); } catch { return dateStr; }
}

function abbrevMfg(manufacturer?: string) {
    if (!manufacturer) return '—';
    return manufacturer.substring(0, 5).toUpperCase();
}

export const ManavataA4Invoice = forwardRef<HTMLDivElement, InvoicePreviewProps>(({ invoice, config }, ref) => {
    const customer = invoice.customer || (invoice as any).patientName;
    const customerName = (invoice as any).patientName || customer?.name || 'Cash Customer';
    const customerAddress = invoice.patientAddress || customer?.address || '—';
    const customerPhone = customer?.phone || '—';
    const customerGstin = customer?.gstin || '—';
    const invoiceDate = invoice.invoiceDate || invoice.createdAt;
    const items = invoice.items || [];
    
    const isQuotation = !!invoice.quotationNo || invoice.invoiceNo?.startsWith('QT-');
    
    const activeConfig = config || DEFAULT_WHOLESALE;
    const columns = activeConfig?.columns || [];
    const sortedColumns = [...columns].filter(c => c.isVisible).sort((a, b) => a.order - b.order);
    const isQtyVisible = columns.find(c => c.id === 'qty')?.isVisible !== false;

    // --- Core Math Helper ---
    const calculateRowMath = (item: CartItem & { b_qty?: number, f_qty?: number, rate?: number }) => {
        const qty = Number(item.b_qty ?? item.totalQty ?? item.qtyStrips ?? 0);
        const freeQty = Number(item.f_qty ?? item.freeQtyStrips ?? 0);
        const mrp = Number(item.mrp ?? 0);
        const ptr = Number(item.ptr ?? item.rate ?? 0);
        const pts = Number(item.pts ?? 0);
        const gstPct = Number(item.gstRate ?? item.gstPct ?? 0);
        const discountFactor = item.discountPct > 0 ? (1 - item.discountPct / 100) : 1;
        const taxable = (ptr * qty * discountFactor) / (1 + gstPct / 100);
        const gstAmount = (ptr * qty * discountFactor) - taxable;
        const amount = ptr * qty * discountFactor;
        
        return { qty, freeQty, mrp, ptr, pts, gstPct, discountFactor, taxable, gstAmount, amount };
    };

    const renderCell = (item: CartItem & { b_qty?: number, f_qty?: number, rate?: number, packUnit?: string, hsnCode?: string }, columnId: string, idx: number) => {
        const { qty, freeQty, mrp, ptr, pts, gstPct, gstAmount, amount } = calculateRowMath(item);

        switch (columnId) {
            case 'sn': return idx + 1;
            case 'productName': return <div className="text-left font-bold uppercase">{item.name}</div>;
            case 'batch': return item.batchNo;
            case 'mrp': return <div className="text-right">{fmtAmt(mrp)}</div>;
            case 'ptr': return <div className="text-right">{fmtAmt(ptr)}</div>;
            case 'pts': return <div className="text-right">{fmtAmt(pts || ptr)}</div>;
            case 'qty': return <div className="font-bold">{qty}</div>;
            case 'hsn': return item.hsnCode || '3004';
            case 'amount': return <div className="text-right font-bold">{fmtAmt(amount)}</div>;
            case 'mfg': return abbrevMfg(item.manufacturer);
            case 'pack': return `${item.packSize || 1}${item.packUnit || 'T'}`;
            case 'exp': return fmtExpiry(item.expiryDate);
            case 'fr': return freeQty;
            case 'sgst': return `${gstPct / 2}%`;
            case 'cgst': return `${gstPct / 2}%`;
            case 'gstAmo': return <div className="text-right">{fmtAmt(gstAmount)}</div>;
            default: return '—';
        }
    };
    
    // Compute Tax Aggregates
    const { summary: taxSummary, totalTaxable, totalSgst, totalCgst } = useMemo(() => {
        const summary: Record<string, { taxable: number, sgst: number, cgst: number }> = {
            '5.00': { taxable: 0, sgst: 0, cgst: 0 },
            '12.00': { taxable: 0, sgst: 0, cgst: 0 },
            '18.00': { taxable: 0, sgst: 0, cgst: 0 },
            '28.00': { taxable: 0, sgst: 0, cgst: 0 },
        };
        let totalTaxable = 0;
        let totalSgst = 0;
        let totalCgst = 0;

        items.forEach(item => {
            const { qty, ptr, gstPct, discountFactor, taxable: rowTaxable, gstAmount: rowGst } = calculateRowMath(item);
            const rateStr = gstPct.toFixed(2);
            if (!summary[rateStr]) {
                summary[rateStr] = { taxable: 0, sgst: 0, cgst: 0 };
            }
            summary[rateStr].taxable += rowTaxable;
            summary[rateStr].sgst += rowGst / 2;
            summary[rateStr].cgst += rowGst / 2;

            totalTaxable += rowTaxable;
            totalSgst += rowGst / 2;
            totalCgst += rowGst / 2;
        });
        return { summary, totalTaxable, totalSgst, totalCgst };
    }, [items]);

    const totalQty = items.reduce((sum, item) => sum + (item.totalQty || item.qtyStrips || 0), 0);
    const derivedDiscount = invoice.subtotal > 0 ? Math.max(0, invoice.subtotal - invoice.grandTotal) : 0;
    const discountAmt = (invoice.discountAmount > 0) ? invoice.discountAmount : derivedDiscount;

    return (
        <div ref={ref} className="bg-white text-black font-sans w-full mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            <style dangerouslySetInnerHTML={{ __html: `
                @page {
                    size: A4 portrait;
                    margin: 10mm;
                }
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                table tr {
                    page-break-inside: avoid;
                }
            `}} />
            
            <div className="border border-black flex flex-col min-h-[250mm] w-full" style={{ maxWidth: '190mm', margin: '0 auto' }}>
                
                {/* ── HEADER ── */}
                <div className="flex border-b border-black">
                    <div className="w-2/3 p-2 border-r border-black">
                        <div className="text-xl font-bold">{activeConfig.header.customText || "S.P.S MANAVATA PHARMA"}</div>
                        <div className="text-xs uppercase">
                            SHOP NO. 1, 2, 3, GR FLOOR, SHANTA COMPLEX, NUTAN COLONY SIGNAL,<br/>
                            CHHATRAPATI SAMBHAJINAGAR - 431001
                        </div>
                        <div className="text-xs mt-1">
                            <span className="font-bold">Phone:</span> +91-0000000000 | <span className="font-bold">Email:</span> manavata@example.com
                        </div>
                        {activeConfig.header.showDrugLicense && (
                            <div className="text-xs mt-1 flex gap-4">
                                <div><span className="font-bold">DL.No.20B:</span> MH-MZ3-315174</div>
                                <div><span className="font-bold">21B:</span> MH-MZ3-315175</div>
                            </div>
                        )}
                        {activeConfig.header.showGstin && (
                            <div className="text-xs font-bold mt-1">GSTIN: 27AATCS1234A1Z5</div>
                        )}
                        
                        {/* Buyer Info */}
                        <div className="mt-3 border-t border-black pt-2">
                            <div className="text-xs font-bold underline mb-1">Details of Receiver (Billed To):</div>
                            <div className="text-sm font-bold">{customerName}</div>
                            <div className="text-xs uppercase">{customerAddress}</div>
                            <div className="text-xs mt-1"><span className="font-bold">Phone:</span> {customerPhone}</div>
                            <div className="text-xs font-bold">GSTIN: {customerGstin}</div>
                        </div>
                    </div>
                    
                    <div className="w-1/3 p-2 flex flex-col justify-between">
                        <div>
                            {!isQuotation && <div className="text-right text-xs font-bold">Original for Buyer</div>}
                            <div className="text-center font-bold text-lg mt-1 border border-black p-1 bg-gray-100">
                                {isQuotation ? 'QUOTATION / ESTIMATE' : 'GST INVOICE'}
                            </div>
                            <div className="text-center font-bold text-md mt-1 border border-black p-1">CREDIT</div>
                        </div>
                        <div className="text-xs mt-2">
                            <div><span className="font-bold">{isQuotation ? 'Quotation No:' : 'Invoice No:'}</span> {invoice.invoiceNo || invoice.quotationNo}</div>
                            <div><span className="font-bold">Date:</span> {format(new Date(invoiceDate), 'dd-MM-yyyy')}</div>
                            <div><span className="font-bold">Due Date:</span> {format(new Date(invoiceDate), 'dd-MM-yyyy')}</div>
                            {invoice.eway_bill_no && <div><span className="font-bold">E-Way Bill:</span> {invoice.eway_bill_no}</div>}
                        </div>
                        
                        {invoice.qr_code && (
                            <div className="mt-2 text-center">
                                <QRCodeSVG value={invoice.qr_code} size={64} className="mx-auto" />
                                <div className="text-[8px] break-all mt-1">{invoice.irn}</div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* ── GRID ── */}
                <div className="flex-grow">
                    <table className="w-full text-[10px] border-collapse text-center">
                        <thead className="border-b border-black text-[9px] font-bold">
                            <tr>
                                {sortedColumns.map((col, idx) => (
                                    <th 
                                        key={col.id} 
                                        className={`border-r border-black p-1 ${idx === sortedColumns.length - 1 ? 'border-r-0' : ''}`}
                                        style={{ width: col.width }}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, i) => (
                                <tr key={i} className="border-b border-gray-200">
                                    {sortedColumns.map((col, idx) => (
                                        <td 
                                            key={col.id}
                                            className={`border-r border-black p-1 ${idx === sortedColumns.length - 1 ? 'border-r-0' : ''}`}
                                        >
                                            {renderCell(item, col.id, i)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {/* ── FOOTER ── */}
                <div className="border-t border-black flex flex-row">
                    {/* LEFT SIDE (Tax Summary & Terms) */}
                    <div className="w-[65%] border-r border-black flex flex-col">
                        <table className="w-full text-[9px] border-collapse text-center">
                            <thead className="border-b border-black font-bold">
                                <tr>
                                    <th className="border-r border-black p-0.5">CLASS</th>
                                    <th className="border-r border-black p-0.5">TOTAL</th>
                                    <th className="border-r border-black p-0.5">SCHEME</th>
                                    <th className="border-r border-black p-0.5">DISCOUNT</th>
                                    <th className="border-r border-black p-0.5">SGST</th>
                                    <th className="border-r border-black p-0.5">CGST</th>
                                    <th className="border-r border-black p-0.5">TOTAL GST</th>
                                    <th className="p-0.5">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(taxSummary).map(([rate, vals]) => (
                                    <tr key={rate}>
                                        <td className="border-r border-black p-0.5">GST {rate}%</td>
                                        <td className="border-r border-black p-0.5 text-right">{fmtAmt(vals.taxable)}</td>
                                        <td className="border-r border-black p-0.5 text-right">0.00</td>
                                        <td className="border-r border-black p-0.5 text-right">0.00</td>
                                        <td className="border-r border-black p-0.5 text-right">{fmtAmt(vals.sgst)}</td>
                                        <td className="border-r border-black p-0.5 text-right">{fmtAmt(vals.cgst)}</td>
                                        <td className="border-r border-black p-0.5 text-right">{fmtAmt(vals.sgst + vals.cgst)}</td>
                                        <td className="p-0.5 text-right">{fmtAmt(vals.taxable)}</td>
                                    </tr>
                                ))}
                                <tr className="border-t border-black font-bold bg-gray-50">
                                    <td className="border-r border-black p-0.5">TOTAL</td>
                                    <td className="border-r border-black p-0.5 text-right">{fmtAmt(totalTaxable)}</td>
                                    <td className="border-r border-black p-0.5 text-right">0.00</td>
                                    <td className="border-r border-black p-0.5 text-right">0.00</td>
                                    <td className="border-r border-black p-0.5 text-right">{fmtAmt(totalSgst)}</td>
                                    <td className="border-r border-black p-0.5 text-right">{fmtAmt(totalCgst)}</td>
                                    <td className="border-r border-black p-0.5 text-right">{fmtAmt(totalSgst + totalCgst)}</td>
                                    <td className="p-0.5 text-right">{fmtAmt(totalTaxable)}</td>
                                </tr>
                            </tbody>
                        </table>
                        
                        <div className="border-t border-black p-1 text-[9px] font-bold">
                            Rs. {amountInWords(invoice.grandTotal).replace('Rs. ', '').replace(' Only', '')} only
                        </div>
                        <div className="border-t border-black p-1 text-[8px] font-bold">
                            MSG. GST {fmtAmt(totalTaxable)}*2.5=2.5%={fmtAmt(totalSgst)}SGST+{fmtAmt(totalCgst)}CGST, &quot;Thanks For Dealing With Manavata&quot;
                        </div>
                        
                        <div className="border-t border-black text-[9px] flex flex-col h-full relative">
                            <div className="font-bold border-b border-black p-1 bg-gray-100">Terms & Conditions</div>
                            <div className="flex flex-row h-full">
                                <div className="w-2/3 p-1">
                                    <div className="whitespace-pre-wrap text-[8px]">{activeConfig.footer.bankDetails}</div>
                                    <div className="whitespace-pre-wrap text-[8px] mt-1">{activeConfig.footer.terms}</div>
                                    <br/>
                                    OUTSTANDING :         0.00
                                </div>
                                <div className="w-1/3 text-center flex flex-col items-center justify-end pb-2 relative">
                                    <div className="font-bold text-[10px] absolute top-1">FOR S.P.S MANAVATA PHARMA</div>
                                    <div className="h-8 w-full mt-4 flex items-center justify-center">
                                        <span className="font-signature text-xl opacity-60 transform -rotate-12 italic text-blue-800">Authorised Signatory</span>
                                    </div>
                                    <div className="font-bold text-[9px]">Authorised Signatory</div>
                                </div>
                            </div>
                            <div className="absolute -bottom-4 left-0 text-[6px] text-gray-500 w-full truncate">
                                Digital Purchase | ERP Ordering | Healthcare QRCode on bills for extra savings | Call MARG 8237284107, 9890315569
                            </div>
                        </div>
                    </div>
                    
                    {/* RIGHT SIDE (Totals) */}
                    <div className="w-[35%] flex flex-col">
                        <div className="flex flex-row h-full">
                            <div className="w-1/2 border-r border-black p-1 text-[10px]">
                                <div className="flex justify-between mb-1"><span>Total Items :-</span> <span className="font-bold">{items.length}</span></div>
                                {isQtyVisible && (
                                    <div className="flex justify-between"><span>Total Qty :-</span> <span className="font-bold">{totalQty}</span></div>
                                )}
                            </div>
                            <div className="w-1/2 p-1 text-[10px]">
                                <div className="flex justify-between mb-1"><span>DIS AMT..</span> <span className="text-right">{fmtAmt(discountAmt)}</span></div>
                                <div className="flex justify-between mb-1"><span>GST PAYBLE</span> <span className="text-right">{fmtAmt(invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount)}</span></div>
                                <div className="flex justify-between mb-1"><span>CR/DR NOTE</span> <span className="text-right">0.00</span></div>
                                <div className="flex justify-between"><span>CR/DR NOTE</span> <span className="text-right">0.00</span></div>
                            </div>
                        </div>
                        <div className="mt-auto border-t border-black p-2 flex justify-between items-center bg-gray-50">
                            <span className="font-bold text-lg">Grand Total</span>
                            <span className="font-bold text-xl">{fmtAmt(invoice.grandTotal)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
ManavataA4Invoice.displayName = 'ManavataA4Invoice';
