import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

let uuidCounter = 0;
jest.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isFetching: false }) }));

const mockCustomerQuery = jest.fn();
jest.mock('@/hooks/useCustomers', () => ({ useCustomerById: (id: string) => mockCustomerQuery(id) }));
// The real form is covered by components/customers/CustomerFormEdit.test.tsx: here it is a stand-in that "saves".
jest.mock('@/components/customers/CustomerForm', () => ({
    __esModule: true,
    default: ({ open, customer, onSaved, onClose }: any) => open ? (
        <div role="dialog" aria-label="Edit Customer">
            <span>Editing {customer?.name}</span>
            <button onClick={() => { onSaved({ id: customer.id, name: 'Abdul Salam Khan', phone: '9123456780', address: 'New Colony', ledgerName: 'Abdul Salam Khan (9123456780)' }); onClose(); }}>save</button>
        </div>
    ) : null,
}));

import { EditBillCustomer } from './EditBillCustomer';
import { LedgerPicker } from './LedgerPicker';
import { useBillingStore } from '@/store/billingStore';
import type { Ledger } from '@/types';

const abdul = { id: 'led-1', name: 'ABDUL SALAM (8888853110)', phone: '8888853110', address: 'SAVERA PARK, CSN, 431001', groupName: 'Sundry Debtors', linkedCustomerId: 'cust-1' } as unknown as Ledger;

describe('Edit on the selected customer (billing)', () => {
    it('shows Edit beside Change for a customer, and tells the screen which one', () => {
        const onEdit = jest.fn();
        render(<LedgerPicker currentLedger={abdul} onSelect={jest.fn()} onEdit={onEdit} icon={null} />);
        fireEvent.click(screen.getByRole('button', { name: /edit/i }));
        expect(onEdit).toHaveBeenCalledWith(abdul);
        expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
    });

    it('offers no Edit where the screen did not ask for one, or for a ledger with no customer record', () => {
        const { rerender } = render(<LedgerPicker currentLedger={abdul} onSelect={jest.fn()} icon={null} />);
        expect(screen.queryByTestId('edit-customer')).not.toBeInTheDocument();
        rerender(<LedgerPicker currentLedger={{ ...abdul, linkedCustomerId: undefined } as Ledger} onSelect={jest.fn()} onEdit={jest.fn()} icon={null} />);
        expect(screen.queryByTestId('edit-customer')).not.toBeInTheDocument();
    });
});

describe('EditBillCustomer', () => {
    beforeEach(() => {
        mockCustomerQuery.mockReset();
        const store = useBillingStore.getState();
        store.resetBilling();
        store.switchDraft(store.createDraft());
        store.setCustomerLedger(abdul);
        store.setPatient({ id: 'cust-2', name: 'Sana' });
    });

    it('opens the form with the full record from the server and puts the saved details back on the bill', () => {
        mockCustomerQuery.mockReturnValue({ data: { id: 'cust-1', name: 'ABDUL SALAM', phone: '8888853110' }, isFetching: false, isError: false });
        const onClose = jest.fn();
        render(<EditBillCustomer customerId="cust-1" open onClose={onClose} />);
        expect(mockCustomerQuery).toHaveBeenCalledWith('cust-1');
        expect(screen.getByText('Editing ABDUL SALAM')).toBeInTheDocument();

        fireEvent.click(screen.getByText('save'));

        const state = useBillingStore.getState();
        const draft = state.drafts[state.activeDraftId!];
        expect(draft.customerLedger).toMatchObject({ id: 'led-1', name: 'Abdul Salam Khan (9123456780)', phone: '9123456780', address: 'New Colony' });
        expect(draft.customer).toMatchObject({ id: 'cust-1', name: 'Abdul Salam Khan (9123456780)', phone: '9123456780' });
        expect(draft.patient).toMatchObject({ id: 'cust-2', name: 'Sana' });
        expect(onClose).toHaveBeenCalled();
    });

    it('waits for the fresh record: an older cached copy is never put in the form', () => {
        mockCustomerQuery.mockReturnValue({ data: { id: 'cust-1', name: 'STALE NAME' }, isFetching: true, isError: false });
        render(<EditBillCustomer customerId="cust-1" open onClose={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('asks for nothing while closed', () => {
        mockCustomerQuery.mockReturnValue({ data: undefined, isFetching: false, isError: false });
        render(<EditBillCustomer customerId="cust-1" open={false} onClose={jest.fn()} />);
        expect(mockCustomerQuery).toHaveBeenCalledWith('');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
