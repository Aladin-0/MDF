/**
 * A typed bill discount is given to the paisa (when no item would go below cost): random carts, rupee and percent typed the way
 * the two boxes store them, retail and wholesale.
 */
import { useBillingStore } from '../store/billingStore';
import { buildSalePayload } from '../utils/payloadBuilders';

jest.mock('uuid', () => ({ v4: () => `id-${Math.random().toString(36).slice(2)}` }));

let seed = 7;
const rnd = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n; };
const store = () => useBillingStore.getState();
const paise = (n: number) => Math.round(n * 100);

function randomBill(saleType: 'RETAIL' | 'WHOLESALE') {
    store().resetBilling();
    const id = store().createDraft();
    if (saleType === 'WHOLESALE') store().setSaleType(id, 'WHOLESALE');
    const lines = 1 + rnd(8);
    for (let i = 0; i < lines; i++) {
        const price = (500 + rnd(50000)) / 100;
        const qty = 1 + rnd(6);
        const gstRate = [0, 5, 12, 18][rnd(4)];
        store().addToCart(id, { batchId: `b${i}`, productId: `p${i}`, name: `I${i}`, packSize: 1, qtyStrips: qty, qtyLoose: 0, totalQty: qty,
            mrp: price, rate: price, saleRate: price, gstRate, discountPct: 0, retailCostFloor: 0.01, wholesaleCostFloor: 0.01 } as any);
    }
    return id;
}

function check(id: string, typedPaise: number) {
    const totals = store().getDraftTotals(id);
    const payload = buildSalePayload(store().drafts[id], null, totals, { id: 's' }, 'o');
    const sum = payload.items.reduce((n: number, it: any) => n + paise(it.totalAmount), 0);
    expect(paise(totals.extraDiscountAmount)).toBe(typedPaise);
    expect(totals.extraDiscountShortfall).toBe(0);                  // given in full: no "discount was cut" note
    expect(sum).toBe(paise(totals.preExtraNet) - typedPaise);       // the lines sent add up to exactly "bill minus discount"
}

describe.each(['RETAIL', 'WHOLESALE'] as const)('%s', (saleType) => {
    it('a rupee discount typed in the amount box is given exactly', () => {
        for (let run = 0; run < 400; run++) {
            const id = randomBill(saleType);
            const base = store().getDraftTotals(id).preExtraNet;
            const typed = (1 + rnd(Math.floor(base * 60))) / 100;          // up to 60% of the bill
            store().setExtraDiscountPct(Number(((typed / base) * 100).toFixed(6)));
            check(id, paise(typed));
        }
    });

    it('a percent typed in the percent box takes that percent of the bill', () => {
        for (let run = 0; run < 400; run++) {
            const id = randomBill(saleType);
            const pct = (1 + rnd(6000)) / 100;
            store().setExtraDiscountPct(pct);
            const base = store().getDraftTotals(id).preExtraNet;
            check(id, Math.round(Math.round(base * 100) * pct / 100));
        }
    });
});

it('Rs 100 off three equal lines of Rs 100 is Rs 100, not 99.99', () => {
    store().resetBilling();
    const id = store().createDraft();
    for (let i = 0; i < 3; i++) {
        store().addToCart(id, { batchId: `b${i}`, productId: `p${i}`, name: `I${i}`, packSize: 1, qtyStrips: 1, qtyLoose: 0, totalQty: 1,
            mrp: 100, rate: 100, saleRate: 100, gstRate: 5, discountPct: 0, retailCostFloor: 1 } as any);
    }
    store().setExtraDiscountPct(Number(((100 / 300) * 100).toFixed(6)));
    check(id, 10000);
});

it('a retail bill ending in exactly 50 paise rounds UP to the next rupee, whatever the GST split leaves behind', () => {
    const wrong: string[] = [];
    for (let rupees = 1; rupees <= 700; rupees++) {
        for (const gstRate of [5, 12, 18]) {
            store().resetBilling();
            const id = store().createDraft();
            store().addToCart(id, { batchId: 'b', productId: 'p', name: 'I', packSize: 1, qtyStrips: 1, qtyLoose: 0, totalQty: 1,
                mrp: rupees + 0.5, rate: rupees + 0.5, saleRate: rupees + 0.5, gstRate, discountPct: 0 } as any);
            const { grandTotal } = store().getDraftTotals(id);
            if (grandTotal !== rupees + 1) wrong.push(`${rupees}.50 @${gstRate}% -> ${grandTotal}`);
        }
    }
    expect(wrong).toEqual([]);
});
