'use client';

import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMonthlySummaries } from '@/hooks/useAttendance';
import { useStaffList } from '@/hooks/useStaff';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { AttendanceSummary } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertCircle, CalendarDays } from 'lucide-react';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

interface Props {
    selectedMonth: number;
    selectedYear: number;
    onMonthChange: (m: number) => void;
    onYearChange: (y: number) => void;
    isMySummary?: boolean;
    currentStaffId?: string;
}

function formatTime12h(timeStr: string) {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h.toString().padStart(2, '0')}:${mStr} ${ampm}`;
}

function AttendancePctBadge({ pct, large = false }: { pct: number, large?: boolean }) {
    const cls = pct >= 90
        ? 'bg-emerald-100 text-emerald-700'
        : pct >= 75
            ? 'bg-amber-100 text-amber-700'
            : 'bg-rose-100 text-rose-700';
    return (
        <span className={cn('rounded-full font-bold flex items-center justify-center', cls, large ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-1 text-xs')}>
            {pct}%
        </span>
    );
}

function MySummaryHero({ summary, shiftStart }: { summary: AttendanceSummary; shiftStart: string }) {
    const { data: staffList = [] } = useStaffList();
    const staff = (staffList as any[]).find((s: any) => s.id === summary.staffId);
    const { totalWorkingDays, presentDays, lateDays, absentDays, halfDays, totalHoursWorked } = summary;

    const avgIsLate = (() => {
        const [sh, sm] = shiftStart.split(':').map(Number);
        const [ah, am] = summary.avgCheckInTime.split(':').map(Number);
        return (ah * 60 + am) > (sh * 60 + sm + 10);
    })();

    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (summary.attendancePct / 100) * circumference;

    return (
        <div className="w-full relative overflow-hidden bg-white/70 backdrop-blur-xl border border-slate-200/50 rounded-[2rem] shadow-sm flex flex-col xl:flex-row items-center xl:items-stretch gap-8 p-8 md:p-10 mb-4 transition-all duration-500 hover:shadow-lg group">
            {/* Soft background glow */}
            <div className="absolute -left-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-1000" />
            <div className="absolute -right-32 -bottom-32 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-1000" />
            
            {/* Left section: Identity & Ring */}
            <div className="relative z-10 flex items-center gap-8 shrink-0">
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r={radius} className="stroke-slate-100 fill-none" strokeWidth="8" />
                        <circle 
                            cx="50" 
                            cy="50" 
                            r={radius} 
                            className={cn('fill-none transition-all duration-1000 ease-out', summary.attendancePct >= 90 ? 'stroke-emerald-400' : summary.attendancePct >= 75 ? 'stroke-amber-400' : 'stroke-rose-400')}
                            strokeWidth="8" 
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                        />
                    </svg>
                    <Avatar className="w-20 h-20 border-4 border-white shadow-md">
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-2xl font-bold">
                            {summary.staffName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                    </Avatar>
                </div>
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">{summary.staffName}</h2>
                    <div className="flex items-center gap-3">
                        {staff && <RoleBadge role={staff.role} size="md" />}
                        <AttendancePctBadge pct={summary.attendancePct} large />
                    </div>
                </div>
            </div>

            <div className="w-full h-px xl:w-px xl:h-auto bg-slate-200/60" />

            {/* Right section: Stats Layout */}
            <div className="relative z-10 flex-1 w-full min-w-0 flex flex-col gap-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 uppercase tracking-wider"><CheckCircle2 className="w-4 h-4" /> Present</span>
                        <span className="text-4xl font-black text-slate-900">{presentDays}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-600 uppercase tracking-wider"><XCircle className="w-4 h-4" /> Absent</span>
                        <span className="text-4xl font-black text-slate-900">{absentDays}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-500 uppercase tracking-wider"><AlertCircle className="w-4 h-4" /> Late</span>
                        <span className="text-4xl font-black text-slate-900">{lateDays}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary uppercase tracking-wider"><Clock className="w-4 h-4" /> Hours</span>
                        <span className="text-4xl font-black text-slate-900">{totalHoursWorked}<span className="text-xl text-slate-400 font-bold ml-0.5">h</span></span>
                    </div>
                </div>

                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pt-6 mt-2 border-t border-slate-100">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <CalendarDays className="w-4 h-4 text-slate-400" />
                            {totalWorkingDays} Working Days
                        </span>
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <Clock className={cn("w-4 h-4", avgIsLate ? 'text-amber-500' : 'text-emerald-500')} />
                            Avg check-in: <strong className="text-slate-900 ml-1">{formatTime12h(summary.avgCheckInTime)}</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-4 w-full xl:w-1/3 min-w-[150px]">
                        {totalWorkingDays > 0 && (
                            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
                                <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${(presentDays / totalWorkingDays) * 100}%` }} />
                                <div className="bg-gradient-to-r from-amber-400 to-amber-500 transition-all" style={{ width: `${(lateDays / totalWorkingDays) * 100}%` }} />
                                <div className="bg-gradient-to-r from-rose-400 to-rose-500 transition-all" style={{ width: `${(absentDays / totalWorkingDays) * 100}%` }} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StaffSummaryCard({ summary, shiftStart }: { summary: AttendanceSummary; shiftStart: string }) {
    const { data: staffList = [] } = useStaffList();
    const staff = (staffList as any[]).find((s: any) => s.id === summary.staffId);
    const { totalWorkingDays, presentDays, lateDays, absentDays } = summary;

    const avgIsLate = (() => {
        const [sh, sm] = shiftStart.split(':').map(Number);
        const [ah, am] = summary.avgCheckInTime.split(':').map(Number);
        return (ah * 60 + am) > (sh * 60 + sm + 10);
    })();

    return (
        <Card className="group relative overflow-hidden bg-white/50 hover:bg-white/90 backdrop-blur-sm border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-500 ease-out hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/40 via-transparent to-blue-50/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <CardContent className="p-6 relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Avatar className="w-12 h-12 border-2 border-white shadow-sm ring-2 ring-primary/5">
                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-sm font-semibold">
                                {summary.staffName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="font-bold text-slate-900 tracking-tight">{summary.staffName}</div>
                            {staff && <div className="mt-0.5"><RoleBadge role={staff.role} size="sm" /></div>}
                        </div>
                    </div>
                    <AttendancePctBadge pct={summary.attendancePct} />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-y-5 gap-x-4 mb-6">
                    <Stat label="Working Days" value={summary.totalWorkingDays} />
                    <Stat label="Present" value={summary.presentDays} color="text-emerald-600" />
                    <Stat label="Absent" value={summary.absentDays} color="text-rose-600" />
                    <Stat label="Late" value={summary.lateDays} color="text-amber-500" />
                    <Stat label="Half Days" value={summary.halfDays} color="text-violet-600" />
                    <Stat label="Hours" value={`${summary.totalHoursWorked}h`} />
                </div>

                {/* Stacked bar */}
                <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
                    {totalWorkingDays > 0 && (
                        <>
                            <div
                                className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-1000 ease-out"
                                style={{ width: `${(presentDays / totalWorkingDays) * 100}%` }}
                            />
                            <div
                                className="bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-1000 ease-out"
                                style={{ width: `${(lateDays / totalWorkingDays) * 100}%` }}
                            />
                            <div
                                className="bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-1000 ease-out"
                                style={{ width: `${(absentDays / totalWorkingDays) * 100}%` }}
                            />
                        </>
                    )}
                </div>

                {/* Avg check-in */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100/50">
                    <div className={cn('p-1.5 rounded-md flex items-center justify-center', avgIsLate ? 'bg-amber-100/50 text-amber-600' : 'bg-emerald-100/50 text-emerald-600')}>
                        <Clock className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm font-medium text-slate-600">
                        Avg check-in: <span className="text-slate-900 font-semibold">{summary.avgCheckInTime}</span>
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-[11px] font-medium tracking-wider text-slate-500 uppercase mb-1">{label}</span>
            <span className={cn('text-xl font-bold tracking-tight', color ?? 'text-slate-800')}>{value}</span>
        </div>
    );
}

export function AttendanceSummaryTab({ selectedMonth, selectedYear, onMonthChange, onYearChange, isMySummary, currentStaffId }: Props) {
    const { data: rawSummaries = [], isLoading } = useMonthlySummaries(selectedMonth, selectedYear);
    const { data: outletSettings } = useOutletSettings();
    
    // Filter down to just the current staff if this is the "My Summary" view
    const summaries = isMySummary && currentStaffId 
        ? rawSummaries.filter((s: any) => s.staffId === currentStaffId)
        : rawSummaries;
    const shiftStart = outletSettings?.openingTime ?? '09:00';

    function prevMonth() {
        if (selectedMonth === 1) { onMonthChange(12); onYearChange(selectedYear - 1); }
        else onMonthChange(selectedMonth - 1);
    }

    function nextMonth() {
        if (selectedMonth === CURRENT_MONTH && selectedYear === CURRENT_YEAR) return;
        if (selectedMonth === 12) { onMonthChange(1); onYearChange(selectedYear + 1); }
        else onMonthChange(selectedMonth + 1);
    }

    const isFutureMonth = selectedYear > CURRENT_YEAR ||
        (selectedYear === CURRENT_YEAR && selectedMonth >= CURRENT_MONTH);

    const totals = summaries.reduce(
        (acc: any, s: any) => ({
            presentDays: acc.presentDays + s.presentDays,
            absentDays: acc.absentDays + s.absentDays,
            totalHours: acc.totalHours + s.totalHoursWorked,
        }),
        { presentDays: 0, absentDays: 0, totalHours: 0 }
    );
    const avgPct = summaries.length > 0
        ? Math.round(summaries.reduce((a: number, s: any) => a + s.attendancePct, 0) / summaries.length)
        : 0;

    return (
        <div className="space-y-4">
            {/* Month navigator */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold min-w-32 text-center">
                    {MONTHS[selectedMonth - 1]} {selectedYear}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={nextMonth}
                    disabled={isFutureMonth}
                >
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Loading summaries...</div>
            ) : (
                <>
                    {isMySummary ? (
                        <div className="flex flex-col gap-4">
                            {summaries.map((s: any) => (
                                <MySummaryHero key={s.staffId} summary={s} shiftStart={shiftStart} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {summaries.map((s: any) => (
                                <StaffSummaryCard key={s.staffId} summary={s} shiftStart={shiftStart} />
                            ))}
                        </div>
                    )}

                    {/* Team totals */}
                    <div className="bg-slate-50 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{summaries.length} staff</span>
                        <span>Present days: <strong>{totals.presentDays}</strong></span>
                        <span>Absent days: <strong>{totals.absentDays}</strong></span>
                        <span>Total hours: <strong>{totals.totalHours.toFixed(1)}h</strong></span>
                        <span>Team avg attendance: <strong>{avgPct}%</strong></span>
                    </div>
                </>
            )}
        </div>
    );
}
