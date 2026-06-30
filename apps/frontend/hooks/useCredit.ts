'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { creditApi } from '@/lib/apiClient';
import { RecordCreditPaymentPayload } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';

export function useCreditAccounts(filters?: any) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['credit', 'accounts', outletId, filters],
        queryFn: () => creditApi.getAccountsList(outletId!, filters),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

export function useCreditTransactions(accountId: string) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['credit', 'transactions', accountId, outletId],
        queryFn: () => creditApi.getTransactions(accountId, outletId!),
        enabled: !!accountId && !!outletId,
        staleTime: 1000 * 60,
    });
}

export function useCreditAgingSummary() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['credit', 'aging', outletId],
        queryFn: () => creditApi.getAgingSummary(outletId!),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useRecordCreditPayment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ accountId, payload }: { accountId: string; payload: RecordCreditPaymentPayload }) =>
            creditApi.recordPayment({ ...payload, creditAccountId: accountId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['credit'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });
}

export function useUpdateCreditLimit() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ accountId, newLimit }: { accountId: string; newLimit: number }) =>
            creditApi.updateCreditLimit(accountId, newLimit),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['credit'] });
        },
    });
}
