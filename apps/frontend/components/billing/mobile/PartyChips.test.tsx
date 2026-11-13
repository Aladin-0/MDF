import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartyChips, scheduleHDetailsMissing } from './PartyChips';
import { useBillingStore } from '@/store/billingStore';
import { useSettingsStore } from '@/store/settingsStore';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return {
        ...actual,
        voucherApi: { ...actual.voucherApi, getLedgers: jest.fn().mockResolvedValue([]) },
        doctorsApi: { ...actual.doctorsApi, search: jest.fn().mockResolvedValue([]) },
    };
});

const ledger = (extra: Record<string, unknown> = {}) => ({
    id: 'l1', name: 'Rahul Sharma (9876543210)', groupName: 'Sundry Debtors', phone: '9876543210', address: '12 MG Road',
    currentBalance: 1200, linkedCustomerId: 'c1', ...extra,
}) as any;

const controlledLine = { batchId: 'b1', productId: 'p1', scheduleType: 'H', rate: 100, mrp: 100, totalQty: 1, totalAmount: 100 } as any;

function seed(updates: Record<string, unknown> = {}, cart: any[] = []) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates, cart } as any } }));
}

function renderChips() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><PartyChips /></QueryClientProvider>);
}

beforeEach(() => {
    useSettingsStore.setState({ enableEwayBill: false } as any);
});

