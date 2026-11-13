import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorSheet } from './DoctorSheet';
import { useBillingStore } from '@/store/billingStore';
import { doctorsApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, doctorsApi: { ...actual.doctorsApi, search: jest.fn() } };
});
jest.mock('@/components/billing/CreateDoctorModal', () => ({
    CreateDoctorModal: ({ initialName, onSave, onClose }: any) => (
        <div role="dialog" aria-label="New doctor popup">
            <span data-testid="popup-name">{initialName}</span>
            <button onClick={() => onSave({ id: 'd-new', name: 'Dr. New', regNo: 'REG-NEW' })}>mock save</button>
            <button onClick={onClose}>mock cancel</button>
        </div>
    ),
}));

const mehta = { id: 'd1', name: 'Dr. Mehta', regNo: 'MH123', specialty: 'Cardiology', hospitalName: 'City Hospital' };
const rao = { id: 'd2', name: 'Dr. Rao', regNo: 'KA456' };

function seed(updates: Record<string, unknown> = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates } as any } }));
}
const active = () => { const s = useBillingStore.getState(); return s.drafts[s.activeDraftId!]; };

function renderSheet(onClose = jest.fn()) {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DoctorSheet open onClose={onClose} /></QueryClientProvider>);
    return onClose;
}

beforeEach(() => {
    jest.clearAllMocks();
    (doctorsApi.search as jest.Mock).mockResolvedValue([mehta, rao]);
});

describe('DoctorSheet', () => {
    it('searches by name or registration number (limit 50, 300ms debounce)', async () => {
        seed();
        renderSheet();
        expect(await screen.findByText('Dr. Mehta')).toBeInTheDocument();
        expect(doctorsApi.search).toHaveBeenCalledWith('outlet-1', undefined, 50);
        fireEvent.change(screen.getByLabelText('Find doctor'), { target: { value: 'MH12' } });
        await waitFor(() => expect(doctorsApi.search).toHaveBeenLastCalledWith('outlet-1', 'MH12', 50));
    });

    it('rows are at least 56px tall with reg no., specialty and hospital', async () => {
        seed();
        renderSheet();
        const row = (await screen.findByText('Dr. Mehta')).closest('button')!;
        expect(row).toHaveClass('min-h-14');
        expect(row).toHaveTextContent('MH123');
        expect(row).toHaveTextContent('Cardiology · City Hospital');
    });

    it('choosing a doctor puts it on the bill and closes', async () => {
        seed();
        const onClose = renderSheet();
        fireEvent.click((await screen.findByText('Dr. Rao')).closest('button')!);
        expect(active().doctor).toMatchObject({ id: 'd2', name: 'Dr. Rao', regNo: 'KA456' });
        expect(onClose).toHaveBeenCalled();
    });

    it('shows the selected doctor and Clear removes it', () => {
        seed({ doctor: mehta });
        renderSheet();
        const card = screen.getByRole('region', { name: 'Selected doctor' });
        expect(card).toHaveTextContent('Dr. Mehta');
        expect(card).toHaveTextContent('Reg. no. MH123');
        fireEvent.click(within(card).getByRole('button', { name: /Clear/ }));
        expect(active().doctor).toBeNull();
    });

    it('Add new doctor opens the form with the typed name; the saved doctor is selected', async () => {
        (doctorsApi.search as jest.Mock).mockResolvedValue([]);
        seed();
        const onClose = renderSheet();
        fireEvent.change(screen.getByLabelText('Find doctor'), { target: { value: 'Dr. New' } });
        expect(await screen.findByText(/No doctor found for/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Add new doctor/ }));
        expect(screen.getByTestId('popup-name')).toHaveTextContent('Dr. New');
        fireEvent.click(screen.getByText('mock save'));
        expect(active().doctor).toMatchObject({ id: 'd-new', regNo: 'REG-NEW' });
        expect(onClose).toHaveBeenCalled();
    });

    it('cancelling the form goes back to the sheet', async () => {
        seed();
        renderSheet();
        await screen.findByText('Dr. Mehta');
        fireEvent.click(screen.getByRole('button', { name: /Add new doctor/ }));
        fireEvent.click(screen.getByText('mock cancel'));
        expect(screen.getByText('Prescribing doctor')).toBeInTheDocument();
        expect(active().doctor).toBeNull();
    });
});
