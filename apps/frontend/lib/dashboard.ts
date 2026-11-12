/**
 * Pure helpers for the home dashboard: labels for the chosen period, trends against the previous period, the
 * hour-by-hour series, and compact rupee amounts. No React in here, so every rule is easy to test.
 */
import { addDays, differenceInCalendarDays, format, isSameYear, parseISO } from 'date-fns';

const DAY = 'yyyy-MM-dd';

/** "Today", "Yesterday", "12 Mar", or "01 Mar – 12 Mar" (with the year when it is not this year). */
export function periodTitle(from: string, to: string, now: Date = new Date()): string {
    const today = format(now, DAY);
    const yesterday = format(addDays(now, -1), DAY);
    if (from === to) {
        if (from === today) return 'Today';
        if (from === yesterday) return 'Yesterday';
        return format(parseISO(from), isSameYear(parseISO(from), now) ? 'd MMM' : 'd MMM yyyy');
    }
    const a = parseISO(from);
    const b = parseISO(to);
    const withYear = !isSameYear(a, now) || !isSameYear(b, now);
    const f = withYear ? 'd MMM yyyy' : 'd MMM';
    return `${format(a, f)} – ${format(b, f)}`;
}

/** What the trend is compared with: "yesterday", "9 Mar", or "the previous 7 days". */
export function comparisonLabel(prevFrom: string | undefined, prevTo: string | undefined, now: Date = new Date()): string {
    if (!prevFrom || !prevTo) return 'the previous period';
    if (prevFrom === prevTo) {
        return prevFrom === format(addDays(now, -1), DAY) ? 'yesterday' : format(parseISO(prevFrom), 'd MMM');
    }
    const days = differenceInCalendarDays(parseISO(prevTo), parseISO(prevFrom)) + 1;
    return `the previous ${days} days`;
}

export interface Trend {
    /** Whole-number percent change, signed. */
    pct: number;
    direction: 'up' | 'down' | 'flat';
}

/**
 * Change against the previous period, or null when there is nothing to compare with (an earlier period of zero
 * would make any number "infinitely" better, so we say nothing rather than invent one).
 */
export function trendOf(current: number | undefined, previous: number | undefined): Trend | null {
    if (current === undefined || previous === undefined || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
    if (previous <= 0) return null;
    const pct = Math.round(((current - previous) / previous) * 100);
    return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/** "12 AM", "9 AM", "12 PM", "6 PM" from "18:00". */
export function hourLabel(hour: string): string {
    const h = Number.parseInt(hour, 10);
    if (!Number.isFinite(h)) return hour;
    const suffix = h < 12 ? 'AM' : 'PM';
    return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

export interface HourBucket { hour: string; label: string; bills: number; sales: number }

/**
 * Every hour from the shop's usual opening to closing (9 AM to 9 PM), widened to cover any sale outside it, so a quiet
 * hour shows as an empty slot instead of the bars around it closing up and misplacing the busy hour.
 */
export function fillHours(rows: { hour: string; bills: number; sales: number }[], open = 9, close = 21): HourBucket[] {
    if (rows.length === 0) return [];
    const byHour = new Map(rows.map((r) => [Number.parseInt(r.hour, 10), r]));
    const hours = Array.from(byHour.keys()).filter(Number.isFinite);
    const first = Math.min(open, ...hours);
    const last = Math.max(close, ...hours);
    const out: HourBucket[] = [];
    for (let h = first; h <= last; h += 1) {
        const row = byHour.get(h);
        const key = `${String(h).padStart(2, '0')}:00`;
        out.push({ hour: key, label: hourLabel(key), bills: row?.bills ?? 0, sales: row?.sales ?? 0 });
    }
    return out;
}

export function peakHour(buckets: HourBucket[]): HourBucket | null {
    let best: HourBucket | null = null;
    for (const b of buckets) if (b.sales > 0 && (!best || b.sales > best.sales)) best = b;
    return best;
}

/** ₹850, ₹12.4k, ₹1.2L, ₹3.4Cr: for chart axes and tight tiles, where the exact amount sits in the tooltip. */
export function compactInr(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    const trim = (v: number) => String(Number(v.toFixed(1)));
    if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
    if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`;
    return `${sign}₹${Math.round(abs)}`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
/** ₹12,400: whole rupees, for a dashboard (the paise are in the reports). */
export function rupees(n: number | undefined | null): string {
    return inr.format(Number.isFinite(n as number) ? (n as number) : 0);
}

/** "12 packs", "1 pack + 3 loose", "5 loose". */
export function describeQty(packs: number, loose = 0): string {
    const parts: string[] = [];
    if (packs > 0 || loose === 0) parts.push(`${packs} ${packs === 1 ? 'pack' : 'packs'}`);
    if (loose > 0) parts.push(`${loose} loose`);
    return parts.join(' + ');
}

/** Whole percent of `part` in `whole`, 0 when there is no whole. */
export function percentOf(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function greetingFor(hour: number): string {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}
