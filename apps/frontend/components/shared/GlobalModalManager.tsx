'use client';

import React from 'react';
import { useModalStore } from '@/store/modalStore';

// Lazy load modals so we don't bundle them all initially
import dynamic from 'next/dynamic';

const CreateLedgerModal = dynamic(() => import('@/components/accounts/CreateLedgerModal').then(m => m.CreateLedgerModal));
const BillAdjustmentModal = dynamic(() => import('@/components/accounts/BillAdjustmentModal').then(m => m.BillAdjustmentModal));
const ManualAttendanceModal = dynamic(() => import('@/components/attendance/ManualAttendanceModal').then(m => m.ManualAttendanceModal));
const CreateDoctorModal = dynamic(() => import('@/components/billing/CreateDoctorModal').then(m => m.CreateDoctorModal));
const BulkReminderModal = dynamic(() => import('@/components/credit/BulkReminderModal').then(m => m.BulkReminderModal));
const StockAdjustmentModal = dynamic(() => import('@/components/inventory/StockAdjustmentModal').then(m => m.StockAdjustmentModal));
const StaffFormModal = dynamic(() => import('@/components/staff/StaffFormModal').then(m => m.StaffFormModal));
const AddOutletModal = dynamic(() => import('@/components/chain/AddOutletModal').then(m => m.AddOutletModal));

export function GlobalModalManager() {
    const { activeModal, modalProps, closeModal } = useModalStore();

    return (
        <>
            {activeModal === 'MODAL_CREATE_LEDGER' && (
                <CreateLedgerModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_BILL_ADJUSTMENT' && (
                <BillAdjustmentModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_MANUAL_ATTENDANCE' && (
                <ManualAttendanceModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_CREATE_DOCTOR' && (
                <CreateDoctorModal isOpen={true} onClose={closeModal} {...modalProps} />
            )}
            {activeModal === 'MODAL_BULK_REMINDER' && (
                <BulkReminderModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_STOCK_ADJUSTMENT' && (
                <StockAdjustmentModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_STAFF_FORM' && (
                <StaffFormModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_ADD_OUTLET' && (
                <AddOutletModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
        </>
    );
}
