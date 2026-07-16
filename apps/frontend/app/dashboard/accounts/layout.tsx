'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, Receipt, Banknote, User, FileText, ShieldAlert, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
    { href: '/dashboard/accounts/overview',       label: 'Overview',       icon: Wallet },
    { href: '/dashboard/accounts/payables',       label: 'Payables',       icon: Banknote },
    { href: '/dashboard/accounts/receivables',    label: 'Receivables',    icon: User },
    { href: '/dashboard/accounts/vouchers',       label: 'Vouchers',       icon: FileText },
];

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const isDeepPage = pathname.split('/').length > 4; 

    return (
        <div className="space-y-6">
            {!isDeepPage && (
                <>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Wallet className="h-4 w-4" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight">Finance Command Center</h1>
                        </div>
                        <p className="pl-[46px] text-sm text-muted-foreground">
                            Accounts, outstanding dues, expenses, and financial integrity
                        </p>
                    </div>

                    <div className="flex border-b border-border overflow-x-auto no-scrollbar">
                        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href || (pathname.startsWith(href) && href !== '/dashboard/accounts/overview');
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-150 whitespace-nowrap',
                                        'border-b-2 -mb-px',
                                        'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                                        isActive && 'border-primary text-primary font-semibold',
                                    )}
                                >
                                    <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                </>
            )}

            <div className={cn("pt-2", isDeepPage && "pt-0")}>
                {children}
            </div>
        </div>
    );
}
