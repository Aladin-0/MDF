'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ChevronDown, LogOut, Pill, Search, X } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { activeNavItem, activeSubHref, searchNav, visibleNavItems } from '@/lib/navConfig';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { cn } from '@/lib/utils';
import type { StaffRole } from '@/types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const rowBase = 'flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40';
const idle = 'text-slate-700 active:bg-slate-100 hover:bg-slate-50';
const current = 'bg-primary text-primary-foreground font-semibold';

/**
 * The phone's menu (the drawer behind the hamburger, on every dashboard page and on the phone billing screen).
 *
 * The desktop bar puts one pull-down under each group. A phone has no hover, so here:
 *  - a group (Sales, Accounts ...) is an accordion: tapping it OPENS or CLOSES its pages and goes nowhere. Every page of every group is
 *    one tap away from ANY page (the old drawer listed a group's pages only after you had already landed in that group);
 *  - the group you are in starts open, one group is open at a time, so the list stays short;
 *  - "Find a page" jumps straight to a page by name ("trial" -> Trial Balance), for the long groups;
 *  - rows are 44px+, there are no keyboard-shortcut badges (nobody has Alt on a phone), and the user card + Log out stay pinned below.
 * The same pages and permissions as the desktop bar: both read lib/navConfig.ts `visibleNavItems`.
 *
 * `replaceHistory`: for a drawer that uses `useBackToClose` (Back closes it). That hook pushes a history entry while the drawer is open and
 * walks back over it when the drawer closes, so closing the drawer in the same moment a link navigates forward undid the navigation (the link
 * appeared to do nothing). With this on, a link REPLACES the drawer's entry and the drawer is left to disappear with the old page; it is closed
 * here only when the tapped page is the one already open.
 */
