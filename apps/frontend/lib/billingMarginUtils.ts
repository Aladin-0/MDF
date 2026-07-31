import { CartItem } from '../types';

export function calculateLineMargin(item: CartItem): { margin: number; marginPct: number; lineGrossProfit: number } {
    const saleRate = Number(item.saleRate || 0);
    const landingRate = Number(item.landingRate || item.purchaseRate || 0);
    const qty = Number(item.totalQty || 0);

    const margin = saleRate - landingRate;
    const marginPct = saleRate > 0 ? (margin / saleRate) * 100 : 0;
    const lineGrossProfit = margin * qty;

    return {
        margin: Math.round(margin * 100) / 100,
        marginPct: Math.round(marginPct * 100) / 100,
        lineGrossProfit: Math.round(lineGrossProfit * 100) / 100,
    };
}

export function calculateTotalMargin(cart: CartItem[], billSubtotal: number): { totalMargin: number; totalGrossProfit: number; totalMarginPct: number } {
    let totalMargin = 0;

    for (const item of cart) {
        const saleRate = Number(item.saleRate || 0);
        const landingRate = Number(item.landingRate || item.purchaseRate || 0);
        const qty = Number(item.totalQty || 0);
        const margin = saleRate - landingRate;
        totalMargin += margin * qty;
    }

    const totalMarginPct = billSubtotal > 0 ? (totalMargin / billSubtotal) * 100 : 0;

    return {
        totalMargin: Math.round(totalMargin * 100) / 100,
        totalGrossProfit: Math.round(totalMargin * 100) / 100,
        totalMarginPct: Math.round(totalMarginPct * 100) / 100,
    };
}
