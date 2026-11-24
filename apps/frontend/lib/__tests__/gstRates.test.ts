import { GST_RATES, gstRateChoices } from '@/lib/gstRates';

describe('GST rate pick-lists', () => {
    it('offer 40% (energy drinks and similar goods are bought and sold at it)', () => {
        expect(GST_RATES).toEqual([0, 5, 12, 18, 28, 40]);
        expect(gstRateChoices()).toEqual([0, 5, 12, 18, 28, 40]);
    });

    it('always include the rate a product already has, in order, so the box is never empty', () => {
        expect(gstRateChoices(3)).toEqual([0, 3, 5, 12, 18, 28, 40]);
        expect(gstRateChoices('0.25')).toEqual([0, 0.25, 5, 12, 18, 28, 40]);
        expect(gstRateChoices(40)).toEqual([0, 5, 12, 18, 28, 40]);        // no duplicate
    });

    it('ignore a value that cannot be a rate', () => {
        for (const junk of [null, undefined, '', 'abc', -5, 140, NaN]) expect(gstRateChoices(junk as any)).toEqual([0, 5, 12, 18, 28, 40]);
    });
});
