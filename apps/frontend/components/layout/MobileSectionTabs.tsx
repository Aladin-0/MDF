'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { activeNavItem, activeSubHref, visibleNavItems } from '@/lib/navConfig';
import { cn } from '@/lib/utils';

/**
 * Phone only: the pages of the group you are in (Sales: Invoices | Quotations | Sale Returns | Revision History) as a row of chips under
 * the top bar, so moving between sibling pages is one tap. The desktop bar does this with a pull-down; a phone has no hover, and going
 * Menu -> group -> Menu -> page for every switch is what made the old menu unusable. The row scrolls sideways by itself when a group is
 * long (Accounts has seven pages) and keeps the current page in view.
 * Shown only inside a group that has two or more pages; hidden from `lg` up, where the desktop bar is used.
 */
export function MobileSectionTabs() {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const rowRef = useRef<HTMLUListElement>(null);

    const group = activeNavItem(pathname, visibleNavItems(hasPermission));
    const subs = group?.subItems ?? [];
    const currentHref = activeSubHref(pathname, subs);

    // keep the current chip in view without moving the page itself up or down
    useEffect(() => {
        const row = rowRef.current;
        const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
        if (!row || !chip) return;
        row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
    }, [pathname, group?.href]);

    if (!group || subs.length < 2) return null;

    return (
        <nav aria-label={`${group.label} pages`} data-testid="section-tabs" className="shrink-0 border-b border-slate-200 bg-white lg:hidden">
            <ul ref={rowRef} className="no-scrollbar relative flex gap-1.5 overflow-x-auto overscroll-x-contain px-2 py-1.5">
                {subs.map((sub) => {
                    const active = sub.href === currentHref;
                    return (
                        <li key={sub.href} className="shrink-0">
                            <Link href={sub.href} aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex h-9 touch-manipulation items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40',
                                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-200',
                                )}>
                                {sub.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
