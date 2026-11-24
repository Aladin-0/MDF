import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreditAccounts, useCreditAgingSummary, useCustomerCreditAccount } from '@/hooks/useCredit';
import { creditApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/lib/apiClient', () => ({ creditApi: { getAccountsList: jest.fn(), getAgingSummary: jest.fn() } }));
const getAccountsList = creditApi.getAccountsList as jest.Mock;
const getAgingSummary = creditApi.getAgingSummary as jest.Mock;

const wrap = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => jest.clearAllMocks());

function CreditPageLike() {
    const { data: accounts } = useCreditAccounts();
    const { data: aging } = useCreditAgingSummary();
    return <div>accounts:{accounts?.length ?? '-'} owed:{aging?.totalOutstanding.amount ?? '-'}</div>;
}

it('the credit list and the aging cards share ONE download (the 500 accounts were fetched twice)', async () => {
    getAccountsList.mockResolvedValue([
        { id: 'a1', customer: { id: 'c1' }, totalOutstanding: 300 },
        { id: 'a2', customer: { id: 'c2' }, totalOutstanding: 200 },
    ]);
    wrap(<CreditPageLike />);
    expect(await screen.findByText('accounts:2 owed:500')).toBeInTheDocument();
    expect(getAccountsList).toHaveBeenCalledTimes(1);
    expect(getAgingSummary).not.toHaveBeenCalled();
});

function CustomerCredit({ id }: { id?: string }) {
    const { data } = useCustomerCreditAccount(id);
    return <div>account:{data?.id ?? 'none'}</div>;
}

it("a customer's page asks for that customer's account only, and waits until it knows who", async () => {
    getAccountsList.mockResolvedValue([{ id: 'acc-9', customer: { id: 'c9' } }]);
    const { rerender } = wrap(<CustomerCredit id={undefined} />);
    expect(getAccountsList).not.toHaveBeenCalled();
    rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <CustomerCredit id="c9" />
        </QueryClientProvider>,
    );
    expect(await screen.findByText('account:acc-9')).toBeInTheDocument();
    expect(getAccountsList).toHaveBeenCalledWith('o1', { customerId: 'c9' });
});
