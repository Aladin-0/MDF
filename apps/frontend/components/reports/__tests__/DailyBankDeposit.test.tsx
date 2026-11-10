import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockToastSuccess = jest.fn();
jest.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: jest.fn() } }));
jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/components/reports/DateRangePicker', () => ({ DateRangePicker: () => <div data-testid="range" /> }));
jest.mock('@/components/reports/partner-settings-modal', () => ({ PartnerSettingsModal: () => null }));
jest.mock('@/components/reports/fixed-expenses-modal', () => ({ FixedExpensesModal: () => null }));
jest.mock('@/hooks/useReports', () => ({ getDefaultDateRange: () => ({ from: '2026-11-09', to: '2026-11-09' }) }));

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { BankDepositModal, type BankOptions } from '../BankDepositModal';
import { DailyReportClient } from '../daily-report-client';

Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn();
Element.prototype.releasePointerCapture = jest.fn();
global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));

const BANK: BankOptions = { accounts: [{ id: 'b1', name: 'SBI Current' }, { id: 'b2', name: 'HDFC Current' }], cashLedger: { id: 'c1', name: 'Cash' } };
const grant = (...p: string[]) => useAuthStore.setState({ user: { id: 'u', role: 'admin', outletId: 'o1', permissions: p, outlet: { id: 'o1' } } as never });
beforeEach(() => { jest.clearAllMocks(); mockToastSuccess.mockReset(); grant('edit_vouchers'); });

describe('BankDepositModal', () => {
    const open = (over: Partial<React.ComponentProps<typeof BankDepositModal>> = {}) => {
        const props = { open: true, onClose: jest.fn(), outletId: 'o1', bank: BANK, defaultDate: '2026-11-09', cashInDrawer: 10000, onDone: jest.fn(), ...over };
        render(<BankDepositModal {...props} />);
        return props;
    };

    it('needs an amount and a bank before it can be recorded', () => {
        open();
        const go = screen.getByRole('button', { name: 'Record deposit' });
        expect(go).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2500' } });
        expect(go).toBeDisabled();                                                                    // still no bank chosen (two to pick from)
    });

    it('a single bank account is chosen for you', async () => {
        open({ bank: { accounts: [{ id: 'b1', name: 'SBI Current' }], cashLedger: BANK.cashLedger } });
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
        expect(screen.getByRole('button', { name: 'Record deposit' })).toBeEnabled();
        expect(screen.getByLabelText('Bank account')).toHaveTextContent('SBI Current');
    });

    it('sends the deposit to the server, then refreshes the report and closes', async () => {
        (api.post as jest.Mock).mockResolvedValue({ data: { voucher: { id: 'v1', voucherNo: 'CON-2026-0001', amount: '4000', bank: 'SBI Current' } } });
        const props = open({ bank: { accounts: [{ id: 'b1', name: 'SBI Current' }], cashLedger: BANK.cashLedger } });
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4000' } });
        fireEvent.change(screen.getByLabelText('Slip or reference'), { target: { value: 'SL-9' } });
        fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'evening' } });
        fireEvent.click(screen.getByRole('button', { name: 'Record deposit' }));
        await waitFor(() => expect(props.onDone).toHaveBeenCalled());
        expect(api.post).toHaveBeenCalledWith('/reports/daily-snapshot/bank-deposit/',
            { outletId: 'o1', date: '2026-11-09', amount: '4000', bankLedgerId: 'b1', reference: 'SL-9', narration: 'evening' });
        expect(props.onClose).toHaveBeenCalled();
        expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('SBI Current'), expect.objectContaining({ description: 'Contra voucher CON-2026-0001' }));
    });

    it('shows the server\'s reason and stays open when it is refused', async () => {
        (api.post as jest.Mock).mockRejectedValue({ error: { code: 'UNKNOWN_ERROR', message: 'Request failed with status code 400', detail: 'A deposit cannot be dated in the future.' } });
        const props = open({ bank: { accounts: [{ id: 'b1', name: 'SBI Current' }], cashLedger: BANK.cashLedger } });
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: 'Record deposit' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('cannot be dated in the future');
        expect(props.onDone).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Record deposit' })).toBeEnabled();                 // can fix and try again
    });

    it('warns, without blocking, when more is banked than the drawer should hold', () => {
        open({ cashInDrawer: 1000, bank: { accounts: [{ id: 'b1', name: 'SBI Current' }], cashLedger: BANK.cashLedger } });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1500' } });
        expect(screen.getByRole('status')).toHaveTextContent('more than the cash the report expects');
        expect(screen.getByRole('button', { name: 'Record deposit' })).toBeEnabled();
    });

    it('tells you to add a bank account when there is none', () => {
        open({ bank: { accounts: [], cashLedger: BANK.cashLedger } });
        expect(screen.getByRole('alert')).toHaveTextContent('There is no bank account yet');
        expect(screen.getByRole('button', { name: 'Record deposit' })).toBeDisabled();
        expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    });

    it('never offers a date in the future', () => {
        open({ defaultDate: '2099-01-01', bank: { accounts: [{ id: 'b1', name: 'SBI' }], cashLedger: null } });
        const local = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
        const todayLocal = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
        expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(todayLocal);          // the shop's day, not UTC's
        expect(screen.getByLabelText('Date')).toHaveAttribute('max', todayLocal);
    });

    it('does not record twice on a double click', async () => {
        let resolve!: (v: unknown) => void;
        (api.post as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
        open({ bank: { accounts: [{ id: 'b1', name: 'SBI Current' }], cashLedger: BANK.cashLedger } });
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '70' } });
        const go = screen.getByRole('button', { name: 'Record deposit' });
        fireEvent.click(go); fireEvent.click(go);
        expect(api.post).toHaveBeenCalledTimes(1);
        resolve({ data: { voucher: { id: 'v', voucherNo: 'CON-1', amount: '70', bank: 'SBI Current' } } });
    });
});

