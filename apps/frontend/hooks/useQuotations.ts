'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletId } from '@/hooks/useOutletId';
import { salesApi } from '@/lib/apiClient';
import { Quotation } from '@/types';

export function useQuotationsList() {
    const outletId = useOutletId();
    return useQuery<{ data: Quotation[] }>({
        queryKey: ['quotations', outletId],
        queryFn: () => salesApi.listQuotations(outletId),
        enabled: !!outletId,
    });
}
