/**
 * The total the screen sends and the lines it sends must agree: the server refuses a bill whose lines do not add up to its grand total
 * ("Security Block: Invalid Round Off"). A real bill hit this: BED PAN PLASTIC, MRP 345, a Rs 40 discount, line sent as 269.64 against a total of 305
 * (the discount percent was applied a second time to a rate that was already discounted).
 */
import { useBillingStore } from '../store/billingStore';
import { quickAddLine } from '../lib/cartLine';
import { computeLine, lineUpdatesFromTotals } from '../components/billing/mobile/CartLineCard';
import { buildSalePayload } from '../utils/payloadBuilders';
import { distributeSmartDiscounts } from '../lib/billingMarginUtils';

jest.mock('uuid', () => ({ v4: () => `id-${Math.random().toString(36).slice(2)}` }));

const batch: any = { id: 'b1', batchNo: 'B1', expiryDate: '2099-12-31', mrp: 345, ptr: 0, pts: 0, purchaseRate: 200, landingRate: 210, qtyStrips: 10, qtyLoose: 0, packSize: 1, packUnit: 'piece', packType: 'other' };
const product: any = { id: 'p1', name: 'BED PAN PLASTIC', composition: '', manufacturer: 'X', gstRate: 5, scheduleType: 'OTC', packUnit: 'piece', packType: 'other' };

/** Build a bill the way a cashier does, return what the screen would send */
function bill({ addDiscountPct = '', lineDiscountRs = 0, billDiscountPct = 0, qty = '1' }: { addDiscountPct?: string; lineDiscountRs?: number; billDiscountPct?: number; qty?: string }) {
    const s = useBillingStore.getState();
    const id = s.createDraft();
    const built: any = quickAddLine({ product, batch, qtyStrips: qty, qtyLoose: '', discountPct: addDiscountPct, saleType: 'RETAIL' });
    s.addToCart(id, built.item);
    if (lineDiscountRs) {
        const item = useBillingStore.getState().drafts[id].cart[0];
        const { totals } = computeLine(item, batch, { qtyStrips: Number(qty), qtyLoose: 0, discountType: 'amount', discountValue: String(lineDiscountRs) }, 'RETAIL', true);
        useBillingStore.getState().updateCartItem(id, item.batchId, lineUpdatesFromTotals(totals, Number(qty), 0, 'amount'));
    }
    if (billDiscountPct) useBillingStore.getState().setExtraDiscountPct(billDiscountPct);
    const draft = useBillingStore.getState().drafts[id];
    const totals = useBillingStore.getState().getDraftTotals(id);
    const payload = buildSalePayload(draft, null, totals, { id: 's' }, 'o');
    const linesSum = payload.items.reduce((n: number, it: any) => n + it.totalAmount, 0);
    return { totals, payload, linesSum, draft };
}

describe('the lines sent add up to the grand total sent', () => {
    it.each([
        ['no discount', {}],
        ['Rs 40 line discount (the failed bill: 345 -> 305)', { lineDiscountRs: 40 }],
        ['discount typed in the Add sheet (11.59%)', { addDiscountPct: '11.59' }],
        ['bill discount only', { billDiscountPct: 11.594202898550725 }],
        ['line discount AND bill discount', { lineDiscountRs: 40, billDiscountPct: 11.594202898550725 }],
        ['two strips with a line discount', { lineDiscountRs: 40, qty: '2' }],
    ])('%s', (_label, opts: any) => {
        const { totals, payload, linesSum } = bill(opts);
        expect(Math.abs(payload.grandTotal - linesSum)).toBeLessThan(1);          // what the server enforces (round-off limit)
        expect(payload.grandTotal).toBe(Math.round(payload.grandTotal));          // retail totals are whole rupees
        expect(payload.grandTotal).toBe(Math.round(totals.grandTotal));
    });

    it('the failed bill is now 305 on the line and on the total', () => {
        const { payload } = bill({ lineDiscountRs: 40 });
        expect(payload.items[0].totalAmount).toBe(305);
        expect(payload.grandTotal).toBe(305);
        expect(payload.items[0].rate).toBe(305);
    });

    it('a discount typed in the Add sheet is really applied to the bill total (it used to be ignored)', () => {
        const { totals } = bill({ addDiscountPct: '10' });
        expect(totals.grandTotal).toBe(Math.round(345 * 0.9));
    });
});

describe('the server-check fallback never discounts an already-net rate twice', () => {
    it('a line with no totalAmount but a net rate keeps that rate', () => {
        const line: any = { batchId: 'b', rate: 305, saleRate: 345, mrp: 345, discountPct: 11.594, qtyStrips: 1, qtyLoose: 0, totalQty: 1, packSize: 1, gstRate: 5, totalAmount: 0, landingRate: 100, purchaseRate: 100 };
        const alloc = distributeSmartDiscounts([line], 0, 'RETAIL', false).get('b')!;
        expect(alloc.finalRowAmount).toBe(305);                                    // not 269.64
    });
});

describe('wholesale (tax-exclusive rates): the lines include the GST the grand total includes', () => {
    it('with and without a line discount', () => {
        for (const lineDiscountRs of [0, 40]) {
            const s = useBillingStore.getState();
            const id = s.createDraft();
            s.setSaleType(id, 'WHOLESALE');
            const wholesaleBatch = { ...batch, pts: 300, ptr: 320 };
            const built: any = quickAddLine({ product, batch: wholesaleBatch, qtyStrips: '2', qtyLoose: '', discountPct: '', saleType: 'WHOLESALE' });
            s.addToCart(id, built.item);
            if (lineDiscountRs) {
                const item = useBillingStore.getState().drafts[id].cart[0];
                const { totals } = computeLine(item, wholesaleBatch, { qtyStrips: 2, qtyLoose: 0, discountType: 'amount', discountValue: String(lineDiscountRs) }, 'WHOLESALE', true);
                useBillingStore.getState().updateCartItem(id, item.batchId, lineUpdatesFromTotals(totals, 2, 0, 'amount'));
            }
            const draft = useBillingStore.getState().drafts[id];
            const totals = useBillingStore.getState().getDraftTotals(id);
            const payload = buildSalePayload(draft, null, totals, { id: 's' }, 'o');
            const linesSum = payload.items.reduce((n: number, it: any) => n + it.totalAmount, 0);
            expect(Math.abs(payload.grandTotal - linesSum)).toBeLessThan(1);
        }
    });
});
