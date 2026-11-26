/**
 * The bill discount of an open bill. It is typed either as a percent or in rupees, and the bill keeps what was typed:
 *   * rupees (`extraDiscountRupees`) stay that many rupees however the bill changes;
 *   * a percent (`extraDiscountPct`) grows and shrinks with the bill.
 * Rupees used to be turned into a percent the moment they were typed, so Rs 100 off a Rs 500 bill became Rs 160 when a
 * Rs 300 medicine was added. Everything that needs "the percent" of a bill asks here; never read `extraDiscountPct` alone.
 */
import type { DraftBill } from '@/types';
import { lineNetAmount } from '@/lib/billingMarginUtils';

type DiscountedBill = Pick<DraftBill, 'extraDiscountPct' | 'extraDiscountRupees' | 'saleType' | 'cart'>;

/** The bill discount as a percent of the bill as it stands now (0 to 100). */
export function billDiscountPctOf(draft: Partial<DiscountedBill> | null | undefined): number {
    const rupees = Number(draft?.extraDiscountRupees || 0);
    if (!(rupees > 0)) return Number(draft?.extraDiscountPct || 0);
    const bill = (draft?.cart || []).reduce((sum, item) => sum + lineNetAmount(item, draft?.saleType || 'RETAIL'), 0);
    return bill > 0 ? Math.min(100, (rupees / bill) * 100) : 0;
}