describe('PartyChips: retail', () => {
    it('an empty retail bill: Walk-in customer, no Billing for chip, Doctor and More say "+ Add"', () => {
        seed();
        renderChips();
        expect(within(screen.getByTestId('chip-customer')).getByText(/Walk-in/)).toBeInTheDocument();
        expect(within(screen.getByTestId('chip-customer')).getByText('+ Add')).toBeInTheDocument();
        expect(screen.queryByTestId('chip-billing-for')).not.toBeInTheDocument();       // needs a customer record first
        expect(within(screen.getByTestId('chip-doctor')).getByText('+ Add')).toBeInTheDocument();
        expect(within(screen.getByTestId('chip-more')).getByText('+ Add')).toBeInTheDocument();
    });

    it('every chip is at least 44px tall and has a visible caption', () => {
        seed({ customerLedger: ledger() });
        renderChips();
        for (const id of ['chip-customer', 'chip-billing-for', 'chip-doctor', 'chip-more']) expect(screen.getByTestId(id)).toHaveClass('min-h-11');
        for (const caption of ['Customer', 'Billing for', 'Doctor', 'More']) expect(screen.getByText(caption)).toBeInTheDocument();
    });

    it('a customer with money owed shows red "Due" and a green "Limit" pill (like the desktop header)', () => {
        seed({ customerLedger: ledger({ currentBalance: 1200 }), customer: { id: 'c1', name: 'Rahul', creditLimit: 5000 } });
        renderChips();
        const chip = screen.getByTestId('chip-customer');
        expect(within(chip).getByText('Rahul Sharma')).toBeInTheDocument();             // "(mobile)" suffix is dropped
        expect(within(chip).getByText('Due ₹1,200')).toHaveClass('text-red-800');
        expect(within(chip).getByText('Limit ₹5,000')).toHaveClass('text-emerald-800');
    });

    it('no pills when nothing is owed and there is no credit limit', () => {
        seed({ customerLedger: ledger({ currentBalance: 0 }), customer: { id: 'c1', name: 'Rahul', creditLimit: 0 } });
        renderChips();
        expect(screen.queryByText(/Due/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Limit/)).not.toBeInTheDocument();
    });

    it('a non-valued customer shows the typed name tagged Walk-in', () => {
        seed({ walkInName: 'Ramesh Patel' });
        renderChips();
        expect(screen.getByTestId('chip-customer')).toHaveTextContent('Ramesh Patel');
        expect(screen.getByTestId('chip-customer')).toHaveTextContent('Walk-in');
    });

    it('Billing for shows Self for an owner, the person for a family bill, and asks for a choice on a shared record', () => {
        seed({ customerLedger: ledger() });
        const { unmount } = renderChips();
        expect(within(screen.getByTestId('chip-billing-for')).getByText('Self')).toBeInTheDocument();
        unmount();

        seed({ customerLedger: ledger({ isFamilyAccount: true, familyMembers: [{ id: 'c1', name: 'Rahul', isAccountHolder: true }, { id: 'm1', name: 'Priya', relationship: 'Wife' }] }), patient: { id: 'm1', name: 'Priya', relationship: 'Wife' } });
        const second = renderChips();
        expect(within(screen.getByTestId('chip-billing-for')).getByText('Priya')).toBeInTheDocument();
        second.unmount();

        seed({ customerLedger: ledger({ isFamilyAccount: true, familyMembers: [{ id: 'm1', name: 'Priya' }, { id: 'm2', name: 'Rohan' }] }) });
        renderChips();
        const chip = screen.getByTestId('chip-billing-for');
        expect(within(chip).getByText('Select who')).toBeInTheDocument();
        expect(chip).toHaveClass('border-amber-500');                                   // amber, and the words say so too
    });

    it('while a saved bill is edited the Billing for chip is read-only (no button, no sheet)', () => {
        seed({ customerLedger: { id: 'mock', name: 'Rahul', isMock: true }, patient: { id: 'm1', name: 'Priya' } });
        renderChips();
        const chip = screen.getByTestId('billing-for');
        expect(chip.tagName).toBe('DIV');
        expect(chip).toHaveTextContent('Priya');
        fireEvent.click(chip);
        expect(screen.queryByText('Select who this bill is for')).not.toBeInTheDocument();
    });

    it('the doctor chip shows the doctor, and the red Schedule H dot only while the details are missing', () => {
        seed({ doctor: { id: 'd1', name: 'Dr. Mehta', regNo: 'MH123' } }, [controlledLine]);
        const { unmount } = renderChips();
        expect(within(screen.getByTestId('chip-doctor')).getByText('Dr. Mehta')).toBeInTheDocument();
        // doctor is set but there is no customer address: still missing
        expect(screen.getByTestId('schedule-h-dot')).toHaveTextContent('Sch. H');
        unmount();

        seed({ doctor: { id: 'd1', name: 'Dr. Mehta', regNo: 'MH123' }, customer: { id: 'c1', name: 'Rahul', address: '12 MG Road' } }, [controlledLine]);
        renderChips();
        expect(screen.queryByTestId('schedule-h-dot')).not.toBeInTheDocument();
    });

    it('no Schedule H dot when the cart has no controlled drug', () => {
        seed({}, [{ ...controlledLine, scheduleType: 'OTC' }]);
        renderChips();
        expect(screen.queryByTestId('schedule-h-dot')).not.toBeInTheDocument();
    });

    it('the Schedule H rule: complete Schedule H data is enough on its own', () => {
        const base: any = { cart: [controlledLine], customer: null, doctor: null, scheduleHData: null };
        expect(scheduleHDetailsMissing(base)).toBe(true);
        expect(scheduleHDetailsMissing({ ...base, scheduleHData: { patientName: 'A', patientAge: 3, patientAddress: 'x', doctorName: 'Dr', doctorRegNo: '1', prescriptionNo: '' } })).toBe(false);
        expect(scheduleHDetailsMissing({ ...base, cart: [{ ...controlledLine, scheduleType: 'G' }] })).toBe(true);    // G needs it too (the server says so)
    });

    it('the More chip summarises hospital, Rx number and photo', () => {
        seed({ hospitalName: 'City Hospital', prescriptionNo: '4411', prescriptionImageUrl: 'data:image/png;base64,AAA' });
        renderChips();
        expect(screen.getByTestId('chip-more')).toHaveTextContent('City Hospital · Rx 4411 · Photo');
    });

    it('tapping a chip opens its sheet', () => {
        seed();
        renderChips();
        fireEvent.click(screen.getByTestId('chip-more'));
        expect(screen.getByText('More details')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(screen.queryByText('More details')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('chip-doctor'));
        expect(screen.getByText('Prescribing doctor')).toBeInTheDocument();
    });
});

describe('PartyChips: wholesale', () => {
    it('has no Billing for or Doctor chip, and asks for a named customer', () => {
        seed({ saleType: 'WHOLESALE' });
        renderChips();
        expect(screen.queryByTestId('chip-billing-for')).not.toBeInTheDocument();
        expect(screen.queryByTestId('chip-doctor')).not.toBeInTheDocument();
        const chip = screen.getByTestId('chip-customer');
        expect(within(chip).getByText('+ Add customer')).toBeInTheDocument();
        expect(chip).toHaveClass('border-amber-500');
    });

    it('shows DL no., credit Limit and Out (red when owing) instead of Due', () => {
        seed({
            saleType: 'WHOLESALE',
            customerLedger: ledger({ currentBalance: 9999 }),
            customer: { id: 'c1', name: 'Shree Medicals', dlNo20b: 'MH-20B-77', creditLimit: 50000, outstanding: 12000 },
        });
        renderChips();
        const chip = screen.getByTestId('chip-customer');
        expect(within(chip).getByText('DL MH-20B-77')).toBeInTheDocument();
        expect(within(chip).getByText('Limit ₹50,000')).toBeInTheDocument();
        expect(within(chip).getByText('Out ₹12,000')).toHaveClass('text-red-800');
        expect(screen.queryByText(/Due/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('chip-billing-for')).not.toBeInTheDocument();       // even with a customer: one party only
    });

    it('More appears for e-way details only when the outlet setting is on (invoice mode keeps it for the date)', () => {
        seed({ saleType: 'WHOLESALE', documentMode: 'quotation' });
        const { unmount } = renderChips();
        expect(screen.queryByTestId('chip-more')).not.toBeInTheDocument();
        unmount();

        useSettingsStore.setState({ enableEwayBill: true } as any);
        seed({ saleType: 'WHOLESALE', documentMode: 'quotation', transporterId: '27ABCDE1234F1Z5', vehicleNo: 'MH01AB1234' });
        renderChips();
        expect(screen.getByTestId('chip-more')).toHaveTextContent('Transporter · MH01AB1234');
    });
});
