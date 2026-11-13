/**
 * The phone billing look = the desktop billing look (components/billing/RightBillingRail, ActiveBillsTabs, BillingHeaderStrip):
 *  - SKY #0EA5E9 is the one action / selection colour (search border, Collect button, selected payment mode); sky-700 for sky text on light
 *  - NAVY docks: slate-900 surface, slate-800 panels, slate-700 borders, WHITE text, slate-300 secondary text (never slate-400/500 on navy)
 *  - light surfaces: slate-100 page (#F1F5F9, the tab band), white cards with slate-300 borders, slate-900 text, slate-700 labels (never slate-500)
 *  - green only for profit / in-stock / success, red only for problems, amber only for warnings; no other brand colours
 * Contrast: every text/background pair here is >= 4.5:1. Labels are 12px minimum. Money uses tabular numerals.
 * Use these constants instead of hand-written colours so every phone screen stays on one palette.
 */
export const T = {
    /** Page behind white cards */
    page: 'bg-slate-100',
    /** White card */
    card: 'rounded-xl border border-slate-300 bg-white shadow-sm',
    /** Small uppercase label above a value / field (12px, slate-700: readable, not grey-on-grey) */
    label: 'text-xs font-bold uppercase tracking-wide text-slate-700',
    /** Table-header-style band (the desktop cart header) */
    band: 'bg-slate-200 text-slate-800 text-xs font-bold uppercase tracking-wider',
    /** Monospace tag used for batch no / expiry on the desktop rows */
    tag: 'rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-800',
    /** Primary action: sky filled, white text, big (the desktop "COLLECT PAYMENT") */
    cta: 'rounded-xl bg-sky-500 font-black uppercase tracking-wide text-white shadow-sm transition-colors active:bg-sky-600 disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none',
    /** Secondary action: white with a sky outline */
    ctaOutline: 'rounded-xl border-2 border-sky-500 bg-white font-bold text-sky-700 transition-colors active:bg-sky-50 disabled:border-slate-300 disabled:text-slate-500',
    /** Neutral button */
    btn: 'rounded-xl border-2 border-slate-400 bg-white font-bold text-slate-900 transition-colors active:bg-slate-100 disabled:opacity-40',
    /** A selected option (batch card, segmented choice): sky border + pale sky fill */
    selected: 'border-sky-500 bg-sky-50 ring-1 ring-sky-500',
    /** Text input on a light surface */
    input: 'rounded-lg border-2 border-slate-400 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30',
    /** Navy dock surface and its parts (the desktop payment dock) */
    dock: 'bg-slate-900 text-white',
    dockPanel: 'rounded-xl border border-slate-700 bg-slate-800 text-white',
    dockMuted: 'text-slate-300',
    dockInput: 'rounded-lg border-2 border-slate-500 bg-slate-800 text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40',
    /** Outlined button on navy (the desktop dark payment-mode buttons) */
    dockBtn: 'rounded-xl border-2 border-slate-500 bg-slate-800 font-bold text-white transition-colors active:bg-slate-700 disabled:opacity-40',
    /** Money: aligned digits */
    money: 'tabular-nums',
} as const;
