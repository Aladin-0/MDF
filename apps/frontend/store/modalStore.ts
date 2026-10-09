import { create } from 'zustand';

type ModalType = 
    | "MODAL_CREATE_LEDGER"
    | "MODAL_BILL_ADJUSTMENT"
    | "MODAL_MANUAL_ATTENDANCE"
    | "MODAL_CREATE_DOCTOR"
    | "MODAL_BULK_REMINDER"
    | "MODAL_STOCK_ADJUSTMENT"
    | "MODAL_STAFF_FORM"
    | "MODAL_ADD_OUTLET"
    | null;

interface ModalState {
    activeModal: ModalType;
    modalProps: any;
    openModal: (modal: ModalType, props?: any) => void;
    closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
    activeModal: null,
    modalProps: {},
    openModal: (modal, props = {}) => set({ activeModal: modal, modalProps: props }),
    closeModal: () => set({ activeModal: null, modalProps: {} }),
}));
