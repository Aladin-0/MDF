'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, TrendingUp, Truck } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { canViewBillingMargins } from '@/lib/access';
import { calculateTotalMargin } from '@/lib/billingMarginUtils';
import { cn } from '@/lib/utils';
import { SheetShell } from './SheetShell';
import { T } from './theme';

const money = (n: number | undefined) => `₹ ${(n ?? 0).toFixed(2)}`;

function Row({ label, value, tone, testId, hint }: { label: string; value: string; tone?: string; testId?: string; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
                <span className={cn('font-semibold text-slate-700', tone)}>{label}</span>
                {hint && <span className="block text-xs font-medium text-slate-700">{hint}</span>}
            </span>
            <span data-testid={testId} className={cn('shrink-0 font-bold tabular-nums text-slate-900', tone)}>{value}</span>
        </div>
    );
}

/** Every line of the desktop Bill Summary, on a phone. Read-only except the bill discount (% and Rs, linked). */
export function TotalsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const drafts = useBillingStore((s) => s.drafts);
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const getDraftTotals = useBillingStore((s) => s.getDraftTotals);
    const setExtraDiscountPct = useBillingStore((s) => s.setExtraDiscountPct);
    const showMarginInfo = useBillingStore((s) => s.showMarginInfo);
    const toggleMarginInfo = useBillingStore((s) => s.toggleMarginInfo);
    const activeStaff = useBillingStore((s) => s.activeStaff);
    const landingCostIncludeGst = useBillingStore((s) => s.landingCostIncludeGst);
    const outlet = useAuthStore((s) => s.outlet);

    const [pctDraft, setPctDraft] = useState('');
    const [amtDraft, setAmtDraft] = useState('');
    const [pctFocused, setPctFocused] = useState(false);
    const [amtFocused, setAmtFocused] = useState(false);

    const draft = activeDraftId ? drafts[activeDraftId] : undefined;
    const totals = draft && activeDraftId ? getDraftTotals(activeDraftId) : null;
    const cart = draft?.cart ?? [];
    const saleType = draft?.saleType || 'RETAIL';
    const extraDiscountPct = draft?.extraDiscountPct || 0;

    const marginData = useMemo(() => {
        if (!draft || !totals) return null;
        return calculateTotalMargin(draft.cart, totals.grandTotal, totals.extraDiscountAmount, draft.extraDiscountPct || 0, saleType, landingCostIncludeGst);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, totals?.grandTotal, totals?.extraDiscountAmount, saleType, landingCostIncludeGst]);

    if (!draft || !totals) return null;

    const canSeeMargins = canViewBillingMargins(activeStaff?.role);          // may the role see them at all (shows the eye)
    const showMargin = canSeeMargins && showMarginInfo;

    // inter-state: same rule as the desktop rail (customer's state differs from the outlet's)
    const outletState = outlet?.state || outlet?.stateCode || '';
    const customerState = draft.customerLedger?.state || draft.customerLedger?.stateCode || draft.customer?.state || draft.customer?.stateCode || '';
    const isInterstate = customerState ? customerState.toLowerCase() !== outletState.toLowerCase() : false;

    const commitPct = (raw: string) => {
        setExtraDiscountPct(Number(Math.min(100, Math.max(0, parseFloat(raw) || 0)).toFixed(2)));
    };
    const commitAmt = (raw: string) => {
        const v = Math.max(0, parseFloat(raw) || 0);
        // % against the bill BEFORE the bill discount, 6 decimals, so Rs -> % -> Rs is exact to the paisa (same as the desktop rail)
        const base = totals.preExtraNet;
        setExtraDiscountPct(base > 0 ? Number(Math.min(100, (v / base) * 100).toFixed(6)) : 0);
    };

    const pctShown = pctFocused ? pctDraft : (extraDiscountPct === 0 ? '' : String(parseFloat(extraDiscountPct.toFixed(2))));
    const amtShown = amtFocused ? amtDraft : (totals.extraDiscountAmount === 0 ? '' : totals.extraDiscountAmount.toFixed(2));
    const roundOff = totals.roundOff ?? 0;
    const inputCls = cn('h-12 w-full touch-manipulation px-2 text-center text-base font-bold tabular-nums', T.input);

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Bill totals"
            footer={
                <button type="button" onClick={onClose} className={cn('h-12 w-full touch-manipulation text-base', T.cta)}>
                    Done
                </button>
            }
        >
            <div className="divide-y divide-slate-200 text-slate-700">
                <Row label="Items" value={`${cart.length}`} testId="totals-item-count" />
                <Row label="Item discount total" value={`- ${money(totals.discountAmount)}`} tone="text-emerald-800" testId="totals-item-discount" />

                <div className="flex flex-col gap-2 py-2">
                    <div className="flex items-baseline justify-between">
                        <span className="text-sm font-semibold text-sky-800">Bill discount</span>
                        <span data-testid="totals-bill-discount" className="text-sm font-bold tabular-nums text-sky-800">- {money(totals.extraDiscountAmount)}</span>
                    </div>
                    <div className="flex items-end gap-2 rounded-lg border border-sky-300 bg-sky-50 p-2.5">
                        <div className="min-w-0 flex-1">
                            <label htmlFor="bill-discount-pct" className={cn('mb-1 block', T.label)}>Percent (%)</label>
                            <input
                                id="bill-discount-pct"
                                data-testid="bill-discount-pct"
                                inputMode="decimal"
                                placeholder="0"
                                value={pctShown}
                                className={inputCls}
                                onFocus={(e) => {
                                    setPctFocused(true);
                                    setPctDraft(extraDiscountPct === 0 ? '' : String(extraDiscountPct));
                                    e.target.select();
                                }}
                                onChange={(e) => {
                                    setPctDraft(e.target.value);
                                    commitPct(e.target.value);
                                }}
                                onBlur={() => {
                                    setPctFocused(false);
                                    commitPct(pctDraft);
                                }}
                            />
                        </div>
                        <span className="pb-3 text-xs font-bold text-slate-700">OR</span>
                        <div className="min-w-0 flex-1">
                            <label htmlFor="bill-discount-amt" className={cn('mb-1 block', T.label)}>Amount (Rs)</label>
                            <input
                                id="bill-discount-amt"
                                data-testid="bill-discount-amt"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={amtShown}
                                className={inputCls}
                                onFocus={(e) => {
                                    setAmtFocused(true);
                                    setAmtDraft(totals.extraDiscountAmount === 0 ? '' : totals.extraDiscountAmount.toFixed(2));
                                    e.target.select();
                                }}
                                onChange={(e) => {
                                    setAmtDraft(e.target.value);
                                    commitAmt(e.target.value);
                                }}
                                onBlur={() => {
                                    setAmtFocused(false);
                                    commitAmt(amtDraft);
                                }}
                            />
                        </div>
                    </div>
                </div>

                <Row label="Gross taxable amount" value={money(totals.taxableAmount)} testId="totals-taxable" />
                {isInterstate ? (
                    <Row label="IGST" hint="Inter-state supply" value={money((totals.cgst ?? 0) + (totals.sgst ?? 0))} testId="totals-igst" />
                ) : (
                    <>
                        <Row label="CGST" value={money(totals.cgst)} testId="totals-cgst" />
                        <Row label="SGST" value={money(totals.sgst)} testId="totals-sgst" />
                    </>
                )}
                {saleType === 'RETAIL' && (
                    <Row
                        label="Round off"
                        testId="totals-round-off"
                        value={roundOff > 0 ? `+ ${money(roundOff)}` : roundOff < 0 ? `- ${money(Math.abs(roundOff))}` : money(0)}
                    />
                )}

                {canSeeMargins && cart.length > 0 && (
                    <div className="py-3" data-testid="totals-margin-block">
                      <div className={cn('space-y-2 p-3', T.dockPanel)}>
                        <div className="flex items-center justify-between">
                            <span className={cn('text-xs font-bold uppercase tracking-widest', T.dockMuted)}>Margin</span>
                            <button
                                type="button"
                                onClick={toggleMarginInfo}
                                aria-label={showMarginInfo ? 'Hide profit' : 'Show profit'}
                                aria-pressed={showMarginInfo}
                                className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border-2 border-slate-500 text-white active:bg-slate-700"
                            >
                                {showMarginInfo ? <Eye className="h-5 w-5" aria-hidden /> : <EyeOff className="h-5 w-5" aria-hidden />}
                            </button>
                        </div>
                        {showMargin && marginData && (
                            <>
                                <div className="flex items-center justify-between text-sm">
                                    <span className={cn('flex items-center gap-1.5 font-semibold', T.dockMuted)}><Truck className="h-4 w-4 text-sky-300" aria-hidden /> Total bill landing cost</span>
                                    <span data-testid="totals-landing" className="font-bold tabular-nums text-sky-300">{money(marginData.totalLandingCost)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className={cn('flex items-center gap-1.5 font-semibold', T.dockMuted)}><TrendingUp className="h-4 w-4" aria-hidden /> Total profit</span>
                                    <span data-testid="totals-profit" className={cn('font-bold tabular-nums', marginData.totalProfit >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                                        {marginData.totalProfit >= 0 ? '+' : ''}{money(marginData.totalProfit)} ({marginData.profitMarginPct.toFixed(1)}%)
                                    </span>
                                </div>
                            </>
                        )}
                      </div>
                    </div>
                )}

                <div className={cn('mt-3 flex flex-col gap-1 rounded-xl px-4 py-4', T.dock)}>
                    <span className={cn('text-xs font-bold uppercase tracking-widest', T.dockMuted)}>Net payable</span>
                    <span data-testid="totals-net-payable" className={cn('text-4xl font-black text-white', T.money)}>{money(totals.grandTotal)}</span>
                </div>
            </div>
        </SheetShell>
    );
}
