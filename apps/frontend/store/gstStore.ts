import { create } from 'zustand';
import { gstApi } from '@/lib/apiClient';

interface GSTPeriod {
    period: string;
    status: 'draft' | 'validated';
}

interface GSTStoreState {
    periods: GSTPeriod[];
    selectedPeriod: string;
    loading: boolean;
    error: string | null;
    fetchPeriods: () => Promise<void>;
    setSelectedPeriod: (period: string) => void;
}

export const useGSTStore = create<GSTStoreState>((set, get) => ({
    periods: [],
    selectedPeriod: '',
    loading: false,
    error: null,
    fetchPeriods: async () => {
        set({ loading: true, error: null });
        try {
            const data = await gstApi.getPeriods();
            const periodsArray = Array.isArray(data) ? data : [];
            set({ periods: periodsArray, loading: false });
            
            if (!get().selectedPeriod && periodsArray.length > 0) {
                set({ selectedPeriod: periodsArray[0].period });
            }
        } catch (error: any) {
            set({ loading: false, error: error.message || 'Failed to fetch periods' });
        }
    },
    setSelectedPeriod: (period: string) => set({ selectedPeriod: period }),
}));
