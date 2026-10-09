'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttendanceSummaryTab } from '@/components/attendance/AttendanceSummaryTab';
import { TodayAttendanceTab } from '@/components/attendance/TodayAttendanceTab';
import { MonthlyAttendanceTab } from '@/components/attendance/MonthlyAttendanceTab';
import { SmartCheckInAction } from '@/components/attendance/SmartCheckInAction';
import { Clock } from 'lucide-react';

export default function AttendancePage() {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedStaffId, setSelectedStaffId] = useState('all');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 text-primary rounded-lg">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance & Timesheets</h1>
                        <p className="text-sm text-slate-500">
                            {isAdmin ? "Manage staff attendance across your outlet" : "View your monthly attendance summary"}
                        </p>
                    </div>
                </div>
                
                <SmartCheckInAction />
            </div>

            <Tabs defaultValue={isAdmin ? "today" : "my-summary"} className="w-full">
                <TabsList className="mb-4">
                    {isAdmin && (
                        <>
                            <TabsTrigger value="today">Today's Roster</TabsTrigger>
                            <TabsTrigger value="monthly">Monthly Detailed</TabsTrigger>
                            <TabsTrigger value="summary">Team Summary</TabsTrigger>
                        </>
                    )}
                    <TabsTrigger value="my-summary">My Summary</TabsTrigger>
                </TabsList>

                {isAdmin && (
                    <>
                        <TabsContent value="today">
                            <TodayAttendanceTab />
                        </TabsContent>
                        
                        <TabsContent value="monthly">
                            <MonthlyAttendanceTab 
                                selectedMonth={selectedMonth} 
                                selectedYear={selectedYear}
                                selectedStaffId={selectedStaffId}
                                onMonthChange={setSelectedMonth}
                                onYearChange={setSelectedYear}
                                onStaffChange={setSelectedStaffId}
                            />
                        </TabsContent>
                        
                        <TabsContent value="summary">
                            <AttendanceSummaryTab 
                                selectedMonth={selectedMonth} 
                                selectedYear={selectedYear}
                                onMonthChange={setSelectedMonth}
                                onYearChange={setSelectedYear}
                            />
                        </TabsContent>
                    </>
                )}
                
                <TabsContent value="my-summary">
                    <AttendanceSummaryTab 
                        selectedMonth={selectedMonth} 
                        selectedYear={selectedYear}
                        onMonthChange={setSelectedMonth}
                        onYearChange={setSelectedYear}
                        isMySummary={true}
                        currentStaffId={user?.id}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
