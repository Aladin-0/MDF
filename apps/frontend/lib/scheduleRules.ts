/**
 * Controlled drugs: a sale that contains one needs patient + doctor details (name, address, doctor reg. no.).
 * The server enforces exactly this list (apps/billing/services.py, CONTROLLED_SCHEDULES): keep them identical, and use this
 * constant everywhere on the screen instead of a hand-written list (the screen used to skip G and H and the server then refused the bill).
 */
export const CONTROLLED_SCHEDULES = ['G', 'H', 'H1', 'X', 'C', 'Narcotic'] as const;

export function isControlledSchedule(scheduleType: string | null | undefined): boolean {
    return (CONTROLLED_SCHEDULES as readonly string[]).includes(scheduleType ?? '');
}