describe('Daily report: bank deposit rows', () => {
    const SNAP = (sb: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({
        date: '2026-11-09', startDate: '2026-11-09', endDate: '2026-11-09', isSingleDay: true,
        financials: { grossProfit: 0, netProfit: 0, totalSales: 0, saleUpto: 0, cumulativePurchase: 0, stockValue: 0 },
        salesBreakdown: { openingCash: 10000, grossSales: 0, saleReturn: 0, creditSale: 0, upi: 0, card: 0, cashExpenses: 0, cashPayments: 0, cashPurchases: 0, bankDeposit: 4000, cashFromBank: 0,
            cashReceived: 0, cashIncome: 0, cashRequired: 6000, actualCash: 0, extraShort: -6000,
            details: { grossSales: [], saleReturn: [], creditSale: [], upi: [], card: [], cashExpenses: [], cashPayments: [], cashPurchases: [], cashReceived: [], cashIncome: [],
                bankDeposit: [{ id: 'v1', no: 'CON-2026-0001', date: '09-11-2026', ledger: 'SBI Current', group: 'Bank Accounts', narration: 'Cash deposited into SBI Current', amount: 4000, totalVoucherAmount: 4000, link: '/dashboard/accounts/voucher-entry?editId=v1' }],
                cashFromBank: [], ...details }, ...sb },
        cashState: { openingCash: 10000, notes2000: 0, notes500: 0, notes200: 0, notes100: 0, notes50: 0, notes20: 0, notes10: 0, pettyCashExp: 0, sideCash: 0, nextDayOpening: 0 },
        fixedExpenses: { totalMonthly: 0, daysInMonth: 30, perDay: 0 }, bills: { first: 'N/A', last: 'N/A' }, partners: [],
        bank: BANK,
    });
    const load = (snap = SNAP()) => { (api.get as jest.Mock).mockResolvedValue({ data: snap }); render(<DailyReportClient />); };

    it('lists the deposit as a deduction with its voucher, and cash required already reflects it', async () => {
        load();
        expect(await screen.findByText('(-) Bank Deposit')).toBeInTheDocument();
        expect(screen.getByText('-₹4,000.00')).toBeInTheDocument();
        fireEvent.click(screen.getByText('(-) Bank Deposit'));
        expect(await screen.findByText('CON-2026-0001')).toBeInTheDocument();
        expect(screen.getByText('SBI Current')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/dashboard/accounts/voucher-entry?editId=v1');
        expect(screen.getAllByText('₹6,000.00').length).toBeGreaterThan(0);                           // CASH REQUIRED from the server
    });

    it('"Deposit to bank" opens the form without toggling the row, and a recorded deposit reloads the report', async () => {
        load();
        await screen.findByText('(-) Bank Deposit');
        fireEvent.click(screen.getByRole('button', { name: /Deposit to bank/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Deposit cash into bank' });
        expect(screen.queryByText('CON-2026-0001')).not.toBeInTheDocument();                          // the click did not expand the list
        (api.post as jest.Mock).mockResolvedValue({ data: { voucher: { id: 'v2', voucherNo: 'CON-2026-0002', amount: '500', bank: 'HDFC Current' } } });
        fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '500' } });
        fireEvent.click(within(dialog).getByRole('combobox', { name: 'Bank account' }));
        fireEvent.click(await screen.findByRole('option', { name: 'HDFC Current' }));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Record deposit' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/reports/daily-snapshot/bank-deposit/', expect.objectContaining({ bankLedgerId: 'b2', amount: '500', date: '2026-11-09' })));
        await waitFor(() => expect((api.get as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2));      // the report was fetched again
    });

    it('without the voucher right the row is there but there is no way to deposit', async () => {
        grant('view_reports');
        load();
        expect(await screen.findByText('(-) Bank Deposit')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Deposit to bank/ })).not.toBeInTheDocument();
    });

    it('cash brought back from the bank only shows when there is some', async () => {
        load();
        await screen.findByText('(-) Bank Deposit');
        expect(screen.queryByText('(+) Cash from Bank')).not.toBeInTheDocument();
        document.body.innerHTML = '';
        load(SNAP({ cashFromBank: 800, cashRequired: 6800 }, { cashFromBank: [{ id: 'v9', no: 'CON-2026-0009', date: '09-11-2026', ledger: 'SBI Current', amount: 800, narration: '' }] }));
        expect(await screen.findByText('(+) Cash from Bank')).toBeInTheDocument();
    });

    it('a report from an older server (no bank fields) still renders', async () => {
        const old = SNAP(); delete (old.salesBreakdown as any).bankDeposit; delete (old.salesBreakdown.details as any).bankDeposit; delete (old as any).bank;
        load(old);
        expect(await screen.findByText('(-) Bank Deposit')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Deposit to bank/ })).toBeInTheDocument();
    });
});
