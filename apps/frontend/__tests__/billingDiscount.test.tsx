/**
 * Discounts on the billing screen.
 *
 * ONE meaning, everywhere: a cart line's `rate` is the price AFTER the line discount, `saleRate` the price before it, and
 * `discountPct` only says how big the discount was. A line's amount is rate x billed quantity (+ GST for wholesale); it is
 * never read from a stored `totalAmount`, which different writers filled with different things.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
    useSearchParams: () => ({ get: () => 'sale-1' }),
    useRouter: () => ({ replace, push: jest.fn() }),
}));
const get = jest.fn();
jest.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
const settings = jest.fn();
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => settings() }));
jest.mock('uuid', () => ({ v4: () => `id-${Math.random().toString(36).slice(2)}` }));

import { useBillingStore } from '../store/billingStore';
import { useAuthStore } from '../store/authStore';
import { quickAddLine, quickAddPreview } from '../lib/cartLine';
import { computeLine, lineUpdatesFromTotals } from '../components/billing/mobile/CartLineCard';
import { buildSalePayload } from '../utils/payloadBuilders';
import { EditSaleHydrator } from '../components/billing/EditSaleHydrator';
import { ManavataA4Invoice } from '../components/print/ManavataA4Invoice';
import { BillDiscountShortfall } from '../components/billing/BillDiscountShortfall';
import { TotalsSheet } from '../components/billing/mobile/TotalsSheet';
import { useSyncBillingSettings } from '../hooks/useSyncBillingSettings';
import { SummaryBar } from '../components/billing/mobile/SummaryBar';
import { CartList } from '../components/billing/mobile/CartList';
import { savedLinePrices } from '../lib/billingMarginUtils';

const batch: any = { id: 'b1', batchNo: 'B1', expiryDate: '2099-12-31', mrp: 345, ptr: 320, pts: 300, purchaseRate: 200, landingRate: 210, retailCostFloor: 210, wholesaleCostFloor: 200, qtyStrips: 50, qtyLoose: 0, packSize: 1, packUnit: 'piece', packType: 'other' };
const product: any = { id: 'p1', name: 'BED PAN', composition: '', manufacturer: 'X', gstRate: 5, scheduleType: 'OTC', packUnit: 'piece', packType: 'other' };

const store = () => useBillingStore.getState();
const draftOf = () => store().drafts[store().activeDraftId as string];
const totals = () => store().getDraftTotals(store().activeDraftId as string);
const payload = () => buildSalePayload(draftOf(), null, totals(), { id: 's' }, 'o');
const linesSum = () => payload().items.reduce((n: number, i: any) => n + i.totalAmount, 0);

function add({ qty = 1, disc = '', saleType = 'RETAIL' as 'RETAIL' | 'WHOLESALE', over = {} as any } = {}) {
    const built: any = quickAddLine({ product, batch: { ...batch, ...over }, qtyStrips: String(qty), qtyLoose: '', discountPct: disc, saleType });
    store().addToCart(store().activeDraftId, built.item);
}

beforeEach(() => {
    store().resetBilling();
    store().createDraft();
    store().setLandingCostIncludeGst(false);
    get.mockReset(); replace.mockReset();
    useAuthStore.setState({ user: { outlet: { id: 'o1' } } as never });
});

describe('line amounts', () => {
    it('wholesale quick-add + bill discount keeps the GST (it used to drop it)', () => {
        store().setSaleType(store().activeDraftId as string, 'WHOLESALE');
        add({ qty: 2, saleType: 'WHOLESALE' });                 // 2 x 300 + 5% = 630
        expect(totals().grandTotal).toBeCloseTo(630, 2);
        store().setExtraDiscountPct(10);
        expect(totals().grandTotal).toBeCloseTo(567, 2);        // not 540
        expect(linesSum()).toBeCloseTo(567, 2);
    });

    it('a 100% line discount is charged as nothing, not as the MRP', () => {
        add({ disc: '100' });
        expect(totals().grandTotal).toBe(0);
        expect(payload().items[0].totalAmount).toBe(0);
    });

    it('adding the same batch again with another discount reprices the whole line at the new rate', () => {
        add({ disc: '10' });
        add({ disc: '' });                                       // the latest rate (345) applies to both packs
        store().setExtraDiscountPct(10);
        expect(totals().preExtraNet).toBeCloseTo(690, 2);
        expect(totals().grandTotal).toBe(Math.round(690 * 0.9));
        expect(draftOf().cart[0].totalAmount).toBeCloseTo(690, 2);
    });

    it('a stale stored totalAmount (a bill left open from before) does not change the bill discount', () => {
        add({ disc: '10' });
        const id = store().activeDraftId as string;
        useBillingStore.setState({ drafts: { [id]: { ...draftOf(), cart: [{ ...draftOf().cart[0], totalAmount: 279.45 }] } } });
        store().setExtraDiscountPct(10);
        expect(totals().grandTotal).toBe(Math.round(345 * 0.9 * 0.9));
    });

    it('a rupee line discount over several packs takes off exactly that many rupees', () => {
        add({ qty: 3 });
        const item = draftOf().cart[0];
        const { totals: t } = computeLine(item, batch, { qtyStrips: 3, qtyLoose: 0, discountType: 'amount', discountValue: '100' }, 'RETAIL', true);
        store().updateCartItem(store().activeDraftId, 'b1', lineUpdatesFromTotals(t, 3, 0, 'amount'));
        expect(draftOf().cart[0].totalAmount).toBe(935);
        expect(payload().items[0].totalAmount).toBe(935);        // not 935.01
    });
});

describe('the line editor uses the same cost floor as checkout and the server', () => {
    const inputs = { qtyStrips: 1, qtyLoose: 0, discountType: 'amount' as const, discountValue: '130' };   // sells at 215
    const line: any = { rate: 345, saleRate: 345, mrp: 345, gstRate: 5, packSize: 1 };

    it('cost without GST: floor is 210 + 5% = 220.50, so 215 is refused in the editor', () => {
        expect(computeLine(line, batch, inputs, 'RETAIL', true, false).totals.isNegativeMargin).toBe(true);
    });
    it('cost that already includes GST: floor is 210, so 215 is allowed', () => {
        expect(computeLine(line, batch, inputs, 'RETAIL', true, true).totals.isNegativeMargin).toBe(false);
    });
});

describe('modifying a saved bill that had a line discount', () => {
    const saved = (over: Record<string, unknown> = {}) => ({
        id: 'sale-1', invoiceDate: '2026-07-01T10:00:00', saleType: 'RETAIL', paymentMode: 'cash', amountPaid: 90, grandTotal: 90,
        updatedAt: '2026-07-01T10:05:00', extraDiscountPct: 0, customer: null,
        items: [{ productId: 'p1', batchId: 'b1', batchNo: 'B1', name: 'Para', packSize: 1, qtyStrips: 1, qtyLoose: 0,
                  mrp: 100, rate: 90, discountPct: 10, gstRate: 0, totalAmount: 90, retailCostFloor: 10 }],
        ...over,
    });
    async function open(inv: unknown) {
        store().resetBilling();
        get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('modification-options') ? { allowedActions: ['commercial_correction'] } : inv }));
        render(<EditSaleHydrator />);
        await waitFor(() => expect(replace).toHaveBeenCalled());
    }

    it('loads the price before and after the discount, discounted once', async () => {
        await open(saved());
        const line = draftOf().cart[0];
        expect(line.rate).toBe(90);
        expect(line.saleRate).toBe(100);
        expect(line.totalAmount).toBe(90);                       // was 81
        expect(totals().grandTotal).toBe(90);
    });

    it('opening the line editor and saving it unchanged keeps the price', async () => {
        await open(saved());
        const line = draftOf().cart[0];
        const { totals: t } = computeLine(line, { ...batch, mrp: 100, retailCostFloor: 10 }, { qtyStrips: 1, qtyLoose: 0, discountType: 'percentage', discountValue: '10' }, 'RETAIL', true);
        expect(t.rate).toBeCloseTo(90, 6);                       // was 81
    });

    it('a rupee discount saved with a rounded rate comes back to the exact saved amount', async () => {
        await open(saved({ grandTotal: 935, items: [{ ...saved().items[0], mrp: 345, rate: 311.67, discountPct: 9.66, qtyStrips: 3, totalAmount: 935 }] }));
        expect(totals().grandTotal).toBe(935);
        expect(draftOf().cart[0].totalAmount).toBe(935);
    });
});

describe('printed A4 invoice', () => {
    it('shows the saved line amount: the discount is not taken off a second time', () => {
        const invoice: any = { invoiceNo: 'INV-1', invoiceDate: '2026-07-01', saleType: 'RETAIL', grandTotal: 180, subtotal: 180, discountAmount: 20,
            items: [{ name: 'Para', batchNo: 'B1', packSize: 1, qtyStrips: 2, qtyLoose: 0, mrp: 100, rate: 90, discountPct: 10, gstRate: 0, taxableAmount: 180, gstAmount: 0, totalAmount: 180 }] };
        render(<ManavataA4Invoice invoice={invoice} config={{ columns: [], header: {}, footer: {} } as any} />);
        expect(screen.queryByText('162.00')).not.toBeInTheDocument();
        expect(screen.getAllByText('180.00').length).toBeGreaterThan(0);
    });
});

describe('the bill discount boxes', () => {
    it('says so when the discount is cut to stop items selling below cost', () => {
        add();                                                   // 345, may not go under 210 + 5% = 220.50
        store().setExtraDiscountPct(50);                         // asks 172.50, only 124.50 possible
        expect(totals().extraDiscountAmount).toBeCloseTo(124.5, 2);
        expect(totals().extraDiscountShortfall).toBeCloseTo(48, 2);
        render(<BillDiscountShortfall totals={totals()} />);
        expect(screen.getByTestId('bill-discount-shortfall')).toHaveTextContent('Discount asked ₹172.50, given ₹124.50. More would sell items below cost.');
    });

    it('phone: the bottom bar says it too, and the bill list leaves room for the note', () => {
        add();
        store().setExtraDiscountPct(50);
        render(<><CartList /><SummaryBar label="Collect" disabledReason={null} submitting={false} onCollect={() => {}} onOpenTotals={() => {}} /></>);
        expect(screen.getByTestId('bill-discount-shortfall')).toHaveTextContent('Discount asked ₹172.50, given ₹124.50');
        expect(screen.getByTestId('mobile-cart-list')).toHaveClass('pb-64');
    });

    it('reports a cut of a few paise as well', () => {
        add();                                                   // room: 345 - 220.50 = 124.50
        store().setExtraDiscountPct(Number(((124.8 / 345) * 100).toFixed(6)));
        expect(totals().extraDiscountShortfall).toBe(0.3);
    });

    it('says nothing when the whole discount is given', () => {
        add();
        store().setExtraDiscountPct(10);
        expect(totals().extraDiscountShortfall).toBe(0);
    });

    it('clicking into the percent box and out again does not change a rupee discount', () => {
        add({ qty: 3 });
        store().setExtraDiscountPct(Number(((100 / 1035) * 100).toFixed(6)));     // Rs 100
        render(<TotalsSheet open onClose={() => {}} />);
        const pct = screen.getByTestId('bill-discount-pct');
        fireEvent.focus(pct);
        fireEvent.blur(pct);
        expect(totals().extraDiscountAmount).toBeCloseTo(100, 2);
        expect(draftOf().extraDiscountPct).toBeCloseTo(9.661836, 6);              // was re-rounded to 9.66
    });
});

describe('outlet setting "landing cost includes GST"', () => {
    it('reaches the billing store from the page hook, so phones get it too', async () => {
        settings.mockReturnValue({ data: { landingCostIncludeGst: true } });
        renderHook(() => useSyncBillingSettings());
        await waitFor(() => expect(store().landingCostIncludeGst).toBe(true));
    });
});

describe('prices read back from a saved bill or quotation', () => {
    it('a net rate keeps itself and works the list price back', () => {
        expect(savedLinePrices({ rate: 90, discountPct: 10, mrp: 100, listPrice: 100 })).toEqual({ rate: 90, saleRate: 100 });
    });
    it('an older retail quotation (rate = MRP beside a discount) is discounted once', () => {
        expect(savedLinePrices({ rate: 100, discountPct: 10, mrp: 100, listPrice: 100 })).toEqual({ rate: 90, saleRate: 100 });
    });
    it('a wholesale line keeps its net rate', () => {
        expect(savedLinePrices({ rate: 270, discountPct: 10, mrp: 345, listPrice: 270 })).toEqual({ rate: 270, saleRate: 300 });
    });
});

describe('the "Disc %" box while adding a medicine', () => {
    const args = { product, batch, qtyStrips: '2', qtyLoose: '', saleType: 'WHOLESALE' as const };

    it.each(['150', '-5'])('refuses %s%%', (discountPct) => {
        const r = quickAddLine({ ...args, discountPct });
        expect(r).toMatchObject({ ok: false, reason: 'bad_discount' });
    });

    it('previews the same amount the line will have (wholesale: with GST)', () => {
        const preview = quickAddPreview({ ...args, discountPct: '10' });
        const r: any = quickAddLine({ ...args, discountPct: '10' });
        expect(preview).toBeCloseTo(567, 2);                     // 2 x 300, less 10%, plus 5% GST
        expect(r.item.totalAmount).toBeCloseTo(preview, 2);
    });
});

describe('a quotation is sent with a price it can store (2 decimals)', () => {
    it.each([['quotation', 33.34], ['invoice', 33.335]] as const)('%s', (mode, sent) => {
        add();
        const id = store().activeDraftId as string;
        store().setDraftDocumentMode(id, mode);
        store().updateCartItem(id, 'b1', { rate: 33.335000000000001 });
        expect(payload().items[0].rate).toBeCloseTo(sent, 6);
    });
});
