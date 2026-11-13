/**
 * MediFlow keyboard shortcuts — THE single source of truth.
 *
 * Everything keyboard-related is listed here: new global shortcuts, the billing multi-bill
 * shortcuts, and the shortcuts that individual screens already handle themselves (marked
 * `local`, kept here so they are documented and collision-checked in one place).
 *
 * Consumers
 *   - components/shared/GlobalShortcuts.tsx  : the listener + "next key" hint panel
 *   - components/shared/ShortcutHelpModal.tsx: the Alt+/ cheat sheet (generated from this file)
 *   - tests/unit/shortcuts.registry.test.ts  : fails on collisions, browser-reserved keys,
 *                                              and navigation targets that are not real pages
 *
 * HOW TO ADD A SHORTCUT
 *   1. Add an entry below (use the helpers: go(), act(), or write a ShortcutDef by hand).
 *   2. Run `npx jest tests/unit/shortcuts` — it tells you if the keys collide with another
 *      shortcut that can be active on the same page, or with a browser key.
 *   3. If a new `command` action is needed, implement it in lib/shortcutCommands.ts.
 *
 * KEY DESIGN (why these keys)
 *   - GO LEADER  `Alt+G`, then a mnemonic key (`Alt+G S I` = Sales → Invoices). Sequences use no
 *     browser key except the leader itself, so navigation can never trigger a browser shortcut.
 *     Alt+G has no meaning in Chrome, Edge or Firefox. While the leader is pending a hint panel
 *     lists the next keys; Esc (or 5 s of silence) cancels. Alt may stay held for later keys.
 *   - BILLING CHORDS  single `Alt+<key>` chords, only active on /billing, work while typing.
 *     Letters avoid the keys browsers use for their menus (see BROWSER_RESERVED).
 *   - NO bare-letter shortcuts anywhere: typing in a search box must never trigger anything.
 *   - Shortcuts are matched by physical key (`event.code`), so they are layout independent.
 */
import type { Permission } from '@/hooks/usePermissions';
import type { ModalType } from '@/store/modalStore';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Where a shortcut is active. 'global' = every authenticated page. Others = a route prefix. */
export type ShortcutScope =
    | 'global'
    | 'billing'
    | 'purchases'
    | 'accounts'
    | 'voucher-entry'
    | 'inventory'
    | 'attendance'
    | 'credit'
    | 'staff'
    | 'chain';

export const SCOPE_ROUTES: Record<ShortcutScope, string | null> = {
    global: null,
    billing: '/billing',
    purchases: '/dashboard/purchases',
    accounts: '/dashboard/accounts',
    'voucher-entry': '/dashboard/accounts/voucher-entry',
    inventory: '/dashboard/inventory',
    attendance: '/dashboard/attendance',
    credit: '/dashboard/credit',
    staff: '/dashboard/staff',
    chain: '/dashboard/chain',
};

export type ShortcutAction =
    /** client-side route change */
    | { type: 'navigate'; href: string }
    /** open one of the global modals managed by GlobalModalManager */
    | { type: 'modal'; modal: Exclude<ModalType, null> }
    /** run a function from lib/shortcutCommands.ts (billing store actions, help panel, …) */
    | { type: 'command'; command: string }
    /** broadcast `mediflow:shortcut` {id}; a mounted component subscribes with useShortcutHandler(id, fn) */
    | { type: 'event' }
    /** handled inside a component that already owns the key. Listed here for documentation + collision checks only */
    | { type: 'local'; handledBy: string };

export interface ShortcutDef {
    id: string;
    /** steps: one chord (['Alt+N']) or a sequence (['Alt+G','S','I']) */
    keys: string[];
    label: string;
    /** heading in the cheat sheet; for sequences also the name shown for the intermediate key */
    group: string;
    scope: ShortcutScope;
    action: ShortcutAction;
    permission?: Permission | null;
    superAdminOnly?: boolean;
    /**
     * Required when `keys[0]` is a "soft" browser key (see BROWSER_RESERVED): states which
     * browser behaviour we knowingly replace on that screen. The test rejects unexplained clashes.
     */
    overridesBrowser?: string;
}

export const LEADER = 'Alt+G';
export const HELP_KEYS = ['Alt+/'];

// ─── Helpers to keep the table below readable ───────────────────────────────

const keysOf = (seq: string) => [LEADER, ...seq.split(' ')];

