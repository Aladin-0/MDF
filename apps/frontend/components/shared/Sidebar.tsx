'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { RoleBadge } from './RoleBadge';
import { StaffRole } from '@/types';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NAV_ITEMS } from '@/lib/navConfig';
import { Building2, Pill, ChevronLeft, ChevronRight, MoreVertical, LogOut, User } from 'lucide-react';

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
    isMobile?: boolean;
}

// Helper to reliably check route matching without collision
const checkIsActive = (pathname: string, href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
};

export function Sidebar({ isCollapsed, onToggle, isMobile = false }: SidebarProps) {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const { user } = useAuthStore();

    const handleLogoutAction = async () => {
        const { handleLogout } = await import('@/lib/auth');
        await handleLogout();
    };

    const getInitials = (name?: string) => {
        if (!name) return 'U';
        return name.substring(0, 2).toUpperCase();
    };

    // Pre-calculate active routes for O(1) lookup during render
    const activeStates = useMemo(() => {
        const states: Record<string, { active: boolean; subActive: boolean }> = {};

        NAV_ITEMS.forEach(item => {
            const isSubActive = item.subItems?.some(sub => checkIsActive(pathname, sub.href)) ?? false;
            // Item is active if a sub-item is active, OR its exact path matches
            const isActive = isSubActive || checkIsActive(pathname, item.href);

            states[item.href] = { active: isActive, subActive: isSubActive };
        });
        return states;
    }, [pathname]);

    return (
        <div
            className={cn(
                'flex flex-col h-full bg-white border-r border-slate-200 transition-all duration-300 ease-in-out relative',
                isCollapsed ? 'w-16' : 'w-64'
            )}
        >
            {/* Top section: Logo */}
            <div className="h-16 flex items-center justify-center border-b border-slate-100 px-4">
                <div className="flex items-center gap-2 overflow-hidden w-full justify-center">
                    <Pill className={cn('text-primary transition-all duration-300', isCollapsed ? 'w-6 h-6' : 'w-7 h-7 shrink-0')} />
                    {!isCollapsed && (
                        <span className="font-bold text-xl text-slate-900 truncate tracking-tight animate-in fade-in duration-300">
                            MediFlow
                        </span>
                    )}
                </div>

                {/* Desktop Collapse Toggle */}
                {!isMobile && (
                    <button
                        onClick={onToggle}
                        className="absolute -right-3 top-12 bg-white border border-slate-200 rounded-full w-6 h-6 flex items-center justify-center shadow-sm cursor-pointer hover:bg-slate-50 hover:scale-110 transition-transform z-40 text-slate-500"
                        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                    </button>
                )}
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TooltipProvider delayDuration={isCollapsed ? 0 : 1000}>

                    {/* Super Admin: Chain Dashboard */}
                    {user?.role === 'super_admin' && (
                        <NavItem
                            href="/dashboard/chain"
                            icon={Building2}
                            label="Chain Dashboard"
                            isActive={checkIsActive(pathname, '/dashboard/chain')}
                            isCollapsed={isCollapsed}
                            isMobile={isMobile}
                            onToggle={onToggle}
                        />
                    )}

                    {/* Standard Navigation */}
                    {NAV_ITEMS.map((item) => {
                        if (item.permission && !hasPermission(item.permission)) return null;

                        const state = activeStates[item.href];
                        const Icon = item.icon;

                        return (
                            <div key={item.href} className="flex flex-col">
                                <NavItem
                                    href={item.href}
                                    icon={Icon}
                                    label={item.label}
                                    shortcut={item.shortcut}
                                    isActive={state.active}
                                    isCollapsed={isCollapsed}
                                    isMobile={isMobile}
                                    onToggle={onToggle}
                                />

                                {/* Sub Items */}
                                {item.subItems && state.active && !isCollapsed && (
                                    <div className="mt-1 ml-[22px] space-y-1 border-l-2 border-slate-100 pl-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                        {item.subItems.map((sub) => {
                                            const subActive = checkIsActive(pathname, sub.href);
                                            const SubIcon = sub.icon;
                                            return (
                                                <Link
                                                    key={sub.href}
                                                    href={sub.href}
                                                    onClick={isMobile ? onToggle : undefined}
                                                    className={cn(
                                                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-all',
                                                        subActive
                                                            ? 'bg-primary/10 text-primary font-semibold'
                                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                                    )}
                                                >
                                                    <SubIcon className={cn("w-3.5 h-3.5 shrink-0 transition-colors", subActive ? "text-primary" : "text-slate-400")} />
                                                    <span className="truncate">{sub.label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </TooltipProvider>
            </div>

            {/* Bottom section: User card */}
            <div className="border-t border-slate-100 p-3 bg-slate-50/50 mt-auto">
                {isCollapsed && !isMobile ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex justify-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Avatar className="w-9 h-9 cursor-pointer hover:ring-2 ring-primary/20 transition-all">
                                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                                    {getInitials(user?.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" side="right" className="w-48 ml-2">
                                            <DropdownMenuItem className="cursor-pointer font-medium">
                                                {user?.name}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={handleLogoutAction} className="text-red-600 cursor-pointer">
                                                <LogOut className="w-4 h-4 mr-2" /> Logout
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p className="font-medium">{user?.name}</p>
                                <p className="text-xs text-slate-500 capitalize">{user?.role?.replace('_', ' ')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <div className="flex items-center gap-3 w-full animate-in fade-in duration-300">
                        <Avatar className="w-9 h-9 shrink-0 border border-slate-200 shadow-sm">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {getInitials(user?.name)}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                                {user?.name}
                            </p>
                            {user?.role && (
                                <div className="mt-0.5">
                                    <RoleBadge role={user.role as StaffRole} size="sm" />
                                </div>
                            )}
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="shrink-0 p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20">
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 shadow-lg rounded-xl">
                                <DropdownMenuItem className="cursor-pointer group">
                                    <User className="w-4 h-4 mr-2 text-slate-400 group-hover:text-slate-700" />
                                    Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogoutAction} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer group">
                                    <LogOut className="w-4 h-4 mr-2 text-red-500 group-hover:text-red-600" />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Extracted Sub-Component for Cleaner Rendering
// ---------------------------------------------------------------------------

interface NavItemProps {
    href: string;
    icon: React.ElementType;
    label: string;
    shortcut?: string;
    isActive: boolean;
    isCollapsed: boolean;
    isMobile: boolean;
    onToggle: () => void;
}

function NavItem({ href, icon: Icon, label, shortcut, isActive, isCollapsed, isMobile, onToggle }: NavItemProps) {
    const linkContent = (
        <Link
            href={href}
            onClick={isMobile ? onToggle : undefined}
            className={cn(
                'group flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 relative overflow-hidden',
                isCollapsed ? 'justify-center py-3' : 'px-3 py-2.5',
                isActive
                    ? 'bg-primary text-white shadow-sm shadow-primary/20 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
        >
            <Icon className={cn('w-5 h-5 shrink-0 transition-transform duration-200', !isActive && 'group-hover:scale-110')} />

            {!isCollapsed && (
                <div className="flex flex-1 items-center justify-between min-w-0">
                    <span className="truncate">{label}</span>
                    {isActive && shortcut && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded shadow-sm font-mono tracking-wider ml-2 shrink-0">
                            {shortcut}
                        </span>
                    )}
                </div>
            )}
        </Link>
    );

    if (isCollapsed && !isMobile) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium shadow-md">
                    {label}
                </TooltipContent>
            </Tooltip>
        );
    }

    return linkContent;
}