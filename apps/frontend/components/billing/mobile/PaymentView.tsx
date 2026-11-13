'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Banknote, BookUser, CheckCircle2, ChevronDown, ChevronRight, CreditCard, Loader2, Smartphone, Split, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import type { useCheckout } from '@/hooks/useCheckout';
import { cn } from '@/lib/utils';
import { SheetShell } from './SheetShell';
import { T } from './theme';
import { formatINR, getCheckRows } from './collectState';

type Tender = 'cash' | 'upi' | 'card' | 'credit';
type FixTarget = 'doctor' | 'customer' | 'cart';

const TENDERS: Array<{ key: Tender; label: string }> = [
    { key: 'cash', label: 'Cash' },
    { key: 'upi', label: 'UPI' },
    { key: 'card', label: 'Card' },
    { key: 'credit', label: 'Credit' },
];
const QUICK: Array<{ key: Exclude<Tender, 'credit'>; label: string; Icon: LucideIcon }> = [
    { key: 'cash', label: 'Cash', Icon: Banknote },
    { key: 'upi', label: 'UPI', Icon: Smartphone },
    { key: 'card', label: 'Card', Icon: CreditCard },
];
const EMPTY_SPLIT = { cash: 0, upi: 0, card: 0, credit: 0 };

const money = (n: number) => `₹${formatINR(n)}`;
/** Keep digits and a single dot, at most 2 decimals */
const cleanDecimal = (raw: string) => {
    const s = raw.replace(/[^0-9.]/g, '');
    const [i, ...rest] = s.split('.');
    return rest.length ? `${i}.${rest.join('').slice(0, 2)}` : i;
};

interface PaymentViewProps {
    open: boolean;
    onClose: () => void;
    checkout: ReturnType<typeof useCheckout>;
    /** A failing check was tapped: open the doctor sheet / customer sheet / go back to the cart. The caller closes this sheet. */
    onFix: (target: FixTarget) => void;
}

/**
 * Phone payment sheet. The whole flow is: tap Collect on the bill, tap how the customer pays (Cash / UPI / Card / Credit), done:
 * choosing a mode saves the bill right away. Split is the only mode with more to fill in, so it expands inline and has its own Collect button.
 * Modifying a bill opens the same sheet, but starts on the bill's CURRENT mode (shown as "Currently ...") and does not save on a tap: you
 * pick the mode and press Save changes, so a stray tap cannot change how a bill was paid.
 * (Wholesale bills and quotations never open this sheet: they save from the bottom bar.)
 */
