import { allowsLoose, wholePackWord, LOOSE_PACK_TYPES } from '../packRules';

describe('allowsLoose (must match apps/backend/apps/inventory/pack_rules.py)', () => {
    it('needs a countable pack of more than one', () => {
        expect(allowsLoose({ packSize: 10, packType: 'strip' })).toBe(true);
        expect(allowsLoose({ packSize: 10, packType: 'Blister' })).toBe(true);
        expect(allowsLoose({ packSize: 12, packType: 'box' })).toBe(true);
        expect(allowsLoose({ packSize: 1, packType: 'strip' })).toBe(false);
        expect(allowsLoose({ packSize: 100, packType: 'bottle' })).toBe(false); // 100 ml, not 100 bottles
        expect(allowsLoose({ packSize: 30, packType: 'tube' })).toBe(false);
        expect(allowsLoose({ packSize: undefined, packType: 'strip' })).toBe(false);
        expect(allowsLoose(null)).toBe(false);
    });

    it("trusts the server's answer over its own rule", () => {
        expect(allowsLoose({ packSize: 10, packType: 'strip', allowsLoose: false })).toBe(false);
        expect(allowsLoose({ packSize: 1, packType: 'bottle', allowsLoose: true })).toBe(true);
    });

    it('uses the same set of types as the server', () => {
        expect([...LOOSE_PACK_TYPES].sort()).toEqual(['blister', 'box', 'other', 'packet', 'strip']);
    });
});

describe('wholePackWord', () => {
    it('names the whole pack', () => {
        expect(wholePackWord('strip')).toBe('strip');
        expect(wholePackWord('Blister')).toBe('strip');
        expect(wholePackWord('box')).toBe('box');
        expect(wholePackWord('')).toBe('unit');
    });
});
