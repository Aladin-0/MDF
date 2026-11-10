/**
 * Staff permission form: the logic, kept out of the component so it can be tested.
 *
 * KEY RULES (each one is a bug the form used to have):
 *  1. `role` is a REAL backend role and is only ever changed by the person picking it. It is never
 *     derived from the toggles. (The form used to set role='custom' whenever the toggles differed
 *     from a preset, which is not a role, and to flip to 'admin' whenever they happened to match
 *     the admin preset, which silently granted full admin rights.)
 *  2. "Custom" is only a LABEL meaning "differs from this role's defaults".
 *  3. An edit sends only the fields the admin actually changed. The form used to send every
 *     permission on every save, rewriting hidden flags nobody had touched.
 */

export const ASSIGNABLE_ROLES = ['admin', 'manager', 'billing_staff', 'view_only'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    billing_staff: 'Billing Staff',
    view_only: 'View Only',
};

// The switches shown in the form. Several stand for more than one backend flag (see FLAG_FANOUT).
export const UI_FLAGS = [
    'canEditSales', 'canModifyPaidBill', 'canModifyDraftUnpaidBill', 'canCorrectHeaderFields', 'canCorrectQuantities',
    'canOverridePricing', 'canCorrectCustomer',
    'canCreatePurchases', 'canViewPurchaseRates', 'canEditPurchases', 'canModifyPaidPurchases',
    'canEditVouchers', 'canModifySettledVouchers', 'canEditReturns', 'canModifySettledReturns',
    'canAccessReports', 'canVoidRecords', 'canViewAuditHistory', 'canExportGst', 'canManagePartners',
] as const;
export type UiFlag = (typeof UI_FLAGS)[number];
export type FlagValues = Record<UiFlag, boolean>;

const flags = (on: Partial<Record<UiFlag, boolean>>): FlagValues =>
    Object.fromEntries(UI_FLAGS.map((k) => [k, !!on[k]])) as FlagValues;

/** Default permissions for each role. (Admin/super_admin bypass the flags on the server anyway.) */
export const PRESETS: Record<AssignableRole, FlagValues> = {
    admin: flags(Object.fromEntries(UI_FLAGS.map((k) => [k, true])) as any),
    manager: flags({
        canEditSales: true, canModifyPaidBill: true, canModifyDraftUnpaidBill: true, canCorrectHeaderFields: true,
        canCorrectQuantities: true, canOverridePricing: true, canCorrectCustomer: true,
        canCreatePurchases: true, canViewPurchaseRates: true, canEditPurchases: true, canModifyPaidPurchases: true,
        canEditVouchers: true, canModifySettledVouchers: true, canEditReturns: true, canModifySettledReturns: true,
        canAccessReports: true, canViewAuditHistory: true, canExportGst: true,
    }),
    billing_staff: flags({ canEditSales: true, canModifyDraftUnpaidBill: true }),
    view_only: flags({ canAccessReports: true }),
};

/** A master switch and the sub-permissions that only make sense under it. */
export const MASTERS: Record<string, UiFlag[]> = {
    canEditSales: ['canModifyDraftUnpaidBill', 'canModifyPaidBill', 'canCorrectHeaderFields', 'canCorrectQuantities'],
    canEditPurchases: ['canModifyPaidPurchases'],
    canEditVouchers: ['canModifySettledVouchers'],
    canEditReturns: ['canModifySettledReturns'],
};

/** Which backend flags each switch controls. */
export const FLAG_FANOUT: Partial<Record<UiFlag, string[]>> = {
    canEditSales: ['canEditSales', 'canModifyBillWithReturn'],
    canOverridePricing: ['canEditRate', 'canCorrectRatesDiscounts'],
    canModifyDraftUnpaidBill: ['canModifyDraftBill', 'canModifyUnpaidBill'],
    canEditReturns: ['canEditSaleReturns', 'canEditPurchaseReturns'],
    canViewAuditHistory: ['canViewAuditHistory', 'canViewBillRevisionHistory'],
    canVoidRecords: ['canVoidRecords', 'canCancelAndReissueBill'],
};

/** Backend flags that feed each switch when a staff member is loaded (a switch is ON if ANY of them is). */
const FLAG_SOURCES: Partial<Record<UiFlag, string[]>> = {
    canModifyDraftUnpaidBill: ['canModifyDraftBill', 'canModifyUnpaidBill'],
    canOverridePricing: ['canEditRate', 'canCorrectRatesDiscounts'],
    canEditReturns: ['canEditSaleReturns', 'canEditPurchaseReturns'],
};

