/**
 * Calendar-day helpers shared by the stock screens.
 * Dates here are plain days ("2026-11-10"), not moments in time.
 */

/** "2026-11-10" -> local Date at midnight. `new Date("2026-11-10")` is UTC and shows the wrong day west of UTC. */
export function parseDay(value: string): Date {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

export const toDayString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });

export const formatDay = (value: string) => dateFmt.format(parseDay(value));
export const formatMonth = (value: string) => monthFmt.format(parseDay(value));

/** Whole days from today until `value` (negative once past). */
export function daysUntil(value: string, now: Date = new Date()): number {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((parseDay(value).getTime() - today.getTime()) / 86_400_000);
}

export type ExpiryTone = 'expired' | 'soon' | 'ok';

/** expired = already past; soon = within 90 days; ok = further away. */
export function expiryTone(expiry: string, now: Date = new Date()): ExpiryTone {
    const days = daysUntil(expiry, now);
    if (days < 0) return 'expired';
    if (days <= 90) return 'soon';
    return 'ok';
}
