import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, format } from 'date-fns';
import DashboardPage from '../page';

const refetch = jest.fn();
let mockQuery: any;
const calls: any[] = [];
jest.mock('@/hooks/useDashboard', () => ({ useDashboardKPI: (range: any) => { calls.push(range); return mockQuery; } }));
jest.mock('@/hooks/useOutletName', () => ({ useOutletName: () => 'Main Pharmacy' }));
jest.mock('next/dynamic', () => () => function Chart() { return <div>CHART</div>; });
jest.mock('@/components/shared/PermissionGate', () => ({ PermissionGate: ({ children }: any) => <>{children}</> }));
jest.mock('@/components/reports/DateRangePicker', () => ({
    DateRangePicker: ({ onChange }: any) => {
        const y = format(addDays(new Date(), -1), 'yyyy-MM-dd');
        return <button type="button" onClick={() => onChange({ from: y, to: y, period: 'yesterday' })}>pick yesterday</button>;
    },
}));

const data = {
    date: '', totalSales: 5000, totalBills: 10, netSales: 5000, salesReturnAmount: 0, cashCollected: 5000, upiCollected: 0, cardCollected: 0, creditGiven: 0,
    totalDiscount: 0, totalGst: 0, topSellingItems: [], staffLeaderboard: [], hourlySales: [],
    paymentBreakdown: { cash: 5000, upi: 0, card: 0, credit: 0 },
    alerts: { lowStock: [], expiringSoon: [], overdueAccounts: [], counts: { lowStock: 0, expiringSoon: 0, overdueAccounts: 0, overdueAmount: 0 } },
};
const query = (over: any = {}) => ({ data, isLoading: false, isFetching: false, isError: false, error: null, isPlaceholderData: false, dataUpdatedAt: 0, refetch, ...over });

describe('Dashboard page', () => {
    beforeEach(() => { jest.clearAllMocks(); calls.length = 0; mockQuery = query(); });

    it('shows the period everywhere it applies, instead of a hard-coded "Today"', async () => {
        render(<DashboardPage />);
        expect(screen.getAllByText('Today', { exact: false }).length).toBeGreaterThan(2);
        await userEvent.click(screen.getByRole('button', { name: 'pick yesterday' }));
        expect(screen.getAllByText('Yesterday', { exact: false }).length).toBeGreaterThan(2);
        expect(screen.getByText('Yesterday · by revenue')).toBeInTheDocument();
        expect(screen.getByText('Yesterday · by sales billed')).toBeInTheDocument();
        expect(calls[calls.length - 1]).toMatchObject({ period: 'yesterday' });
    });

    it('names the outlet being shown', () => {
        render(<DashboardPage />);
        expect(screen.getByText('Main Pharmacy', { exact: false })).toBeInTheDocument();
    });

    it('a failed first load says so and offers a retry', async () => {
        mockQuery = query({ data: undefined, isError: true, error: new Error('Server is down') });
        render(<DashboardPage />);
        const alert = screen.getByRole('alert');
        expect(within(alert).getByText('Couldn’t load the dashboard')).toBeInTheDocument();
        await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
        expect(refetch).toHaveBeenCalled();
    });

    it('a failed refresh keeps the last numbers on screen and says they are the last ones', () => {
        mockQuery = query({ isError: true, error: new Error('timeout') });
        render(<DashboardPage />);
        expect(screen.getByText('Couldn’t refresh the dashboard')).toBeInTheDocument();
        expect(screen.getByText(/last numbers we had/)).toBeInTheDocument();
        expect(screen.getByText('₹5,000', { selector: 'span.text-2xl' })).toBeInTheDocument();
    });

    it('dims the page only while the previous period stands in for the one just chosen', () => {
        const { container, rerender } = render(<DashboardPage />);
        expect(container.querySelector('[aria-busy]')!.className).not.toMatch(/opacity-60/);
        mockQuery = query({ isPlaceholderData: true, isFetching: true });
        rerender(<DashboardPage />);
        expect(container.querySelector('[aria-busy]')!.className).toMatch(/opacity-60/);
    });

    it('the refresh button asks for fresh numbers and is disabled while they load', async () => {
        const { rerender } = render(<DashboardPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
        expect(refetch).toHaveBeenCalledTimes(1);
        mockQuery = query({ isFetching: true });
        rerender(<DashboardPage />);
        expect(screen.getByRole('button', { name: 'Updating dashboard' })).toBeDisabled();
    });

    it('while loading for the first time it shows placeholders, no numbers', () => {
        mockQuery = query({ data: undefined, isLoading: true });
        render(<DashboardPage />);
        expect(screen.queryByText('₹5,000')).not.toBeInTheDocument();
        expect(screen.getAllByRole('status').length).toBeGreaterThan(4);
    });
});
