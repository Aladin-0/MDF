'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { rupees } from '@/lib/dashboard';
import { StaffRole } from '@/types';

interface LeaderboardStaff {
    id: string;
    name: string;
    role: string | StaffRole;
    totalSales: number;
    billsCount: number;
}

interface StaffLeaderboardProps {
    leaderboard: LeaderboardStaff[];
    isLoading?: boolean;
    periodLabel: string;
}

const initials = (name?: string) => (name ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?');

/** Who billed the most in the period: amount first (that is what is being ranked), bills under it. */
export default function StaffLeaderboard({ leaderboard, isLoading, periodLabel }: StaffLeaderboardProps) {
    const top = leaderboard[0]?.totalSales ?? 0;

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Staff</CardTitle>
                <CardDescription>{periodLabel} · by sales billed</CardDescription>
            </CardHeader>
            <CardContent className="pb-3">
                {isLoading ? (
                    <div className="space-y-2" role="status" aria-label="Loading staff">
                        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
                    </div>
                ) : leaderboard.length === 0 ? (
                    <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No billing in this period</p>
                ) : (
                    <ol className="divide-y">
                        {leaderboard.slice(0, 5).map((s, i) => (
                            <li key={s.id || `${s.name}-${i}`} className="flex items-center gap-3 py-2.5">
                                <span className="w-4 text-center text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                                <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(s.name)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{s.name}</p>
                                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                        <div className="h-full rounded-full bg-primary" style={{ width: `${top > 0 ? (s.totalSales / top) * 100 : 0}%` }} />
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-semibold tabular-nums">{rupees(s.totalSales)}</p>
                                    <p className="text-xs tabular-nums text-muted-foreground">{s.billsCount} {s.billsCount === 1 ? 'bill' : 'bills'}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
                <PermissionGate permission="manage_staff">
                    <Link href="/dashboard/staff" className="mt-2 inline-block rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Manage staff →
                    </Link>
                </PermissionGate>
            </CardContent>
        </Card>
    );
}
