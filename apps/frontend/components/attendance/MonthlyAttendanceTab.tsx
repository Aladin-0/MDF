'use client';

import { useState } from 'react';
import {
    startOfMonth, endOfMonth, eachDayOfInterval,
    getDay, format, isFuture, isSameDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMonthlyAttendance } from '@/hooks/useAttendance';
import { useOutletId } from '@/hooks/useOutletId';
import { useStaffList } from '@/hooks/useStaff';
import { AttendanceRecord, AttendanceStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
    Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Props {
    selectedMonth: number;
    selectedYear: number;
    selectedStaffId: string;
    onMonthChange: (m: number) => void;
    onYearChange: (y: number) => void;
    onStaffChange: (id: string) => void;
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

function formatLateMin(mins: number) {
    if (!mins) return '';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
    present: 'bg-green-500 text-white',
    late: 'bg-amber-500 text-white',
    absent: 'bg-red-500 text-white',
    half_day: 'bg-purple-500 text-white',
    weekly_off: 'bg-sky-400 text-white',
    holiday: 'bg-blue-400 text-white',
};

const STATUS_DOT: Record<AttendanceStatus, string> = {
    present: 'bg-green-500',
    late: 'bg-amber-500',
    absent: 'bg-red-500',
    half_day: 'bg-purple-500',
    weekly_off: 'bg-sky-400',
    holiday: 'bg-blue-400',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

function DayCell({ day, record, weeklyOffDay }: { day: Date; record?: AttendanceRecord; weeklyOffDay?: number | null }) {
    const dayNum = format(day, 'd');
    const future = isFuture(day) && !isSameDay(day, now);

    if (future) {
        return (
            <div className="aspect-square rounded-lg flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-100">
                <span className="text-xs text-slate-300">{dayNum}</span>
            </div>
        );
    }
    if (!record) {
        if (weeklyOffDay !== undefined && weeklyOffDay !== null && getDay(day) === weeklyOffDay) {
            return (
                <div className={cn("aspect-square rounded-lg flex flex-col items-center justify-center", STATUS_COLORS.weekly_off)}>
                    <span className="text-xs font-medium">{dayNum}</span>
                    <span className="text-[10px] opacity-80 mt-0.5">Off</span>
                </div>
            );
        }
        return (
            <div className="aspect-square rounded-lg flex flex-col items-center justify-center bg-slate-100 border border-slate-200">
                <span className="text-xs text-slate-400">{dayNum}</span>
            </div>
        );
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        'aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity w-full',
                        STATUS_COLORS[record.status] ?? 'bg-slate-200'
                    )}
                >
                    <span className="text-xs font-medium">{dayNum}</span>
                    {record.checkInTime && (
                        <span className="text-[10px] opacity-80">{formatTime12h(record.checkInTime)}</span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3">
                <div className="text-sm font-semibold mb-2">{format(day, 'dd MMM yyyy')}</div>
                <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Status: <span className="font-medium text-foreground capitalize">{record.status}</span></div>
                    {record.checkInTime && <div>Check In: {formatTime12h(record.checkInTime)}</div>}
                    {record.checkOutTime && <div>Check Out: {formatTime12h(record.checkOutTime)}</div>}
                    {record.workingHours !== undefined && <div>Hours: {record.workingHours}h</div>}
                    {record.isLate && <div className="text-amber-600">Late by {formatLateMin(record.lateByMinutes)}</div>}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function SingleStaffCalendar({
    records,
    month,
    year,
    staff,
}: {
    records: AttendanceRecord[];
    month: number;
    year: number;
    staff?: any;
}) {
    const monthDate = new Date(year, month - 1, 1);
    const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
    const firstDayOfWeek = getDay(days[0]);
    const blanks = Array(firstDayOfWeek).fill(null);

    return (
        <div>
            <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map(d => (
                    <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {blanks.map((_, i) => <div key={`blank-${i}`} />)}
                {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const record = records.find(r => r.date === dateStr);
                    return <DayCell key={dateStr} day={day} record={record} weeklyOffDay={staff?.weeklyOffDay} />;
                })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4">
                {(Object.entries(STATUS_COLORS) as [AttendanceStatus, string][]).map(([status, cls]) => (
                    <div key={status} className="flex items-center gap-1.5">
                        <div className={cn('w-3 h-3 rounded-sm', STATUS_DOT[status])} />
                        <span className="text-xs text-muted-foreground capitalize">{status.replace('_', ' ')}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TeamGrid({ records, month, year }: { records: AttendanceRecord[]; month: number; year: number }) {
    const { data: staffList = [] } = useStaffList();
    const monthDate = new Date(year, month - 1, 1);
    const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });

    return (
        <div className="overflow-x-auto pb-4 rounded-xl border border-slate-100 bg-white/50 backdrop-blur-sm">
            <table className="min-w-max text-xs w-full border-collapse">
                <thead>
                    <tr>
                        <th className="text-left pl-6 pr-4 py-4 font-semibold text-slate-500 sticky left-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 z-10 w-48">Staff Member</th>
                        {days.map(d => (
                            <th key={format(d, 'd')} className="w-10 text-center py-4 font-semibold text-slate-500 border-b border-slate-100">
                                {format(d, 'd')}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(staffList as any[]).map(staff => (
                        <tr key={staff.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="pl-6 pr-4 py-3 font-medium text-sm sticky left-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-sm border-b border-slate-50 transition-colors z-10">
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-7 h-7 border border-slate-100">
                                        <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">
                                            {staff.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-slate-700 tracking-tight">{staff.name.split(' ')[0]}</span>
                                </div>
                            </td>
                            {days.map(day => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const rec = records.find(r => r.staffId === staff.id && r.date === dateStr);
                                const future = isFuture(day) && !isSameDay(day, now);
                                
                                if (future) {
                                    return <td key={dateStr} className="text-center py-3 border-b border-slate-50"><div className="w-2.5 h-2.5 rounded-full bg-slate-100 mx-auto" /></td>;
                                }
                                if (!rec) {
                                    if (staff.weeklyOffDay !== undefined && staff.weeklyOffDay !== null && getDay(day) === staff.weeklyOffDay) {
                                        return <td key={dateStr} className="text-center py-3 border-b border-slate-50"><div className={cn("w-3.5 h-3.5 rounded-full mx-auto shadow-sm ring-2 ring-white", STATUS_DOT.weekly_off)} /></td>;
                                    }
                                    return <td key={dateStr} className="text-center py-3 border-b border-slate-50"><div className="w-2.5 h-2.5 rounded-full bg-slate-200/60 mx-auto" /></td>;
                                }

                                return (
                                    <td key={dateStr} className="text-center py-3 border-b border-slate-50">
                                        <Popover>
                                            <PopoverTrigger className="focus:outline-none hover:scale-125 transition-transform duration-200">
                                                <div className={cn('w-3.5 h-3.5 rounded-full mx-auto shadow-sm ring-2 ring-white', STATUS_DOT[rec.status] ?? 'bg-slate-300')} />
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56 p-3">
                                                <div className="text-sm font-semibold mb-2">{format(day, 'dd MMM yyyy')} - {staff.name.split(' ')[0]}</div>
                                                <div className="space-y-1 text-xs text-muted-foreground">
                                                    <div>Status: <span className="font-medium text-foreground capitalize">{rec.status}</span></div>
                                                    {rec.checkInTime && <div>Check In: {formatTime12h(rec.checkInTime)}</div>}
                                                    {rec.checkOutTime && <div>Check Out: {formatTime12h(rec.checkOutTime)}</div>}
                                                    {rec.workingHours !== undefined && <div>Hours: {rec.workingHours}h</div>}
                                                    {rec.isLate && <div className="text-amber-600 font-medium">Late by {formatLateMin(rec.lateByMinutes)}</div>}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function MonthlyAttendanceTab({
    selectedMonth,
    selectedYear,
    selectedStaffId,
    onMonthChange,
    onYearChange,
    onStaffChange,
}: Props) {
    const outletId = useOutletId();
    const { data: staffList = [] } = useStaffList();
    const { data: records = [], isLoading } = useMonthlyAttendance({
        staffId: selectedStaffId === 'all' ? undefined : selectedStaffId,
        month: selectedMonth,
        year: selectedYear,
        outletId,
    });

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

    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center gap-3">
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

                    {/* Staff selector */}
                    <Select value={selectedStaffId} onValueChange={onStaffChange}>
                        <SelectTrigger className="w-44">
                            <SelectValue placeholder="Select staff" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Staff</SelectItem>
                            {staffList.map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
                ) : selectedStaffId !== 'all' ? (
                    <SingleStaffCalendar records={records} month={selectedMonth} year={selectedYear} staff={staffList.find((s: any) => s.id === selectedStaffId)} />
                ) : (
                    <TeamGrid records={records} month={selectedMonth} year={selectedYear} />
                )}
            </CardContent>
        </Card>
    );
}
