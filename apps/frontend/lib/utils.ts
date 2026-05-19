import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Convert a date/string to IST (Asia/Kolkata, UTC+5:30).
 * Use this everywhere you display time on invoices/receipts so
 * the output is always Indian Standard Time regardless of the
 * server/container timezone.
 *
 * Usage:
 *   import { toIST } from '@/lib/utils';
 *   format(toIST(someDate), 'dd-MM-yyyy HH:mm')
 */
export function toIST(date: Date | string | number | null | undefined): Date {
    if (!date) return new Date();
    const d = date instanceof Date ? date : new Date(date);
    // IST = UTC + 5h 30m = UTC + 330 minutes
    const utcMs = d.getTime() + (d.getTimezoneOffset() * 60_000); // normalise to UTC
    return new Date(utcMs + (330 * 60_000));
}

export function formatQty(
    qty_strips: number,
    qty_loose: number,
    pack_size: number | null
): string {
    const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

    if (!pack_size || pack_size <= 1) {
        if (qty_strips > 0 && qty_loose > 0)
            return s(qty_strips, 'strip') + ' + ' + s(qty_loose, 'tablet')
        if (qty_strips > 0) return s(qty_strips, 'strip')
        return s(qty_loose, 'tablet')
    }
    const extra = Math.floor(qty_loose / pack_size)
    const rem = qty_loose % pack_size
    const total_strips = qty_strips + extra
    if (total_strips > 0 && rem > 0)
        return s(total_strips, 'strip') + ' + ' + s(rem, 'tablet')
    if (total_strips > 0) return s(total_strips, 'strip')
    return s(rem, 'tablet')
}

export function formatDecimalQty(
    fractionalStrips: number,
    packSize: number | null
): string {
    if (fractionalStrips === 0) return '0';

    const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // Handle floating-point imprecision (e.g. 11.9999999)
    const totalUnits = Math.round(fractionalStrips * (packSize && packSize > 1 ? packSize : 1));

    if (!packSize || packSize <= 1) {
        return s(totalUnits, 'tablet');
    }

    const strips  = Math.floor(totalUnits / packSize);
    const tablets = totalUnits % packSize;

    if (strips > 0 && tablets > 0) return s(strips, 'strip') + ' + ' + s(tablets, 'tablet');
    if (strips > 0)                return s(strips, 'strip');
    return s(tablets, 'tablet');
}
