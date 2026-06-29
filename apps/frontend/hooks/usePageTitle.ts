'use client';

import { usePathname } from 'next/navigation';

export function usePageTitle(): string {
    const pathname = usePathname();
    const titleMap: Record<string, string> = {
        '/dashboard': 'Dashboard',
        '/billing': 'Billing',
        '/dashboard/inventory': 'Inventory',
        '/dashboard/purchases': 'Purchases',
        '/dashboard/customers': 'Customers',
        '/dashboard/credit': 'Credit / Udhari',
        '/dashboard/staff': 'Staff Management',
        '/dashboard/attendance': 'Attendance',
        '/dashboard/reports': 'Reports',
        '/dashboard/settings': 'Settings',
    };
    return titleMap[pathname] ?? 'MediFlow';
}