export function PaymentView({ open, onClose, checkout, onFix }: PaymentViewProps) {
    const { drafts, activeDraftId, getDraftTotals, landingCostIncludeGst, setPayment } = useBillingStore();
    const draft = activeDraftId ? drafts[activeDraftId] : null;
    const totals = activeDraftId ? getDraftTotals(activeDraftId) : null;
    const grandTotal = totals?.grandTotal || 0;
    const method = (draft?.payment?.method as Tender | 'split') || 'cash';
    const isEdit = Boolean(draft?.editingSaleId);
    const split = draft?.payment?.splitBreakdown || EMPTY_SPLIT;

    const [isOnline, setIsOnline] = useState(true);
    useEffect(() => {
        if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine !== false);
        const on = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    const [showSplit, setShowSplit] = useState(false);
    const [pending, setPending] = useState<Tender | null>(null);
    // the mode the bill was saved with, captured when the sheet opens (edit mode), so "Currently paid by" does not follow the picks
    const [savedMode, setSavedMode] = useState<string>('cash');
    const [splitText, setSplitText] = useState<Partial<Record<Tender, string>>>({});
    const splitFirstRef = useRef<HTMLInputElement>(null);

    // A fresh sheet every time: plain Cash, nothing left over from an earlier split or a "received" amount.
    // Modifying a bill instead keeps the mode it was saved with (a UPI bill must not turn into Cash just because the sheet opened).
    useEffect(() => {
        if (!open) return;
        setPending(null);
        setSplitText({});
        if (isEdit) {
            setSavedMode(draft?.payment?.method || 'cash');
            setShowSplit(draft?.payment?.method === 'split');
            setPayment({ cashTendered: undefined });
        } else {
            setShowSplit(false);
            setPayment({ method: 'cash', cashTendered: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Choosing a mode saves the bill. The method is written to the store first and the save runs on the next render, so it
    // always sees the mode that was just chosen (useCheckout reads the draft through its render).
    useEffect(() => {
        if (pending && method === pending) {
            setPending(null);
            checkout.handleCheckout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pending, method]);

    const choose = (mode: Tender) => {
        if (checkout.isLoading) return;
        setPayment({ method: mode, cashTendered: undefined });
        if (!isEdit) setPending(mode);          // new bill: choosing saves. Edit: choosing only selects, Save changes saves.
    };

    const rows = getCheckRows({ draft, totals, checkout, isOnline, landingCostIncludeGst });
    // problems that stop ANY way of paying (credit / split rules only matter once that mode is chosen)
    const blocking = rows.filter((r) => !['creditCustomer', 'creditLimit', 'split', 'tender'].includes(r.id));
    const blocked = blocking.length > 0 || checkout.isLoading;

    const customer = draft?.customer && draft.customer.id !== 'mock' ? draft.customer : null;
    const limit = customer?.creditLimit || 0;
    const outstanding = customer?.outstanding || 0;

    // ── split
    const splitShown = (k: Tender) => {
        const n = Number(split[k]) || 0;
        const local = splitText[k];
        return local !== undefined && (parseFloat(local) || 0) === n ? local : (n ? String(n) : '');
    };
    const openSplit = () => {
        const next = !showSplit;
        setShowSplit(next);
        if (next) {
            const empty = !split.cash && !split.upi && !split.card && !split.credit;
            setPayment({ method: 'split', cashTendered: undefined, splitBreakdown: empty ? { cash: grandTotal, upi: 0, card: 0, credit: 0 } : split });
            setTimeout(() => splitFirstRef.current?.focus(), 50);
        } else {
            setPayment({ method: 'cash' });
        }
    };
    const setTender = (k: Tender, raw: string) => {
        const clean = cleanDecimal(raw);
        setSplitText((t) => ({ ...t, [k]: clean }));
        setPayment({ method: 'split', splitBreakdown: { ...split, [k]: parseFloat(clean) || 0 } });
    };
    const fillTender = (k: Tender) => {
        const rest = Number((grandTotal - (checkout.splitTotal - (Number(split[k]) || 0))).toFixed(2));
        const v = Math.max(0, rest);
        setSplitText((t) => ({ ...t, [k]: v ? String(v) : '' }));
        setPayment({ method: 'split', splitBreakdown: { ...split, [k]: v } });
    };
    const diff = Number((grandTotal - checkout.splitTotal).toFixed(2));
    const exact = Math.abs(diff) <= 0.01;
    const splitProblem = rows.find((r) => r.id === 'split' || r.id === 'creditCustomer');
    const splitDisabled = blocked || !checkout.canCheckout || !exact || Boolean(splitProblem);

    const MODE_NAME: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'On credit', split: 'Split' };
    // edit mode: no mode is "the" action, so the picked one is marked and the rest are quiet
    const pickedCls = 'ring-2 ring-white ring-offset-2 ring-offset-slate-900';
    const editSaveDisabled = blocked || !checkout.canCheckout || (method === 'credit' && !customer);

    const modeBtn = 'flex touch-manipulation min-h-[72px] flex-col items-center justify-center gap-1 px-2 py-2 text-base font-extrabold';

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Payment"
            description={isEdit ? 'Change how this bill was paid, then save' : 'Tap how the customer is paying'}
            tone="dark"
            bodyClassName="bg-slate-900"
        >
            <div className="flex flex-col gap-3 pb-1">
                <p data-testid="payment-total" className="sr-only">{money(grandTotal)}</p>
                {isEdit && (
                    <p data-testid="payment-current" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100">
                        Currently paid by <span className="font-extrabold text-white">{MODE_NAME[savedMode] || 'Cash'}</span>
                    </p>
                )}
                <div className={cn(T.dockPanel, 'px-4 py-3')} aria-hidden>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Net payable</p>
                    <p className={cn(T.money, 'mt-0.5 text-4xl font-black leading-tight tracking-tight text-white')}>{money(grandTotal)}</p>
                </div>

                {rows.length > 0 && (
                    <ul className="flex flex-col gap-2" aria-label="Checks">
                        {rows.filter((r) => showSplit || blocking.includes(r)).map((row) => {
                            const body = (
                                <>
                                    {row.id === 'offline' ? <WifiOff className="h-5 w-5 shrink-0 text-red-300" aria-hidden /> : <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" aria-hidden />}
                                    <span className="flex-1 text-left">{row.reason}</span>
                                    {row.fix && row.fix !== 'local' && <ChevronRight className="h-5 w-5 shrink-0 text-red-300" aria-hidden />}
                                </>
                            );
                            const cls = 'flex min-h-[48px] w-full touch-manipulation items-center gap-2 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-sm font-semibold text-red-100';
                            return (
                                <li key={row.id}>
                                    {row.fix && row.fix !== 'local' ? (
                                        <button type="button" data-testid={`check-${row.id}`} onClick={() => onFix(row.fix as FixTarget)} className={cn(cls, 'active:bg-red-900')}>{body}</button>
                                    ) : (
                                        <div data-testid={`check-${row.id}`} className={cls}>{body}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment mode">
                    {QUICK.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            type="button"
                            data-testid={`pay-${key}`}
                            data-payment-mode={key}
                            disabled={blocked || showSplit}
                            onClick={() => choose(key)}
                            aria-pressed={isEdit ? method === key : undefined}
                            className={cn(
                                isEdit && method !== key && !showSplit ? T.dockBtn : T.cta,
                                modeBtn,
                                'disabled:bg-sky-500 disabled:text-white disabled:opacity-50',
                                isEdit && method === key && pickedCls,
                                pending === key && checkout.isLoading && 'disabled:opacity-100',
                            )}
                        >
                            {pending === key && checkout.isLoading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : isEdit && method === key ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <Icon className="h-6 w-6" aria-hidden />}
                            {label}
                        </button>
                    ))}
                </div>

                {customer ? (
                    <button
                        type="button"
                        data-testid="pay-credit"
                        data-payment-mode="credit"
                        disabled={blocked || showSplit}
                        onClick={() => choose('credit')}
                        aria-pressed={isEdit ? method === 'credit' : undefined}
                        className={cn(isEdit && method === 'credit' ? T.cta : T.dockBtn, modeBtn, 'min-h-[64px] w-full flex-row justify-between px-4', isEdit && method === 'credit' && pickedCls)}
                    >
                        <span className="flex items-center gap-2">{isEdit && method === 'credit' ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <BookUser className="h-6 w-6" aria-hidden />}On credit</span>
                        <span className={cn(T.dockMuted, T.money, 'text-right text-xs font-semibold leading-tight')}>
                            {customer.name}
                            <span className="block">Due {money(outstanding)}{limit > 0 ? ` · limit ${money(limit)}` : ''}</span>
                        </span>
                    </button>
                ) : (
                    <button
                        type="button"
                        data-testid="pay-credit"
                        data-payment-mode="credit"
                        disabled={blocked || showSplit}
                        onClick={() => onFix('customer')}
                        className={cn(T.dockBtn, modeBtn, 'min-h-[56px] w-full flex-row justify-between border-dashed px-4')}
                    >
                        <span className="flex items-center gap-2"><BookUser className="h-6 w-6" aria-hidden />On credit</span>
                        <span className={cn(T.dockMuted, 'text-xs font-semibold')}>Select a customer first</span>
                    </button>
                )}

                {isEdit && !showSplit && (
                    <button
                        type="button"
                        data-testid="payment-edit-save"
                        disabled={editSaveDisabled}
                        onClick={() => checkout.handleCheckout()}
                        className={cn(T.cta, T.money, 'flex min-h-[56px] w-full touch-manipulation items-center justify-center gap-2 px-4 text-lg')}
                    >
                        {checkout.isLoading ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden />Saving…</>) : `Save changes · ${MODE_NAME[method] || method} · ${money(grandTotal)}`}
                    </button>
                )}

                <button
                    type="button"
                    data-testid="pay-split-toggle"
                    aria-expanded={showSplit}
                    disabled={blocked && !showSplit}
                    onClick={openSplit}
                    className={cn(T.dockBtn, 'flex min-h-[48px] w-full touch-manipulation items-center justify-between px-4 text-sm')}
                >
                    <span className="flex items-center gap-2"><Split className="h-5 w-5" aria-hidden />Split between modes</span>
                    <ChevronDown className={cn('h-5 w-5 transition-transform', showSplit && 'rotate-180')} aria-hidden />
                </button>

                {showSplit && (
                    <section aria-label="Split payment" className={cn(T.dockPanel, 'p-3')}>
                        <div className="flex flex-col gap-3">
                            {TENDERS.map(({ key, label }, i) => (
                                <div key={key}>
                                    <label htmlFor={`split-${key}`} className="text-sm font-bold text-white">{label}</label>
                                    <div className="mt-1 flex gap-2">
                                        <div className="relative flex-1">
                                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-300">₹</span>
                                            <input
                                                id={`split-${key}`}
                                                ref={i === 0 ? splitFirstRef : undefined}
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="0.00…"
                                                value={splitShown(key)}
                                                onChange={(e) => setTender(key, e.target.value)}
                                                className={cn(T.dockInput, T.money, 'h-11 w-full touch-manipulation pl-8 pr-3 text-base font-semibold')}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            aria-label={`Fill remaining in ${label}`}
                                            onClick={() => fillTender(key)}
                                            className="min-h-[44px] shrink-0 touch-manipulation rounded-md border-2 border-sky-400 px-3 text-sm font-bold text-sky-300 active:bg-sky-400/10"
                                        >
                                            Fill remaining
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div
                            data-testid="payment-split-status"
                            role="status"
                            className={cn(
                                'mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold',
                                exact ? 'bg-emerald-900/50 text-emerald-200' : diff > 0 ? 'bg-amber-900/50 text-amber-200' : 'bg-red-950 text-red-200',
                            )}
                        >
                            {exact ? (
                                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" aria-hidden />Exact match</span>
                            ) : diff > 0 ? (
                                <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" aria-hidden />Remaining {money(diff)}</span>
                            ) : (
                                <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" aria-hidden />Overpaid by {money(-diff)}</span>
                            )}
                            <span className={T.money}>{money(checkout.splitTotal)} / {money(grandTotal)}</span>
                        </div>
                        <button
                            type="button"
                            data-testid="payment-split-collect"
                            disabled={splitDisabled}
                            onClick={() => checkout.handleCheckout()}
                            className={cn(T.cta, T.money, 'mt-3 flex min-h-[56px] w-full touch-manipulation items-center justify-center gap-2 px-4 text-lg')}
                        >
                            {checkout.isLoading ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden />Processing…</>) : `${isEdit ? 'Save changes' : 'Collect'} ${money(grandTotal)}`}
                        </button>
                    </section>
                )}

                {checkout.checkoutError && (
                    <p role="alert" data-testid="payment-error" className="flex items-start gap-1.5 rounded-lg border border-red-500/60 bg-red-950 p-3 text-sm font-bold text-red-200">
                        <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-red-300" aria-hidden />{checkout.checkoutError}
                    </p>
                )}
            </div>
        </SheetShell>
    );
}
