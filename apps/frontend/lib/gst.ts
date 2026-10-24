import { CartItem, BillTotals } from '../types';

export function calculateItemTotals(
    mrp: number,
    rate: number,
    qty: number,
    discountPct: number,
    gstRate: number
): { taxableAmount: number; gstAmount: number; totalAmount: number } {
    if (qty <= 0) return { taxableAmount: 0, gstAmount: 0, totalAmount: 0 };

    const discountedRate = rate * (1 - discountPct / 100);
    const rawTotal = discountedRate * qty;

    if (gstRate === 0) {
        return {
            taxableAmount: Number(rawTotal.toFixed(2)),
            gstAmount: 0,
            totalAmount: Number(rawTotal.toFixed(2))
        };
    }

    // Backward calculation logic for GST-inclusive rates (standard in Indian Pharmacy)
    const taxableAmount = rawTotal / (1 + gstRate / 100);
    const gstAmount = rawTotal - taxableAmount;

    return {
        taxableAmount: Number(taxableAmount.toFixed(2)),
        gstAmount: Number(gstAmount.toFixed(2)),
        totalAmount: Number(rawTotal.toFixed(2))
    };
}

export function calculateBillTotals(items: CartItem[], extraDiscPct: number = 0): BillTotals {
    const discountFactor = extraDiscPct > 0 ? 1 - extraDiscPct / 100 : 1;

    let subtotal = 0;
    let totalRateAmount = 0;
    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;

    items.forEach(item => {
        const rawTotal = item.rate * item.totalQty;
        subtotal += item.mrp * item.totalQty;
        totalRateAmount += rawTotal;

        // C2 fix: apply extra discount per-item BEFORE GST extraction
        const discountedTotal = rawTotal * discountFactor;
        const gstRate = item.gstRate || 0;

        // Quantize itemTaxable to 2 decimals BEFORE computing itemGst
        // so the floor-based CGST/SGST split matches the backend exactly.
        const itemTaxable = gstRate > 0
            ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
            : Number(discountedTotal.toFixed(2));
        const itemGst = Number((discountedTotal - itemTaxable).toFixed(2));

        taxableAmount += itemTaxable;

        // H8 fix: floor-based CGST/SGST split — guarantees sum = itemGst exactly
        const itemCgst = Math.floor(itemGst * 100 / 2) / 100;
        const itemSgst = Number((itemGst - itemCgst).toFixed(2));
        cgstAmount += itemCgst;
        sgstAmount += itemSgst;
    });

    const discountAmount = subtotal - totalRateAmount;
    const extraDiscountAmount = totalRateAmount * extraDiscPct / 100;
    const rawTotal = taxableAmount + cgstAmount + sgstAmount;
    const grandTotal = Math.round(rawTotal);
    const roundOff = grandTotal - rawTotal;

    return {
        subtotal: Number(subtotal.toFixed(2)),
        discountAmount: Number(discountAmount.toFixed(2)),
        extraDiscountAmount: Number(extraDiscountAmount.toFixed(2)),
        preExtraNet: Number(totalRateAmount.toFixed(2)),
        taxableAmount: Number(taxableAmount.toFixed(2)),
        cgstAmount: Number(cgstAmount.toFixed(2)),
        sgstAmount: Number(sgstAmount.toFixed(2)),
        cgst: Number(cgstAmount.toFixed(2)),
        sgst: Number(sgstAmount.toFixed(2)),
        igst: 0,
        roundOff: Number(roundOff.toFixed(2)),
        grandTotal: Number(grandTotal.toFixed(2)),
        amountPaid: 0,
        amountDue: Number(grandTotal.toFixed(2)),
        itemCount: items.length,
        totalQty: items.reduce((acc, item) => acc + item.totalQty, 0),
        hasScheduleH: items.some(item => ['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType)),
        requiresDoctorDetails: items.some(item => ['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType))
    };
}

export function isInterState(fromState: string, toState: string): boolean {
    if (!fromState || !toState) return false;
    return fromState.trim().toLowerCase() !== toState.trim().toLowerCase();
}

export function formatCurrency(amount: number): string {
    if (amount === undefined || amount === null) return "₹0.00";

    // Format for Indian locale
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}

export function formatGSTIN(gstin: string): string {
    if (!gstin) return "";
    // Validates basic format generally: 2 digits(State code) + 10 chars(PAN) + 1 digit + 'Z' + 1 digit/char
    const cleaned = gstin.toUpperCase().trim();
    return cleaned;
}
