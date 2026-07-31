import { format } from 'date-fns';
import {
    SalesReportRow,
    GSTSummary,
    StockValuationRow,
    ExpiryReportRow,
    StaffReportRow,
    PurchaseReportRow,
    DateRangeFilter,
} from '@/types';

function downloadCSV(headers: string[], rows: (string | number)[][], filename: string): void {
    const csvHeaders = headers.join(',');
    const csvRows = rows.map(row =>
        row.map(val => {
            const str = String(val ?? '');
            return str.includes(',') ? `"${str}"` : str;
        }).join(',')
    );
    const csv = [csvHeaders, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportSalesReportCSV(rows: SalesReportRow[], dateRange: DateRangeFilter): void {
    const headers = [
        'Date', 'Invoices', 'Total Sales', 'Discount', 'GST',
        'Net Sales', 'Cash', 'UPI', 'Card', 'Credit',
    ];
    const csvRows = rows.map(r => [
        r.date, r.invoiceCount, r.totalSales, r.totalDiscount,
        r.totalTax, r.netSales, r.cashSales, r.upiSales,
        r.cardSales, r.creditSales,
    ]);
    downloadCSV(headers, csvRows, `sales-report-${dateRange.from}-to-${dateRange.to}.csv`);
}

export function exportGSTReportCSV(summary: GSTSummary): void {
    const headers = [
        'HSN Code', 'Product', 'Taxable Amount',
        'CGST Rate%', 'CGST Amount', 'SGST Rate%', 'SGST Amount', 'Total Tax',
    ];
    const rows = summary.rows.map(r => [
        r.hsnCode, r.productName, r.taxableAmount,
        r.cgstRate, r.cgstAmount, r.sgstRate, r.sgstAmount, r.totalTax,
    ]);
    downloadCSV(headers, rows, `gst-report-${summary.period.from}.csv`);
}

export function exportStockValuationCSV(rows: StockValuationRow[]): void {
    const headers = [
        'Product', 'Composition', 'Batch', 'Expiry', 'Qty (Strips)',
        'Purchase Rate', 'MRP', 'Sale Rate', 'Stock Value', 'MRP Value',
    ];
    const csvRows = rows.map(r => [
        r.productName, r.composition, r.batchNo, r.expiryDate, r.qtyStrips,
        r.purchaseRate, r.mrp, r.saleRate, r.stockValue, r.mrpValue,
    ]);
    downloadCSV(headers, csvRows, `stock-valuation-${format(new Date(), 'yyyy-MM-dd')}.csv`);
}

export function exportExpiryReportCSV(rows: ExpiryReportRow[]): void {
    const headers = [
        'Product', 'Batch No', 'Expiry Date', 'Days Remaining',
        'Qty (Strips)', 'MRP', 'Stock Value', 'Distributor',
    ];
    const csvRows = rows.map(r => [
        r.productName, r.batchNo, r.expiryDate, r.daysRemaining,
        r.qtyStrips, r.mrp, r.stockValue, r.distributorName,
    ]);
    downloadCSV(headers, csvRows, `expiry-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
}

export function exportStaffReportCSV(rows: StaffReportRow[], dateRange: DateRangeFilter): void {
    const headers = [
        'Staff Name', 'Role', 'Bills', 'Total Sales', 'Avg Bill Value',
        'Total Discount', 'Avg Discount%', 'Cash Bills', 'Credit Bills',
    ];
    const csvRows = rows.map(r => [
        r.staffName, r.role, r.billsCount, r.totalSales, r.avgBillValue,
        r.totalDiscount, r.avgDiscountPct, r.cashBills, r.creditBills,
    ]);
    downloadCSV(headers, csvRows, `staff-report-${dateRange.from}-to-${dateRange.to}.csv`);
}

export function exportPurchaseReportCSV(rows: PurchaseReportRow[], dateRange: DateRangeFilter): void {
    const headers = [
        'Date', 'Invoice No', 'Distributor', 'Items',
        'Subtotal', 'Tax', 'Grand Total', 'Paid', 'Outstanding',
    ];
    const csvRows = rows.map(r => [
        r.date, r.invoiceNo, r.distributorName, r.itemCount,
        r.subtotal, r.taxAmount, r.grandTotal, r.amountPaid, r.outstanding,
    ]);
    downloadCSV(headers, csvRows, `purchase-report-${dateRange.from}-to-${dateRange.to}.csv`);
}


export function exportGSTR1_JSON(reportData: any, outlet: any, dateRange: DateRangeFilter): void {
    const filename = `gstr1_${outlet.gstin || outlet.id}_${dateRange.from}_to_${dateRange.to}.json`;
    const meta = {
        outletId: outlet.id,
        gstin: outlet.gstin,
        periodFrom: dateRange.from,
        periodTo: dateRange.to,
        generatedAt: new Date().toISOString(),
        reportType: 'GSTR-1'
    };
    const payload = { meta, data: reportData };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportGSTR3B_JSON(reportData: any, outlet: any, dateRange: DateRangeFilter): void {
    const filename = `gstr3b_${outlet.gstin || outlet.id}_${dateRange.from}_to_${dateRange.to}.json`;
    const meta = {
        outletId: outlet.id,
        gstin: outlet.gstin,
        periodFrom: dateRange.from,
        periodTo: dateRange.to,
        generatedAt: new Date().toISOString(),
        reportType: 'GSTR-3B'
    };
    const payload = { meta, data: reportData };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportGSTR1_CSV(data: any, outlet: any, dateRange: DateRangeFilter): void {
    const baseName = `gstr1_${outlet.gstin || outlet.id}_${dateRange.from}`;
    
    // B2B
    if (data.b2b_invoices && data.b2b_invoices.length > 0) {
        const headers = ['Receiver GSTIN/UIN', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
        const rows = data.b2b_invoices.map((r: any) => [
            r.party_gstin || '', r.document_number || '', r.transaction_date || '', 
            r.total_taxable_value || 0, r.total_igst || 0, r.total_cgst || 0, r.total_sgst || 0, r.total_cess || 0
        ]);
        downloadCSV(headers, rows, `${baseName}_b2b.csv`);
    }

    // B2C
    if (data.b2c_summary && data.b2c_summary.length > 0) {
        const headers = ['Place of Supply (POS)', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
        const rows = data.b2c_summary.map((r: any) => [
            r.party_state || '', r.gst_rate || 0, r.total_taxable_value || 0, 
            r.total_igst || 0, r.total_cgst || 0, r.total_sgst || 0, r.total_cess || 0
        ]);
        downloadCSV(headers, rows, `${baseName}_b2c.csv`);
    }

    // CDNR
    if (data.cdnr && data.cdnr.length > 0) {
        const headers = ['Receiver GSTIN/UIN', 'Note Number', 'Note Date', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
        const rows = data.cdnr.map((r: any) => [
            r.party_gstin || '', r.document_number || '', r.transaction_date || '', 
            r.total_taxable_value || 0, r.total_igst || 0, r.total_cgst || 0, r.total_sgst || 0, r.total_cess || 0
        ]);
        downloadCSV(headers, rows, `${baseName}_cdnr.csv`);
    }

    // HSN
    if (data.hsn_summary && data.hsn_summary.length > 0) {
        const headers = ['HSN', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
        const rows = data.hsn_summary.map((r: any) => [
            r.hsn_code || '', r.gst_rate || 0, r.total_taxable_value || 0, 
            r.total_igst || 0, r.total_cgst || 0, r.total_sgst || 0, r.total_cess || 0
        ]);
        downloadCSV(headers, rows, `${baseName}_hsn.csv`);
    }
}

export function exportGSTR3B_CSV(data: any, outlet: any, dateRange: DateRangeFilter): void {
    const baseName = `gstr3b_${outlet.gstin || outlet.id}_${dateRange.from}`;

    // 3.1
    const t31 = data.outward_supplies?.taxable || {};
    const n31 = data.outward_supplies?.nil_exempt || {};
    const headers31 = ['Nature of Supplies', 'Total Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'];
    const rows31 = [
        ['(a) Outward taxable supplies (other than zero rated, nil rated and exempted)', t31.total_taxable_value || 0, t31.total_igst || 0, t31.total_cgst || 0, t31.total_sgst || 0, t31.total_cess || 0],
        ['(c) Other outward supplies (Nil rated, exempted)', n31.total_taxable_value || 0, 0, 0, 0, 0]
    ];
    downloadCSV(headers31, rows31, `${baseName}_3_1.csv`);

    // 4A
    const itc = data.eligible_itc?.all_other_itc || {};
    const headers4a = ['Details', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'];
    const rows4a = [
        ['(A) (5) All other ITC', itc.total_igst || 0, itc.total_cgst || 0, itc.total_sgst || 0, itc.total_cess || 0]
    ];
    downloadCSV(headers4a, rows4a, `${baseName}_4a.csv`);
}
