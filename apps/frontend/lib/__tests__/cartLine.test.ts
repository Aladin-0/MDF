import { quickAddLine, defaultRateFor, STOCK_BLOCK_MESSAGE } from '../cartLine';

const batch = (over: any = {}): any => ({
    id: 'b1', batchNo: 'B1', expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50, landingRate: 55,
    qtyStrips: 10, qtyLoose: 3, packSize: 10, packUnit: 'tablet', packType: 'strip', ...over,
});
const product = (over: any = {}): any => ({
    id: 'p1', name: 'DOLO 650', composition: 'PARACETAMOL', manufacturer: 'Micro', gstRate: 12, scheduleType: 'OTC',
    packUnit: 'tablet', packType: 'strip', hsnCode: '3004', ...over,
});

// The formulas exactly as the billing screen used to compute them inline (the oracle this module must keep matching)
function oldInline(p: any, b: any, s: number, l: number, dPct: number, saleType: string) {
    const eff = (b.packType === 'strip' && b.packSize > 1) ? l : 0;
    const frac = s + eff / b.packSize;
    const rate = saleType === 'WHOLESALE' ? (b.pts || b.ptr || b.mrp) : b.mrp;
    const disc = rate * (1 - dPct / 100);
    const taxable = (disc * frac) / (1 + p.gstRate / 100);
    return { eff, frac, rate, total: disc * frac, taxable, gst: disc * frac - taxable };
}

describe('quickAddLine', () => {
    it('a line added with a discount carries the net rate, so the bill total and the line agree', () => {
        const r: any = quickAddLine({ product: product(), batch: batch(), qtyStrips: '1', qtyLoose: '', discountPct: '10', saleType: 'RETAIL' });
        expect(r.item.rate).toBeCloseTo(90, 10);
        expect(r.item.saleRate).toBe(100);
        expect(r.item.totalAmount).toBeCloseTo(r.item.rate * r.item.totalQty, 10);
    });

    it.each([
        ['RETAIL', 2, 3, 0], ['RETAIL', 1, 0, 10], ['RETAIL', 3, 9, 7.5], ['WHOLESALE', 5, 0, 5], ['WHOLESALE', 2, 4, 0],
    ])('%s %i strips + %i loose at %s%% matches the old inline maths', (saleType, s, l, d) => {
        const p = product(), b = batch();
        const r: any = quickAddLine({ product: p, batch: b, qtyStrips: String(s), qtyLoose: String(l), discountPct: String(d), saleType: saleType as any });
        const o = oldInline(p, b, s, l, d, saleType);
        expect(r.ok).toBe(true);
        expect(r.item.saleRate).toBe(o.rate);                                   // the price before the discount (editor base)
        expect(r.item.rate).toBeCloseTo(o.rate * (1 - d / 100), 10);            // `rate` is the NET price after the line discount
        expect(r.item.qtyLoose).toBe(o.eff);
        expect(r.item.totalQty).toBeCloseTo(o.frac, 10);
        expect(r.item.totalAmount).toBeCloseTo(o.total, 10);
        expect(r.item.taxableAmount).toBeCloseTo(o.taxable, 10);
        expect(r.item.gstAmount).toBeCloseTo(o.gst, 10);
    });

    it('carries the product and batch identity onto the line', () => {
        const r: any = quickAddLine({ product: product(), batch: batch(), qtyStrips: '2', qtyLoose: '', discountPct: '', saleType: 'RETAIL' });
        expect(r.item).toMatchObject({ batchId: 'b1', productId: 'p1', name: 'DOLO 650', batchNo: 'B1', mrp: 100, rate: 100, saleRate: 100, qtyStrips: 2, qtyLoose: 0,
            discountPct: 0, hsn: '3004', saleMode: 'strip', landingRate: 55, purchaseRate: 50, requiresPrescription: false });
    });

    it('asks for a quantity when nothing was entered', () => {
        expect(quickAddLine({ product: product(), batch: batch(), qtyStrips: '', qtyLoose: '0', discountPct: '', saleType: 'RETAIL' })).toEqual({ ok: false, reason: 'no_qty' });
    });

    it('blocks more than the batch holds (10 strips + 3 loose of 10 = 103 units)', () => {
        const over = quickAddLine({ product: product(), batch: batch(), qtyStrips: '10', qtyLoose: '4', discountPct: '', saleType: 'RETAIL' });
        expect(over).toEqual({ ok: false, reason: 'exceeds_stock', message: STOCK_BLOCK_MESSAGE });
        expect(quickAddLine({ product: product(), batch: batch(), qtyStrips: '10', qtyLoose: '3', discountPct: '', saleType: 'RETAIL' }).ok).toBe(true);
    });

    it('ignores loose units on a pack that cannot be sold loose', () => {
        const syrup = batch({ packType: 'bottle', packSize: 1 });
        const r: any = quickAddLine({ product: product(), batch: syrup, qtyStrips: '2', qtyLoose: '5', discountPct: '', saleType: 'RETAIL' });
        expect(r.item.qtyLoose).toBe(0);
        expect(r.item.totalQty).toBe(2);
    });

    it('flags prescription-only schedules on the line', () => {
        const r: any = quickAddLine({ product: product({ scheduleType: 'H' }), batch: batch(), qtyStrips: '1', qtyLoose: '', discountPct: '', saleType: 'RETAIL' });
        expect(r.item.requiresPrescription).toBe(true);
    });
});

describe('defaultRateFor', () => {
    it('retail is MRP; wholesale is PTS, then PTR, then MRP', () => {
        expect(defaultRateFor(batch(), 'RETAIL')).toBe(100);
        expect(defaultRateFor(batch(), 'WHOLESALE')).toBe(70);
        expect(defaultRateFor(batch({ pts: 0 }), 'WHOLESALE')).toBe(80);
        expect(defaultRateFor(batch({ pts: 0, ptr: 0 }), 'WHOLESALE')).toBe(100);
    });
});
