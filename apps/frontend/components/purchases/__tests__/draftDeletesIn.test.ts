jest.mock('@/lib/api', () => ({ api: {} }));
import { draftDeletesIn } from '../PurchasesList';

describe('draftDeletesIn', () => {
    const now = new Date('2026-11-11T10:00:00');
    it('counts whole days left', () => {
        expect(draftDeletesIn('2026-11-13T12:00:00', now)).toBe('Auto-deletes in 2 days if not saved');
        expect(draftDeletesIn('2026-11-12T11:00:00', now)).toBe('Auto-deletes in 1 day if not saved');
    });
    it('says today / soon at the end', () => {
        expect(draftDeletesIn('2026-11-11T20:00:00', now)).toBe('Auto-deletes today if not saved');
        expect(draftDeletesIn('2026-11-11T09:00:00', now)).toBe('Auto-deletes soon — save it to keep it');
    });
    it('ignores bad dates', () => expect(draftDeletesIn('nope', now)).toBe(''));
});
