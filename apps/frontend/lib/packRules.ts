/**
 * Can this pack be sold loose? Mirror of apps/backend/apps/inventory/pack_rules.py.
 *
 * The server decides and sends `allowsLoose` with every product and batch; that wins. The local
 * rule below exists only for payloads that do not carry the flag yet (an older cached response)
 * and MUST stay identical to the backend one. Before this, six places here each had their own idea
 * (some "any pack size above 1", some "strip or blister only") and the billing screen offered a
 * Loose box that the server then refused.
 */

/** Pack types that hold a countable number of smaller units. Same set as LOOSE_PACK_TYPES on the server. */
export const LOOSE_PACK_TYPES: ReadonlySet<string> = new Set(['strip', 'blister', 'box', 'packet', 'other']);

export interface PackLike {
    packSize?: number | null;
    packType?: string | null;
    allowsLoose?: boolean | null;
}

export function allowsLoose(pack: PackLike | null | undefined): boolean {
    if (!pack) return false;
    if (typeof pack.allowsLoose === 'boolean') return pack.allowsLoose;
    const size = Number(pack.packSize ?? 1);
    return size > 1 && LOOSE_PACK_TYPES.has((pack.packType ?? '').trim().toLowerCase());
}

/** What to call the whole pack in the UI: "strip", "box", ... (blister counts as a strip). */
export function wholePackWord(packType?: string | null): string {
    const t = (packType ?? '').trim().toLowerCase();
    if (!t) return 'unit';
    return t === 'blister' ? 'strip' : t;
}
