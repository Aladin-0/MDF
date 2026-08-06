import { inferPackUnit } from '../../utils/productUtils';

describe('inferPackUnit', () => {
    describe('Strips and Blisters', () => {
        it('defaults to Tablet for normal names', () => {
            expect(inferPackUnit('Paracetamol 500mg', 'strip')).toBe('Tablet');
            expect(inferPackUnit('Dolo 650', 'blister')).toBe('Tablet');
        });

        it('infers Capsule if name implies it', () => {
            expect(inferPackUnit('Amoxicillin Cap 500mg', 'strip')).toBe('Capsule');
            expect(inferPackUnit('Omeprazole capsule', 'blister')).toBe('Capsule');
            expect(inferPackUnit('B-COMPLEX CAPSULES', 'strip')).toBe('Capsule');
        });

        it('infers Softgel if name implies it', () => {
            expect(inferPackUnit('Evion 400 Softgel', 'strip')).toBe('Softgel');
            expect(inferPackUnit('Vitamin E softgels', 'blister')).toBe('Softgel');
        });
    });

    describe('Bottles', () => {
        it('defaults to Bottle for normal names', () => {
            expect(inferPackUnit('Mineral Water', 'bottle')).toBe('Bottle');
        });

        it('infers Syrup', () => {
            expect(inferPackUnit('Corex Syr', 'bottle')).toBe('Syrup');
            expect(inferPackUnit('Benadryl syrup', 'bottle')).toBe('Syrup');
        });

        it('infers Suspension', () => {
            expect(inferPackUnit('Calpol Susp', 'bottle')).toBe('Suspension');
            expect(inferPackUnit('Maalox suspension', 'bottle')).toBe('Suspension');
        });

        it('infers Drops', () => {
            expect(inferPackUnit('Nasivion Drop', 'bottle')).toBe('Drops');
            expect(inferPackUnit('Eye drops', 'bottle')).toBe('Drops');
        });

        it('infers Vial for injections', () => {
            expect(inferPackUnit('Insulin Inj', 'bottle')).toBe('Vial');
            expect(inferPackUnit('Tetanus injection', 'bottle')).toBe('Vial');
        });
    });

    describe('Tubes', () => {
        it('defaults to Tube for normal names', () => {
            expect(inferPackUnit('Generic paste', 'tube')).toBe('Tube');
        });

        it('infers Cream', () => {
            expect(inferPackUnit('Betnovate Cream', 'tube')).toBe('Cream');
        });

        it('infers Gel', () => {
            expect(inferPackUnit('Volini Gel', 'tube')).toBe('Gel');
        });

        it('infers Ointment', () => {
            expect(inferPackUnit('Neosporin oint', 'tube')).toBe('Ointment');
            expect(inferPackUnit('Burn Ointment', 'tube')).toBe('Ointment');
        });
    });

    describe('Other pack types', () => {
        it('defaults box to Piece', () => {
            expect(inferPackUnit('Surgical Mask', 'box')).toBe('Piece');
        });

        it('defaults jar to Jar', () => {
            expect(inferPackUnit('Vicks', 'jar')).toBe('Jar');
        });

        it('defaults sachet to Sachet', () => {
            expect(inferPackUnit('ORS', 'sachet')).toBe('Sachet');
        });

        it('defaults ampoule to Ampoule', () => {
            expect(inferPackUnit('Inj', 'ampoule')).toBe('Ampoule');
        });

        it('defaults kit to Kit', () => {
            expect(inferPackUnit('First Aid', 'kit')).toBe('Kit');
        });

        it('falls back to Piece for unknown types', () => {
            expect(inferPackUnit('Random product', 'unknown')).toBe('Piece');
        });
    });

    it('handles undefined or null product name safely', () => {
        expect(inferPackUnit(undefined as any, 'strip')).toBe('Tablet');
        expect(inferPackUnit(null as any, 'tube')).toBe('Tube');
    });
});
