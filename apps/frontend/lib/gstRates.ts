/**
 * GST rates offered in pick-lists.
 *
 * These are SUGGESTIONS, not a rule. A product is bought, kept and sold at whatever rate its purchase bill says; the
 * server accepts any rate from 0 to 100 and refuses a sale or a product save for no other rate reason. Lists that
 * offered only 0 / 5 / 12 / 18 / 28 showed an empty box for a 40% product (energy drinks) and gave no way to pick it.
 * Every GST pick-list builds its options here, so the next new rate is added in one place.
 */
export const GST_RATES: readonly number[] = [0, 5, 12, 18, 28, 40];

/** The options for a GST pick-list: the standard rates plus the value already stored, so it is never an empty box. */
export function gstRateChoices(current?: number | string | null): number[] {
    const rates = [...GST_RATES];
    const stored = current === '' || current == null ? NaN : Number(current);
    if (Number.isFinite(stored) && stored >= 0 && stored <= 100 && !rates.includes(stored)) rates.push(stored);
    return rates.sort((a, b) => a - b);
}
