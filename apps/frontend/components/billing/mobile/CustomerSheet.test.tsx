import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerSheet } from './CustomerSheet';
import { useBillingStore } from '@/store/billingStore';
import { voucherApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, voucherApi: { ...actual.voucherApi, getLedgers: jest.fn() } };
});
// The real popup is tested on its own; here only how the sheet hands it a query and takes the new customer back
jest.mock('@/components/billing/NewCustomerModal', () => ({
    NewCustomerModal: ({ open, initialQuery, onCreated, onClose }: any) => open ? (
        <div role="dialog" aria-label="New customer popup">
            <span data-testid="popup-query">{initialQuery}</span>
            <button onClick={() => onCreated({ id: 'new-l', name: 'Neha Verma', phone: '9123456789', linkedCustomerId: 'new-c', currentBalance: 0 })}>mock create</button>
            <button onClick={onClose}>mock cancel</button>
        </div>
    ) : null,
}));

const rahul = { id: 'l1', name: 'Rahul Sharma (9876543210)', groupName: 'Sundry Debtors', phone: '9876543210', address: '12 MG Road', gstin: '27ABCDE1234F1Z5', currentBalance: 1200, linkedCustomerId: 'c1', creditLimit: 5000 } as any;
const family = {
    id: 'l2', name: 'Verma Family', groupName: 'Sundry Debtors', phone: '9000000001', currentBalance: 0, linkedCustomerId: 'c2', isFamilyAccount: true,
    familyMembers: [{ id: 'c2', name: 'Anil Verma', isAccountHolder: true }, { id: 'm1', name: 'Priya Verma', relationship: 'Wife', phone: '9000000002' }],
} as any;

function seed(updates: Record<string, unknown> = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates } as any } }));
}
const active = () => { const s = useBillingStore.getState(); return s.drafts[s.activeDraftId!]; };

function renderSheet(onClose = jest.fn()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CustomerSheet open onClose={onClose} /></QueryClientProvider>);
    return onClose;
}

beforeEach(() => {
    jest.clearAllMocks();
    (voucherApi.getLedgers as jest.Mock).mockResolvedValue([rahul, family]);
});

describe('CustomerSheet: search', () => {
    it('searches Sundry Debtors with limit 50 and, after the 300ms debounce, the typed text', async () => {
        seed();
        renderSheet();
        expect(await screen.findByText('Rahul Sharma')).toBeInTheDocument();
        expect(voucherApi.getLedgers).toHaveBeenCalledWith('outlet-1', { group: 'Sundry Debtors', search: undefined, limit: 50 });

        fireEvent.change(screen.getByLabelText('Find customer'), { target: { value: 'rah' } });
        await waitFor(() => expect(voucherApi.getLedgers).toHaveBeenLastCalledWith('outlet-1', { group: 'Sundry Debtors', search: 'rah', limit: 50 }));
    });

    it('result rows are at least 56px tall and show the mobile once (not twice in the name)', async () => {
        seed();
        renderSheet();
        const row = (await screen.findByText('Rahul Sharma')).closest('button')!;
        expect(row).toHaveClass('min-h-14');
        expect(within(row).getByText('9876543210')).toBeInTheDocument();
    });

    it('the mobile search box uses a search keyboard and a visible label', () => {
        seed();
        renderSheet();
        const box = screen.getByLabelText('Find customer');
        expect(box).toHaveAttribute('inputmode', 'search');
        expect(box).toHaveClass('h-12');
    });

    it('choosing a customer copies the record onto the bill, clears the person (Self) and closes', async () => {
        seed({ patient: { id: 'm9', name: 'Old person' }, walkInName: 'Ramesh' });
        const onClose = renderSheet();
        fireEvent.click((await screen.findByText('Rahul Sharma')).closest('button')!);
        const d = active();
        expect(d.customerLedger?.id).toBe('l1');
        expect(d.customer).toMatchObject({ id: 'c1', name: 'Rahul Sharma (9876543210)', phone: '9876543210', address: '12 MG Road', gstin: '27ABCDE1234F1Z5', creditLimit: 5000 });
        expect(d.patient).toBeNull();
        expect(d.walkInName).toBeNull();
        expect(onClose).toHaveBeenCalled();
    });

    it('a family found by a member\'s name preselects that person (retail)', async () => {
        seed();
        renderSheet();
        fireEvent.change(screen.getByLabelText('Find customer'), { target: { value: 'priya' } });
        fireEvent.click((await screen.findByText('Verma Family')).closest('button')!);
        expect(active().customerLedger?.id).toBe('l2');
        expect(active().patient).toMatchObject({ id: 'm1', name: 'Priya Verma' });
    });

    it('wholesale never records a family person, even when searching by a member\'s name', async () => {
        seed({ saleType: 'WHOLESALE' });
        renderSheet();
        fireEvent.change(screen.getByLabelText('Find customer'), { target: { value: 'priya' } });
        fireEvent.click((await screen.findByText('Verma Family')).closest('button')!);
        expect(active().patient).toBeNull();
    });
});

