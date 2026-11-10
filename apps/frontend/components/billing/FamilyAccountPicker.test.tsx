import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { LedgerPicker } from './LedgerPicker';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'test-outlet-id' }));

const family = {
    id: 'fam-ledger', name: 'Sharma Family Account', phone: '9876543210', groupName: 'Sundry Debtors', currentBalance: 1200,
    linkedCustomerId: 'fam-customer', isFamilyAccount: true,
    familyMembers: [
        { id: 'm1', name: 'Rahul', relationship: 'Father', gender: 'M', age: 45 },
        { id: 'm2', name: 'Priya', relationship: 'Mother', gender: 'F', age: 42 },
        { id: 'm3', name: 'Rohan', relationship: 'Son', gender: 'M', age: 12 },
    ],
};
const solo = { id: 'solo', name: 'Solo Customer', phone: '9000000000', groupName: 'Sundry Debtors', isFamilyAccount: false, familyMembers: [] };

const DATA = [family, solo];      // stable identity, like react-query's cached data
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: DATA, isFetching: false }) }));

const open = (props: Record<string, unknown>) => {
    const onSelect = jest.fn();
    render(<LedgerPicker currentLedger={null} icon={null} onSelect={onSelect} defaultGroupName="Sundry Debtors" placeholder="Search Customer..." {...props} />);
    fireEvent.focus(screen.getByPlaceholderText('Search Customer...'));
    return onSelect;
};

describe('family accounts in the customer picker', () => {
    it('lists one row per person with age, gender, relationship and the shared account', () => {
        open({ expandFamilyMembers: true });
        expect(screen.getByText(/Rahul/)).toBeInTheDocument();
        expect(screen.getByText(/Priya/)).toBeInTheDocument();
        expect(screen.getByText(/Rohan/)).toBeInTheDocument();
        expect(screen.getByText(/12y · M · Son/)).toBeInTheDocument();
        expect(screen.getAllByText(/Sharma Family Account/).length).toBe(3);      // each row names the shared account
        expect(screen.getByText('Solo Customer')).toBeInTheDocument();           // ordinary customers are unchanged
    });

    it('choosing a person hands back the shared ledger AND that person', () => {
        const onSelect = open({ expandFamilyMembers: true });
        fireEvent.pointerDown(screen.getByText(/Priya/));
        expect(onSelect).toHaveBeenCalledWith(family, family.familyMembers[1]);
    });

    it('an ordinary customer is still selected with the ledger alone (one argument)', () => {
        const onSelect = open({ expandFamilyMembers: true });
        fireEvent.pointerDown(screen.getByText('Solo Customer'));
        expect(onSelect).toHaveBeenCalledWith(solo);
    });

    it('other screens that do not ask for it still see the family as a single ledger', () => {
        open({});
        expect(screen.getByText('Sharma Family Account')).toBeInTheDocument();
        expect(screen.queryByText('Priya')).not.toBeInTheDocument();          // no row per person (the "Family: …" hint on the ledger row is fine)
    });

    it('keyboard: ArrowDown + Enter picks the second person', () => {
        const onSelect = open({ expandFamilyMembers: true });
        const input = screen.getByPlaceholderText('Search Customer...');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(family, family.familyMembers[1]);
    });
});
