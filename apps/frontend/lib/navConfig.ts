import { Permission } from '@/hooks/usePermissions';
import {
    LayoutDashboard, Receipt, Package, ShoppingCart, Users,
    CreditCard, UserCog, CalendarCheck, BarChart3, Settings,
    Pill, ChevronLeft, ChevronRight, MoreVertical, Wallet, Building2,
    BookOpen, ArrowUpLeft, ArrowDownLeft, List, Scale, PieChart, FileSearch,
    ClipboardList, TrendingUp, History,
} from 'lucide-react';

export type SubNavItem = {
    label: string;
    href: string;
    icon: any;
    /** Who may see this entry. Leave out to inherit the parent's rule. Lets one tab group pages with different rights
     *  (e.g. Staff List is admin-only, Attendance is for everyone). */
    permission?: Permission | null;
};

export type NavItem = {
    label: string;
    href: string;
    icon: any;
    permission: Permission | null;
    badge?: string;
    subItems?: SubNavItem[];
};

export const NAV_ITEMS: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        permission: null,
    },
    {
        label: 'Billing',
        href: '/billing',
        icon: Receipt,
        permission: 'create_bills' as Permission,
    },
    {
        label: 'Sales',
        href: '/dashboard/sales',
        icon: ClipboardList,
        permission: 'create_bills' as Permission,
        subItems: [
            { label: 'Invoices', href: '/dashboard/sales', icon: List },
            { label: 'Quotations', href: '/dashboard/sales/quotations', icon: FileSearch },
            { label: 'Sale Returns', href: '/dashboard/accounts/sale-returns', icon: ArrowDownLeft },
            { label: 'Revision History', href: '/dashboard/sales/revisions', icon: History },
        ],
    },
    {
        label: 'Inventory',
        href: '/dashboard/inventory',
        icon: Package,
        permission: 'view_outlet' as Permission,
        subItems: [
            { label: 'Stock List', href: '/dashboard/inventory', icon: List },
            { label: 'Stock Ledger', href: '/dashboard/stockledger', icon: ClipboardList },
        ],
    },
    {
        label: 'Purchases',
        href: '/dashboard/purchases',
        icon: ShoppingCart,
        permission: 'view_purchases' as Permission,
        subItems: [
            { label: 'Purchases Dashboard', href: '/dashboard/purchases', icon: LayoutDashboard },
            { label: 'Purchase Returns', href: '/dashboard/accounts/purchase-returns', icon: ArrowUpLeft },
        ],
    },
    {
        label: 'Customers',
        href: '/dashboard/customers',
        icon: Users,
        permission: 'view_outlet' as Permission,
    },
    {
        label: 'Credit',
        href: '/dashboard/credit',
        icon: CreditCard,
        permission: 'view_outlet' as Permission,
    },
    {
        // Staff and Attendance used to be two top tabs. One group now, like Sales / Purchases / Accounts.
        label: 'Staff',
        href: '/dashboard/staff',
        icon: UserCog,
        permission: null,
        subItems: [
            { label: 'Staff List', href: '/dashboard/staff', icon: Users, permission: 'manage_staff' as Permission },
            { label: 'Attendance', href: '/dashboard/attendance', icon: CalendarCheck, permission: 'view_outlet' as Permission },
        ],
    },
    {
        label: 'Accounts',
        href: '/dashboard/accounts/vouchers',
        icon: Wallet,
        permission: 'view_accounts' as Permission,
        subItems: [
            { label: 'Accounts Dashboard', href: '/dashboard/accounts/overview', icon: LayoutDashboard },
            { label: 'New Voucher', href: '/dashboard/accounts/voucher-entry', icon: BookOpen },
            { label: 'All Vouchers', href: '/dashboard/accounts/vouchers', icon: List },
            { label: 'Ledgers', href: '/dashboard/accounts/ledgers', icon: List },
            { label: 'Trial Balance', href: '/dashboard/reports/trial-balance', icon: Scale },
            { label: 'Balance Sheet', href: '/dashboard/reports/balance-sheet', icon: PieChart },
            { label: 'Profit & Loss', href: '/dashboard/reports/profit-loss', icon: TrendingUp },
        ],
    },
    {
        label: 'GST',
        href: '/gst',
        icon: Scale,
        permission: 'view_reports' as Permission,
    },
    {
        label: 'Reports',
        href: '/dashboard/reports',
        icon: BarChart3,
        permission: 'view_reports' as Permission,
        subItems: [
            { label: 'Reports Dashboard', href: '/dashboard/reports', icon: LayoutDashboard },
            { label: 'Daily Report', href: '/dashboard/reports/daily', icon: ClipboardList },
        ],
    },
    {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: Settings,
        permission: 'manage_settings' as Permission,
    },
] as const;

type Has = (permission: Permission) => boolean;

/**
 * The navigation a given user should see, from one place (the top bar and the sidebar both use it).
 *  - an entry the user may not open is dropped, sub-items included;
 *  - a group left with no entries disappears;
 *  - a group left with a single entry becomes a plain link to it, named after that entry. A cashier therefore still sees a plain
 *    "Attendance" tab, not a "Staff" dropdown holding one thing.
 */
export function visibleNavItems(has: Has): NavItem[] {
    const out: NavItem[] = [];
    for (const item of NAV_ITEMS) {
        if (item.permission && !has(item.permission)) continue;
        if (!item.subItems) { out.push(item); continue; }

        const gated = item.subItems.some((s) => s.permission);
        const subs = item.subItems.filter((s) => !s.permission || has(s.permission));
        if (subs.length === 0) continue;
        if (gated && subs.length === 1 && item.subItems.length > 1) {
            const only = subs[0];
            out.push({ label: only.label, href: only.href, icon: only.icon, permission: null });
            continue;
        }
        out.push({ ...item, subItems: subs });
    }
    return out;
}

/**
 * Which sub-item is the current page: the MOST specific match. (`/dashboard/sales/quotations` also starts with `/dashboard/sales`;
 * a plain prefix test highlighted both entries.)
 */
export function activeSubHref(pathname: string, subItems?: SubNavItem[]): string | null {
    let best: string | null = null;
    for (const sub of subItems ?? []) {
        const hit = pathname === sub.href || pathname.startsWith(sub.href + '/');
        if (hit && (best === null || sub.href.length > best.length)) best = sub.href;
    }
    return best;
}