/** Go-leader navigation: `go('S I', 'Sales', 'Invoices', '/dashboard/sales', 'create_bills')` */
function go(
    seq: string,
    group: string,
    label: string,
    href: string,
    permission: Permission | null = null,
    extra: Partial<ShortcutDef> = {},
): ShortcutDef {
    return {
        id: `go.${seq.toLowerCase().replace(/ /g, '.')}`,
        keys: keysOf(seq),
        label,
        group,
        scope: 'global',
        action: { type: 'navigate', href },
        permission,
        ...extra,
    };
}

/** Go-leader "New…" actions that open a global modal. Contextual ones are scoped to their page. */
function create(
    letter: string,
    label: string,
    modal: Exclude<ModalType, null>,
    scope: ShortcutScope,
    permission: Permission | null,
    extra: Partial<ShortcutDef> = {},
): ShortcutDef {
    return {
        id: `new.${letter.toLowerCase()}`,
        keys: keysOf(`N ${letter}`),
        label,
        group: 'New / Create',
        scope,
        action: { type: 'modal', modal },
        permission,
        ...extra,
    };
}

function local(
    id: string,
    keys: string[],
    label: string,
    group: string,
    scope: ShortcutScope,
    handledBy: string,
    extra: Partial<ShortcutDef> = {},
): ShortcutDef {
    return { id, keys, label, group, scope, action: { type: 'local', handledBy }, ...extra };
}

// ─── GO LEADER: pages (Alt+G, then …) ───────────────────────────────────────

