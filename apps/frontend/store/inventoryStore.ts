import { create } from 'zustand';
import type { ValuationMode } from '@/lib/inventory';

export type { ValuationMode };

interface InventoryState {
    valuationMode: ValuationMode;
    setValuationMode: (mode: ValuationMode) => void;
}

export const useInventoryStore = create<InventoryState>((set) => ({
    valuationMode: 'PURCHASE',
    setValuationMode: (mode) => set({ valuationMode: mode }),
}));
