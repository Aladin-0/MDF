import { batchState, computeMetrics, describePack, type DetailBatch } from '../productDetail';
import { toDayString } from '../dates';

const now = new Date(2026, 10, 10); // 10 Nov 2026
const inDays = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return toDayString(d); };
const batch = (over: Partial<DetailBatch> = {}): DetailBatch => ({
    id: 'b', batchNo: 'B', expiryDate: inDays(400), qtyStrips: 4, qtyLoose: 0, packSize: 10, mrp: 150, purchaseRate: 100, landingRate: 110, ...over,
});

describe('batchState', () => {
    it('empty beats everything, expiring TODAY is still sellable, yesterday is expired', () => {
        expect(batchState(batch({ qtyStrips: 0, qtyLoose: 0, expiryDate: inDays(-5) }), now)).toBe('empty');
        expect(batchState(batch({ expiryDate: inDays(-1) }), now)).toBe('expired');
        expect(batchState(batch({ expiryDate: inDays(0) }), now)).toBe('expiring');   // the page called this "expired"
        expect(batchState(batch({ expiryDate: inDays(90) }), now)).toBe('expiring');
        expect(batchState(batch({ expiryDate: inDays(91) }), now)).toBe('ok');
    });
    it('a batch with only loose units still counts as stocked', () => {
        expect(batchState(batch({ qtyStrips: 0, qtyLoose: 3 }), now)).toBe('ok');
    });
});

describe('computeMetrics', () => {
    it('counts loose units in packs and in every value (they were ignored in the values)', () => {
        const m = computeMetrics({ packSize: 10, batches: [batch({ qtyStrips: 2, qtyLoose: 5 })] }, now);
        expect(m.packs).toBe(2.5);
        expect(m.costValue).toBe(275);      // 2.5 x landing 110
        expect(m.mrpValue).toBe(375);       // 2.5 x 150
        expect(m.averageMrp).toBe(150);
    });

    it('values with the BATCH pack size when it differs from the product\'s', () => {
        const m = computeMetrics({ packSize: 5, batches: [batch({ qtyStrips: 0, qtyLoose: 5, packSize: 10 })] }, now);
        expect(m.packs).toBe(0.5);
    });

    it('counts batches by state and finds the nearest expiry among stocked batches', () => {
        const m = computeMetrics({ packSize: 10, batches: [
            batch({ id: '1', expiryDate: inDays(-30) }),
            batch({ id: '2', expiryDate: inDays(20) }),
            batch({ id: '3', expiryDate: inDays(300) }),
            batch({ id: '4', expiryDate: inDays(-100), qtyStrips: 0 }),   // empty: ignored
        ] }, now);
        expect(m).toMatchObject({ inStockBatches: 3, expiredBatches: 1, expiringBatches: 1, nearestExpiry: inDays(-30) });
    });

    it('is low below the product\'s own level, or below 10 when none is set (0 used to mean "never low")', () => {
        expect(computeMetrics({ minQty: 5, batches: [batch({ qtyStrips: 3 })] }, now)).toMatchObject({ isLow: true, level: 5 });
        expect(computeMetrics({ minQty: 5, batches: [batch({ qtyStrips: 6 })] }, now).isLow).toBe(false);
        expect(computeMetrics({ minQty: 0, batches: [batch({ qtyStrips: 9 })] }, now)).toMatchObject({ isLow: true, level: 10 });
        expect(computeMetrics({ minQty: 0, batches: [batch({ qtyStrips: 10 })] }, now).isLow).toBe(false);
    });

    it('copes with no batches', () => {
        expect(computeMetrics({ batches: [] }, now)).toMatchObject({ packs: 0, nearestExpiry: null, averageMrp: 0, isLow: true });
    });
});

describe('describePack', () => {
    it('says what the pack is in words', () => {
        expect(describePack({ packSize: 10, packType: 'strip', packUnit: 'tablet' })).toBe('10 tablets per strip');
        expect(describePack({ packSize: 1, packType: 'piece', packUnit: 'Piece' })).toBe('Sold whole (piece)');
        expect(describePack({ packSize: 12, packType: 'box', packUnit: 'strip' })).toBe('12 strips per box');
    });
});