/**
 * Legacy / unknown role strings ('custom', 'cashier', anything else) are shown as billing_staff, the
 * lowest billing tier (the server treats 'custom' and 'cashier' the same way), so that saving
 * the form repairs the row. super_admin is kept: it can be shown but never assigned here.
 */
export function normalizeRole(role: unknown): AssignableRole | 'super_admin' {
    if (role === 'super_admin') return 'super_admin';
    return (ASSIGNABLE_ROLES as readonly string[]).includes(role as string) ? (role as AssignableRole) : 'billing_staff';
}

export function presetFor(role: unknown): FlagValues | null {
    const r = normalizeRole(role);
    return r === 'super_admin' ? null : PRESETS[r];
}

/** True when the switches are exactly this role's defaults (always true for super_admin: no presets). */
export function matchesPreset(role: unknown, values: Partial<FlagValues>): boolean {
    const preset = presetFor(role);
    if (!preset) return true;
    return UI_FLAGS.every((k) => !!values[k] === preset[k]);
}

/** The switches that differ from the role's defaults (for the "Customised" hint). */
export function customisedFlags(role: unknown, values: Partial<FlagValues>): UiFlag[] {
    const preset = presetFor(role);
    if (!preset) return [];
    return UI_FLAGS.filter((k) => !!values[k] !== preset[k]);
}

export interface StaffFormValues extends FlagValues {
    name: string;
    role: string;
    phone: string;
    email: string;
    password: string;
    confirmPassword: string;
    pin: string;
    confirmPin: string;
    shiftStartTime: string;
    shiftEndTime: string;
    weeklyOffDay: number | null;
    maxDiscount: number;
}

export function defaultFormValues(): StaffFormValues {
    return {
        name: '', role: 'billing_staff', phone: '', email: '',
        password: '', confirmPassword: '', pin: '', confirmPin: '',
        shiftStartTime: '', shiftEndTime: '', weeklyOffDay: null, maxDiscount: 0,
        ...PRESETS.billing_staff,
    };
}

/** Form values for an existing staff member (as returned by GET /staff/). */
export function staffToFormValues(staff: any): StaffFormValues {
    const anyOf = (keys: string[]) => keys.some((k) => !!staff?.[k]);
    const values: any = {
        ...defaultFormValues(),
        name: staff?.name ?? '',
        role: normalizeRole(staff?.role),
        phone: staff?.phone ?? '',
        email: staff?.email ?? '',
        shiftStartTime: staff?.shiftStartTime ?? '',
        shiftEndTime: staff?.shiftEndTime ?? '',
        weeklyOffDay: staff?.weeklyOffDay ?? null,
        maxDiscount: Number(staff?.maxDiscount ?? 0) || 0,
    };
    for (const k of UI_FLAGS) {
        values[k] = FLAG_SOURCES[k] ? anyOf(FLAG_SOURCES[k]!) : !!staff?.[k];
    }
    return values as StaffFormValues;
}

const numberOr0 = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

/**
 * The request body.
 *  - create: everything.
 *  - edit:   ONLY the fields in `dirty` (react-hook-form's dirtyFields), so saving a name change
 *            cannot rewrite permissions nobody touched. Password / PIN only when typed.
 * `role` is only ever one of the real roles; anything else is dropped.
 */
export function buildStaffPayload(
    values: Partial<StaffFormValues>,
    opts: { isEdit: boolean; dirty?: Record<string, any> },
): Record<string, any> {
    const { isEdit } = opts;
    const dirty = opts.dirty ?? {};
    const send = (key: string) => !isEdit || !!dirty[key];
    const out: Record<string, any> = {};

    if (send('name')) out.name = values.name;
    if (send('email')) out.email = values.email || null;
    if (!isEdit) out.phone = values.phone;                      // the phone is the login id: set once, at creation
    if (send('role') && (ASSIGNABLE_ROLES as readonly string[]).includes(values.role as string)) out.role = values.role;
    if (send('maxDiscount')) out.maxDiscount = numberOr0(values.maxDiscount);
    if (send('shiftStartTime')) out.shiftStartTime = values.shiftStartTime || '';
    if (send('shiftEndTime')) out.shiftEndTime = values.shiftEndTime || '';
    if (send('weeklyOffDay')) out.weeklyOffDay = values.weeklyOffDay ?? null;
    if (values.password) out.password = values.password;
    if (values.pin) out.pin = values.pin;

    for (const k of UI_FLAGS) {
        if (!send(k)) continue;
        for (const backendKey of FLAG_FANOUT[k] ?? [k]) out[backendKey] = !!values[k];
    }
    return out;
}
