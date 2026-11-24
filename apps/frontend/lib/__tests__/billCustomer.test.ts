let uuidCounter = 0;
jest.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }));

import { billCustomerFromLedger, ledgerAfterCustomerEdit, ledgerHasCustomer } from '@/lib/billCustomer';
import { customerBody } from '@/lib/apiClient';
import { useBillingStore } from '@/store/billingStore';
import type { Ledger } from '@/types';

const ledger = (over: Partial<Ledger> = {}): Ledger => ({
    id: 'led-1', name: 'ABDUL SALAM (8888853110)', groupId: 'g', groupName: 'Sundry Debtors', nature: 'asset', openingBalance: 0,
    balanceType: 'Dr', currentBalance: 450, phone: '8888853110', address: 'SAVERA PARK, CSN, 431001', gstin: '', linkedCustomerId: 'cust-1',
    isFamilyAccount: true, familyMembers: [
        { id: 'cust-1', name: 'ABDUL SALAM', phone: '8888853110', isAccountHolder: true },
        { id: 'cust-2', name: 'Sana', phone: '8888853110', relationship: 'Daughter' },
    ],
    ...over,
} as unknown as Ledger);

const saved = {
    id: 'cust-1', name: 'Abdul Salam Khan', phone: '9123456780', address: 'New Colony, CSN', gstin: '27AABCA1234A1Z5',
    creditLimit: 5000, dlNo20b: 'MH-20B-1', dlNo21b: null, dlExpiry: '2028-03-31', customerType: 'WHOLESALE', stateCode: '27',
    ledgerName: 'Abdul Salam Khan (9123456780)',
};

describe('the customer on a bill after an edit', () => {
    it('shows what the server saved, on the same ledger', () => {
        const after = ledgerAfterCustomerEdit(ledger(), saved);
        expect(after).toMatchObject({
            id: 'led-1', currentBalance: 450,                                    // same account, same money
            name: 'Abdul Salam Khan (9123456780)', phone: '9123456780', address: 'New Colony, CSN', gstin: '27AABCA1234A1Z5',
            creditLimit: 5000, dlNo20b: 'MH-20B-1', dlExpiry: '2028-03-31',
        });
        expect(after.familyMembers?.[0]).toMatchObject({ id: 'cust-1', name: 'Abdul Salam Khan', phone: '9123456780', isAccountHolder: true });
        expect(billCustomerFromLedger(after)).toMatchObject({ id: 'cust-1', name: 'Abdul Salam Khan (9123456780)', phone: '9123456780', address: 'New Colony, CSN' });
    });

    it('changes only that person when a family member was edited', () => {
        const after = ledgerAfterCustomerEdit(ledger(), { id: 'cust-2', name: 'Sana Khan', phone: '9000000009' });
        expect(after).toMatchObject({ name: 'ABDUL SALAM (8888853110)', phone: '8888853110', address: 'SAVERA PARK, CSN, 431001' });
        expect(after.familyMembers?.[1]).toMatchObject({ id: 'cust-2', name: 'Sana Khan', phone: '9000000009', relationship: 'Daughter' });
    });

    it('knows which ledgers carry a person', () => {
        expect(ledgerHasCustomer(ledger(), 'cust-1')).toBe(true);
        expect(ledgerHasCustomer(ledger(), 'cust-2')).toBe(true);
        expect(ledgerHasCustomer(ledger(), 'someone-else')).toBe(false);
        expect(ledgerHasCustomer(null, 'cust-1')).toBe(false);
    });
});

describe('billingStore.applyCustomerEdit', () => {
    beforeEach(() => useBillingStore.getState().resetBilling());

    it('refreshes every open bill for that customer and keeps who the bill is for', () => {
        const store = useBillingStore.getState();
        const first = store.createDraft();
        store.switchDraft(first);
        store.setCustomerLedger(ledger());
        store.setCustomer(billCustomerFromLedger(ledger()));
        store.setPatient({ id: 'cust-2', name: 'Sana', relationship: 'Daughter' });
        const second = store.createDraft();
        store.switchDraft(second);
        store.setCustomerLedger(ledger());
        const other = store.createDraft();
        store.switchDraft(other);
        store.setCustomerLedger(ledger({ id: 'led-9', name: 'Someone Else (9000000000)', linkedCustomerId: 'cust-9', familyMembers: [] }));

        useBillingStore.getState().applyCustomerEdit(saved);

        const drafts = useBillingStore.getState().drafts;
        expect(drafts[first].customerLedger).toMatchObject({ name: 'Abdul Salam Khan (9123456780)', address: 'New Colony, CSN' });
        expect(drafts[first].customer).toMatchObject({ id: 'cust-1', phone: '9123456780', gstin: '27AABCA1234A1Z5' });
        expect(drafts[first].patient).toMatchObject({ id: 'cust-2', name: 'Sana' });          // not dropped: nobody picked a different customer
        expect(drafts[second].customerLedger?.name).toBe('Abdul Salam Khan (9123456780)');
        expect(drafts[other].customerLedger?.name).toBe('Someone Else (9000000000)');         // another customer's bill is untouched
    });
});

describe('customerBody (what create / update send)', () => {
    it('sends every field the form built: nothing is dropped on the way', () => {
        const body = customerBody({
            outletId: 'o1', name: 'A', phone: '9000000001', address: 'Road', state: 'Gujarat', dob: '1980-05-17', gstin: '24AABCA1234A1Z5',
            isChronic: true, creditLimit: 500, fixedDiscount: 5, dlNo20b: 'GJ-1', dlNo21b: 'GJ-2', dlExpiry: '2028-03-31', gender: 'male', relationship: 'Son',
        });
        expect(body).toEqual({
            outletId: 'o1', name: 'A', phone: '9000000001', address: 'Road', state: 'Gujarat', dob: '1980-05-17', gstin: '24AABCA1234A1Z5',
            isChronic: true, creditLimit: 500, fixedDiscount: 5, dlNo20b: 'GJ-1', dlNo21b: 'GJ-2', dlExpiry: '2028-03-31', gender: 'male', relationship: 'Son',
        });
    });

    it('clears a field the form emptied, and leaves alone a field that was never passed', () => {
        const body = customerBody({ outletId: 'o1', name: 'A', gstin: undefined, dlNo20b: undefined });
        expect(body).toEqual({ outletId: 'o1', name: 'A', gstin: null, dlNo20b: null });
        expect('phone' in body).toBe(false);
        expect('creditLimit' in body).toBe(false);
    });

    it('passes the family choices only when a customer is created', () => {
        const payload = { outletId: 'o1', name: 'A', accountHolderId: 'owner-1', isFamilyAccount: undefined };
        expect(customerBody(payload)).toEqual({ outletId: 'o1', name: 'A' });
        expect(customerBody(payload, ['name', 'accountHolderId', 'isFamilyAccount'])).toEqual({ outletId: 'o1', name: 'A', accountHolderId: 'owner-1', isFamilyAccount: null });
    });
});
