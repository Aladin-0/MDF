let uuidCounter = 0;
jest.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }));

import { costFloorOf, distributeSmartDiscounts, floorsOf } from '@/lib/billingMarginUtils';
import { buildSalePayload } from '@/utils/payloadBuilders';
import { useBillingStore } from '@/store/billingStore';

/**
 * The bill that was refused with "Security Block: Invalid Round Off (₹-13.98)" on 24 Nov 2026: five lines, ₹359.70, a bill
 * discount of ₹135 (37.53%). BUDECORT's batch had no landing cost on record: PTR 19.49, purchase rate 14.62. On that day the
 * server's floor for it was the PTR and the screen's own guess was the purchase rate.
 *
 * The screen no longer guesses: it reads the floor the server sends with each batch. These tests give the lines the floors
 * the server had THAT DAY (BUDECORT 19.49) to prove the screen obeys whatever it is sent; the last test uses today's
 * (15.35 = what was paid + GST). `withFloors=false` is a cart line as the screen built it before.
 */
const line = (batchId: string, mrp: number, packSize: number, strips: number, loose: number, landing: number | null, ptr: number, purchase: number,
              withFloors = true) => {
    const totalQty = strips + loose / packSize;
    const serverRetailFloor = landing ?? (ptr > 0 ? ptr : purchase);          // the server's floor on the day of the bug
    return {
        batchId, productId: `p-${batchId}`, name: batchId, batchNo: batchId, expiryDate: '2028-01-31', scheduleType: 'OTC', saleMode: 'strip',
        packSize, mrp, rate: mrp, saleRate: mrp, qtyStrips: strips, qtyLoose: loose, totalQty, discountPct: 0, gstRate: 5,
        ptr, pts: 0, purchaseRate: purchase,
        landingRate: landing ?? purchase,                                     // the screen fills a missing landing cost with the purchase rate
        totalAmount: mrp * totalQty,
        ...(withFloors ? { retailCostFloor: serverRetailFloor, wholesaleCostFloor: purchase } : {}),
    } as any;
};
const bill = (withFloors = true) => [
    line('DILZEM', 18.67, 5, 1, 0, 14.58, 14.32, 14.32, withFloors),
    line('DUONICS', 27.0, 5, 5, 0, 5.66, 5.5, 5.5, withFloors),
    line('MUCIDOTE', 50.5, 2, 1, 0, 17.06, 16.25, 16.25, withFloors),
    line('BUDECORT', 25.58, 1, 4, 0, null, 19.49, 14.62, withFloors),
    line('NICARDIA', 159.64, 15, 0, 5, 127.71, 121.63, 121.63, withFloors),
];
const SERVER_LINE_FLOORS: Record<string, number> = { DILZEM: 14.58, DUONICS: 28.3, MUCIDOTE: 17.06, BUDECORT: 77.96, NICARDIA: 42.57 };
const rowsOf = (cart: any[], pct = 37.53) => {
    const a = distributeSmartDiscounts(cart, pct, 'RETAIL', true);
    return Object.fromEntries(cart.map((c) => [c.batchId, a.get(c.batchId)!.finalRowAmount]));
};
const sum = (rows: Record<string, number>) => Math.round(Object.values(rows).reduce((s, r) => s + r, 0) * 100) / 100;

describe('cost floor: one rule, the server\'s', () => {
    it('reads the floor the server sent, whatever the cart did to landing / PTR', () => {
        const budecort = { ...line('BUDECORT', 25.58, 1, 4, 0, null, 19.49, 14.62), ptr: undefined };   // the line editor clears PTR on a retail line
        expect(costFloorOf(budecort, 'RETAIL')).toBe(19.49);
        expect(costFloorOf(budecort, 'WHOLESALE')).toBe(14.62);
        expect(costFloorOf({ retailCostFloor: 0, landingRate: 50 }, 'RETAIL')).toBe(0);                   // "no cost on record" is an answer too
    });

    it('falls back to landing, then PTR, then purchase rate only for a line with no server floor', () => {
        expect(costFloorOf({ landingRate: 12, ptr: 10, purchaseRate: 9 }, 'RETAIL')).toBe(12);
        expect(costFloorOf({ landingRate: null, ptr: 10, purchaseRate: 9 }, 'RETAIL')).toBe(10);
        expect(costFloorOf({ ptr: 0, purchaseRate: 9 }, 'RETAIL')).toBe(9);
        expect(costFloorOf({ purchaseRate: 9, pts: 8, landingRate: 12 }, 'WHOLESALE')).toBe(9);
        expect(costFloorOf({ pts: 8, landingRate: 12 }, 'WHOLESALE')).toBe(8);
        expect(costFloorOf({}, 'RETAIL')).toBe(0);
    });

    it('copies both floors from a batch and nothing made up', () => {
        expect(floorsOf({ retailCostFloor: 19.49, wholesaleCostFloor: 14.62 })).toEqual({ retailCostFloor: 19.49, wholesaleCostFloor: 14.62 });
        expect(floorsOf({ landingRate: 5 })).toEqual({});
        expect(floorsOf(null)).toEqual({});
        // spreading the floors of a batch that has none must not wipe the ones a line already carries
        expect({ retailCostFloor: 19.49, ...floorsOf({ landingRate: 5 }) }).toEqual({ retailCostFloor: 19.49 });
    });
});

