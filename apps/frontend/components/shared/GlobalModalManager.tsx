'use client';

import React from 'react';
import { useModalStore } from '@/store/modalStore';
import { useOutletId } from '@/hooks/useOutletId';
import { toast } from '@/hooks/use-toast';

// Lazy load modals so we don't bundle them all initially
import dynamic from 'next/dynamic';

const CreateLedgerModal = dynamic(() => import('@/components/accounts/CreateLedgerModal').then(m => m.CreateLedgerModal));
const BillAdjustmentModal = dynamic(() => import('@/components/accounts/BillAdjustmentModal').then(m => m.BillAdjustmentModal));
const ManualAttendanceModal = dynamic(() => import('@/components/attendance/ManualAttendanceModal').then(m => m.ManualAttendanceModal));
const CreateDoctorModal = dynamic(() => import('@/components/billing/CreateDoctorModal').then(m => m.CreateDoctorModal));
const BulkReminderModal = dynamic(() => import('@/components/credit/BulkReminderModal'));
const StockAdjustmentModal = dynamic(() => import('@/components/inventory/StockAdjustmentModal').then(m => m.StockAdjustmentModal));
const StaffFormModal = dynamic(() => import('@/components/staff/StaffFormModal').then(m => m.StaffFormModal));
const AddOutletModal = dynamic(() => import('@/components/chain/AddOutletModal').then(m => m.AddOutletModal));

export function GlobalModalManager() {
    const { activeModal, modalProps, closeModal } = useModalStore();
    const outletId = useOutletId();

    return (
        <>
            {activeModal === 'MODAL_CREATE_LEDGER' && outletId && (
                <CreateLedgerModal
                    outletId={outletId}
                    onSave={() => { toast({ title: 'Ledger created' }); closeModal(); }}
                    onClose={closeModal}
                    {...modalProps}
                />
            )}
            {activeModal === 'MODAL_BILL_ADJUSTMENT' && (
                <BillAdjustmentModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_MANUAL_ATTENDANCE' && (
                <ManualAttendanceModal isOpen={true} onClose={closeModal} {...modalProps} />
            )}
            {activeModal === 'MODAL_CREATE_DOCTOR' && (
                <CreateDoctorModal
                    onSave={() => { toast({ title: 'Doctor added' }); closeModal(); }}
                    onClose={closeModal}
                    {...modalProps}
                />
            )}
            {activeModal === 'MODAL_BULK_REMINDER' && (
                <BulkReminderModal isOpen={true} onClose={closeModal} {...modalProps} />
            )}
            {activeModal === 'MODAL_STOCK_ADJUSTMENT' && (
                <StockAdjustmentModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
            {activeModal === 'MODAL_STAFF_FORM' && (
                <StaffFormModal open={true} onClose={closeModal} {...modalProps} />
            )}
            {activeModal === 'MODAL_ADD_OUTLET' && (
                <AddOutletModal open={true} onOpenChange={(val) => !val && closeModal()} {...modalProps} />
            )}
        </>
    );
}
