import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const get = jest.fn();
const post = jest.fn();
jest.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import { FamilyFields, FamilyFormValues } from './FamilyFields';
import { FamilyBadge } from './FamilyBadge';
import { CustomerLookup } from './CustomerLookup';
import { buildCustomerPayload } from '@/utils/payloadBuilders';

const blank: FamilyFormValues = { gender: '', relationship: '', isFamilyAccount: false, accountHolderId: '', accountHolderName: '', accountMode: 'own' };
beforeEach(() => { get.mockReset(); post.mockReset(); });

describe('Account choice in the new customer form', () => {
    it('offers three plain choices and starts on "Own account"', () => {
        render(<FamilyFields values={blank} onPatch={jest.fn()} outletId="o1" isEditing={false} />);
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(3);
        expect(screen.getByRole('radio', { name: /Own account/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.queryByLabelText('Search the account owner')).not.toBeInTheDocument();
    });

    it('choosing "Under another customer\'s account" reveals a search of ALL customers (not just special family records)', async () => {
        const onPatch = jest.fn();
        const { rerender } = render(<FamilyFields values={blank} onPatch={onPatch} outletId="o1" isEditing={false} />);
        fireEvent.click(screen.getByRole('radio', { name: /Under another customer/ }));
        expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ accountMode: 'join', isFamilyAccount: false }));
        rerender(<FamilyFields values={{ ...blank, accountMode: 'join' }} onPatch={onPatch} outletId="o1" isEditing={false} />);

        get.mockResolvedValue({ data: [{ id: 'c9', name: 'Prasad Panvalkar', phone: '9000000014', memberCount: 0, isFamilyAccount: false, outstanding: 0 }] });
        fireEvent.change(screen.getByLabelText('Search the account owner'), { target: { value: 'prasa' } });
        fireEvent.click(await screen.findByText('Prasad Panvalkar'));
        expect(get).toHaveBeenCalledWith('/customers/search/', { params: { outletId: 'o1', q: 'prasa', accountOwners: 1 } });
        expect(onPatch).toHaveBeenLastCalledWith({ accountHolderId: 'c9', accountHolderName: 'Prasad Panvalkar' });
    });

    it('turns browser autofill off on the search box (its saved-address popup covered the results)', () => {
        render(<FamilyFields values={{ ...blank, accountMode: 'join' }} onPatch={jest.fn()} outletId="o1" isEditing={false} />);
        expect(screen.getByLabelText('Search the account owner')).toHaveAttribute('autocomplete', 'off');
    });

    it('says what will happen once an owner is chosen', () => {
        render(<FamilyFields values={{ ...blank, accountMode: 'join', accountHolderId: 'c9', accountHolderName: 'Prasad Panvalkar' }} onPatch={jest.fn()} outletId="o1" personName="Pradip Seth" isEditing={false} />);
        expect(screen.getByText('Pradip Seth')).toBeInTheDocument();
        expect(screen.getByText(/Prasad Panvalkar/, { selector: 'b' })).toBeInTheDocument();
        expect(screen.getByText(/Relationship to Prasad Panvalkar/)).toBeInTheDocument();
    });

    it('a search with no match explains what to do next instead of showing nothing', async () => {
        get.mockResolvedValue({ data: [] });
        render(<CustomerLookup outletId="o1" mode="owners" onPick={jest.fn()} />);
        fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'zzzz' } });
        expect(await screen.findByText(/No customer found/)).toBeInTheDocument();
        expect(screen.getByText(/Own account/)).toBeInTheDocument();
    });

    it('"Shared family account" hides the person-only fields', () => {
        render(<FamilyFields values={{ ...blank, accountMode: 'shared', isFamilyAccount: true }} onPatch={jest.fn()} outletId="o1" isEditing={false} />);
        expect(screen.queryByLabelText('Gender')).not.toBeInTheDocument();
    });

    it('when editing, joining is left to the customer page (it checks balances)', () => {
        render(<FamilyFields values={blank} onPatch={jest.fn()} outletId="o1" isEditing />);
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(screen.getByText(/Family card/)).toBeInTheDocument();
    });

    it('the create payload carries the family choices', () => {
        const form = { name: ' Meera ', phone: '9876543210', address: '', state: 'Maharashtra', dob: '', gstin: '', isChronic: false, creditLimit: '0', fixedDiscount: '0',
                       dlNo20b: '', dlNo21b: '', dlExpiry: '', gender: 'F', relationship: 'Daughter', isFamilyAccount: false, accountHolderId: 'c9', accountMode: 'join' };
        const p = buildCustomerPayload('o1', form, () => null);
        expect(p).toMatchObject({ name: 'Meera', gender: 'F', relationship: 'Daughter', accountHolderId: 'c9' });
        expect(p.isFamilyAccount).toBeUndefined();
    });
});

describe('FamilyBadge', () => {
    it('counts the owner among the people, and labels members; nothing for everyone else', () => {
        const { container, rerender } = render(<FamilyBadge isFamilyAccount memberCount={2} />);
        expect(screen.getByText(/Family · 3 people/)).toBeInTheDocument();                   // owner + 2 members
        rerender(<FamilyBadge isFamilyAccount isSharedAccountRecord memberCount={3} />);
        expect(screen.getByText(/Family · 3 people/)).toBeInTheDocument();                   // a shared record is nobody
        rerender(<FamilyBadge isFamilyMember relationship="Mother" accountName="Rahul" />);
        expect(screen.getByText(/Mother · Rahul/)).toBeInTheDocument();
        rerender(<FamilyBadge />);
        expect(container).toBeEmptyDOMElement();
    });
});
