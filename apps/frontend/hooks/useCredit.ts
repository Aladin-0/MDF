'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { creditApi } from '@/lib/apiClient';
import { RecordCreditPaymentPayload } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { computeCreditAging } from '@/lib/creditAging';

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

/**
 * The aging buckets, worked out from the SAME cached accounts list `useCreditAccounts()` loads (same query key, so
 * one request serves both). It used to download the 500 accounts a second time.
 */
export function useCreditAgingSummary() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['credit', 'accounts', outletId, undefined],
        queryFn: () => creditApi.getAccountsList(outletId!),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
        select: (accounts) => computeCreditAging(accounts),
    });
}

/** The credit account of ONE customer (the customer page used to download every account of the outlet to find it). */
export function useCustomerCreditAccount(customerId: string | undefined) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['credit', 'accounts', outletId, { customerId }],
        queryFn: () => creditApi.getAccountsList(outletId!, { customerId }),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId && !!customerId,
        select: (accounts: any[]) => accounts.find((a) => (a.customer?.id ?? a.customerId) === customerId),
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
