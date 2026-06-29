'use client';

import { useState } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { cn } from '@/lib/utils';
import { useSaveBill } from '@/hooks/useSaveBill';
import { useToast } from '@/hooks/use-toast';

export function RightBillingRail() {
    const { drafts, activeDraftId, getDraftTotals, setDraftDocumentMode } = useBillingStore();
    
    const draft = activeDraftId ? drafts[activeDraftId] : null;
    const isQuotation = draft?.documentMode === 'quotation';
    const [localPaymentMethod, setLocalPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
    const [cashReceived, setCashReceived] = useState<string>('');
    
    const { saveBill, isLoading } = useSaveBill();
    const { toast } = useToast();
    const [checkoutError, setCheckoutError] = useState<string | null>(null);

    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;

    const cart = activeDraft.cart;
    const totals = getDraftTotals(activeDraftId);
    const extraDiscountPct = activeDraft.extraDiscountPct || 0;
    const { updateDraftHeader } = useBillingStore.getState();

    const [pctDraft, setPctDraft] = useState<string>('');
    const [amtDraft, setAmtDraft] = useState<string>('');
    const [pctFocused, setPctFocused] = useState(false);
    const [amtFocused, setAmtFocused] = useState(false);

    const base = totals.subtotal - totals.discountAmount;

    const commitPct = (raw: string) => {
        const v = Number(Math.min(100, Math.max(0, parseFloat(raw) || 0)).toFixed(2));
        updateDraftHeader(activeDraftId, { extraDiscountPct: v });
    };

    const commitAmt = (raw: string) => {
        const v = Math.max(0, parseFloat(raw) || 0);
        const pct = base > 0 ? Number(Math.min(100, (v / base) * 100).toFixed(2)) : 0;
        updateDraftHeader(activeDraftId, { extraDiscountPct: pct });
    };

    const totalStrips = cart.reduce((sum, item) => sum + item.qtyStrips, 0);
    const totalLoose = cart.reduce((sum, item) => sum + item.qtyLoose, 0);
    const qtyCountStr = totalStrips > 0 ? `${totalStrips} Strips${totalLoose > 0 ? ` ${totalLoose} Loose` : ''}` : `${totalLoose} Quantities`;

    const hasScheduleH = useBillingStore(state => state.hasScheduleHItems(activeDraftId));
    const scheduleHData = activeDraft.scheduleHData;
    const isScheduleHValid = !hasScheduleH || (scheduleHData && scheduleHData.patientName && scheduleHData.doctorName);

    const tenderAmount = cashReceived === '' ? totals.grandTotal : Number(cashReceived);
    const balance = Math.max(0, tenderAmount - totals.grandTotal);
    
    const isTenderInvalid = localPaymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < totals.grandTotal;
    const canCheckout = cart.length > 0 && isScheduleHValid && !isTenderInvalid && !isLoading;

    const handleCheckout = async () => {
        setCheckoutError(null);
        try {
            await saveBill({
                method: localPaymentMethod,
                amount: totals.grandTotal,
                cashTendered: localPaymentMethod === 'cash' ? tenderAmount : 0,
                cashReturned: localPaymentMethod === 'cash' ? balance : 0,
                upiRef: '',
                cardLast4: '',
                cardType: '',
                creditGiven: 0
            });
            toast({
                title: 'Success',
                description: 'Bill Saved Successfully!',
            });
            // Success! The app should redirect or show a success screen automatically via useBillingStore state changes.
        } catch (error: any) {
            console.error(error);
            const message = error?.message ?? error?.error?.message ?? error?.detail ?? 'Failed to save bill. Please try again.';
            setCheckoutError(message);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white relative overflow-hidden border-l border-slate-200">
            {/* Bill Summary Header */}
            <div className="px-5 py-4 border-b border-slate-200 shrink-0">
                <h3 className="font-bold text-slate-800 text-lg">Bill Summary</h3>
            </div>

            {/* Quick Stats */}
            <div className="px-5 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 shrink-0">
                <div className="text-sm font-medium text-slate-600">
                    {totals.itemCount} Items | {cart.reduce((s, i) => s + (i.qtyStrips * i.packSize + i.qtyLoose), 0)} Quantities
                </div>
                <div className="text-sm font-bold text-blue-600">
                    Bill Disc: -₹{totals.extraDiscountAmount.toFixed(2)}
                </div>
            </div>

            {/* Breakdown */}
            <div className="flex-1 p-5 overflow-y-auto">
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
                                        value={pctFocused ? pctDraft : (extraDiscountPct === 0 ? '' : String(extraDiscountPct))}
                                        className="w-10 h-6 text-center text-xs border border-blue-200 rounded px-1 text-blue-700 bg-blue-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-3"
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
                                        className="w-14 h-6 text-center text-xs border border-blue-200 rounded px-1 text-blue-700 bg-blue-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-3"
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
                        <span>- ₹ {totals.extraDiscountAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-800">
                        <span>Gross Amount</span>
                        <span>₹ {(totals.subtotal + totals.discountAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>CGST (Avg 9%)</span>
                        <span>₹ {totals.cgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>SGST (Avg 9%)</span>
                        <span>₹ {totals.sgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Round Off</span>
                        <span>- ₹ {Math.abs(totals.roundOff).toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Sticky Payment Dock (Dark Theme) */}
            <div className="bg-[#2A303C] text-white p-5 shrink-0 border-t-4 border-slate-800">
                {/* Net Payable */}
                <div className="flex justify-between items-end mb-6">
                    <span className="text-[13px] font-black tracking-widest text-slate-300">NET PAYABLE</span>
                    <span className="font-black text-5xl tracking-tight text-white">₹ {totals.grandTotal.toFixed(2)}</span>
                </div>

                {/* Payment Options (Hide if Quotation) */}
                {!isQuotation && (
                    <>
                        <div className="mb-4">
                            <span className="text-xs font-semibold text-slate-400 block mb-2">Payment Mode</span>
                            <div className="flex gap-2">
                                {['cash', 'upi', 'card'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setLocalPaymentMethod(mode as any)}
                                        className={cn(
                                            "flex-1 py-1.5 border rounded text-sm font-bold capitalize transition-colors",
                                            localPaymentMethod === mode 
                                                ? "bg-[#0EA5E9] border-[#0EA5E9] text-white" 
                                                : "bg-transparent border-slate-600 text-slate-300 hover:border-slate-400"
                                        )}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cash Received & Balance */}
                        {localPaymentMethod === 'cash' && (
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <span className="text-xs font-semibold text-slate-400 block mb-1">Received</span>
                                    <input 
                                        type="number"
                                        value={cashReceived}
                                        onChange={(e) => setCashReceived(e.target.value)}
                                        placeholder={totals.grandTotal.toString()}
                                        className="w-full bg-[#1C2029] border border-slate-600 rounded px-3 py-2 text-white font-bold outline-none focus:border-[#0EA5E9]"
                                    />
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-slate-400 block mb-1">Balance</span>
                                    <div className="w-full bg-[#1C2029] border border-slate-600 rounded px-3 py-2 flex items-center">
                                        <span className="text-emerald-400 font-bold">₹ {balance.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
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

                {/* Submit Button */}
                <button 
                    onClick={handleCheckout}
                    disabled={!canCheckout}
                    className="w-full py-3.5 bg-[#0EA5E9] hover:bg-[#0284C7] disabled:bg-slate-700 disabled:text-slate-400 text-white font-black text-lg rounded shadow-sm transition-colors flex justify-center items-center gap-2 tracking-wide"
                >
                    <span className="bg-transparent border-none p-0 flex items-center gap-2">
                        {isLoading ? 'Processing...' : (
                            isQuotation ? (
                                <>SAVE QUOTATION</>
                            ) : (
                                <>COLLECT PAYMENT <span className="text-blue-200 text-xs font-normal ml-1 border border-blue-400/30 px-1 rounded bg-blue-500/20">[F8]</span></>
                            )
                        )}
                    </span>
                </button>
                
                {/* Validation Warnings & Errors */}
                <div className="mt-3 text-center min-h-[20px]">
                    {checkoutError && (
                        <span className="text-sm font-bold text-red-400 block mb-1">{checkoutError}</span>
                    )}
                    {cart.length === 0 && !checkoutError && (
                        <span className="text-xs font-semibold text-slate-400">Add items to enable checkout</span>
                    )}
                    {cart.length > 0 && !isScheduleHValid && !checkoutError && (
                        <span className="text-xs font-bold text-red-400">Missing Schedule H details</span>
                    )}
                    {cart.length > 0 && isScheduleHValid && isTenderInvalid && !checkoutError && (
                        <span className="text-xs font-bold text-red-400">Tender amount cannot be less than total</span>
                    )}
                </div>
            </div>
        </div>
    );
}
