/**
 * PKG (units per pack) on a purchase line: the one set of rules the grid, the phone editor, the schema and the payload share.
 * The server checks the same range (`apps/inventory/pack_rules.py` MAX_PURCHASE_PKG / parse_purchase_pkg): keep them equal.
 *
 * PKG sets how much stock a line adds ((qty + free) x PKG units) and the pack size of the batch billing sells from, so a wrong number
 * silently creates or loses stock. It used to turn into 1 whenever it was blank, decimal or zero.
 */
export const MAX_PKG = 1000;
/** Above this a typing slip is more likely than a real pack (the catalogue's largest pack is 120): shown as a warning, not refused */
export const LARGE_PKG = 200;

export type PkgCheck = { ok: true; value: number } | { ok: false; message: string };

/** A PKG as a whole number 1..MAX_PKG, or the reason it is not one. Blank is NOT 1. */
export function parsePkg(v: unknown): PkgCheck {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return { ok: false, message: 'Enter units per pack (Pkg)' };
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, message: 'Pkg must be a whole number' };
    if (n < 1 || n > MAX_PKG) return { ok: false, message: `Pkg must be 1 to ${MAX_PKG}` };
    return { ok: true, value: n };
}

/** Leading whole-number digits of what was typed or pasted ("15.5" -> "15", "1,5" -> "1", "12 3" -> "12", "-5" -> ""): it stops at the first non-digit
 *  instead of dropping it, because dropping the "." would turn 15.5 into 155. */
export function leadingDigits(raw: string): string {
    return raw.trim().match(/^\d*/)?.[0] ?? '';
}

/** What may be typed in a PKG box: whole digits only, at most the digits of MAX_PKG, no leading zeros */
export function sanitizePkgInput(raw: string): string {
    return leadingDigits(raw).replace(/^0+(?=\d)/, '').slice(0, String(MAX_PKG).length);      // zeros first, or "00015" would be cut to "0001"
}

/** The PKG as a number for sums: 0 when it is not a valid whole number (never 1: a blank must not look like a pack of 1) */
export function pkgOrZero(v: unknown): number {
    const r = parsePkg(v);
    return r.ok ? r.value : 0;
}

export interface PkgNote {
    kind: 'differs' | 'large';
    /** Short text for under the box / the field hint */
    text: string;
}

/**
 * What to tell the clerk about a PKG that parses but may be wrong:
 *  - it differs from the catalogue's pack size (only when the catalogue HAS one: a catalogue size of 1 usually means "never filled in"
 *    - 83% of products - and a clerk entering the real size there is the normal case, not worth a warning);
 *  - it is unusually large.
 */
export function pkgNote(item: { pkg: unknown; catalogPkg?: number | null }): PkgNote | null {
    const r = parsePkg(item.pkg);
    if (!r.ok) return null;
    if (item.catalogPkg && item.catalogPkg > 1 && item.catalogPkg !== r.value) return { kind: 'differs', text: `Catalogue: ${item.catalogPkg}` };
    if (r.value > LARGE_PKG) return { kind: 'large', text: 'Very large pack: check' };
    return null;
}

export interface PackMismatch {
    index: number;
    name: string;
    pkg: number;
    catalogPkg: number;
    packs: number;
    units: number;
}

/**
 * The started lines whose PKG contradicts a catalogue pack size above 1 (the catalogue says 10 per strip, the line says 15): the screen asks
 * before saving those. `skip` lets an edit leave out lines that were already saved this way and are not being changed.
 */
export function packMismatches<T extends { productId?: string; productName?: string; pkg: unknown; catalogPkg?: number | null; qty: number; freeQty: number }>(
    items: T[],
    skip?: (item: T, index: number) => boolean,
): PackMismatch[] {
    const out: PackMismatch[] = [];
    items.forEach((it, index) => {
        const r = parsePkg(it.pkg);
        if (!r.ok || !it.catalogPkg || it.catalogPkg <= 1 || it.catalogPkg === r.value) return;
        if (skip?.(it, index)) return;
        const packs = (Number(it.qty) || 0) + (Number(it.freeQty) || 0);
        out.push({ index, name: it.productName || `Medicine ${index + 1}`, pkg: r.value, catalogPkg: it.catalogPkg, packs, units: packs * r.value });
    });
    return out;
}
