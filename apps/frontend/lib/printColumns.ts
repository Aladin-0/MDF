/**
 * The columns of the A4 invoice. One place: the printed page and Settings → Printer use the same defaults.
 */
import type { PrintSettingsConfig } from '@/types';

type Column = PrintSettingsConfig['columns'][number];

const col = (id: string, label: string, order: number, width: string): Column => ({ id, label, isVisible: true, order, width });

export const A4_RETAIL_COLUMNS: Column[] = [
    col('sn', 'SN', 1, '5%'), col('productName', 'Item Name & Company', 2, '31%'), col('batch', 'Batch', 3, '11%'), col('exp', 'Exp', 4, '8%'),
    col('qty', 'Qty', 5, '8%'), col('mrp', 'MRP', 6, '9%'), col('ptr', 'Rate', 7, '9%'), col('disc', 'Disc', 8, '7%'), col('amount', 'Amount(₹)', 9, '12%'),
];

export const A4_WHOLESALE_COLUMNS: Column[] = [
    col('sn', 'SN', 1, '4%'), col('productName', 'Item Name & Details', 2, '22%'), col('hsn', 'HSN', 3, '6%'), col('batch', 'Batch', 4, '8%'),
    col('exp', 'Exp', 5, '6%'), col('b_qty', 'B-Qty', 6, '5%'), col('f_qty', 'F-Qty', 7, '5%'), col('mrp', 'MRP', 8, '7%'), col('ptr', 'PTR', 9, '7%'),
    col('disc', 'Disc', 10, '5%'), col('gst', 'GST', 11, '5%'), col('taxable', 'Taxable', 12, '8%'), col('amount', 'Amount(₹)', 13, '12%'),
];

/**
 * The columns to draw on the A4 page, in order, with widths that fill it exactly.
 *
 * An outlet that never saved its printer settings carries the server's default, a narrow-slip layout in which "Batch" is
 * switched on with width 0%: on A4 it had no room and was printed outside the frame, one letter per line. A layout with
 * a shown column that has no width cannot be printed as saved, so the standard A4 layout is used (which is what
 * Settings → Printer shows such an outlet). Any other saved layout is kept; its widths are scaled to 100%.
 */
export function a4Columns(saved: Column[] | undefined | null, isWholesale: boolean): Column[] {
    const shown = (columns: Column[]) => columns.filter((c) => c.isVisible).sort((a, b) => a.order - b.order);
    let columns = shown(saved || []);
    if (columns.length === 0 || columns.some((c) => !(parseFloat(c.width) > 0))) {
        columns = shown(isWholesale ? A4_WHOLESALE_COLUMNS : A4_RETAIL_COLUMNS);
    }
    const total = columns.reduce((sum, c) => sum + parseFloat(c.width), 0);
    return columns.map((c) => ({ ...c, width: `${((parseFloat(c.width) * 100) / total).toFixed(3)}%` }));
}