export function MobileNav({ onNavigate, replaceHistory = false }: { onNavigate: () => void; replaceHistory?: boolean }) {
    const pathname = usePathname();
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const user = useAuthStore((s) => s.user);

    const items = visibleNavItems(hasPermission);
    const here = activeNavItem(pathname, items);
    const hereSub = activeSubHref(pathname, here?.subItems);
    // the one page that is "you are here": a group's sub-page, or the plain entry itself
    const hereHref = here && !here.subItems?.length ? here.href : hereSub;

    // the drawer's content is created fresh each time it opens, so this starts on the group you are in
    const [openHref, setOpenHref] = useState<string | null>(here?.subItems?.length ? here.href : null);
    const [query, setQuery] = useState('');
    const matches = searchNav(items, query);
    const searching = query.trim().length > 0;

    // a link was followed: close the drawer now, unless a page change is about to remove it (see replaceHistory above)
    const followed = (href: string) => { if (!replaceHistory || href === pathname) onNavigate(); };

    const logout = async () => {
        const { handleLogout } = await import('@/lib/auth');
        await handleLogout();
    };
    const initials = (user?.name || 'U').substring(0, 2).toUpperCase();
    const isChain = pathname === '/dashboard/chain' || pathname.startsWith('/dashboard/chain/');

    return (
        // The menu sits inside the top bar's React tree, which listens for arrow / Enter / Space keys for the desktop pull-downs and
        // cancels them. Keep our keys to ourselves, or Space could not be typed in the search box and Enter would not follow a link.
        <div data-testid="mobile-nav" onKeyDown={(e) => e.stopPropagation()} className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 pl-4 pr-12">
                <Pill className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span className="truncate text-lg font-bold tracking-tight text-slate-900">MediFlow</span>
            </div>

            <div className="shrink-0 border-b border-slate-100 p-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && matches[0]) {
                                const href = matches[0].href;
                                if (replaceHistory && href !== pathname) router.replace(href); else if (!replaceHistory) router.push(href);
                                followed(href);
                            }
                        }}
                        placeholder="Find a page…"
                        aria-label="Find a page"
                        enterKeyHint="go"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        data-testid="nav-search"
                        className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-10 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query && (
                        <button type="button" aria-label="Clear search" onClick={() => setQuery('')}
                            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 active:bg-slate-200">
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            </div>

            <nav aria-label="Main menu" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-2">
                {searching ? (
                    matches.length === 0 ? (
                        <p data-testid="nav-no-match" className="px-3 py-6 text-center text-sm text-slate-500">No page matches “{query.trim()}”.</p>
                    ) : (
                        <ul data-testid="nav-results" className="space-y-0.5">
                            {matches.map((m) => {
                                const Icon = m.icon;
                                const active = m.href === hereHref;
                                return (
                                    <li key={m.href}>
                                        <Link href={m.href} replace={replaceHistory} onClick={() => followed(m.href)} aria-current={active ? 'page' : undefined}
                                            className={cn(rowBase, 'min-h-12 py-1.5', active ? current : idle)}>
                                            <Icon className="h-5 w-5 shrink-0" aria-hidden />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate">{m.label}</span>
                                                {m.group && <span className={cn('block truncate text-xs font-normal', active ? 'text-primary-foreground/80' : 'text-slate-500')}>{m.group}</span>}
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )
                ) : (
                    <>
                        {user?.role === 'super_admin' && (
                            <Link href="/dashboard/chain" replace={replaceHistory} onClick={() => followed('/dashboard/chain')} aria-current={isChain ? 'page' : undefined}
                                className={cn(rowBase, 'min-h-12', isChain ? current : idle)}>
                                <Building2 className="h-5 w-5 shrink-0" aria-hidden />
                                <span className="truncate">Chain Dashboard</span>
                            </Link>
                        )}

                        {items.map((item) => {
                            const Icon = item.icon;
                            const isHere = here?.href === item.href;

                            if (!item.subItems?.length) {
                                return (
                                    <Link key={item.href} href={item.href} replace={replaceHistory} onClick={() => followed(item.href)} aria-current={isHere ? 'page' : undefined}
                                        className={cn(rowBase, 'min-h-12', isHere ? current : idle)}>
                                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                                        <span className="truncate">{item.label}</span>
                                    </Link>
                                );
                            }

                            const open = openHref === item.href;
                            const listId = `mobile-nav-${slug(item.label)}`;
                            return (
                                <div key={item.href}>
                                    <button type="button" aria-expanded={open} aria-controls={listId}
                                        onClick={() => setOpenHref(open ? null : item.href)}
                                        className={cn(rowBase, 'min-h-12', isHere ? 'bg-primary/10 font-semibold text-primary' : idle)}>
                                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                                        <span className="flex-1 truncate">{item.label}</span>
                                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
                                    </button>
                                    {open && (
                                        <ul id={listId} className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l-2 border-slate-100 pl-2">
                                            {item.subItems.map((sub) => {
                                                const SubIcon = sub.icon;
                                                const active = isHere && sub.href === hereSub;
                                                return (
                                                    <li key={sub.href}>
                                                        <Link href={sub.href} replace={replaceHistory} onClick={() => followed(sub.href)} aria-current={active ? 'page' : undefined}
                                                            className={cn(rowBase, 'min-h-11 text-sm', active ? current : idle)}>
                                                            <SubIcon className="h-4 w-4 shrink-0" aria-hidden />
                                                            <span className="truncate">{sub.label}</span>
                                                        </Link>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}
            </nav>

            <div className="shrink-0 border-t border-slate-100 bg-slate-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0 border border-slate-200">
                        <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-slate-900">{user?.name || 'Staff user'}</p>
                        {user?.role && <div className="mt-0.5"><RoleBadge role={user.role as StaffRole} size="sm" /></div>}
                    </div>
                    <button type="button" onClick={logout} data-testid="nav-logout"
                        className="flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 active:bg-red-50">
                        <LogOut className="h-4 w-4" aria-hidden /> Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