const GO_SHORTCUTS: ShortcutDef[] = [
    go('D', 'Dashboard', 'Dashboard', '/dashboard'),
    go('B', 'Billing', 'Billing Terminal', '/billing', 'create_bills'),

    // Sales
    go('S I', 'Sales', 'Sales Invoices', '/dashboard/sales', 'create_bills'),
    go('S Q', 'Sales', 'Quotations', '/dashboard/sales/quotations', 'create_bills'),
    go('S R', 'Sales', 'Sale Returns', '/dashboard/accounts/sale-returns', 'create_bills'),
    go('S N', 'Sales', 'New Sale Return', '/dashboard/accounts/sale-returns/new', 'create_bills'),
    go('S H', 'Sales', 'Revision History', '/dashboard/sales/revisions', 'create_bills'),

    // Inventory
    go('I I', 'Inventory', 'Stock List', '/dashboard/inventory', 'view_outlet'),
    go('I L', 'Inventory', 'Stock Ledger', '/dashboard/stockledger', 'view_outlet'),

    // Purchases
    go('P P', 'Purchases', 'Purchases', '/dashboard/purchases', 'view_purchases'),
    go('P R', 'Purchases', 'Purchase Returns', '/dashboard/accounts/purchase-returns', 'view_purchases'),
    go('P N', 'Purchases', 'New Purchase Return', '/dashboard/accounts/purchase-returns/new', 'view_purchases'),

    // People & credit
    go('C', 'Customers', 'Customers', '/dashboard/customers', 'view_outlet'),
    go('U', 'Credit', 'Credit & Receivables', '/dashboard/credit', 'view_outlet'),

    // Accounts
    go('A D', 'Accounts', 'Accounts Dashboard', '/dashboard/accounts/overview', 'view_accounts'),
    go('A G', 'Accounts', 'Ledgers', '/dashboard/accounts/ledgers', 'view_accounts'),
    go('A V', 'Accounts', 'All Vouchers', '/dashboard/accounts/vouchers', 'view_accounts'),
    go('A N', 'Accounts', 'New Voucher', '/dashboard/accounts/voucher-entry', 'view_accounts'),
    go('A E', 'Accounts', 'Expenses', '/dashboard/accounts/expenses', 'view_accounts'),
    go('A P', 'Accounts', 'Payables', '/dashboard/accounts/payables', 'view_accounts'),
    go('A R', 'Accounts', 'Receivables', '/dashboard/accounts/receivables', 'view_accounts'),
    go('A M', 'Accounts', 'Payments', '/dashboard/accounts/payments', 'view_accounts'),
    go('A T', 'Accounts', 'Trial Balance', '/dashboard/reports/trial-balance', 'view_reports'),
    go('A B', 'Accounts', 'Balance Sheet', '/dashboard/reports/balance-sheet', 'view_reports'),
    go('A L', 'Accounts', 'Profit & Loss', '/dashboard/reports/profit-loss', 'view_reports'),

    // GST
    go('G G', 'GST', 'GST Dashboard', '/gst', 'view_reports'),
    go('G 1', 'GST', 'GSTR-1', '/gst/gstr1', 'view_reports'),
    go('G 3', 'GST', 'GSTR-3B', '/gst/gstr3b', 'view_reports'),
    go('G 2', 'GST', 'GSTR-2A', '/gst/gstr2a', 'view_reports'),

    // Reports
    go('R R', 'Reports', 'Reports Dashboard', '/dashboard/reports', 'view_reports'),
    go('R D', 'Reports', 'Daily Report', '/dashboard/reports/daily', 'view_reports'),
    go('R S', 'Reports', 'Sales Book', '/dashboard/reports/sales-book', 'view_reports'),
    go('R P', 'Reports', 'Purchase Book', '/dashboard/reports/purchase-book', 'view_reports'),
    go('R G', 'Reports', 'Gross Profit', '/dashboard/reports/erp-gross-profit', 'view_reports'),
    go('R E', 'Reports', 'Expiry Report', '/dashboard/reports/expiry-report', 'view_reports'),
    go('R V', 'Reports', 'Stock Valuation', '/dashboard/reports/stock-valuation', 'view_reports'),
    go('R H', 'Reports', 'Schedule Drugs', '/dashboard/reports/schedule-drugs', 'view_reports'),

    // Team
    go('T T', 'Staff & Attendance', 'Staff Members', '/dashboard/staff', 'manage_staff'),
    go('T A', 'Staff & Attendance', 'Attendance', '/dashboard/attendance', 'view_outlet'),
    go('T M', 'Staff & Attendance', 'Mark Attendance', '/dashboard/attendance/mark', 'view_outlet'),

    // Settings (the settings page reads ?tab=)
    go('O O', 'Settings', 'Outlet Profile', '/dashboard/settings?tab=outlet', 'manage_settings'),
    go('O G', 'Settings', 'GST & Tax', '/dashboard/settings?tab=gst', 'manage_settings'),
    go('O P', 'Settings', 'Printing', '/dashboard/settings?tab=printer', 'manage_settings'),
    go('O B', 'Settings', 'Billing', '/dashboard/settings?tab=billing', 'manage_settings'),
    go('O R', 'Settings', 'Billing & Pricing', '/dashboard/settings?tab=pricing', 'manage_settings'),
    go('O U', 'Settings', 'Purchase Orders', '/dashboard/settings?tab=purchasing', 'manage_settings'),
    go('O A', 'Settings', 'Attendance Settings', '/dashboard/settings?tab=attendance', 'manage_settings'),
    go('O N', 'Settings', 'Notifications', '/dashboard/settings?tab=notifications', 'manage_settings'),
    go('O F', 'Settings', 'Preferences', '/dashboard/settings?tab=preferences', 'manage_settings'),
    go('O D', 'Settings', 'Data Management', '/dashboard/settings?tab=data', 'manage_settings'),

    // Administration
    go('H', 'Administration', 'Chain Dashboard', '/dashboard/chain', null, { superAdminOnly: true }),
    go('L', 'Administration', 'Audit Logs', '/admin/audit', null, { superAdminOnly: true }),
];

// ─── GO LEADER: "New / Create" (Alt+G, N, …) — contextual ones only exist on their page ─
// Only modals that can be opened from anywhere belong here (GlobalModalManager supplies their props).
// Deliberately NOT shortcut-enabled: Stock Adjustment (needs a chosen batch), Bill Adjustment (a step
// inside the voucher flow) and Add Outlet (self-contained dialog on the chain page) — each needs context
// only its own page has, so use the buttons on those pages.

const CREATE_SHORTCUTS: ShortcutDef[] = [
    create('L', 'Create Ledger', 'MODAL_CREATE_LEDGER', 'global', 'view_accounts'),
    create('D', 'Add Doctor', 'MODAL_CREATE_DOCTOR', 'billing', 'create_bills'),
    create('R', 'Send Bulk Reminders', 'MODAL_BULK_REMINDER', 'credit', 'create_bills'),
    create('S', 'Add Staff Member', 'MODAL_STAFF_FORM', 'staff', 'manage_staff'),
    create('A', 'Mark Manual Attendance', 'MODAL_MANUAL_ATTENDANCE', 'attendance', 'manage_staff'),
];

// ─── General ─────────────────────────────────────────────────────────────────

