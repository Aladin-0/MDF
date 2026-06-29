'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { NAV_ITEMS, NavItem } from '@/lib/navConfig';
import { cn } from '@/lib/utils';
import { Pill, Menu, Bell, Settings, Building2 } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from '@/components/shared/Sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { OutletSwitcher } from '@/components/shared/OutletSwitcher';
import { shortcutRegistry } from '@/lib/shortcuts';

export function GlobalNavigation() {
    const pathname = usePathname();
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const { user, logout } = useAuthStore();
    const navRef = useRef<HTMLDivElement>(null);

    // Filter items based on permissions
    const accessibleNavItems = NAV_ITEMS.filter(item => !item.permission || hasPermission(item.permission));

    // For Super Admin chain link
    const hasChainLink = user?.role === 'super_admin';
    const totalTopItems = accessibleNavItems.length + (hasChainLink ? 1 : 0);

    // Active state logic
    const activeItemIndex = accessibleNavItems.findIndex(item => 
        pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
    );
    const isChainActive = hasChainLink && (pathname === '/dashboard/chain' || pathname.startsWith('/dashboard/chain/'));
    const initialFocusedTopIndex = isChainActive ? 0 : (activeItemIndex !== -1 ? activeItemIndex + (hasChainLink ? 1 : 0) : 0);

    // Keyboard navigation state
    const [focusedTopIndex, setFocusedTopIndex] = useState<number>(initialFocusedTopIndex);
    const [focusedChildIndex, setFocusedChildIndex] = useState<number>(-1);
    const [openMenuIndex, setOpenMenuIndex] = useState<number>(-1);
    
    // Refs for focusing DOM elements
    const topItemRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);
    const childItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

    // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(e.target as Node)) {
                setOpenMenuIndex(-1);
                setFocusedChildIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close menu on route change
    useEffect(() => {
        setOpenMenuIndex(-1);
        setFocusedChildIndex(-1);
    }, [pathname]);

    // Keep focus in sync with state
    useEffect(() => {
        if (openMenuIndex === -1 && focusedTopIndex >= 0 && topItemRefs.current[focusedTopIndex]) {
            topItemRefs.current[focusedTopIndex]?.focus();
        } else if (openMenuIndex !== -1 && focusedChildIndex >= 0 && childItemRefs.current[focusedChildIndex]) {
            childItemRefs.current[focusedChildIndex]?.focus();
        }
    }, [focusedTopIndex, focusedChildIndex, openMenuIndex]);

    // Register Alt+` to focus main nav
    useEffect(() => {
        const id = 'focus-main-nav';
        shortcutRegistry.register({
            id,
            combo: 'Alt+`',
            scope: 'global',
            description: 'Focus Main Navigation',
            handler: () => {
                setFocusedTopIndex(initialFocusedTopIndex);
                setOpenMenuIndex(-1);
                setFocusedChildIndex(-1);
                if (topItemRefs.current[initialFocusedTopIndex]) {
                    topItemRefs.current[initialFocusedTopIndex]?.focus();
                }
            }
        });
        return () => shortcutRegistry.unregister(id);
    }, [initialFocusedTopIndex]);

    // Handle logout
    const handleLogoutAction = async () => {
        const { handleLogout } = await import('@/lib/auth');
        await handleLogout();
    };

    const getInitials = (name?: string) => {
        if (!name) return 'U';
        return name.substring(0, 2).toUpperCase();
    };

    // Global Keydown handler for the entire menubar
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
            // Let the browser handle Tab naturally to exit the menu
            setOpenMenuIndex(-1);
            setFocusedChildIndex(-1);
            setFocusedTopIndex(initialFocusedTopIndex);
            return;
        }

        const isMenuOpen = openMenuIndex !== -1;
        const currentTopItem = hasChainLink && focusedTopIndex === 0 ? null : accessibleNavItems[focusedTopIndex - (hasChainLink ? 1 : 0)];

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                setOpenMenuIndex(-1);
                setFocusedChildIndex(-1);
                setFocusedTopIndex((prev) => (prev + 1) % totalTopItems);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                setOpenMenuIndex(-1);
                setFocusedChildIndex(-1);
                setFocusedTopIndex((prev) => (prev - 1 + totalTopItems) % totalTopItems);
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (isMenuOpen && currentTopItem?.subItems) {
                    if (focusedChildIndex < currentTopItem.subItems.length - 1) {
                        setFocusedChildIndex(focusedChildIndex + 1);
                    }
                } else if (!isMenuOpen && currentTopItem?.subItems?.length) {
                    setOpenMenuIndex(focusedTopIndex);
                    setFocusedChildIndex(0);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (isMenuOpen) {
                    if (focusedChildIndex > 0) {
                        setFocusedChildIndex(focusedChildIndex - 1);
                    } else {
                        // Return to parent
                        setOpenMenuIndex(-1);
                        setFocusedChildIndex(-1);
                    }
                }
                break;
            case 'Escape':
                e.preventDefault();
                if (isMenuOpen) {
                    setOpenMenuIndex(-1);
                    setFocusedChildIndex(-1);
                    topItemRefs.current[focusedTopIndex]?.focus();
                }
                break;
            case 'Home':
                e.preventDefault();
                if (isMenuOpen) {
                    setFocusedChildIndex(0);
                } else {
                    setFocusedTopIndex(0);
                }
                break;
            case 'End':
                e.preventDefault();
                if (isMenuOpen && currentTopItem?.subItems) {
                    setFocusedChildIndex(currentTopItem.subItems.length - 1);
                } else {
                    setFocusedTopIndex(totalTopItems - 1);
                }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (isMenuOpen && focusedChildIndex !== -1 && currentTopItem?.subItems) {
                    router.push(currentTopItem.subItems[focusedChildIndex].href);
                } else if (!isMenuOpen) {
                    if (hasChainLink && focusedTopIndex === 0) {
                        router.push('/dashboard/chain');
                    } else if (currentTopItem) {
                        if (currentTopItem.subItems?.length) {
                            setOpenMenuIndex(focusedTopIndex);
                            setFocusedChildIndex(0);
                        } else {
                            router.push(currentTopItem.href);
                        }
                    }
                }
                break;
        }
    };

    const handleParentClick = (index: number, e: React.MouseEvent) => {
        e.preventDefault();
        setFocusedTopIndex(index);
        if (openMenuIndex === index) {
            setOpenMenuIndex(-1);
            setFocusedChildIndex(-1);
        } else {
            setOpenMenuIndex(index);
            setFocusedChildIndex(-1);
        }
    };

    return (
        <div 
            className="w-full bg-white shadow-sm border-b border-slate-200 flex flex-col z-40 shrink-0"
            role="menubar" 
            aria-label="Main navigation"
            onKeyDown={handleKeyDown}
            ref={navRef}
        >
            {/* Top Row: Main Nav */}
            <div className="w-full h-12 flex items-center px-4 relative">
                {/* Mobile Hamburger Drawer */}
                <div className="lg:hidden mr-3">
                    <Sheet>
                        <SheetTrigger asChild>
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
                                <Menu className="w-5 h-5" />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 w-[240px] border-r-0">
                            <Sidebar isCollapsed={false} onToggle={() => {}} isMobile={true} />
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-2 mr-6 shrink-0 nav-item" tabIndex={-1}>
                    <Pill className="text-primary w-6 h-6" />
                    <span className="font-bold text-slate-900 tracking-tight text-lg">MediFlow</span>
                </Link>

                {/* Divider */}
                <div className="hidden lg:block w-px h-5 bg-slate-300 mr-2"></div>

                {/* Desktop Nav Items */}
                <div className="hidden lg:flex items-center h-full gap-1">
                    {hasChainLink && (
                        <Link
                            href="/dashboard/chain"
                            role="menuitem"
                            tabIndex={focusedTopIndex === 0 ? 0 : -1}
                            ref={(el) => { topItemRefs.current[0] = el; }}
                            className={cn(
                                "nav-item h-full flex items-center px-3 text-[13px] font-semibold transition-colors relative",
                                isChainActive
                                    ? "text-primary border-b-2 border-primary"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                            )}
                        >
                            <Building2 className="w-4 h-4 mr-1.5" />
                            Chain Dashboard
                        </Link>
                    )}

                    {accessibleNavItems.map((item, i) => {
                        const index = hasChainLink ? i + 1 : i;
                        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                        const hasPopup = !!(item.subItems && item.subItems.length > 0);
                        const isExpanded = openMenuIndex === index;
                        const isTabbable = focusedTopIndex === index && openMenuIndex === -1;
                        
                        const itemClasses = cn(
                            "nav-item h-full flex items-center px-3 text-[13px] font-semibold transition-colors relative border-b-2 outline-none",
                            isActive || isExpanded
                                ? "text-primary border-primary" 
                                : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-50"
                        );

                        if (hasPopup) {
                            return (
                                <div 
                                    key={item.href} 
                                    className="relative h-full"
                                    onMouseEnter={() => setOpenMenuIndex(index)}
                                    onMouseLeave={() => {
                                        setOpenMenuIndex(-1);
                                        setFocusedChildIndex(-1);
                                    }}
                                >
                                    <button
                                        role="menuitem"
                                        aria-haspopup="true"
                                        aria-expanded={isExpanded}
                                        tabIndex={isTabbable ? 0 : -1}
                                        onClick={(e) => handleParentClick(index, e)}
                                        ref={(el) => { topItemRefs.current[index] = el; }}
                                        className={itemClasses}
                                    >
                                        {item.label}
                                        {item.badge === 'overdueCreditCount' && (
                                            <span className="ml-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                                        )}
                                    </button>
                                    
                                    {/* Anchored Submenu Panel */}
                                    {isExpanded && (
                                        <div 
                                            className="absolute top-[calc(100%-2px)] left-0 min-w-[240px] bg-white border border-slate-200 shadow-md rounded-md py-1.5 z-50 overflow-hidden"
                                            role="menu"
                                            aria-label={`${item.label} submenu`}
                                        >
                                            {item.subItems!.map((subItem, j) => {
                                                const isChildActive = pathname === subItem.href || pathname.startsWith(subItem.href + '/');
                                                const Icon = subItem.icon;
                                                
                                                return (
                                                    <Link
                                                        key={subItem.href}
                                                        href={subItem.href}
                                                        role="menuitem"
                                                        tabIndex={focusedChildIndex === j ? 0 : -1}
                                                        ref={(el) => { childItemRefs.current[j] = el; }}
                                                        className={cn(
                                                            "nav-item flex items-center gap-3 px-4 py-2 text-[13px] font-medium transition-colors outline-none",
                                                            isChildActive 
                                                                ? "text-primary bg-primary/5" 
                                                                : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                                        )}
                                                        onClick={() => setOpenMenuIndex(-1)}
                                                    >
                                                        <Icon className={cn("w-4 h-4", isChildActive ? "text-primary" : "text-slate-400")} />
                                                        {subItem.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                role="menuitem"
                                tabIndex={isTabbable ? 0 : -1}
                                ref={(el) => { topItemRefs.current[index] = el; }}
                                className={itemClasses}
                            >
                                {item.label}
                                {item.badge === 'overdueCreditCount' && (
                                    <span className="ml-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                                )}
                            </Link>
                        );
                    })}
                </div>

                {/* Right Side Actions */}
                <div className="ml-auto flex items-center gap-2">
                    {/* Outlet Switcher for Super Admins */}
                    {user?.role === 'super_admin' && (
                        <div className="hidden md:block mr-2 w-48">
                            <OutletSwitcher isCollapsed={false} />
                        </div>
                    )}

                    {/* Notifications & Settings */}
                    <button className="hidden sm:flex items-center justify-center w-8 h-8 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors nav-item" tabIndex={-1}>
                        <Bell className="w-4 h-4" />
                    </button>
                    <Link href="/dashboard/settings" className="hidden sm:flex items-center justify-center w-8 h-8 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors mr-2 nav-item" tabIndex={-1}>
                        <Settings className="w-4 h-4" />
                    </Link>

                    {/* User Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="nav-item flex items-center gap-2 hover:bg-slate-50 p-1 rounded-md transition-colors border border-transparent hover:border-slate-200" tabIndex={-1}>
                                <Avatar className="w-7 h-7 rounded-md">
                                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs rounded-md">
                                        {getInitials(user?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="hidden md:flex flex-col items-start text-left">
                                    <span className="text-xs font-bold text-slate-900 leading-none">{user?.name || 'Staff User'}</span>
                                    <span className="text-[10px] font-medium text-slate-500 mt-0.5 leading-none uppercase tracking-wider">{user?.role?.replace('_', ' ') || 'Staff'}</span>
                                </div>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 z-50">
                            <div className="px-2 py-2 mb-1 border-b border-slate-100">
                                <p className="text-sm font-medium">{user?.name}</p>
                                <p className="text-xs text-slate-500 truncate">{user?.phone || 'No phone provided'}</p>
                            </div>
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/settings" className="cursor-pointer">Profile Settings</Link>
                            </DropdownMenuItem>
                            {user?.role === 'super_admin' && (
                                <DropdownMenuItem asChild className="md:hidden">
                                    <Link href="/dashboard/chain" className="cursor-pointer">Chain Dashboard</Link>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogoutAction} className="text-red-600 focus:bg-red-50 focus:text-red-600 cursor-pointer">
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
}
