import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const get = jest.fn();
const post = jest.fn();
jest.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

import { FamilyAccountCard } from './FamilyAccountCard';

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const props = { customerId: 'c1', customerName: 'Rahul Sharma', customerPhone: '9876543210', outletId: 'o1' };
const respond = (data: unknown, extra?: (url: string) => unknown) => get.mockImplementation((url: string) => Promise.resolve({ data: extra?.(url) ?? data }));

beforeEach(() => { get.mockReset(); post.mockReset(); jest.requireMock('@/hooks/use-toast').toast.mockClear(); });

test('a customer with no family is offered "Add family member" first', async () => {
    respond({ accountId: 'c1', accountName: 'Rahul Sharma', isFamilyAccount: false, members: [{ id: 'c1', name: 'Rahul Sharma', isAccountHolder: false }] });
    wrap(<FamilyAccountCard {...props} />);
    expect(await screen.findByText('Add family member')).toBeInTheDocument();
    expect(screen.getByText('Bill under another customer')).toBeInTheDocument();
});

test('an owner lists everyone (no remove button on the owner) with age and relationship', async () => {
    respond({ accountId: 'c1', accountName: 'Rahul Sharma', isFamilyAccount: true, members: [
        { id: 'c1', name: 'Rahul Sharma', isAccountHolder: true, relationship: 'Account holder', age: 46 },
        { id: 'm1', name: 'Priya', relationship: 'Wife', gender: 'F', age: 42 }] });
    wrap(<FamilyAccountCard {...props} />);
    expect(await screen.findByText(/Priya/)).toBeInTheDocument();
    expect(screen.getByText(/42y · F · Wife/)).toBeInTheDocument();
    expect(screen.getByLabelText('Remove Priya')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove Rahul Sharma')).not.toBeInTheDocument();
});

test('a member sees whose account they bill under and has no add / join buttons', async () => {
    respond({ accountId: 'own1', accountName: 'Rahul Sharma', isFamilyAccount: true, members: [{ id: 'own1', name: 'Rahul Sharma', isAccountHolder: true }, { id: 'c1', name: 'Priya' }] });
    wrap(<FamilyAccountCard {...props} customerName="Priya" />);
    expect(await screen.findByText(/Bills under/)).toBeInTheDocument();
    expect(screen.queryByText('Add family member')).not.toBeInTheDocument();
});

test('removing a person takes them off the account', async () => {
    respond({ accountId: 'c1', accountName: 'Rahul Sharma', isFamilyAccount: true, members: [{ id: 'c1', name: 'Rahul Sharma', isAccountHolder: true }, { id: 'm1', name: 'Priya' }] });
    post.mockResolvedValue({ data: {} });
    wrap(<FamilyAccountCard {...props} />);
    fireEvent.click(await screen.findByLabelText('Remove Priya'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/customers/m1/account/', { outletId: 'o1', accountHolderId: null }));
});

test('"Bill under another customer" searches ALL customers and moves this person under the one chosen', async () => {
    respond(null, (url) => url.includes('/members/')
        ? { accountId: 'c1', accountName: 'Rahul Sharma', isFamilyAccount: false, members: [{ id: 'c1', name: 'Rahul Sharma' }] }
        : [{ id: 'p9', name: 'Prasad Panvalkar', phone: '9000000014', memberCount: 0, isFamilyAccount: false }]);
    post.mockResolvedValue({ data: {} });
    wrap(<FamilyAccountCard {...props} />);
    fireEvent.click(await screen.findByText('Bill under another customer'));
    fireEvent.change(screen.getByLabelText('Search the account owner'), { target: { value: 'prasa' } });
    fireEvent.click(await screen.findByText('Prasad Panvalkar'));
    fireEvent.click(screen.getByText(/Move under Prasad Panvalkar/));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/customers/c1/account/', { outletId: 'o1', accountHolderId: 'p9', relationship: '' }));
});

test('the server refusal is shown instead of failing silently', async () => {
    const { toast } = jest.requireMock('@/hooks/use-toast');
    respond(null, (url) => url.includes('/members/')
        ? { accountId: 'c1', accountName: 'Rahul Sharma', isFamilyAccount: false, members: [{ id: 'c1', name: 'Rahul Sharma' }] }
        : [{ id: 'p9', name: 'Prasad', phone: '9000000014', memberCount: 0 }]);
    post.mockRejectedValue({ response: { data: { detail: 'has an outstanding balance of their own. Settle it first.' } } });
    wrap(<FamilyAccountCard {...props} />);
    fireEvent.click(await screen.findByText('Bill under another customer'));
    fireEvent.change(screen.getByLabelText('Search the account owner'), { target: { value: 'pras' } });
    fireEvent.click(await screen.findByText('Prasad'));
    fireEvent.click(screen.getByText(/Move under Prasad/));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(JSON.stringify(toast.mock.calls[0][0])).toContain('Settle it first');
});
