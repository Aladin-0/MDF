import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
    CartItem,
    StaffPinVerifyResponse,
    Customer,
    Doctor,
    Ledger,
    PaymentSplit,
    ScheduleHData,
    BillTotals,
    SaleInvoice,
    DraftBill,
    DraftStatus
} from '../types';

interface BillingState {
    drafts: Record<string, DraftBill>;
    activeDraftId: string | null;

    activeStaff: StaffPinVerifyResponse | null;
    isPinVerified: boolean;

    // Transient UI State (Not preserved in draft)
    isCartOpen: boolean;
    isCustomerSelectorOpen: boolean;
    searchQuery: string;
    lastInvoice: SaleInvoice | null;
    editingSaleId: string | null;
    editingReturnInfo: { count: number; total: number; summary: { returnNo: string; returnDate: string; totalAmount: number; reason: string }[] } | null;
    revisionAction: string | null;
    revisionReasonCode: string | null;
    revisionReasonText: string | null;

    backendRateErrors: Record<string, string>;

    // Actions - Draft Management
    createDraft: () => string;
    switchDraft: (id: string) => void;
    replaceDraftId: (oldId: string, newId: string) => void;
    closeDraft: (id: string) => void;
    updateDraftHeader: (id: string, updates: Partial<Omit<DraftBill, 'id' | 'cart'>>) => void;
    setDraftDocumentMode: (id: string, mode: 'invoice' | 'quotation') => void;
    setDraftValidUntil: (id: string, dateStr: string | undefined) => void;
    setDraftSaveStatus: (id: string, status: 'saving' | 'saved' | 'error' | 'offline', time?: string) => void;

    // Actions - Active Draft Setters (Helpers)
    setCustomer: (c: Customer | null) => void;
    setCustomerLedger: (l: Ledger | null) => void;
    setDoctor: (d: Doctor | null) => void;
    setHospitalName: (name: string | null) => void;
    setPayment: (payment: Partial<PaymentSplit>) => void;
    setScheduleHData: (data: ScheduleHData | null) => void;
    setExtraDiscountPct: (pct: number) => void;

    // Actions - Cart Management (Scoped to Active Draft)
    addToCart: (draftId: string | null | undefined, item: CartItem) => void;
    removeFromCart: (draftId: string | null | undefined, batchId: string) => void;
    updateCartItem: (draftId: string | null | undefined, batchId: string, updates: Partial<CartItem>) => void;
    applyDiscountToItem: (draftId: string | null | undefined, batchId: string, pct: number) => void;
    clearCart: (draftId?: string | null | any) => void;

    // Computed
    getDraftTotals: (id: string) => BillTotals;
    hasScheduleHItems: (id: string) => boolean;
    cartCount: (id?: string | null) => number;

    // Global UI Actions
    setActiveStaff: (staff: StaffPinVerifyResponse) => void;
    clearPin: () => void;
    setSearchQuery: (q: string) => void;
    toggleCart: () => void;
    setCustomerSelectorOpen: (open: boolean) => void;
    setLastInvoice: (inv: SaleInvoice | null) => void;
    setEditingSaleId: (id: string | null) => void;
    setEditingReturnInfo: (info: BillingState['editingReturnInfo']) => void;
    setRevisionContext: (action: string | null, reasonCode: string | null, reasonText: string | null) => void;
    resetBilling: () => void;
    setDrafts: (drafts: Record<string, DraftBill>, activeId: string | null) => void;

    setBackendRateError: (batchId: string, errorMsg: string) => void;
    clearBackendRateError: (batchId: string) => void;
    clearAllBackendRateErrors: () => void;

    // Session bill counter
    billsToday: number;
    incrementBillsToday: () => void;
}

const initialPayment: PaymentSplit = {
    method: 'cash',
    amount: 0,
    cashTendered: 0,
    cashReturned: 0
};

