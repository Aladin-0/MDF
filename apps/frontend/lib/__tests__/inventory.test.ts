import {
    batchValue, productValue, pluralize, hasExpiry, expiryText, directionFor, previewAdjustment, buildAdjustPayload,
} from '../inventory';
import { applyInventoryPatch, readInventoryParams, hasActiveFilters } from '../inventoryParams';

describe('valuation', () => {
    const batch = { qtyStrips: 2, qtyLoose: 5, packSize: 10, purchaseRate: 100, landingRate: 120, mrp: 200 };

    it('values loose units with the BATCH pack size, not the product one', () => {
        // 2.5 packs at purchase 100; with the product's size (5) this used to be 3 packs = 300
        expect(batchValue(batch, 'PURCHASE', 5)).toBe(250);
        expect(batchValue(batch, 'MRP', 5)).toBe(500);
    });

    it('falls back to purchase rate when there is no landing rate, and to the product pack size when the batch has none', () => {
        expect(batchValue({ ...batch, landingRate: null }, 'LANDING')).toBe(250);
        expect(batchValue({ ...batch, packSize: undefined }, 'PURCHASE', 5)).toBe(300);
    });

    it('sums batches', () => {
        expect(productValue([batch, { ...batch, qtyStrips: 1, qtyLoose: 0 }], 'PURCHASE')).toBe(350);
        expect(productValue(undefined, 'PURCHASE')).toBe(0);
    });
});

describe('wording', () => {
    it('pluralises properly ("boxs" was shown)', () => {
        expect(pluralize('strip')).toBe('strips');
        expect(pluralize('box')).toBe('boxes');
        expect(pluralize('bottle')).toBe('bottles');
        expect(pluralize('box', 1)).toBe('box');
        expect(pluralize('')).toBe('units');
    });

    it('treats the API placeholder date as "no expiry"', () => {
        expect(hasExpiry('2099-12-31')).toBe(false);
        expect(hasExpiry(null)).toBe(false);
        expect(hasExpiry('2027-01-31')).toBe(true);
    });

    it('describes days left, today and past', () => {
        expect(expiryText(10)).toBe('10 days left');
        expect(expiryText(1)).toBe('1 day left');
        expect(expiryText(0)).toBe('Expires today');
        expect(expiryText(-3)).toBe('Expired 3 days ago');
    });
});

describe('stock adjustment', () => {
    const batch = { qtyStrips: 5, qtyLoose: 3, packSize: 10, packType: 'strip' };

    it('damage and theft remove, a patient return adds, a correction goes either way', () => {
        expect(directionFor('damage', 'add')).toBe('remove');
        expect(directionFor('theft', 'add')).toBe('remove');
        expect(directionFor('return_from_patient', 'remove')).toBe('add');
        expect(directionFor('correction', 'remove')).toBe('remove');
        expect(directionFor('correction', 'add')).toBe('add');
    });

    it('previews whole packs: only the pack count moves, never below zero', () => {
        expect(previewAdjustment(batch, 'packs', 'remove', 2)).toEqual({ strips: 3, loose: 3 });
        expect(previewAdjustment(batch, 'packs', 'add', 2)).toEqual({ strips: 7, loose: 3 });
        expect(previewAdjustment(batch, 'packs', 'remove', 6)).toBeNull();
    });

    it('previews loose units: breaks a pack open and folds whole packs back', () => {
        expect(previewAdjustment(batch, 'loose', 'remove', 5)).toEqual({ strips: 4, loose: 8 }); // 53 - 5 = 48
        expect(previewAdjustment(batch, 'loose', 'add', 9)).toEqual({ strips: 6, loose: 2 });   // 53 + 9 = 62
        expect(previewAdjustment(batch, 'loose', 'remove', 54)).toBeNull();
    });

    it('shows no change for an empty quantity', () => {
        expect(previewAdjustment(batch, 'packs', 'add', 0)).toEqual({ strips: 5, loose: 3 });
    });

    it('builds exactly the body the endpoint needs: type, signed qty, unit and PIN', () => {
        const body = buildAdjustPayload('b1', 'o1', {
            adjustmentType: 'damage', direction: 'add', unit: 'packs', quantity: 4, reason: '  Broken in transit ', pin: '4321',
        });
        expect(body).toEqual({ batchId: 'b1', outletId: 'o1', type: 'damage', qty: -4, adjustUnit: 'strips', reason: 'Broken in transit', pin: '4321' });
        expect(buildAdjustPayload('b1', 'o1', {
            adjustmentType: 'return_from_patient', direction: 'remove', unit: 'loose', quantity: 3, reason: 'Unused', pin: '1111',
        })).toMatchObject({ qty: 3, adjustUnit: 'loose' });
    });
});

describe('inventory URL state', () => {
    it('reads defaults and ignores junk', () => {
        expect(readInventoryParams(new URLSearchParams('tab=nope&sort=valuation&size=250&page=-4'))).toEqual({
            tab: 'all', q: '', schedule: 'all', sort: 'name', order: 'asc', page: 1, size: 50,
        });
        expect(readInventoryParams(new URLSearchParams('tab=expiring&sort=stock&order=desc&size=100&page=3&q=dolo&schedule=H'))).toEqual({
            tab: 'expiring', q: 'dolo', schedule: 'H', sort: 'stock', order: 'desc', page: 3, size: 100,
        });
    });

    it('anything that changes what is listed goes back to page 1 in the same update', () => {
        const start = new URLSearchParams('page=4&sort=stock');
        for (const patch of [{ q: 'x' }, { schedule: 'H' }, { tab: 'expiring' as const }, { sort: 'name' as const }, { size: 25 }]) {
            expect(applyInventoryPatch(start, patch).get('page')).toBeNull();
        }
        expect(applyInventoryPatch(start, { page: 5 }).get('page')).toBe('5');
    });

    it('keeps the URL clean and Clear Filters leaves the tab and sort alone', () => {
        // defaults are never written, so clearing the last real value leaves a clean URL
        expect(applyInventoryPatch(new URLSearchParams('q=dolo&page=3'), { q: '  ' }).toString()).toBe('');
        expect(applyInventoryPatch(new URLSearchParams(''), { tab: 'all', sort: 'name', order: 'asc', size: 50, schedule: 'all' }).toString()).toBe('');
        const cleared = applyInventoryPatch(new URLSearchParams('tab=expiring&q=a&schedule=H&sort=stock'), { q: '', schedule: 'all' });
        expect(cleared.toString()).toBe('tab=expiring&sort=stock');
        expect(hasActiveFilters(readInventoryParams(new URLSearchParams('q=a')))).toBe(true);
        expect(hasActiveFilters(readInventoryParams(new URLSearchParams('tab=expiring')))).toBe(false);
    });
});
