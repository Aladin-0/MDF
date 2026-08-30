import { create } from 'zustand';

export type ValuationMode = 'PURCHASE' | 'LANDING' | 'MRP';

interface InventoryState {
    valuationMode: ValuationMode;
    setValuationMode: (mode: ValuationMode) => void;
}

export const useInventoryStore = create<InventoryState>((set) => ({
    valuationMode: 'PURCHASE',
    setValuationMode: (mode) => set({ valuationMode: mode }),
}));