describe('the refused bill (₹359.70, bill discount ₹135)', () => {
    it('before: the screen put BUDECORT at ₹63.68, below the server\'s floor of ₹77.96', () => {
        const rows = rowsOf(bill(false));
        expect(rows).toEqual({ DILZEM: 14.58, DUONICS: 73.12, MUCIDOTE: 30.75, BUDECORT: 63.68, NICARDIA: 42.57 });   // exactly what the server logged, line 4 aside
        expect(rows.BUDECORT).toBeLessThan(SERVER_LINE_FLOORS.BUDECORT);
    });

    it('now: every line stays at or above the server\'s floor and the customer still gets the full ₹135', () => {
        const rows = rowsOf(bill());
        // eslint-disable-next-line no-console
        console.log('ROWS_WITH_SERVER_FLOORS', JSON.stringify(rows));
        for (const [name, floor] of Object.entries(SERVER_LINE_FLOORS)) expect(rows[name]).toBeGreaterThanOrEqual(floor - 0.005);
        expect(rows.BUDECORT).toBe(77.96);
        expect(sum(rows)).toBe(224.7);                                           // 359.70 - 135.00
    });

    it('the total on screen and the lines that are sent agree (the server refuses anything else)', () => {
        const store = useBillingStore.getState();
        store.resetBilling();
        const id = store.createDraft();
        store.switchDraft(id);
        useBillingStore.setState({ landingCostIncludeGst: true } as any);
        useBillingStore.getState().updateDraftHeader(id, { cart: bill(), extraDiscountPct: 37.53 } as any);

        const state = useBillingStore.getState();
        const totals = state.getDraftTotals(id);
        const payload = buildSalePayload(state.drafts[id], undefined, totals, { id: 'staff-1' }, 'outlet-1');
        const lines = payload.items.reduce((s: number, i: any) => s + i.totalAmount, 0);
        expect(totals.grandTotal).toBe(225);
        expect(Math.abs(payload.grandTotal - lines)).toBeLessThanOrEqual(0.5);   // only the rupee rounding
        expect(payload.items.find((i: any) => i.batchId === 'BUDECORT').totalAmount).toBe(77.96);
    });

    it('with today\'s floor for BUDECORT (15.35 a pack: what was paid + GST) the bill is ₹225 and nothing is below cost', () => {
        const cart = bill().map((l) => (l.batchId === 'BUDECORT' ? { ...l, retailCostFloor: 15.35 } : l));
        const rows = rowsOf(cart);
        expect(rows.BUDECORT).toBeGreaterThanOrEqual(61.4);                      // 4 x 15.35
        expect(rows.BUDECORT).toBeLessThan(77.96);                               // and no longer held to 4 x PTR
        expect(sum(rows)).toBe(224.7);
    });

    it('a bill left open from before corrects itself when the server sends the floors back', () => {
        const store = useBillingStore.getState();
        store.resetBilling();
        const id = store.createDraft();
        store.switchDraft(id);
        useBillingStore.setState({ landingCostIncludeGst: true } as any);
        useBillingStore.getState().updateDraftHeader(id, { cart: bill(false), extraDiscountPct: 37.53 } as any);
        expect(rowsOf(useBillingStore.getState().drafts[id].cart).BUDECORT).toBe(63.68);

        // what the server answers with code DISCOUNT_BELOW_COST
        useBillingStore.getState().applyCostFloors([{ batchId: 'BUDECORT', retailCostFloor: 19.49, wholesaleCostFloor: 14.62 }]);

        const after = useBillingStore.getState();
        expect(rowsOf(after.drafts[id].cart).BUDECORT).toBe(77.96);
        expect(after.getDraftTotals(id).grandTotal).toBe(225);                   // the discount moved to the lines that can take it
        expect(after.drafts[id].cart.find((i) => i.batchId === 'DILZEM')?.retailCostFloor).toBeUndefined();   // only the lines named are touched
    });
});
