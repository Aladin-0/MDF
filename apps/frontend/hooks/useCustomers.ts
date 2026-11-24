'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { customersApi, doctorsApi } from '@/lib/apiClient';
import { CustomerFull, CustomerFilters } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';

// NOTE: useOutletId from hooks/useOutletId.ts respects selectedOutletId from settingsStore

export function useCustomerList(filters?: CustomerFilters) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['customers', outletId, filters],
        // the signal cancels a search the clerk has already typed past
        queryFn: ({ signal }) => customersApi.list(outletId, filters, signal),
        staleTime: 1000 * 60 * 3,
        enabled: !!outletId,
        // keep showing the current rows while the next search / filter loads (the table used to blank out),
        // but never another outlet's rows
        placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === outletId ? previous : undefined),
    });
}

/** Counts and the total outstanding for the Customers page, in one small request (it was three full lists). */
export function useCustomerSummary() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['customers', outletId, 'summary'],
        queryFn: ({ signal }) => customersApi.getSummary(outletId, signal),
        staleTime: 1000 * 60 * 3,
        enabled: !!outletId,
    });
}

export function useCustomerById(id: string) {
    return useQuery({
        queryKey: ['customers', id],
        queryFn: () => customersApi.getById(id),
        enabled: !!id,
    });
}

export function useCustomerPurchaseHistory(customerId: string) {
    return useQuery({
        queryKey: ['customers', customerId, 'history'],
        queryFn: () => customersApi.getPurchaseHistory(customerId),
        enabled: !!customerId,
    });
}

export function useRefillAlerts() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['customers', 'refill-alerts', outletId],
        queryFn: () => customersApi.getRefillAlerts(outletId),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

export function useCreateCustomer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: Partial<CustomerFull>) =>
            customersApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        },
    });
}

export function useUpdateCustomer(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: Partial<CustomerFull>) =>
            customersApi.update(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers', id] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            // the customer's ledger carries a copy of the name, mobile and address (billing's customer search reads it)
            queryClient.invalidateQueries({ queryKey: ['ledgers'] });
        },
    });
}

export function useDoctorList() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['doctors', outletId],
        queryFn: () => customersApi.getDoctors(outletId),
        staleTime: 1000 * 60 * 30,
        enabled: !!outletId,
    });
}

export function useDoctorSearch(search: string) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['doctors', 'search', search, outletId],
        queryFn: () => doctorsApi.search(outletId, search),
        enabled: search.length >= 2 && !!outletId,
        staleTime: 60_000,
    });
}

export function useCreateDoctor() {
    const queryClient = useQueryClient();
    const outletId = useOutletId();
    return useMutation({
        mutationFn: (data: { name: string; registrationNo: string; degree?: string; qualification?: string; specialty?: string; hospitalName?: string; address?: string; phone?: string }) =>
            doctorsApi.create({ ...data, outletId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['doctors'] });
        },
    });
}
