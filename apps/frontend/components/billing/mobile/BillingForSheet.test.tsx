import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BillingForSheet, billingForState } from './BillingForSheet';
import { useBillingStore } from '@/store/billingStore';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/components/billing/AddFamilyMemberDialog', () => ({
    AddFamilyMemberDialog: ({ open, ownerId, ownerName, onAdded, onClose }: any) => open ? (
        <div role="dialog" aria-label="Add family popup">
            <span data-testid="owner">{ownerId}|{ownerName}</span>
            <button onClick={() => onAdded({ id: 'm-new', name: 'Rohan Sharma', relationship: 'Son' })}>mock add</button>
            <button onClick={onClose}>mock cancel</button>
        </div>
    ) : null,
}));

const owner = { id: 'c1', name: 'Rahul Sharma', phone: '9876543210', isAccountHolder: true };
const priya = { id: 'm1', name: 'Priya Sharma', relationship: 'Wife', age: 38, phone: '9876543211' };
const family = (extra: Record<string, unknown> = {}) => ({
    id: 'l1', name: 'Rahul Sharma (9876543210)', phone: '9876543210', groupName: 'Sundry Debtors', currentBalance: 1200, linkedCustomerId: 'c1',
    isFamilyAccount: true, familyMembers: [owner, priya], ...extra,
}) as any;

function seed(updates: Record<string, unknown> = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates } as any } }));
    return id;
}
const active = () => { const s = useBillingStore.getState(); return s.drafts[s.activeDraftId!]; };

describe('BillingForSheet', () => {
    it('lists Self and each member as large radio rows with Self selected by default', () => {
        seed({ customerLedger: family() });
        render(<BillingForSheet open onClose={jest.fn()} />);
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(2);
        expect(radios[0]).toHaveTextContent('Rahul Sharma');
        expect(radios[0]).toHaveTextContent('Self');
        expect(radios[0]).toHaveAttribute('aria-checked', 'true');
        expect(radios[1]).toHaveTextContent('Priya Sharma');
        expect(radios[1]).toHaveTextContent('Wife');
        expect(radios[1]).toHaveTextContent('38 yrs');
        expect(radios[1]).toHaveAttribute('aria-checked', 'false');
        for (const r of radios) expect(r).toHaveClass('min-h-14');
        expect(screen.getByTestId('billing-for')).toBeInTheDocument();
    });

    it('picking a member bills the ONE account and names the person: customer and ledger stay put, patient = member', () => {
        const onClose = jest.fn();
        seed({ customerLedger: family(), customer: { id: 'c1', name: 'Rahul Sharma', creditLimit: 5000 } });
        render(<BillingForSheet open onClose={onClose} />);
        fireEvent.click(screen.getByRole('radio', { name: /Priya Sharma/ }));
        const d = active();
        expect(d.patient).toMatchObject({ id: 'm1', name: 'Priya Sharma' });
        expect(d.customerLedger?.id).toBe('l1');                            // money stays on the account owner's ledger
        expect(d.customer?.id).toBe('c1');
        expect(onClose).toHaveBeenCalled();
    });

    it('picking Self clears the patient (empty = the owner)', () => {
        seed({ customerLedger: family(), patient: priya });
        render(<BillingForSheet open onClose={jest.fn()} />);
        expect(screen.getByRole('radio', { name: /Priya Sharma/ })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('radio', { name: /Rahul Sharma/ }));
        expect(active().patient).toBeNull();
    });

    it('shows the shared Due / Limit and family size once, with the family-account-money test id', () => {
        seed({ customerLedger: family(), customer: { id: 'c1', name: 'Rahul', creditLimit: 5000 } });
        render(<BillingForSheet open onClose={jest.fn()} />);
        const money = screen.getByTestId('family-account-money');
        expect(money).toHaveTextContent('Family · 2 people');
        expect(within(money).getByText('Shared due ₹1,200')).toHaveClass('text-red-800');
        expect(money).toHaveTextContent('Shared limit ₹5,000');
    });

    it('a purely shared family record has no Self: amber "Select who this bill is for"', () => {
        seed({ customerLedger: family({ familyMembers: [priya, { id: 'm2', name: 'Rohan Sharma', relationship: 'Son' }] }) });
        render(<BillingForSheet open onClose={jest.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Select who this bill is for');
        expect(screen.getAllByRole('radio')).toHaveLength(2);
        for (const r of screen.getAllByRole('radio')) expect(r).toHaveAttribute('aria-checked', 'false');
        expect(screen.queryByText('Self')).not.toBeInTheDocument();
    });

    it('Add family member opens the popup for THIS account; the new person is added to the account and selected', () => {
        const onClose = jest.fn();
        seed({ customerLedger: family({ isFamilyAccount: false, familyMembers: [] }) });
        render(<BillingForSheet open onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Add family member/ }));
        expect(screen.getByTestId('owner')).toHaveTextContent('c1|Rahul Sharma');
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();                // sheet steps aside for the popup
        fireEvent.click(screen.getByText('mock add'));
        const d = active();
        expect(d.patient).toMatchObject({ id: 'm-new', name: 'Rohan Sharma' });
        expect(d.customerLedger?.isFamilyAccount).toBe(true);
        expect(d.customerLedger?.familyMembers?.map((m) => m.name)).toEqual(['Rahul Sharma', 'Rohan Sharma']);   // owner is listed too
        expect(d.customerLedger?.id).toBe('l1');
        expect(onClose).toHaveBeenCalled();
    });

    it('is read-only (no radios, no Add) while a saved bill is edited or repeated', () => {
        seed({ customerLedger: { id: 'mock', name: 'Rahul', isMock: true }, patient: { id: 'm1', name: 'Priya Sharma' } });
        render(<BillingForSheet open onClose={jest.fn()} />);
        expect(screen.getByTestId('billing-for')).toHaveTextContent('Priya Sharma');
        expect(screen.getByTestId('billing-for')).toHaveTextContent('Fixed while you edit or repeat');
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add family member/ })).not.toBeInTheDocument();
    });

    it('with no customer it asks to pick one first', () => {
        seed();
        render(<BillingForSheet open onClose={jest.fn()} />);
        expect(screen.getByTestId('billing-for')).toHaveTextContent('Select a customer first');
    });

    it('billingForState: owner is Self; a member is selected only when it is not the owner', () => {
        const l = family();
        expect(billingForState(l, null).selected?.isAccountHolder).toBe(true);
        expect(billingForState(l, priya).selected?.id).toBe('m1');
        expect(billingForState(l, { id: 'c1', name: 'Rahul' }).selected?.isAccountHolder).toBe(true);
    });
});
