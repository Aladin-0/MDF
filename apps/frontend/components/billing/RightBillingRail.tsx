'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { useMagicSubmit } from '@/hooks/useMagicSubmit';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { calculateTotalMargin } from '@/lib/billingMarginUtils';
import { useCheckout } from '@/hooks/useCheckout';
import { useToast } from '@/hooks/use-toast';
import { RevisionReasonModal } from './RevisionReasonModal';
import { Eye, EyeOff, TrendingUp, Truck, AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export function RightBillingRail() {
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const { drafts, activeDraftId, getDraftTotals, setDraftDocumentMode, setRevisionContext, showMarginInfo, toggleMarginInfo, activeStaff } = useBillingStore();
    const isCashier = activeStaff?.role === 'cashier';
    const canViewMargins = !isCashier && showMarginInfo;
    const { outlet } = useAuthStore();
    const containerRef = useRef<HTMLDivElement>(null);
    
    const draft = activeDraftId ? drafts[activeDraftId] : null;
    const isQuotation = draft?.documentMode === 'quotation';
    const paymentMethod = draft?.payment?.method || 'cash';
    const splitBreakdown = draft?.payment?.splitBreakdown || { cash: 0, upi: 0, card: 0, credit: 0 };

    const setPaymentMethod = (mode: any) => {
        const currentBreakdown = draft?.payment?.splitBreakdown || { cash: 0, upi: 0, card: 0, credit: 0 };
        const isCurrentEmpty = !currentBreakdown.cash && !currentBreakdown.upi && !currentBreakdown.card && !currentBreakdown.credit;
        useBillingStore.getState().setPayment({ 
            method: mode,
            splitBreakdown: mode === 'split' && isCurrentEmpty
                ? { cash: totals.grandTotal, upi: 0, card: 0, credit: 0 }
                : currentBreakdown
        });
    };

    const updateSplitTender = (tender: 'cash' | 'upi' | 'card' | 'credit', value: number) => {
        const current = draft?.payment?.splitBreakdown || { cash: 0, upi: 0, card: 0, credit: 0 };
        useBillingStore.getState().setPayment({
            method: 'split',
            splitBreakdown: {
                ...current,
                [tender]: Number(value) || 0
            }
        });
    };

    useEffect(() => {
        if (draft?.saleType === 'WHOLESALE' && draft?.payment?.method !== 'credit') {
            setPaymentMethod('credit');
        }
    }, [draft?.saleType]);
    
    

    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;

    const cart = activeDraft.cart;
    const totals = getDraftTotals(activeDraftId);
    const extraDiscountPct = activeDraft.extraDiscountPct || 0;
    const { updateDraftHeader } = useBillingStore.getState();

    const outletState = outlet?.state || outlet?.stateCode || '';
    const customerState = activeDraft?.customerLedger?.state || activeDraft?.customerLedger?.stateCode || activeDraft?.customer?.state || activeDraft?.customer?.stateCode || '';
    const isInterstate = customerState ? customerState.toLowerCase() !== outletState.toLowerCase() : false;

    const isCreditBlocked = activeDraft?.saleType === 'WHOLESALE' && activeDraft?.customer && ((activeDraft.customer.outstanding || 0) + totals.grandTotal > (activeDraft.customer.creditLimit || 0));

    const [pctDraft, setPctDraft] = useState<string>('');
    const [amtDraft, setAmtDraft] = useState<string>('');
    const [pctFocused, setPctFocused] = useState(false);
    const [amtFocused, setAmtFocused] = useState(false);

    const marginData = useMemo(() => {
        if (!activeDraft) return null;
        return calculateTotalMargin(activeDraft.cart, totals.grandTotal, totals.extraDiscountAmount);
    }, [activeDraft, totals.grandTotal, totals.extraDiscountAmount]);




    const commitPct = (raw: string) => {
        const v = Number(Math.min(100, Math.max(0, parseFloat(raw) || 0)).toFixed(2));
        updateDraftHeader(activeDraftId, { extraDiscountPct: v });
    };

    const commitAmt = (raw: string) => {
        const v = Math.max(0, parseFloat(raw) || 0);
        // Use preExtraNet (value before the global bill discount) as the base.
        // IMPORTANT: store 6 decimal places of % precision here so that the
        // round-trip  ₹ → % → ₹  is lossless to within <₹0.01.
        // Example: 3432 / 5140 * 100 = 66.770428... stored as 66.7704
        //          When rendered: 66.7704% of 5140 = ₹3432.00 ✓
        const base = totals.preExtraNet;
        const pct = base > 0 ? Number(Math.min(100, (v / base) * 100).toFixed(6)) : 0;
        updateDraftHeader(activeDraftId, { extraDiscountPct: pct });
    };

    const totalStrips = cart.reduce((sum, item) => sum + item.qtyStrips, 0);
    const totalLoose = cart.reduce((sum, item) => sum + item.qtyLoose, 0);
    const qtyCountStr = totalStrips > 0 ? `${totalStrips} Strips${totalLoose > 0 ? ` ${totalLoose} Loose` : ''}` : `${totalLoose} Quantities`;

    const {
        handleCheckout,
        executeCheckout,
        canCheckout,
        checkoutError,
        reasonModalOpen,
        setReasonModalOpen,
        isLoading,
        isScheduleHValid,
        isCreditInvalid,
        splitTotal,
        isSplitInvalid,
        isSplitCreditInvalid,
        isLossSale,
        isGlobalLoss,
    } = useCheckout();

    useMagicSubmit(null, () => {
        if (canCheckout && !(paymentMethod === 'credit' && isCreditBlocked)) {
            handleCheckout();
        }
    });

    return (
        <div ref={containerRef} className="flex flex-col lg:h-full bg-white relative lg:overflow-hidden lg:border-l border-slate-200">
            {/* Bill Summary Header */}
            <div className="hidden lg:flex px-5 py-3.5 border-b border-slate-200 shrink-0 items-center">
                <h3 className="font-bold text-slate-800 text-base">Bill Summary</h3>
            </div>

            {/* Quick Stats */}
            <div className="hidden lg:flex px-5 py-3 border-b border-slate-200 justify-between items-center bg-slate-50/50 shrink-0">
                <div className="text-sm font-medium text-slate-600" data-testid="cart-summary-items">
                    {totals.itemCount} Items | {(() => {
                        const totalStrips = cart.reduce((s, i) => s + i.qtyStrips, 0);
                        const totalLoose = cart.reduce((s, i) => s + i.qtyLoose, 0);
                        if (totalStrips > 0 || totalLoose > 0) {
                            return `${totalStrips > 0 ? `${totalStrips} S` : ''}${totalStrips > 0 && totalLoose > 0 ? ' ' : ''}${totalLoose > 0 ? `${totalLoose} L` : ''}`;
                        }
                        return `${cart.reduce((s, i) => s + (i.totalQty || i.qtyStrips), 0)} Qty`;
                    })()}
                </div>
                <div className="text-sm font-bold text-blue-600">
                    Bill Disc: -₹{totals.extraDiscountAmount.toFixed(2)}
                </div>
            </div>

            {/* Breakdown */}
            <div className="hidden lg:block flex-1 p-4 md:p-5 overflow-y-auto max-h-[320px] lg:max-h-none">
                <div className="space-y-4 text-sm font-medium text-slate-600">
                    <div className="flex justify-between text-green-600">
                        <span>Item Discount Total</span>
                        <span>- ₹ {totals.discountAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-blue-600 items-center">
                        <div className="flex items-center gap-2">
                            <span>Bill Discount</span>
                            <div className="flex items-center gap-1 opacity-90 transition-opacity focus-within:opacity-100 hover:opacity-100">
                                <div className="relative flex items-center">
                                    <input
                                        inputMode="decimal"
                                        placeholder="0"
                                        value={pctFocused ? pctDraft : (extraDiscountPct === 0 ? '' : String(parseFloat(extraDiscountPct.toFixed(2))))}
                                        className="w-14 h-7 text-center text-xs border border-blue-200 rounded px-1 text-blue-700 bg-blue-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-3"
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
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { commitPct(pctDraft); (e.target as HTMLInputElement).blur(); }
                                            if (e.key === 'Escape') { setPctDraft(''); setPctFocused(false); }
                                        }}
                                    />
                                    <span className="absolute right-1 text-[9px] text-blue-400 pointer-events-none select-none">%</span>
                                </div>
                                <span className="text-[10px] text-blue-300">|</span>
                                <div className="relative flex items-center">
                                    <span className="absolute left-1 text-[9px] text-blue-400 pointer-events-none select-none">₹</span>
                                    <input
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={amtFocused ? amtDraft : (totals.extraDiscountAmount === 0 ? '' : totals.extraDiscountAmount.toFixed(2))}
                                        className="w-20 h-7 text-center text-xs border border-blue-200 rounded px-1 text-blue-700 bg-blue-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-3"
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
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { commitAmt(amtDraft); (e.target as HTMLInputElement).blur(); }
                                            if (e.key === 'Escape') { setAmtDraft(''); setAmtFocused(false); }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <span>- ₹ {(totals.extraDiscountAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-800">
                        <span>Gross Amount</span>
                        <span>₹ {(totals.taxableAmount ?? 0).toFixed(2)}</span>
                    </div>
                    {isInterstate ? (
                        <div className="flex justify-between">
                            <span>IGST</span>
                            <span>₹ {((totals.cgst ?? 0) + (totals.sgst ?? 0)).toFixed(2)}</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between">
                                <span>CGST</span>
                                <span>₹ {(totals.cgst ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>SGST</span>
                                <span>₹ {(totals.sgst ?? 0).toFixed(2)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between">
                        <span>Round Off</span>
                        <span>
                            {(totals.roundOff ?? 0) > 0
                                ? `+ ₹ ${(totals.roundOff ?? 0).toFixed(2)}`
                                : (totals.roundOff ?? 0) < 0
                                ? `- ₹ ${Math.abs(totals.roundOff ?? 0).toFixed(2)}`
                                : '₹ 0.00'}
                        </span>
                    </div>

                    {/* Accurate Landing Cost & Profit Breakdown */}
                    {marginData && cart.length > 0 && canViewMargins && (
                        <div className="pt-3 border-t border-dashed border-slate-200 space-y-2 text-xs">
                            <div className="flex justify-between text-slate-600">
                                <span className="flex items-center gap-1.5 font-medium">
                                    <Truck className="w-3.5 h-3.5 text-sky-600" />
                                    Total Bill Landing Cost
                                </span>
                                <span className="font-bold text-slate-800 tabular-nums">
                                    ₹ {marginData.totalLandingCost.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                                    Total Margin (Gross Profit)
                                </span>
                                <span className={cn(
                                    "font-bold tabular-nums",
                                    marginData.totalProfit >= 0 ? "text-emerald-700" : "text-rose-600"
                                )}>
                                    {marginData.totalProfit >= 0 ? '+' : ''}₹ {marginData.totalProfit.toFixed(2)} ({marginData.profitMarginPct.toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky Payment Dock (Dark Theme) */}
            <div className="fixed bottom-0 left-0 w-full z-40 bg-gray-900 p-4 md:p-5 flex flex-col gap-4 shadow-2xl lg:relative lg:p-5 lg:shadow-none lg:bg-[#2A303C] lg:border-t-4 lg:border-slate-800">
                {/* Net Payable */}
                <div className="flex justify-between items-center mb-1 lg:mb-4">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xs lg:text-[13px] font-black tracking-widest text-slate-300">NET PAYABLE</span>
                        <button
                            type="button"
                            onClick={() => setIsSummaryModalOpen(true)}
                            className="lg:hidden text-xs bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-sky-400 border border-slate-700 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                            <span>ℹ️</span> Summary
                        </button>
                    </div>
                    <span className="font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-white" data-testid="grand-total-amount">₹ {totals.grandTotal.toFixed(2)}</span>
                </div>
                
                {(canViewMargins && marginData && cart.length > 0) && (
                    <div className="hidden lg:flex flex-col mb-4 bg-slate-800/90 p-3 rounded-lg border border-slate-700/80 shadow-sm">
                        <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-700/70">
                            <span className="text-slate-300 font-medium flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-sky-400" />
                                Total Bill Landing Cost
                            </span>
                            <span className="font-black text-sky-300 text-sm tabular-nums">
                                ₹ {marginData.totalLandingCost.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-slate-300 font-medium flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                Total Profit
                            </span>
                            <div className="text-right">
                                <span className={cn(
                                    "font-black text-sm tabular-nums",
                                    marginData.totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                                )}>
                                    {marginData.totalProfit >= 0 ? '+' : ''}₹ {marginData.totalProfit.toFixed(2)}
                                </span>
                                <span className={cn(
                                    "text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded",
                                    marginData.totalProfit >= 0 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                )}>
                                    {marginData.profitMarginPct.toFixed(1)}% margin
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Payment Options (Hide if Quotation) */}
                {!isQuotation && (
                    <>
                        <div className="mb-4" onKeyDown={(e) => {
                            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                                e.preventDefault();
                                e.stopPropagation();
                                const buttons = Array.from(e.currentTarget.querySelectorAll('button[data-payment-mode]')) as HTMLButtonElement[];
                                const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
                                if (currentIndex !== -1) {
                                    let nextIndex = currentIndex;
                                    if (e.key === 'ArrowRight') {
                                        nextIndex = (currentIndex + 1) % buttons.length;
                                    } else if (e.key === 'ArrowLeft') {
                                        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                                    }
                                    buttons[nextIndex].focus();
                                }
                            }
                        }}>
                            <span className="text-xs font-semibold text-slate-400 block mb-2">Payment Mode</span>
                            <div className="flex gap-2">
                                {['cash', 'upi', 'card', 'credit', 'split'].map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        data-payment-mode="true"
                                        onClick={() => setPaymentMethod(mode as any)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setPaymentMethod(mode as any);
                                            }
                                        }}
                                        className={cn(
                                            "flex-1 min-h-[44px] py-2 border rounded-md text-xs sm:text-sm font-bold capitalize transition-colors flex items-center justify-center",
                                            paymentMethod === mode 
                                                ? "bg-[#0EA5E9] border-[#0EA5E9] text-white shadow-sm" 
                                                : "bg-transparent border-slate-600 text-slate-300 hover:border-slate-400 active:bg-slate-800"
                                        )}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>

                            {/* Split Payment Breakdown Grid */}
                            {paymentMethod === 'split' && (
                                <div className="mt-3 p-3 bg-slate-800/90 rounded-lg border border-slate-700 space-y-2">
                                    <div className="flex justify-between items-center text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-700">
                                        <span>Split Breakdown</span>
                                        <span className={cn(
                                            "font-mono text-xs font-bold",
                                            Math.abs(splitTotal - totals.grandTotal) < 0.01 ? "text-emerald-400" : "text-amber-400"
                                        )}>
                                            ₹{splitTotal.toFixed(2)} / ₹{totals.grandTotal.toFixed(2)}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        {/* Cash */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[11px] font-semibold text-slate-300">Cash</span>
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    onClick={() => updateSplitTender('cash', Math.max(0, totals.grandTotal - (splitTotal - (splitBreakdown.cash || 0))))}
                                                    className="text-[10px] text-sky-400 hover:underline font-bold"
                                                >
                                                    Fill
                                                </button>
                                            </div>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-2 text-slate-500 text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={splitBreakdown.cash !== undefined && splitBreakdown.cash !== 0 ? splitBreakdown.cash : ''}
                                                    onChange={(e) => updateSplitTender('cash', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 pl-5 py-1 text-white text-xs font-mono focus:border-sky-400 focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* UPI */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[11px] font-semibold text-slate-300">UPI</span>
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    onClick={() => updateSplitTender('upi', Math.max(0, totals.grandTotal - (splitTotal - (splitBreakdown.upi || 0))))}
                                                    className="text-[10px] text-sky-400 hover:underline font-bold"
                                                >
                                                    Fill
                                                </button>
                                            </div>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-2 text-slate-500 text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={splitBreakdown.upi !== undefined && splitBreakdown.upi !== 0 ? splitBreakdown.upi : ''}
                                                    onChange={(e) => updateSplitTender('upi', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 pl-5 py-1 text-white text-xs font-mono focus:border-sky-400 focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Card */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[11px] font-semibold text-slate-300">Card</span>
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    onClick={() => updateSplitTender('card', Math.max(0, totals.grandTotal - (splitTotal - (splitBreakdown.card || 0))))}
                                                    className="text-[10px] text-sky-400 hover:underline font-bold"
                                                >
                                                    Fill
                                                </button>
                                            </div>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-2 text-slate-500 text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={splitBreakdown.card !== undefined && splitBreakdown.card !== 0 ? splitBreakdown.card : ''}
                                                    onChange={(e) => updateSplitTender('card', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 pl-5 py-1 text-white text-xs font-mono focus:border-sky-400 focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Credit */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[11px] font-semibold text-slate-300">Credit</span>
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    onClick={() => updateSplitTender('credit', Math.max(0, totals.grandTotal - (splitTotal - (splitBreakdown.credit || 0))))}
                                                    className="text-[10px] text-sky-400 hover:underline font-bold"
                                                >
                                                    Fill
                                                </button>
                                            </div>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-2 text-slate-500 text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={splitBreakdown.credit !== undefined && splitBreakdown.credit !== 0 ? splitBreakdown.credit : ''}
                                                    onChange={(e) => updateSplitTender('credit', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 pl-5 py-1 text-white text-xs font-mono focus:border-sky-400 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Match / Difference status indicator */}
                                    <div className="text-[11px] pt-1 flex justify-between font-medium">
                                        {Math.abs(splitTotal - totals.grandTotal) < 0.01 ? (
                                            <span className="text-emerald-400 font-semibold flex items-center gap-1">✓ Exact match (₹{totals.grandTotal.toFixed(2)})</span>
                                        ) : splitTotal < totals.grandTotal ? (
                                            <span className="text-amber-300">Remaining: ₹{(totals.grandTotal - splitTotal).toFixed(2)}</span>
                                        ) : (
                                            <span className="text-red-400">Overpaid by: ₹{(splitTotal - totals.grandTotal).toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>


                    </>
                )}

                {/* Convert to Invoice Button (If loaded quotation) */}
                {isQuotation && draft?.quotationId && (
                    <button
                        onClick={() => setDraftDocumentMode(activeDraftId, 'invoice')}
                        className="w-full mb-3 py-2 border-2 border-[#0EA5E9] text-[#0EA5E9] hover:bg-[#0EA5E9]/10 font-bold text-sm rounded transition-colors flex justify-center items-center gap-2"
                    >
                        CONVERT TO INVOICE
                    </button>
                )}

                {/* Loss-Sale Prevention Lock Banner */}
                {(isLossSale || isGlobalLoss) && (
                    <div 
                        data-testid="loss-sale-lock-banner"
                        className="w-full mb-3 p-3 bg-red-600/15 border-2 border-red-500/80 rounded-lg text-red-400 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-sm"
                    >
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>Checkout Locked: One or more items are being sold below landing cost.</span>
                    </div>
                )}

                {/* Submit Button */}
                <button 
                    data-testid="checkout-button"
                    onClick={handleCheckout}
                    disabled={!canCheckout || (paymentMethod === 'credit' && !!isCreditBlocked)}
                    className="w-full min-h-[56px] py-3.5 bg-[#0EA5E9] hover:bg-[#0284C7] active:bg-[#0369A1] disabled:bg-slate-700 disabled:text-slate-400 text-white font-black text-lg sm:text-xl rounded-lg shadow-md transition-colors flex justify-center items-center gap-2 tracking-wide"
                >
                    <span className="bg-transparent border-none p-0 flex items-center gap-2">
                        {isLoading ? 'Processing...' : (
                            isQuotation ? (
                                <>SAVE QUOTATION</>
                            ) : paymentMethod === 'credit' ? (
                                <>SAVE ON CREDIT <span className="text-blue-200 text-xs font-normal ml-1 border border-blue-400/30 px-1 rounded bg-blue-500/20">(Ctrl + Enter)</span></>
                            ) : (
                                <>COLLECT PAYMENT <span className="text-blue-200 text-xs font-normal ml-1 border border-blue-400/30 px-1 rounded bg-blue-500/20">(Ctrl + Enter)</span></>
                            )
                        )}
                    </span>
                </button>
                
                {/* Validation Warnings & Errors */}
                <div className="mt-3 text-center min-h-[20px]">
                    {checkoutError && (
                        <span className="text-sm font-bold text-red-400 block mb-1">{checkoutError}</span>
                    )}
                    {(isLossSale || isGlobalLoss) && !checkoutError && (
                        <span className="text-xs font-bold text-red-400 block mb-1">
                            Checkout Locked: One or more items are being sold below landing cost.
                        </span>
                    )}
                    {cart.length === 0 && !checkoutError && (
                        <span className="text-xs font-semibold text-slate-400">Add items to enable checkout</span>
                    )}
                    {cart.length > 0 && !isScheduleHValid && !checkoutError && (
                        <span className="text-xs font-bold text-red-400">Missing Schedule H details</span>
                    )}

                    {cart.length > 0 && isCreditInvalid && !checkoutError && (
                        <span className="text-xs font-bold text-red-400">Customer is required for credit bills</span>
                    )}
                    {paymentMethod === 'credit' && isCreditBlocked && !checkoutError && (
                        <span className="text-xs font-bold text-red-400">Credit limit exceeded for this customer</span>
                    )}
                    {paymentMethod === 'split' && isSplitInvalid && !checkoutError && (
                        <span className="text-xs font-bold text-amber-400">
                            Split total (₹{splitTotal.toFixed(2)}) must equal net payable (₹{totals.grandTotal.toFixed(2)})
                        </span>
                    )}
                    {paymentMethod === 'split' && isSplitCreditInvalid && !checkoutError && (
                        <span className="text-xs font-bold text-red-400">Customer is required for credit tender in split payment</span>
                    )}
                </div>
            </div>
            <RevisionReasonModal 
                open={reasonModalOpen} 
                onOpenChange={setReasonModalOpen} 
                onSubmit={async (code, text) => {
                    setRevisionContext(activeDraft?.revisionAction || null, code, text);
                    setReasonModalOpen(false);
                    // Zustand updates are synchronous, so we can immediately execute checkout
                    executeCheckout();
                }}
            />

            {/* Tablet/Mobile ℹ️ Summary Modal */}
            <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
                <DialogContent className="max-w-md w-[92vw] sm:w-full bg-white text-slate-800 p-6 rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 flex justify-between items-center pr-6">
                            <span>Bill Summary & Tax Details</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                                    {totals.itemCount} items
                                </span>
                                {!isCashier && (
                                    <button
                                        type="button"
                                        onClick={toggleMarginInfo}
                                        title={showMarginInfo ? "Hide Profit" : "Show Profit"}
                                        aria-label={showMarginInfo ? "Hide Profit" : "Show Profit"}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 bg-transparent transition-colors cursor-pointer"
                                    >
                                        {showMarginInfo ? (
                                            <Eye className="w-4 h-4 text-slate-500" />
                                        ) : (
                                            <EyeOff className="w-4 h-4" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 py-3 text-sm font-medium text-slate-600 border-t border-b border-slate-100 my-2">
                        <div className="flex justify-between text-slate-800 font-semibold">
                            <span>Gross Taxable Amount</span>
                            <span>₹ {(totals.taxableAmount ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-600">
                            <span>Item Discount Total</span>
                            <span>- ₹ {totals.discountAmount.toFixed(2)}</span>
                        </div>
                        {/* Bill Discount Interactive Touch Controls */}
                        <div className="flex flex-col gap-2 py-1 text-blue-600">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-sm">Bill Discount</span>
                                <span className="font-bold text-sm">- ₹ {(totals.extraDiscountAmount ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-blue-50/70 p-2.5 rounded-lg border border-blue-200">
                                {/* Percentage Input */}
                                <div className="relative flex-1 flex items-center">
                                    <input
                                        inputMode="decimal"
                                        placeholder="0"
                                        value={pctFocused ? pctDraft : (extraDiscountPct === 0 ? '' : String(parseFloat(extraDiscountPct.toFixed(2))))}
                                        className="w-full h-10 text-center text-base font-bold border border-blue-300 rounded-md px-2 text-blue-700 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-6"
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
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { commitPct(pctDraft); (e.target as HTMLInputElement).blur(); }
                                            if (e.key === 'Escape') { setPctDraft(''); setPctFocused(false); }
                                        }}
                                    />
                                    <span className="absolute right-2.5 text-xs font-bold text-blue-500 pointer-events-none select-none">%</span>
                                </div>

                                <span className="text-xs font-bold text-blue-400">OR</span>

                                {/* Amount Input */}
                                <div className="relative flex-1 flex items-center">
                                    <span className="absolute left-2.5 text-xs font-bold text-blue-500 pointer-events-none select-none">₹</span>
                                    <input
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={amtFocused ? amtDraft : (totals.extraDiscountAmount === 0 ? '' : totals.extraDiscountAmount.toFixed(2))}
                                        className="w-full h-10 text-center text-base font-bold border border-blue-300 rounded-md px-2 pl-6 text-blue-700 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { commitAmt(amtDraft); (e.target as HTMLInputElement).blur(); }
                                            if (e.key === 'Escape') { setAmtDraft(''); setAmtFocused(false); }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        {isInterstate ? (
                            <div className="flex justify-between">
                                <span>IGST</span>
                                <span>₹ {((totals.cgst ?? 0) + (totals.sgst ?? 0)).toFixed(2)}</span>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between">
                                    <span>CGST</span>
                                    <span>₹ {(totals.cgst ?? 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>SGST</span>
                                    <span>₹ {(totals.sgst ?? 0).toFixed(2)}</span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between">
                            <span>Round Off</span>
                            <span>
                                {(totals.roundOff ?? 0) > 0
                                    ? `+ ₹ ${(totals.roundOff ?? 0).toFixed(2)}`
                                    : (totals.roundOff ?? 0) < 0
                                    ? `- ₹ ${Math.abs(totals.roundOff ?? 0).toFixed(2)}`
                                    : '₹ 0.00'}
                            </span>
                        </div>

                        {marginData && cart.length > 0 && canViewMargins && (
                            <div className="pt-3 border-t border-dashed border-slate-200 space-y-2 text-xs">
                                <div className="flex justify-between text-slate-600">
                                    <span className="flex items-center gap-1.5 font-medium">
                                        <Truck className="w-3.5 h-3.5 text-sky-600" />
                                        Total Bill Landing Cost
                                    </span>
                                    <span className="font-bold text-slate-800 tabular-nums">
                                        ₹ {marginData.totalLandingCost.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                                        Total Profit
                                    </span>
                                    <span className={cn(
                                        "font-bold tabular-nums",
                                        marginData.totalProfit >= 0 ? "text-emerald-700" : "text-rose-600"
                                    )}>
                                        {marginData.totalProfit >= 0 ? '+' : ''}₹ {marginData.totalProfit.toFixed(2)} ({marginData.profitMarginPct.toFixed(1)}%)
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2 font-black text-xl text-slate-900">
                        <span>Net Payable:</span>
                        <span className="text-2xl text-blue-600 font-bold">₹ {totals.grandTotal.toFixed(2)}</span>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
