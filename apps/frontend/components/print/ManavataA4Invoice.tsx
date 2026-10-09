import React, { forwardRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { SaleInvoice, PrintSettingsConfig, CartItem } from '@/types';

interface InvoicePreviewProps {
    invoice: SaleInvoice;
    config?: PrintSettingsConfig;
    template?: 'A4' | 'A5';
    saleType?: 'RETAIL' | 'WHOLESALE';
}

const DEFAULT_CONFIG: PrintSettingsConfig = {
    template: 'A4',
    columns: [],
    header: { showLogo: true, showDrugLicense: true, showGstin: true, customText: "S.P.S MANAVATA PHARMA" },
    footer: { bankDetails: "Bank: HDFC, A/C: 1234...", terms: "1. Goods once sold will not be taken back." }
};

// ─── Math & Format Helpers ────────────────────────────────────────────────
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

export function amountInWords(amount: number): string {
    const intPart = Math.floor(amount);
    const decPart = Math.round((amount - intPart) * 100);
    let words = toWords(intPart) || 'Zero';
    if (decPart > 0) words += ' and ' + toWords(decPart) + ' Paise';
    return 'Rs. ' + words + ' Only';
}

export function fmtAmt(n: number) {
    return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtExpiry(dateStr?: string) {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'MM/yy'); } catch { return dateStr; }
}

export function abbrevMfg(manufacturer?: string) {
    if (!manufacturer) return '—';
    return manufacturer.substring(0, 5).toUpperCase();
}

