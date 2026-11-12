'use client';

import { useState } from 'react';
import { Plus, UserCog, Trophy, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { StaffTable } from 'components/staff/StaffTable';
import { StaffFormModal } from 'components/staff/StaffFormModal';
import { StaffLeaderboard } from 'components/staff/StaffLeaderboard';
import { StaffSectionTabs } from 'components/staff/StaffSectionTabs';

export default function StaffPage() {
    const [showForm, setShowForm] = useState(false);
    const [editingStaff, setEditingStaff] = useState<any>(null);

    const handleEdit = (staff: any) => {
        setEditingStaff(staff);
        setShowForm(true);
    };

    const handleClose = () => {
        setShowForm(false);
        setEditingStaff(null);
    };

    return (
        <div className="space-y-6">
            {/* Header (same pattern as Attendance: icon tile, title, subtitle, actions on the right) */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
                        <UserCog className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Staff Management</h1>
                        <p className="text-sm text-slate-500">Manage staff, PINs, roles, and performance tracking</p>
                    </div>
                </div>
                <PermissionGate permission="manage_staff">
                    <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Staff Member
                    </Button>
                </PermissionGate>
            </div>

            <StaffSectionTabs />

            {/* Tabs */}
            <Tabs defaultValue="staff">
                <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="staff" className="flex flex-1 sm:flex-none gap-2">
                        <UserCog className="w-4 h-4" />
                        Staff List
                    </TabsTrigger>
                    <TabsTrigger value="leaderboard" className="flex flex-1 sm:flex-none gap-2">
                        <Trophy className="w-4 h-4" />
                        Leaderboard
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="staff" className="mt-4">
                    <StaffTable onEdit={handleEdit} />
                </TabsContent>

                <TabsContent value="leaderboard" className="mt-4">
                    <StaffLeaderboard />
                </TabsContent>
            </Tabs>

            {/* Create/Edit Modal */}
            <StaffFormModal
                open={showForm}
                onClose={handleClose}
                editingStaff={editingStaff}
            />
        </div>
    );
}
