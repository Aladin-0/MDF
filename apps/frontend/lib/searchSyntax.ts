/**
 * The medicine search box understands a few short codes (the server parses them: apps/inventory/search_query.py):
 *   dolo 650        every word, any order          L+175         names starting with L priced about 175 (+/-10%), closest first
 *   C,losartan      brands containing that salt     L+20-30 range, L+<50 up to 50, L+>100 from 100, L+=23.50 exactly
 *   8901234567890   a scanned barcode
 * Substitutes ("same salt, other brand") are opened with A (after moving the highlight) or Alt+A.
 */

/** One word of letters / digits / dashes with at least 6 digits: what a hardware barcode scanner types ('paracetamol' or 'dolo650' is not). */
export function looksLikeBarcode(text: string): boolean {
    const t = (text || '').trim();
    return /^[0-9A-Za-z-]{6,64}$/.test(t) && (t.match(/\d/g) || []).length >= 6;
}

export const SEARCH_TIPS = 'L+175 about that price (L+20-30 range) · C,losartan by salt · ↓ then A (or Alt+A) for substitutes · scan a barcode';
