import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import { productsApi } from '@/lib/apiClient'
import { useOutletId } from '@/hooks/useOutletId'

export function useProductSearch(query: string, context: 'purchase' | 'billing' | 'procurement' | '' = 'purchase') {
    const [debouncedQuery] = useDebounce(query, 150)
    const outletId = useOutletId()

    return useQuery({
        queryKey: ['products', 'search', debouncedQuery, outletId, context],
        queryFn: () => {
            if (!outletId) return Promise.resolve([])
            if (context === 'procurement') {
                return productsApi.catalogSearch(debouncedQuery, outletId)
            }
            return productsApi.search(debouncedQuery, outletId, context as 'purchase' | 'billing' | '')
        },
        enabled: debouncedQuery.length >= 2 && !!outletId,
        staleTime: 1000 * 60, // 1 minute
        placeholderData: keepPreviousData,
    })
}
