import { CONTROLLED_SCHEDULES, isControlledSchedule } from '../scheduleRules';

describe('controlled drug schedules', () => {
    it('is exactly the list the server enforces', () => {
        expect([...CONTROLLED_SCHEDULES]).toEqual(['G', 'H', 'H1', 'X', 'C', 'Narcotic']);
    });
    it('flags every controlled schedule, including plain G and H', () => {
        for (const s of ['G', 'H', 'H1', 'X', 'C', 'Narcotic']) expect(isControlledSchedule(s)).toBe(true);
    });
    it('does not flag ordinary products', () => {
        for (const s of ['OTC', 'Ayurvedic', 'Surgical', 'Cosmetic', 'Veterinary', '', undefined, null]) expect(isControlledSchedule(s as any)).toBe(false);
    });
});
