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
};

export type NavItem = {
    label: string;
    href: string;
    icon: any;
    permission: Permission | null;
    shortcut?: string;
    sequence?: string;
    badge?: string;
    subItems?: SubNavItem[];
};

export const NAV_ITEMS: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        permission: null,
        shortcut: 'Alt+1',
        sequence: 'g d',
    },
    {
        label: 'Billing',
        href: '/billing',
        icon: Receipt,
        permission: 'create_bills' as Permission,
        shortcut: 'Alt+2',
        sequence: 'g b',
    },
    {
        label: 'Sales',
        href: '/dashboard/sales',
        icon: ClipboardList,
        permission: 'create_bills' as Permission,
        shortcut: 'Alt+3',
        sequence: 'g s',
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
        shortcut: 'Alt+4',
        sequence: 'g i',
        subItems: [
            { label: 'Stock List', href: '/dashboard/inventory', icon: List },
            { label: 'Stock Ledger', href: '/dashboard/stockledger', icon: ClipboardList },
        ],
    },
    {
        label: 'Purchases',
        href: '/dashboard/purchases',
        icon: ShoppingCart,
        permission: 'create_purchases' as Permission,
        shortcut: 'Alt+5',
        sequence: 'g p',
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
        shortcut: 'Alt+6',
        sequence: 'g c',
    },
    {
        label: 'Credit / Udhari',
        href: '/dashboard/credit',
        icon: CreditCard,
        permission: 'view_outlet' as Permission,
        badge: 'overdueCreditCount',
        shortcut: 'Alt+7',
        sequence: 'g u',
    },
    {
        label: 'Staff',
        href: '/dashboard/staff',
        icon: UserCog,
        permission: 'manage_staff' as Permission,
    },
    // Attendance — Phase 2, hidden from nav
    // {
    //     label: 'Attendance',
    //     href: '/dashboard/attendance',
    //     icon: CalendarCheck,
    //     permission: 'view_outlet' as Permission,
    // },
    {
        label: 'Accounts',
        href: '/dashboard/accounts',
        icon: Wallet,
        permission: 'create_purchases' as Permission,
        shortcut: 'Alt+8',
        sequence: 'g a',
        subItems: [
            { label: 'Accounts Dashboard', href: '/dashboard/accounts', icon: LayoutDashboard },
            { label: 'Voucher Entry', href: '/dashboard/accounts/voucher-entry', icon: BookOpen },
            { label: 'Ledgers', href: '/dashboard/accounts/ledgers', icon: List },
        ],
    },
    {
        label: 'Reports',
        href: '/dashboard/reports',
        icon: BarChart3,
        permission: 'view_reports' as Permission,
        shortcut: 'Alt+9',
        sequence: 'g r',
        subItems: [
            { label: 'Reports Dashboard', href: '/dashboard/reports', icon: LayoutDashboard },
            { label: 'Trial Balance', href: '/dashboard/reports/trial-balance', icon: Scale },
            { label: 'Balance Sheet', href: '/dashboard/reports/balance-sheet', icon: PieChart },
            { label: 'Profit & Loss', href: '/dashboard/reports/profit-loss', icon: TrendingUp },
            { label: 'GSTR-2A Recon', href: '/dashboard/reports/gstr2a', icon: FileSearch },
        ],
    },
    {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: Settings,
        permission: 'manage_settings' as Permission,
        shortcut: 'Alt+0',
        sequence: 'g t',
    },
] as const;
