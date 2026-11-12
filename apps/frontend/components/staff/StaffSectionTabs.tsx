'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarCheck, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions, type Permission } from '@/hooks/usePermissions';

const SECTIONS: { href: string; label: string; icon: typeof UserCog; permission: Permission }[] = [
    { href: '/dashboard/staff', label: 'Staff List', icon: UserCog, permission: 'manage_staff' },
    { href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck, permission: 'view_outlet' },
];

/**
 * Switch between the pages of the Staff section (same entries as the Staff dropdown in the top bar), styled like the project's
 * tabs. Shown only to people who can open more than one of them, so a cashier who only has Attendance sees no switcher.
 */
export function StaffSectionTabs() {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const visible = SECTIONS.filter((s) => hasPermission(s.permission));
    if (visible.length < 2) return null;

    return (
        <nav aria-label="Staff section" className="flex w-full sm:inline-flex sm:w-auto h-10 items-center rounded-md bg-muted p-1 text-muted-foreground">
            {visible.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                    <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                        className={cn('inline-flex flex-1 sm:flex-none justify-center items-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
                            active ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground')}>
                        <Icon className="w-4 h-4" /> {label}
                    </Link>
                );
            })}
        </nav>
    );
}