const createEmptyDraft = (id: string): DraftBill => ({
    id,
    documentMode: 'invoice',
    customer: null,
    customerLedger: null,
    doctor: null,
    hospitalName: null,
    prescriptionNo: null,
    scheduleHData: null,
    prescriptionImageUrl: null,
    cart: [],
    payment: { ...initialPayment },
    extraDiscountPct: 0,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

export const useBillingStore = create<BillingState>((set, get) => ({
    drafts: {},
    activeDraftId: null,

    activeStaff: null,
    isPinVerified: false,

    isCartOpen: false,
    isCustomerSelectorOpen: false,
    searchQuery: '',
    lastInvoice: null,
    editingSaleId: null,
    editingReturnInfo: null,
    revisionAction: null,
    revisionReasonCode: null,
    revisionReasonText: null,
    billsToday: 0,
    backendRateErrors: {},

    // --- Draft Management ---

    createDraft: () => {
        const state = get();
        if (Object.keys(state.drafts).length >= 10) {
            // Prevent creating too many drafts
            return '';
        }
        
        const id = `local-${uuidv4()}`;
        const newDraft = createEmptyDraft(id);
        set((state) => ({
            drafts: { ...state.drafts, [id]: newDraft },
            activeDraftId: id,
        }));
        return id;
    },

    switchDraft: (id) => set((state) => {
        if (state.drafts[id]) {
            return { activeDraftId: id };
        }
        return state;
    }),

    replaceDraftId: (oldId, newId) => set((state) => {
        const drafts = { ...state.drafts };
        if (!drafts[oldId]) return state;
        
        const draft = drafts[oldId];
        draft.id = newId;
        drafts[newId] = draft;
        delete drafts[oldId];
        
        return {
            drafts,
            activeDraftId: state.activeDraftId === oldId ? newId : state.activeDraftId
        };
    }),

    closeDraft: (id) => set((state) => {
        const newDrafts = { ...state.drafts };
        delete newDrafts[id];
        
        const remainingKeys = Object.keys(newDrafts);
        let newActiveId = state.activeDraftId;
        
        if (state.activeDraftId === id) {
            newActiveId = remainingKeys.length > 0 ? remainingKeys[0] : null;
        }
        
        return { drafts: newDrafts, activeDraftId: newActiveId };
    }),

    updateDraftHeader: (id, updates) => set((state) => {
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: { ...draft, ...updates, updatedAt: new Date().toISOString() }
            }
        };
    }),

    setDraftSaveStatus: (id, status, time) => set((state) => {
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: { 
                    ...draft, 
                    saveStatus: status,
                    ...(time ? { lastSavedAt: time } : {})
                }
            }
        };
    }),

    setDraftDocumentMode: (id, mode) => set((state) => {
        const draft = state.drafts[id];
        if (!draft) return state;
        
        let validUntil = draft.validUntil;
        if (mode === 'quotation' && !validUntil) {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            validUntil = d.toISOString().split('T')[0];
        }
        
        return {
            drafts: {
                ...state.drafts,
                [id]: { ...draft, documentMode: mode, validUntil }
            }
        };
    }),

    setDraftValidUntil: (id, dateStr) => set((state) => {
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: { ...draft, validUntil: dateStr }
            }
        };
    }),

    // --- Active Draft Setters (Helpers for current UI) ---
    
    setCustomer: (customer) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { customer });
    },
    
    setCustomerLedger: (customerLedger) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { customerLedger });
    },

    setDoctor: (doctor) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { doctor });
    },

    setHospitalName: (name) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { hospitalName: name });
    },

    setPayment: (updates) => {
        const state = get();
        const activeId = state.activeDraftId;
        if (activeId && state.drafts[activeId]) {
            state.updateDraftHeader(activeId, { 
                payment: { ...state.drafts[activeId].payment, ...updates }
            });
        }
    },

    setScheduleHData: (data) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { scheduleHData: data });
    },

    setExtraDiscountPct: (pct) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { extraDiscountPct: Math.max(0, Math.min(100, pct)) });
    },

    // --- Cart Management (Scoped to Active Draft) ---

    addToCart: (draftId, item) => set((state) => {
        const id = draftId || state.activeDraftId;
        if (!id) return state;
        
        const draft = state.drafts[id];
        if (!draft) return state;
        const existingIndex = draft.cart.findIndex(i => i.batchId === item.batchId);
        
        let newCart = [...draft.cart];
        if (existingIndex >= 0) {
            newCart[existingIndex] = {
                ...newCart[existingIndex],
                ...item,
                totalQty: item.totalQty
            };
        } else {
            newCart = [...newCart, item];
        }

        return {
            drafts: {
                ...state.drafts,
                [id]: { ...draft, cart: newCart, updatedAt: new Date().toISOString() }
            }
        };
    }),

    removeFromCart: (draftId, batchId) => set((state) => {
        const id = draftId || state.activeDraftId;
        if (!id) return state;
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: { 
                    ...draft, 
                    cart: draft.cart.filter((item) => item.batchId !== batchId),
                    updatedAt: new Date().toISOString() 
                }
            }
        };
    }),

    updateCartItem: (draftId, batchId, updates) => set((state) => {
        const id = draftId || state.activeDraftId;
        if (!id) return state;
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: {
                    ...draft,
                    cart: draft.cart.map((item) =>
                        item.batchId === batchId ? { ...item, ...updates } : item
                    ),
                    updatedAt: new Date().toISOString()
                }
            }
        };
    }),

    applyDiscountToItem: (draftId, batchId, discountPct) => set((state) => {
        const id = draftId || state.activeDraftId;
        if (!id) return state;
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: {
                    ...draft,
                    cart: draft.cart.map((item) => {
                        if (item.batchId === batchId) {
                            const discountedRate = (item.saleRate ?? item.mrp) * (1 - discountPct / 100);
                            return { ...item, discountPct, rate: discountedRate };
                        }
                        return item;
                    }),
                    updatedAt: new Date().toISOString()
                }
            }
        };
    }),

    clearCart: (draftId) => set((state) => {
        if (typeof draftId !== 'string') {
            draftId = state.activeDraftId;
        } else {
            draftId = draftId || state.activeDraftId;
        }
        const id = draftId;
        if (!id) return state;
        const draft = state.drafts[id];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [id]: {
                    ...draft,
                    cart: [],
                    customer: null,
                    customerLedger: null,
                    doctor: null,
                    hospitalName: null,
                    payment: { ...initialPayment },
                    scheduleHData: null,
                    prescriptionImageUrl: null,
                    extraDiscountPct: 0,
                    updatedAt: new Date().toISOString()
                }
            }
        };
    }),

    // --- Computed ---

    getDraftTotals: (id) => {
        const state = get();
        const draft = state.drafts[id];
        if (!draft) return {
            subtotal: 0, discountAmount: 0, extraDiscountAmount: 0, taxableAmount: 0,
            cgstAmount: 0, sgstAmount: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0,
            grandTotal: 0, amountPaid: 0, amountDue: 0, itemCount: 0, totalQty: 0,
            hasScheduleH: false, requiresDoctorDetails: false
        };

        const extraDiscPct = draft.extraDiscountPct || 0;
        const discountFactor = extraDiscPct > 0 ? 1 - extraDiscPct / 100 : 1;

        let subtotal = 0;
        let totalRateAmount = 0;
        let taxableAmount = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;
        let totalQty = 0;
        let hasScheduleH = false;
        let requiresDoctorDetails = false;

        draft.cart.forEach(item => {
            const rawTotal = item.rate * item.totalQty;
            const gstRate = item.gstRate || 0;

            subtotal += item.mrp * item.totalQty;
            totalRateAmount += rawTotal;
            totalQty += item.totalQty;

            const discountedTotal = rawTotal * discountFactor;

            const itemTaxable = gstRate > 0
                ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
                : Number(discountedTotal.toFixed(2));
            const itemGst = Number((discountedTotal - itemTaxable).toFixed(2));

            taxableAmount += itemTaxable;

            const itemCgst = Math.floor(itemGst * 100 / 2) / 100;
            const itemSgst = Number((itemGst - itemCgst).toFixed(2));
            cgstAmount += itemCgst;
            sgstAmount += itemSgst;

            if (['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType)) {
                hasScheduleH = true;
                requiresDoctorDetails = true;
            }
        });

        const discountAmount = subtotal - totalRateAmount;
        const extraDiscountAmount = totalRateAmount * extraDiscPct / 100;

        const exactTotal = taxableAmount + cgstAmount + sgstAmount;
        const grandTotal = Math.round(exactTotal);
        const roundOff = grandTotal - exactTotal;

        const amountPaid = draft.payment.amount || 0;
        const amountDue = grandTotal - amountPaid;

        return {
            subtotal,
            discountAmount,
            extraDiscountAmount,
            taxableAmount,
            cgstAmount,
            sgstAmount,
            cgst: cgstAmount,
            sgst: sgstAmount,
            igst: 0,
            roundOff,
            grandTotal,
            amountPaid,
            amountDue,
            itemCount: draft.cart.length,
            totalQty,
            hasScheduleH,
            requiresDoctorDetails
        };
    },

    hasScheduleHItems: (id) => {
        const state = get();
        const draft = state.drafts[id];
        if (!draft) return false;
        return draft.cart.some(
            item => ['H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType)
        );
    },

    cartCount: (id) => {
        const draftId = id || get().activeDraftId;
        if (!draftId) return 0;
        const draft = get().drafts[draftId];
        if (!draft) return 0;
        return draft.cart.length;
    },

    // --- Global UI Actions ---

    setEditingSaleId: (id) => set((state) => {
        if (!state.activeDraftId) return state;
        const draft = state.drafts[state.activeDraftId];
        return {
            drafts: {
                ...state.drafts,
                [state.activeDraftId]: { ...draft, editingSaleId: id || undefined }
            }
        };
    }),
    setEditingReturnInfo: (info) => set({ editingReturnInfo: info }),
    
    resetBilling: () => set({
        drafts: {},
        activeDraftId: null,
        isPinVerified: false,
        activeStaff: null,
        lastInvoice: null,
        editingSaleId: null,
        editingReturnInfo: null,
        revisionAction: null,
        revisionReasonCode: null,
        revisionReasonText: null,
    }),

    setDrafts: (drafts, activeId) => set({
        drafts,
        activeDraftId: activeId || (Object.keys(drafts).length > 0 ? Object.keys(drafts)[0] : null)
    }),

    incrementBillsToday: () => set((state) => ({ billsToday: state.billsToday + 1 })),

    setBackendRateError: (batchId, errorMsg) => set((state) => ({
        backendRateErrors: { ...state.backendRateErrors, [batchId]: errorMsg }
    })),
    clearBackendRateError: (batchId) => set((state) => {
        const { [batchId]: _, ...rest } = state.backendRateErrors;
        return { backendRateErrors: rest };
    }),
    clearAllBackendRateErrors: () => set({ backendRateErrors: {} }),
    
    setRevisionContext: (action, reasonCode, reasonText) => set((state) => {
        if (!state.activeDraftId) return state;
        const draft = state.drafts[state.activeDraftId];
        return {
            drafts: {
                ...state.drafts,
                [state.activeDraftId]: { 
                    ...draft, 
                    revisionAction: action || undefined, 
                    revisionReasonCode: reasonCode || undefined, 
                    revisionReasonText: reasonText || undefined 
                }
            }
        };
    }),

    setActiveStaff: (staff) => set({ activeStaff: staff, isPinVerified: true }),
    clearPin: () => set({ activeStaff: null, isPinVerified: false }),

    setSearchQuery: (q) => set({ searchQuery: q }),
    toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
    setCustomerSelectorOpen: (open) => set({ isCustomerSelectorOpen: open }),
    setLastInvoice: (inv) => set({ lastInvoice: inv }),

}));
