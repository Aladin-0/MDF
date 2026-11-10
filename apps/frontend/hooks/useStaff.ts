'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/apiError';
import { PERMISSIONS_STALE_EVENT } from '@/lib/sessionEvents';

export function useStaffList() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['staff', 'list', outletId],
        queryFn: () => staffApi.list(outletId),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

export function useCreateStaff() {
    const queryClient = useQueryClient();
    const outletId = useOutletId();
    return useMutation({
        mutationFn: (data: any) => staffApi.create({ ...data, outletId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
            toast.success('Staff member created successfully');
        },
        onError: (err: any) => {
            toast.error(apiErrorMessage(err, 'Failed to create staff'));
        },
    });
}

export function useUpdateStaff() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) =>
            staffApi.update(id, data),
        onSuccess: (response, variables) => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
            
            // If the signed-in user edited themselves, re-fetch their rights from the server. (This used
            // to merge the raw staff record into the session, which left the permission list stale.)
            if (useAuthStore.getState().user?.id === variables.id && typeof window !== 'undefined') {
                window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
            }

            toast.success('Staff member updated successfully');
        },
        onError: (err: any) => {
            toast.error(apiErrorMessage(err, 'Failed to update staff'));
        },
    });
}

export function useDeleteStaff() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => staffApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
            toast.success('Staff member deactivated');
        },
        onError: (err: any) => {
            toast.error(apiErrorMessage(err, 'Failed to deactivate staff'));
        },
    });
}

// ✅ FIXED — matches apiClient: (staffId, startDate, endDate)
export function useStaffPerformance(id: string, from: string, to: string) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['staff', 'performance', id, outletId, from, to],
        queryFn: () => staffApi.getPerformance(id, from, to),
        enabled: !!id,
    });
}

// ✅ FIXED — matches apiClient: (outletId) only
export function useStaffLeaderboard(from: string, to: string) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['staff', 'leaderboard', outletId, from, to],
        queryFn: () => staffApi.getLeaderboard(outletId, from, to),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}
