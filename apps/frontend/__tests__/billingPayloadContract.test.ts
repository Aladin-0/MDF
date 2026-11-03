/**
 * Contract between the POS (billingStore totals + buildSalePayload) and the sale API.
 *
 * The backend refuses a bill whose grandTotal differs from the sum of its own line totals by more
 * than MAX_ROUND_OFF (apps/backend/apps/billing/utils/item_amounts.py). These tests drive the REAL
 * store and payload builder so a change on either side that would make the POS send a bill the
 * server rejects fails here, not in a pharmacy.
 */
import { useBillingStore } from '../store/billingStore';
import { buildSalePayload } from '../utils/payloadBuilders';

const MAX_ROUND_OFF = 2.0; // keep in sync with the backend constant

type Line = {
    batchId: string; rate: number; totalQty: number; gstRate: number; mrp?: number;
};

function makeDraft(lines: Line[], opts: { saleType?: 'RETAIL' | 'WHOLESALE'; extraDiscountPct?: number } = {}) {
    return {
        cart: lines.map((l, i) => ({
            batchId: l.batchId, productId: `p${i}`, name: `Item ${i}`, batchNo: `B${i}`, expiryDate: '2030-12-31',
            rate: l.rate, mrp: l.mrp ?? l.rate, ptr: l.rate, pts: l.rate, gstRate: l.gstRate, gstPct: l.gstRate,
            qtyStrips: l.totalQty, qtyLoose: 0, totalQty: l.totalQty, packSize: 10, saleMode: 'strip',
            discountPct: 0, scheduleType: 'OTC',
        })),
        saleType: opts.saleType ?? 'RETAIL',
        extraDiscountPct: opts.extraDiscountPct ?? 0,
        payment: { method: 'cash', amount: 0 },
        customer: null, customerLedger: null, doctor: null,
    };
}

function payloadFor(draft: any) {
    useBillingStore.setState({ drafts: { d1: draft }, activeDraftId: 'd1' } as any);
    const totals = useBillingStore.getState().getDraftTotals('d1');
    return buildSalePayload(draft, undefined, totals, { id: 'staff-1' }, 'outlet-1');
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function expectServerAcceptable(payload: any) {
    const lineTotal = sum(payload.items.map((i: any) => i.totalAmount));
    expect(Math.abs(payload.grandTotal - lineTotal)).toBeLessThanOrEqual(MAX_ROUND_OFF);
    for (const item of payload.items) {
        // The server's row-level integrity rule: taxable + gst == total.
        expect(Math.abs(item.taxableAmount + item.gstAmount - item.totalAmount)).toBeLessThanOrEqual(0.05);
    }
}

describe('POS payload vs sale API integrity rules', () => {
    it('RETAIL (tax-inclusive MRP rates), mixed GST slabs', () => {
        const payload = payloadFor(makeDraft([
            { batchId: 'a', rate: 100, totalQty: 2, gstRate: 12 },
            { batchId: 'b', rate: 55.5, totalQty: 3, gstRate: 5 },
            { batchId: 'c', rate: 20, totalQty: 1, gstRate: 0 },
        ]));
        expectServerAcceptable(payload);
    });

    it('RETAIL with a bill-level extra discount', () => {
        const payload = payloadFor(makeDraft([
            { batchId: 'a', rate: 100, totalQty: 2, gstRate: 12 },
            { batchId: 'b', rate: 55.5, totalQty: 3, gstRate: 5 },
        ], { extraDiscountPct: 7 }));
        expectServerAcceptable(payload);
    });

    it('WHOLESALE (tax-exclusive rates): line totals include the GST that the grand total includes', () => {
        const payload = payloadFor(makeDraft([
            { batchId: 'a', rate: 100, totalQty: 1, gstRate: 12 },
            { batchId: 'b', rate: 250, totalQty: 4, gstRate: 18 },
        ], { saleType: 'WHOLESALE' }));
        expect(payload.grandTotal).toBeCloseTo(100 * 1.12 + 1000 * 1.18, 2);
        expectServerAcceptable(payload);
    });

    it('WHOLESALE with a bill-level extra discount', () => {
        const payload = payloadFor(makeDraft([
            { batchId: 'a', rate: 100, totalQty: 3, gstRate: 12 },
            { batchId: 'b', rate: 250, totalQty: 2, gstRate: 5 },
        ], { saleType: 'WHOLESALE', extraDiscountPct: 5 }));
        expectServerAcceptable(payload);
    });
});