// ─── Main Component ───────────────────────────────────────────────────────
export const ManavataA4Invoice = forwardRef<HTMLDivElement, InvoicePreviewProps>(({ invoice, config, template, saleType }, ref) => {
    const activeConfig = config || DEFAULT_CONFIG;
    const isWholesale = saleType?.toUpperCase() === 'WHOLESALE' || invoice.saleType?.toUpperCase() === 'WHOLESALE';
    const isA4 = template === 'A4' || activeConfig.template === 'A4';
    
    const customer = invoice.customer || (invoice as any).patientName;
    const customerName = (invoice as any).patientName || customer?.name || 'Cash Customer';
    const customerAddress = invoice.patientAddress || customer?.address || '—';
    const customerPhone = customer?.phone || '—';
    const customerGstin = customer?.gstin || '—';
    const invoiceDate = invoice.invoiceDate || invoice.createdAt;
    const items = invoice.items || [];
    
    const isQuotation = !!invoice.quotationNo || invoice.invoiceNo?.startsWith('QT-');

    // Dynamic Columns Support
    const defaultRetailColumns = [
        { id: "sn", label: "SN", isVisible: true, order: 1, width: "5%" },
        { id: "productName", label: "Item Name & Company", isVisible: true, order: 2, width: "31%" },
        { id: "batch", label: "Batch", isVisible: true, order: 3, width: "11%" },
        { id: "exp", label: "Exp", isVisible: true, order: 4, width: "8%" },
        { id: "qty", label: "Qty", isVisible: true, order: 5, width: "8%" },
        { id: "mrp", label: "MRP", isVisible: true, order: 6, width: "9%" },
        { id: "ptr", label: "Rate", isVisible: true, order: 7, width: "9%" },
        { id: "disc", label: "Disc", isVisible: true, order: 8, width: "7%" },
        { id: "amount", label: "Amount(₹)", isVisible: true, order: 9, width: "12%" }
    ];

    const defaultWholesaleColumns = [
        { id: "sn", label: "SN", isVisible: true, order: 1, width: "4%" },
        { id: "productName", label: "Item Name & Details", isVisible: true, order: 2, width: "22%" },
        { id: "hsn", label: "HSN", isVisible: true, order: 3, width: "6%" },
        { id: "batch", label: "Batch", isVisible: true, order: 4, width: "8%" },
        { id: "exp", label: "Exp", isVisible: true, order: 5, width: "6%" },
        { id: "b_qty", label: "B-Qty", isVisible: true, order: 6, width: "5%" },
        { id: "f_qty", label: "F-Qty", isVisible: true, order: 7, width: "5%" },
        { id: "mrp", label: "MRP", isVisible: true, order: 8, width: "7%" },
        { id: "ptr", label: "PTR", isVisible: true, order: 9, width: "7%" },
        { id: "disc", label: "Disc", isVisible: true, order: 10, width: "5%" },
        { id: "gst", label: "GST", isVisible: true, order: 11, width: "5%" },
        { id: "taxable", label: "Taxable", isVisible: true, order: 12, width: "8%" },
        { id: "amount", label: "Amount(₹)", isVisible: true, order: 13, width: "12%" }
    ];

    const defaultActiveColumns = isWholesale ? defaultWholesaleColumns : defaultRetailColumns;
    const activeColumns = (activeConfig.columns && activeConfig.columns.length > 0) 
        ? activeConfig.columns 
        : defaultActiveColumns;
    const sortedColumns = [...activeColumns].filter(c => c.isVisible).sort((a, b) => a.order - b.order);

    const calculateRowMath = (item: CartItem & { b_qty?: number, f_qty?: number, rate?: number }) => {
        // Calculate true fractional quantity (Strips + Loose/PackSize) to ensure math aligns with Pack-based MRP
        const packSize = Number(item.packSize || 1);
        const qtyStrips = Number(item.qtyStrips || 0);
        const qtyLoose = Number(item.qtyLoose || 0);
        
        let qty = 0;
        if (item.qtyStrips !== undefined || item.qtyLoose !== undefined) {
            qty = qtyStrips + (qtyLoose / packSize);
        } else {
            qty = Number(item.b_qty ?? item.totalQty ?? 0);
        }

        const freeQty = Number(item.f_qty ?? item.freeQtyStrips ?? 0);
        const mrp = Number(item.mrp ?? 0);
        const ptr = Number(item.ptr ?? item.rate ?? 0);
        const pts = Number(item.pts ?? 0);
        const gstPct = Number(item.gstRate ?? item.gstPct ?? 0);
        const discountFactor = item.discountPct > 0 ? (1 - item.discountPct / 100) : 1;
        
        const taxable = (ptr * qty * discountFactor) / (1 + gstPct / 100);
        const gstAmount = (ptr * qty * discountFactor) - taxable;
        const amount = ptr * qty * discountFactor;
        
        return { qty, qtyStrips, qtyLoose, freeQty, mrp, ptr, pts, gstPct, discountFactor, taxable, gstAmount, amount, disc: item.discountPct || 0 };
    };

    const renderCell = (item: CartItem & any, columnId: string, idx: number) => {
        const { qty, qtyStrips, qtyLoose, freeQty, mrp, ptr, pts, gstPct, taxable, amount, disc } = calculateRowMath(item);

        switch (columnId) {
            case 'sn': return idx + 1;
            case 'productName': return (
                <>
                    <span className="font-bold text-gray-900 leading-none uppercase text-[0.65rem]">{item.name || item.productName}</span>
                    <span className="text-gray-500 leading-none ml-1 uppercase text-[0.55rem]">{abbrevMfg(item.manufacturer)}</span>
                </>
            );
            case 'hsn': return item.hsnCode || '3004';
            case 'batch': return item.batchNo || item.batch;
            case 'exp': return fmtExpiry(item.expiryDate);
            case 'qty': 
                if (qtyStrips > 0 || qtyLoose > 0) {
                    return <span className="font-bold">{qtyStrips > 0 ? `${qtyStrips} S` : ''}{qtyLoose > 0 ? ` ${qtyLoose} L` : ''}</span>;
                }
                return <span className="font-bold">{qty}</span>;
            case 'b_qty': 
                if (qtyStrips > 0 || qtyLoose > 0) {
                    return <span className="font-bold">{qtyStrips > 0 ? `${qtyStrips} S` : ''}{qtyLoose > 0 ? ` ${qtyLoose} L` : ''}</span>;
                }
                return <span className="font-bold">{qty}</span>;
            case 'f_qty': return freeQty || 0;
            case 'mrp': return fmtAmt(mrp);
            case 'ptr': return fmtAmt(ptr);
            case 'pts': return fmtAmt(pts || ptr);
            case 'disc': return `${disc}%`;
            case 'gst': return `${gstPct}%`;
            case 'taxable': return fmtAmt(taxable);
            case 'amount': return <span className="font-semibold">{fmtAmt(amount)}</span>;
            default: return '—';
        }
    };

    const { summary: taxSummary, totalTaxable, totalSgst, totalCgst } = useMemo(() => {
        const summary: Record<string, { taxable: number, sgst: number, cgst: number }> = {};
        let totalTaxable = 0, totalSgst = 0, totalCgst = 0;

        items.forEach(item => {
            const { gstPct, taxable: rowTaxable, gstAmount: rowGst } = calculateRowMath(item);
            const rateStr = gstPct.toFixed(2);
            if (!summary[rateStr]) summary[rateStr] = { taxable: 0, sgst: 0, cgst: 0 };
            
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
    const totalGst = totalSgst + totalCgst + (invoice.igstAmount || 0);

    const fillerRowsCount = Math.max(0, 5 - items.length);
    const fillerRows = Array.from({ length: fillerRowsCount });

    const InvoiceCard = () => {
        
        return (
            <div className={`flex flex-col flex-grow relative bg-white border-[2px] border-gray-900`} style={{ margin: '6px auto', width: '277mm', minHeight: '190mm' }}>
                {/* Horizontal Header: 3 Columns */}
                <div className={`flex border-b-[2px] border-gray-900 items-stretch`}>
                    
                    {/* Col 1: Logo & Company (40% retail, 35% wholesale) */}
                    <div className={`${isWholesale ? 'w-[35%]' : 'w-[40%]'} p-1.5 flex gap-2 items-center border-r-[2px] border-gray-900 bg-gray-50/50`}>
                        <div className="flex-grow">
                            <h1 className="font-bold text-gray-900 tracking-wide uppercase leading-tight text-[0.9rem]">
                                {activeConfig.header.customText || "S.P.S MANAVATA PHARMA"}
                            </h1>
                            <p className="text-gray-700 leading-tight mt-0.5 text-[0.6rem]">
                                Shop No. 1, 2, 3, Gr Floor, Shanta Complex,<br/>
                                Nutan Colony Signal, Chhatrapati Sambhajinagar
                            </p>
                            <p className="text-gray-600 leading-tight mt-0.5 text-[0.55rem]">
                                <span className="font-semibold text-gray-800">Ph:</span> +91-9876543210 &bull; <span className="font-semibold text-gray-800">GSTIN:</span> 27AATCS1234A1Z5<br/>
                                {activeConfig.header.showDrugLicense && <><span className="font-semibold text-gray-800">DL:</span> 20B: MH-MZ3-315174 | 21B: MH-MZ3-315175</>}
                            </p>
                        </div>
                    </div>

                    {/* Col 2: Buyer Details (35%) */}
                    <div className="w-[35%] p-1.5 border-r-[2px] border-gray-900 flex flex-col justify-center">
                        <h3 className="font-bold text-gray-800 uppercase border-b border-gray-300 pb-0.5 mb-1 inline-block text-[0.65rem]">
                            {isWholesale ? 'Bill To / Buyer Details' : 'Bill To / Patient Details'}
                        </h3>
                        {isWholesale ? (
                            <>
                                <p className="font-bold text-gray-900 leading-tight truncate text-[0.85rem] uppercase">{customerName}</p>
                                <p className="text-gray-700 leading-tight text-[0.65rem] truncate">{customerAddress}</p>
                                <p className="text-gray-600 leading-tight mt-0.5 text-[0.6rem]">
                                    <span className="font-semibold text-gray-800">GSTIN:</span> {customerGstin}<br/>
                                    {invoice.placeOfSupply && <><span className="font-semibold text-gray-800">Place of Supply:</span> {invoice.placeOfSupply}</>}
                                </p>
                            </>
                        ) : (
                            <div className="flex justify-between items-start">
                                <div className="w-1/2 pr-1">
                                    <p className="text-gray-500 uppercase leading-none text-[0.55rem]">Patient</p>
                                    <p className="font-bold text-gray-900 leading-tight truncate text-[0.85rem] uppercase">{customerName}</p>
                                    <p className="text-gray-700 leading-tight text-[0.65rem] truncate">{customerPhone}</p>
                                </div>
                                <div className="w-1/2 pl-1 border-l border-gray-200">
                                    <p className="text-gray-500 uppercase leading-none text-[0.55rem]">Doctor</p>
                                    <p className="font-bold text-gray-900 leading-tight truncate text-[0.85rem] uppercase">{(invoice as any).doctorName || 'Self'}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Col 3: Invoice Info */}
                    <div className={`${isWholesale ? 'w-[30%]' : 'w-[25%]'} p-1.5 flex flex-col bg-gray-50/50 justify-center`}>
                        <div className="bg-gray-800 text-white rounded px-2 py-0.5 shadow-sm text-center w-full mb-1.5">
                            <h2 className="font-bold uppercase tracking-wider leading-tight text-[0.8rem]">
                                {isQuotation ? 'QUOTATION' : 'TAX INVOICE'} 
                                <span className="font-normal text-gray-300 text-[0.55rem]">({isWholesale ? 'Wholesale' : 'Retail'})</span>
                            </h2>
                        </div>
                        <div className="flex justify-between items-start w-full gap-2">
                            <div className="flex-grow">
                                <table className="w-full text-right text-[0.6rem]">
                                    <tbody>
                                        <tr><td className="font-semibold text-gray-600 py-0.5">Inv No:</td><td className="font-bold text-gray-900 py-0.5">{invoice.invoiceNo || invoice.quotationNo}</td></tr>
                                        <tr><td className="font-semibold text-gray-600 py-0.5">Date:</td><td className="font-bold text-gray-900 py-0.5">{format(new Date(invoiceDate), 'dd-MMM-yyyy')}</td></tr>
                                        {isWholesale && invoice.eway_bill_no && <tr><td className="font-semibold text-gray-600 py-0.5">E-Way:</td><td className="font-bold text-gray-900 py-0.5">{invoice.eway_bill_no}</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                            {isWholesale && invoice.qr_code && (
                                <div className="flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <QRCodeSVG value={invoice.qr_code} size={50} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-grow flex flex-col bg-white"> 
                    <table className="w-full text-left text-[0.7rem] pdf-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr className="bg-gray-100 text-gray-800 uppercase tracking-wide text-[0.55rem]">
                                {sortedColumns.map((col, idx) => (
                                    <th 
                                        key={col.id} 
                                        className={`py-0.5 px-1 border-t-0 border-b-[2px] border-gray-900 ${idx === sortedColumns.length - 1 ? 'border-r-0' : 'border-r border-gray-300'} ${['mrp', 'ptr', 'pts', 'amount', 'taxable'].includes(col.id) ? 'text-right' : ['sn', 'qty', 'b_qty', 'f_qty', 'disc', 'gst', 'exp', 'hsn'].includes(col.id) ? 'text-center' : 'text-left'}`}
                                        style={{ width: col.width }}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="align-top">
                            {items.map((item, idx) => (
                                <tr key={idx}>
                                    {sortedColumns.map((col, cIdx) => (
                                        <td 
                                            key={col.id} 
                                            className={`py-0.5 px-1 border-b-0 border-l-0 ${cIdx === sortedColumns.length - 1 ? 'border-r-0' : 'border-r border-gray-300'} ${idx === 0 ? '' : 'border-t border-gray-300'} ${['mrp', 'ptr', 'pts', 'amount', 'taxable'].includes(col.id) ? 'text-right' : ['sn', 'qty', 'b_qty', 'f_qty', 'disc', 'gst', 'exp', 'hsn'].includes(col.id) ? 'text-center' : 'text-left'}`}
                                        >
                                            {renderCell(item, col.id, idx)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {/* Single filler row to extend vertical borders downwards */}
                            <tr className="h-auto">
                                {sortedColumns.map((col, cIdx) => (
                                    <td 
                                        key={`filler-${col.id}`} 
                                        className={`border-b-0 border-l-0 ${cIdx === sortedColumns.length - 1 ? 'border-r-0' : 'border-r border-gray-300'} ${items.length === 0 ? '' : 'border-t border-gray-300'}`}
                                    ></td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="flex border-t-[2px] border-gray-900 bg-white items-stretch flex-shrink-0">
                    
                    {/* Left Block (72%) */}
                    <div className="w-[72%] flex flex-col border-r-[2px] border-gray-900">
                        
                        <div className="flex flex-grow items-stretch border-b border-gray-300">
                            
                            {/* Terms & Bank */}
                            <div className={`${isWholesale ? 'w-[50%]' : 'w-[45%]'} p-1.5 border-r border-gray-300 flex flex-col justify-between`}>
                                {isWholesale ? (
                                    <>
                                        <div className="flex gap-2 mb-1">
                                            <div className="w-full">
                                                <h4 className="font-bold text-gray-800 uppercase mb-0.5 text-[0.55rem]">Bank Details</h4>
                                                <p className="text-gray-700 leading-tight text-[0.55rem] whitespace-pre-wrap">
                                                    {activeConfig.footer.bankDetails}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-auto pt-1 border-t border-gray-100">
                                            <h4 className="font-bold text-gray-800 uppercase mb-0.5 text-[0.5rem]">Terms & Conditions</h4>
                                            <p className="text-gray-500 text-[0.45rem] leading-[1.2] whitespace-pre-wrap">
                                                {activeConfig.footer.terms}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <h4 className="font-bold text-gray-800 uppercase mb-0.5 text-[0.55rem]">Terms & Conditions</h4>
                                            <p className="text-gray-700 text-[0.5rem] leading-[1.2] whitespace-pre-wrap">
                                                {activeConfig.footer.terms}
                                            </p>
                                        </div>
                                        <div className="mt-1 pt-1.5 border-t border-gray-100 flex items-center gap-1.5">
                                            <div className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center bg-gray-50 flex-shrink-0 shadow-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 uppercase leading-none text-[0.45rem]">Pay via UPI</p>
                                                <p className="font-bold text-gray-900 mt-0.5 text-[0.55rem]">manavata@sbi</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* GST Summary Cards */}
                            <div className={`${isWholesale ? 'w-[50%]' : 'w-[55%]'} p-1.5 bg-gray-50/50 flex flex-col justify-center`}>
                                <h4 className="font-bold text-gray-800 uppercase mb-1 flex justify-between items-end text-[0.55rem]">
                                    <span>GST Breakdown</span>
                                    <span className="text-gray-500 font-normal normal-case text-[0.45rem]">Total Tax: ₹{fmtAmt(totalGst)}</span>
                                </h4>
                                
                                <div className="flex flex-col gap-1">
                                    {Object.entries(taxSummary).filter(([_, vals]) => vals.taxable > 0).map(([rate, vals]) => (
                                        <div key={rate} className="flex justify-between items-center bg-white border border-gray-200 rounded px-1.5 py-1 shadow-sm">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900 leading-tight text-[0.55rem]">GST {rate}%</span>
                                                <span className="text-gray-500 leading-tight mt-0.5 text-[0.45rem]">Taxable: ₹{fmtAmt(vals.taxable)}</span>
                                            </div>
                                            <div className="flex gap-2 text-center">
                                                <div className="leading-tight"><span className="block text-gray-400 uppercase text-[0.4rem]">CGST</span><span className="font-semibold text-gray-700 text-[0.5rem]">₹{fmtAmt(vals.cgst)}</span></div>
                                                <div className="leading-tight"><span className="block text-gray-400 uppercase text-[0.4rem]">SGST</span><span className="font-semibold text-gray-700 text-[0.5rem]">₹{fmtAmt(vals.sgst)}</span></div>
                                            </div>
                                            <div className="text-right leading-tight">
                                                <span className="block text-gray-400 uppercase text-[0.4rem]">Tax</span>
                                                <span className="font-bold text-gray-800 text-[0.55rem]">₹{fmtAmt(vals.cgst + vals.sgst)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Amount in Words */}
                        <div className="p-1.5 flex items-center bg-white h-[7mm]">
                            <span className="text-gray-500 uppercase mr-1.5 text-[0.5rem]">Amount in Words:</span>
                            <span className="font-bold text-gray-900 uppercase text-[0.55rem]">{amountInWords(invoice.grandTotal)}</span>
                        </div>
                    </div>

                    {/* Right Block: Totals & Signature (28%) */}
                    <div className="w-[28%] flex flex-col bg-white">
                        
                        <div className="bg-gray-100 flex flex-col border-b border-gray-300">
                            <div className="p-1.5 space-y-1">
                                <div className="flex justify-between items-center text-gray-600 text-[0.55rem]">
                                    <span>Subtotal ({items.length} Items, {totalQty} Qty)</span>
                                    <span className="font-semibold text-gray-900">₹{fmtAmt(invoice.subtotal)}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-600 text-[0.55rem]">
                                    <span>Discount Savings</span>
                                    <span className="font-bold">-₹{fmtAmt(discountAmt)}</span>
                                </div>
                            </div>
                            <div className="bg-gray-800 text-white px-2 py-1 flex justify-between items-center shadow-inner">
                                <span className="font-bold uppercase tracking-wide text-[0.6rem]">Grand Total</span>
                                <span className="font-bold text-[0.85rem]">₹{fmtAmt(invoice.grandTotal)}</span>
                            </div>
                        </div>

                        {/* Signature Area */}
                        <div className="flex-grow flex flex-col items-center justify-end p-1.5 relative min-h-[14mm]">
                            <div className="font-bold text-gray-800 text-center absolute top-1.5 w-full leading-tight text-[0.5rem]">For {activeConfig.header.customText || "S.P.S MANAVATA PHARMA"}</div>
                            <div className="w-4/5 border-t border-gray-400 mt-6 pt-0.5 text-center">
                                <span className="text-gray-500 uppercase tracking-wide font-medium text-[0.45rem]">Authorized Signatory</span>
                            </div>
                        </div>

                    </div>
                </div>
                
                {/* Bottom Brand Strip */}
                <div className="bg-gray-800 text-white text-center py-0.5 uppercase font-semibold text-[0.5rem] tracking-[0.1em]">
                    Thank You For Your Visit • Wish You A Speedy Recovery
                </div>

            </div>
        );
    };

    return (
        <div ref={ref} className="w-full max-w-[297mm] mx-auto bg-white font-sans" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
            <style dangerouslySetInnerHTML={{ __html: `
                @page {
                    size: A4 landscape;
                    margin: 0;
                }
                body {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                table tr {
                    page-break-inside: avoid;
                }
            `}} />
            <InvoiceCard />
        </div>
    );
});
ManavataA4Invoice.displayName = 'ManavataA4Invoice';