describe('CustomerSheet: retail vs wholesale actions', () => {
    it('retail offers Counter bill (and no name-only option); wholesale offers neither', () => {
        seed();
        const { unmount } = render(<QueryClientProvider client={new QueryClient()}><CustomerSheet open onClose={jest.fn()} /></QueryClientProvider>);
        expect(screen.getByTestId('counter-bill')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Non-valued customer/ })).not.toBeInTheDocument();   // a bill is a Counter bill or a customer bill
        unmount();

        seed({ saleType: 'WHOLESALE' });
        render(<QueryClientProvider client={new QueryClient()}><CustomerSheet open onClose={jest.fn()} /></QueryClientProvider>);
        expect(screen.queryByTestId('counter-bill')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Non-valued customer/ })).not.toBeInTheDocument();
    });

    it('Counter bill clears customer, person and name, then closes', () => {
        seed({ customer: { id: 'c1', name: 'Rahul' }, customerLedger: rahul, patient: { id: 'm1', name: 'Priya' } });
        const onClose = renderSheet();
        fireEvent.click(screen.getByTestId('counter-bill'));
        const d = active();
        expect(d.customer).toBeNull();
        expect(d.customerLedger).toBeNull();
        expect(d.patient).toBeNull();
        expect(d.walkInName).toBeNull();
        expect(onClose).toHaveBeenCalled();
    });

    it('a walk-in name is shown as the walk-in chip with a Change button that removes it', () => {
        seed({ walkInName: 'Ramesh Patel' });
        renderSheet();
        const chip = screen.getByTestId('walk-in-chip');
        expect(chip).toHaveTextContent('Ramesh Patel');
        expect(chip).toHaveTextContent('no mobile number');
        fireEvent.click(within(chip).getByRole('button', { name: 'Remove walk-in customer' }));
        expect(active().walkInName).toBeNull();
        expect(screen.queryByTestId('walk-in-chip')).not.toBeInTheDocument();
    });
});

describe('CustomerSheet: add new customer', () => {
    it('no match: the prompt offers Add new customer pre-filled with what was typed; the new customer lands on the bill', async () => {
        (voucherApi.getLedgers as jest.Mock).mockResolvedValue([]);
        seed();
        const onClose = renderSheet();
        fireEvent.change(screen.getByLabelText('Find customer'), { target: { value: '9123456789' } });
        const prompt = await screen.findByTestId('add-new-customer-prompt');
        expect(screen.getByText(/No customer found for/)).toBeInTheDocument();
        fireEvent.click(prompt);

        expect(screen.getByTestId('popup-query')).toHaveTextContent('9123456789');
        expect(screen.queryByText('Customer', { selector: 'h2' })).not.toBeInTheDocument();      // the sheet steps aside for the popup
        fireEvent.click(screen.getByText('mock create'));
        expect(active().customerLedger?.id).toBe('new-l');
        expect(active().customer).toMatchObject({ id: 'new-c', name: 'Neha Verma', phone: '9123456789' });
        expect(onClose).toHaveBeenCalled();
    });

    it('cancelling the popup returns to the sheet with the bill unchanged', async () => {
        seed();
        renderSheet();
        await screen.findByText('Rahul Sharma');
        fireEvent.click(screen.getByRole('button', { name: /Add new customer/ }));
        fireEvent.click(screen.getByText('mock cancel'));
        expect(screen.getByText('Customer', { selector: 'h2' })).toBeInTheDocument();
        expect(active().customerLedger).toBeNull();
    });
});

describe('CustomerSheet: selected customer detail', () => {
    it('retail: phone, address, GSTIN, red Due and Limit', () => {
        seed({ customerLedger: rahul, customer: { id: 'c1', name: 'Rahul', creditLimit: 5000 } });
        renderSheet();
        const detail = screen.getByRole('region', { name: 'Selected customer' });
        expect(detail).toHaveTextContent('Rahul Sharma');
        expect(detail).toHaveTextContent('9876543210');
        expect(detail).toHaveTextContent('12 MG Road');
        expect(detail).toHaveTextContent('GSTIN 27ABCDE1234F1Z5');
        expect(within(detail).getByText('Due ₹1,200')).toHaveClass('text-red-800');
        expect(within(detail).getByText('Limit ₹5,000')).toBeInTheDocument();
    });

    it('wholesale: DL no., Limit and Out instead of Due', () => {
        seed({ saleType: 'WHOLESALE', customerLedger: rahul, customer: { id: 'c1', name: 'Shree Medicals', dlNo21b: 'DL-21B-9', creditLimit: 20000, outstanding: 3000 } });
        renderSheet();
        const detail = screen.getByRole('region', { name: 'Selected customer' });
        expect(within(detail).getByText('DL DL-21B-9')).toBeInTheDocument();
        expect(within(detail).getByText('Limit ₹20,000')).toBeInTheDocument();
        expect(within(detail).getByText('Out ₹3,000')).toHaveClass('text-red-800');
        expect(within(detail).queryByText(/Due/)).not.toBeInTheDocument();
    });
});
