import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdate = jest.fn();
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/hooks/useCustomers', () => ({
    useCreateCustomer: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUpdateCustomer: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

import CustomerForm from './CustomerForm';
import type { Customer } from '@/types';

const customer = (over: Partial<Customer> = {}): Customer => ({
    id: 'c1', name: 'Old Import', phone: '02402331234', address: 'Station Road, CSN, Maharashtra, 431001', state: 'Maharashtra', stateCode: '27',
    gstin: '', dob: '', isChronic: false, creditLimit: 0, fixedDiscount: 0, outstanding: 0, totalPurchases: 0, isActive: true,
    ...over,
} as unknown as Customer);

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const save = () => fireEvent.click(screen.getByRole('button', { name: /save customer/i }));

describe('Editing a customer', () => {
    beforeEach(() => { mockUpdate.mockReset(); mockUpdate.mockResolvedValue({ id: 'c1', name: 'Old Import' }); });

    it('saves a customer whose existing number is a landline (it used to refuse every edit on them)', async () => {
        const onSaved = jest.fn();
        const onClose = jest.fn();
        wrap(<CustomerForm open onClose={onClose} customer={customer()} onSaved={onSaved} />);
        fireEvent.change(screen.getByPlaceholderText('27AABCA1234A1Z5'), { target: { value: '27AABCA1234A1Z5' } });
        save();

        await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
        expect(mockUpdate.mock.calls[0][0]).toMatchObject({ phone: '02402331234', gstin: '27AABCA1234A1Z5' });
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'c1', name: 'Old Import' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('still insists on a proper mobile when the number is changed', async () => {
        wrap(<CustomerForm open onClose={jest.fn()} customer={customer()} />);
        fireEvent.change(screen.getByPlaceholderText('98765 43210'), { target: { value: '12345' } });
        save();
        expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeInTheDocument();
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('does not add the state to the address again on every save', async () => {
        wrap(<CustomerForm open onClose={jest.fn()} customer={customer()} />);
        save();
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
        expect(mockUpdate.mock.calls[0][0].address).toBe('Station Road, CSN, Maharashtra, 431001');   // exactly what was stored
        expect(mockUpdate.mock.calls[0][0].state).toBe('Maharashtra');
    });

    it('shows the state its GST code stands for when no state name is on record', async () => {
        wrap(<CustomerForm open onClose={jest.fn()} customer={customer({ state: '', stateCode: '24' })} />);
        save();
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
        expect(mockUpdate.mock.calls[0][0].state).toBe('Gujarat');                                    // not a blanket "Maharashtra"
    });
});