const GENERAL_SHORTCUTS: ShortcutDef[] = [
    {
        id: 'help.open',
        keys: HELP_KEYS,
        label: 'Show / hide keyboard shortcuts',
        group: 'General',
        scope: 'global',
        action: { type: 'command', command: 'help' },
    },
];

// ─── BILLING (multi-bill terminal) — direct chords, work while typing ───────

const bill = (
    id: string,
    keys: string,
    label: string,
    command: string,
): ShortcutDef => ({
    id: `billing.${id}`,
    keys: [keys],
    label,
    group: 'Billing',
    scope: 'billing',
    action: { type: 'command', command },
    permission: 'create_bills',
});

const BILL_JUMPS: ShortcutDef[] = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1; // bills are numbered 1..10 (the store allows at most 10 open bills)
    const digit = n === 10 ? '0' : String(n);
    return {
        id: `billing.jump.${n}`,
        keys: [`Alt+Shift+${digit}`],
        label: `Switch to Bill ${n}`,
        group: 'Billing — multiple bills',
        scope: 'billing' as const,
        action: { type: 'command' as const, command: `billing.jump:${n}` },
        permission: 'create_bills' as Permission,
    };
});

const BILLING_SHORTCUTS: ShortcutDef[] = [
    // multiple bills
    { ...bill('new', 'Alt+N', 'New Bill', 'billing.new'), group: 'Billing — multiple bills' },
    { ...bill('close', 'Alt+W', 'Close Current Bill', 'billing.close'), group: 'Billing — multiple bills' },
    { ...bill('next', 'Alt+]', 'Next Bill', 'billing.next'), group: 'Billing — multiple bills' },
    { ...bill('prev', 'Alt+[', 'Previous Bill', 'billing.prev'), group: 'Billing — multiple bills' },
    ...BILL_JUMPS,
    // quick focus
    bill('focus.medicine', 'Alt+M', 'Focus Medicine Search', 'billing.focusMedicine'),
    bill('focus.customer', 'Alt+P', 'Focus Customer Search', 'billing.focusCustomer'),
    bill('lock', 'Alt+L', 'Lock Terminal / Switch Cashier', 'billing.lock'),
    // customer on the bill
    bill('counter', 'Alt+C', 'Counter Bill (no customer, cash sale)', 'billing.counterBill'),
    // handled by the billing screen itself
    local('billing.checkout', ['Ctrl+Enter'], 'Collect Payment / Save Bill', 'Billing', 'billing',
        'components/billing/RightBillingRail.tsx (useMagicSubmit)'),
    local('billing.margin', ['Ctrl+M'], 'Show / Hide Margin Info', 'Billing', 'billing',
        'app/billing/page.tsx', { overridesBrowser: 'Firefox: mute/unmute tab (only when not typing)' }),
];

// ─── PURCHASES ──────────────────────────────────────────────────────────────

const PURCHASE_SHORTCUTS: ShortcutDef[] = [
    {
        id: 'purchases.saveDraft',
        keys: ['Ctrl+S'],
        label: 'Save Purchase Draft',
        group: 'Purchases',
        scope: 'purchases',
        action: { type: 'event' },
        permission: 'create_purchases',
        overridesBrowser: 'Save page as… (suppressed on the purchase screen)',
    },
    local('purchases.submit', ['Ctrl+Enter'], 'Submit Purchase Invoice', 'Purchases', 'purchases',
        'components/purchases/NewPurchaseForm.tsx (useMagicSubmit)'),
];

// ─── ACCOUNTS / VOUCHERS (already implemented inside the voucher form) ──────

const ACCOUNTS_SHORTCUTS: ShortcutDef[] = [
    local('voucher.contra', ['F4'], 'Voucher type: Contra', 'Vouchers', 'voucher-entry',
        'components/accounts/VoucherForm.tsx'),
    local('voucher.payment', ['F5'], 'Voucher type: Payment', 'Vouchers', 'voucher-entry',
        'components/accounts/VoucherForm.tsx',
        { overridesBrowser: 'F5 reloads the page (suppressed on the voucher form when not typing)' }),
    local('voucher.receipt', ['F6'], 'Voucher type: Receipt', 'Vouchers', 'voucher-entry',
        'components/accounts/VoucherForm.tsx',
        { overridesBrowser: 'F6 moves focus to the address bar (suppressed on the voucher form when not typing)' }),
    local('voucher.journal', ['F7'], 'Voucher type: Journal', 'Vouchers', 'voucher-entry',
        'components/accounts/VoucherForm.tsx',
        { overridesBrowser: 'F7 toggles caret browsing (suppressed on the voucher form when not typing)' }),
    local('voucher.save', ['Ctrl+S'], 'Save Voucher', 'Vouchers', 'voucher-entry',
        'components/accounts/VoucherForm.tsx',
        { overridesBrowser: 'Save page as… (suppressed on the voucher form when not typing)' }),
    local('ledgerpicker.create', ['Alt+C'], 'Create new ledger (while the ledger search box is open)', 'Accounts', 'accounts',
        'components/accounts/LedgerPicker.tsx'),
];

export const SHORTCUTS: ShortcutDef[] = [
    ...GENERAL_SHORTCUTS,
    ...GO_SHORTCUTS,
    ...CREATE_SHORTCUTS,
    ...BILLING_SHORTCUTS,
    ...PURCHASE_SHORTCUTS,
    ...ACCOUNTS_SHORTCUTS,
];

// ─── Browser / OS keys we must not collide with ─────────────────────────────

export interface ReservedKey {
    combo: string;
    /**
     * hard: the browser keeps it even if the page calls preventDefault() — never use.
     * soft: a page can intercept it, but doing so breaks something users rely on — use only with
     *       an explicit `overridesBrowser` note on the shortcut.
     */
    severity: 'hard' | 'soft';
    why: string;
}

const hard = (combo: string, why: string): ReservedKey => ({ combo, severity: 'hard', why });
const soft = (combo: string, why: string): ReservedKey => ({ combo, severity: 'soft', why });

export const BROWSER_RESERVED: ReservedKey[] = [
    // cannot be intercepted by web pages
    hard('Ctrl+N', 'new window'),
    hard('Ctrl+T', 'new tab'),
    hard('Ctrl+W', 'close tab'),
    hard('Ctrl+Shift+N', 'new incognito / private window'),
    hard('Ctrl+Shift+T', 'reopen closed tab'),
    hard('Ctrl+Shift+W', 'close window'),
    hard('Ctrl+Tab', 'next tab'),
    hard('Ctrl+Shift+Tab', 'previous tab'),
    hard('Ctrl+PageUp', 'previous tab'),
    hard('Ctrl+PageDown', 'next tab'),
    hard('Ctrl+Q', 'quit browser (Linux / Firefox)'),
    hard('Ctrl+Shift+Q', 'quit browser (Firefox)'),
    hard('Ctrl+Shift+Delete', 'clear browsing data'),
    hard('Alt+F4', 'close window (Windows)'),
    hard('Alt+Tab', 'OS window switcher'),
    // interceptable but would hijack native behaviour
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => soft(`Ctrl+${d}`, 'switch tab / reset zoom')),
    ...['L', 'K', 'E', 'D', 'F', 'G', 'H', 'J', 'O', 'P', 'R', 'U', 'S', 'M', 'B', 'I'].map((c) =>
        soft(`Ctrl+${c}`, 'browser command (address bar, find, history, print, save, mute, …)')),
    ...['A', 'C', 'V', 'X', 'Z', 'Y'].map((c) => soft(`Ctrl+${c}`, 'text editing (select / copy / paste / cut / undo / redo)')),
    ...['R', 'I', 'J', 'C', 'B', 'O', 'A', 'M', 'P', 'D'].map((c) => soft(`Ctrl+Shift+${c}`, 'hard reload / devtools / bookmarks / profile / private window')),
    soft('Ctrl+Space', 'input-method switch (Windows / Linux IME)'),
    soft('F1', 'browser help'),
    soft('F3', 'find next'),
    soft('F5', 'reload'),
    soft('F6', 'focus address bar'),
    soft('F7', 'caret browsing'),
    soft('F10', 'menu bar'),
    soft('F11', 'full screen'),
    soft('F12', 'developer tools'),
    soft('Alt+Left', 'history back'),
    soft('Alt+Right', 'history forward'),
    soft('Alt+Home', 'browser home page'),
    soft('Alt+Space', 'window menu (Windows)'),
    // Alt+letter keys that open browser menus (Chrome/Edge: D address bar, E/F app menu; Firefox menu bar: F E V S B T H)
    ...['D', 'E', 'F', 'H', 'S', 'T', 'V', 'B'].map((c) => soft(`Alt+${c}`, 'opens a browser menu or the address bar')),
];
