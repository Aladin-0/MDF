import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import type { DashboardAlerts, DashboardKPI } from '@/types';
import StatCardsRow from '../StatCardsRow';
import AlertsRow from '../AlertsRow';
import PaymentMixCard from '../PaymentMixCard';
import TopSellingTable from '../TopSellingTable';
import StaffLeaderboard from '../StaffLeaderboard';
import HourlySalesChart from '../HourlySalesChart';

let mockCanManageStaff = true;
jest.mock('@/components/shared/PermissionGate', () => ({
    PermissionGate: ({ children }: any) => (mockCanManageStaff ? <>{children}</> : null),
}));
// recharts measures the DOM, which jsdom cannot: draw nothing, keep the accessible table and the text
jest.mock('recharts', () => {
    const Pass = ({ children }: any) => <div>{children}</div>;
    return { ResponsiveContainer: Pass, BarChart: Pass, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});

const kpi = (over: Partial<DashboardKPI> = {}): DashboardKPI => ({
    date: '2026-03-12', totalSales: 10000, totalBills: 20, netSales: 9500, salesReturnAmount: 500, salesReturnCount: 2,
    cashCollected: 4000, upiCollected: 3000, cardCollected: 1000, creditGiven: 2000, totalDiscount: 300, totalGst: 900,
    outstandingCredit: 7500, grossProfit: null, grossMarginPct: null,
    previous: { totalSales: 8000, totalBills: 20, creditGiven: 1000, salesReturnAmount: 500 },
    previousStartDate: format(addDays(new Date(), -1), 'yyyy-MM-dd'), previousEndDate: format(addDays(new Date(), -1), 'yyyy-MM-dd'),   // yesterday, whatever day the test runs
    topSellingItems: [], staffLeaderboard: [], hourlySales: [],
    paymentBreakdown: { cash: 4000, upi: 3000, card: 1000, credit: 2000 },
    ...over,
});

describe('StatCardsRow', () => {
    it('shows the real change against the previous period, never an invented one', () => {
        render(<StatCardsRow kpi={kpi()} />);
        const sales = screen.getByText('Sales').closest('div')!.parentElement!;
        expect(within(sales).getByText('₹10,000')).toBeInTheDocument();
        expect(within(sales).getByText(/\+25%/)).toBeInTheDocument();            // 10000 vs 8000
        expect(within(sales).getByText(/compared with yesterday/)).toBeInTheDocument();
        expect(screen.queryByText(/\+12%/)).not.toBeInTheDocument();             // the old hard-coded numbers
        expect(screen.queryByText(/\+8%/)).not.toBeInTheDocument();
    });

    it('shows no trend at all when the previous period had nothing', () => {
        render(<StatCardsRow kpi={kpi({ previous: { totalSales: 0, totalBills: 0, creditGiven: 0, salesReturnAmount: 0 } })} />);
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });

    it('treats a rise in credit or returns as bad news and a fall as good', () => {
        render(<StatCardsRow kpi={kpi()} />);
        const credit = screen.getByText('Credit given').closest('a')!;           // 2000 vs 1000: +100%, bad
        expect(within(credit).getByText(/\+100%/).className).toMatch(/red/);
        const salesChip = within(screen.getByText('Sales').closest('div')!.parentElement!).getByText(/\+25%/);
        expect(salesChip.className).toMatch(/emerald/);                          // the same direction on sales is good
    });

    it('credit given is this period\'s credit, and what is owed in total is named separately', () => {
        render(<StatCardsRow kpi={kpi()} />);
        const credit = screen.getByText('Credit given').closest('a')!;
        expect(within(credit).getByText('₹2,000')).toBeInTheDocument();
        expect(within(credit).getByText('₹7,500 owed in total')).toBeInTheDocument();
    });

    it('shows gross profit only when the server sent one (people who may not see purchase rates get none)', () => {
        const { rerender } = render(<StatCardsRow kpi={kpi()} />);
        expect(screen.queryByText('Gross profit')).not.toBeInTheDocument();
        rerender(<StatCardsRow kpi={kpi({ grossProfit: 2400, grossMarginPct: 24 })} />);
        expect(screen.getByText('Gross profit')).toBeInTheDocument();
        expect(screen.getByText('₹2,400')).toBeInTheDocument();
        expect(screen.getByText('24% margin at landing cost')).toBeInTheDocument();
    });

    it('the tiles that lead somewhere are real links', () => {
        render(<StatCardsRow kpi={kpi()} />);
        expect(screen.getByText('Credit given').closest('a')).toHaveAttribute('href', '/dashboard/credit');
        expect(screen.getByText('Returns').closest('a')).toHaveAttribute('href', '/sales-returns');
        expect(screen.getByText('Bills').closest('a')).toHaveAttribute('href', '/dashboard/sales');
    });

    it('shows the figure after returns, and a plain bill count when there are none', () => {
        const { rerender } = render(<StatCardsRow kpi={kpi()} />);
        expect(screen.getByText('₹9,500 after returns')).toBeInTheDocument();
        rerender(<StatCardsRow kpi={kpi({ salesReturnAmount: 0, netSales: 10000 })} />);
        expect(screen.getByText('20 bills')).toBeInTheDocument();
    });

    it('draws loading placeholders, not placeholder text', () => {
        render(<StatCardsRow isLoading />);
        expect(screen.getAllByRole('status')).toHaveLength(4);
        expect(screen.queryByText('...')).not.toBeInTheDocument();
    });
});

const alerts = (over: Partial<DashboardAlerts> = {}): DashboardAlerts => ({
    lowStock: [], expiringSoon: [], overdueAccounts: [], counts: { lowStock: 0, expiringSoon: 0, overdueAccounts: 0, overdueAmount: 0 }, ...over,
});

describe('AlertsRow', () => {
    it('with nothing wrong, says so in one quiet line per card', () => {
        render(<AlertsRow alerts={alerts()} />);
        expect(screen.getByText('Every product is above its reorder level')).toBeInTheDocument();
        expect(screen.getByText('Nothing expires within 90 days')).toBeInTheDocument();
        expect(screen.getByText('No overdue credit balances')).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('shows the true total next to a short list, and links each row and the full list', () => {
        render(<AlertsRow alerts={alerts({
            lowStock: [1, 2, 3, 4].map((i) => ({ productId: `p${i}`, productName: `Item ${i}`, currentStock: i, reorderLevel: 10 })),
            counts: { lowStock: 23, expiringSoon: 0, overdueAccounts: 0, overdueAmount: 0 },
        })} />);
        const card = screen.getByRole('region', { name: 'Low stock' });
        expect(within(card).getByText('23')).toBeInTheDocument();
        expect(within(card).getByText('23 products are below the reorder level')).toBeInTheDocument();
        expect(within(card).getAllByRole('listitem')).toHaveLength(3);          // the worst three
        expect(within(card).getByRole('link', { name: /Item 1/ })).toHaveAttribute('href', '/dashboard/inventory/p1');
        expect(within(card).getByRole('link', { name: /See all low stock/ })).toHaveAttribute('href', '/dashboard/inventory?tab=low_stock');
    });

    it('says "Out of stock" for zero, and words (not just colour) for every status', () => {
        render(<AlertsRow alerts={alerts({
            lowStock: [{ productId: 'p', productName: 'Gone', currentStock: 0, reorderLevel: 10 }],
            counts: { lowStock: 1, expiringSoon: 0, overdueAccounts: 0, overdueAmount: 0 },
        })} />);
        expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('describes expired, expiring today and expiring soon stock', () => {
        render(<AlertsRow alerts={alerts({
            expiringSoon: [
                { productId: 'a', batch: { productName: 'Old', batchNumber: 'B1', expiryDate: '2026-03-02' }, daysUntilExpiry: -10 },
                { productId: 'b', batch: { productName: 'Now', batchNumber: 'B2', expiryDate: '2026-03-12' }, daysUntilExpiry: 0 },
                { productId: 'c', batch: { productName: 'Soon', batchNumber: 'B3', expiryDate: '2026-05-01' }, daysUntilExpiry: 50 },
            ],
            counts: { lowStock: 0, expiringSoon: 3, overdueAccounts: 0, overdueAmount: 0 },
        })} />);
        expect(screen.getByText('Expired 10d ago')).toBeInTheDocument();
        expect(screen.getByText('Expires today')).toBeInTheDocument();
        expect(screen.getByText('50d left').className).toMatch(/amber/);
        expect(screen.getByText('Expired 10d ago').className).toMatch(/red/);
        expect(screen.getByText('3 batches expire within 90 days or have expired')).toBeInTheDocument();
    });

    it('lists overdue credit with the amount owed', () => {
        render(<AlertsRow alerts={alerts({
            overdueAccounts: [{ customerId: 'c1', customerName: 'Rahul', outstandingAmount: 700, daysOverdue: 45 }],
            counts: { lowStock: 0, expiringSoon: 0, overdueAccounts: 2, overdueAmount: 1000 },
        })} />);
        expect(screen.getByText('₹1,000 owed by 2 customers')).toBeInTheDocument();
        expect(screen.getByText('45d overdue').className).toMatch(/red/);
    });

    it('still works with an older server that sent no counts', () => {
        render(<AlertsRow alerts={{ lowStock: [{ currentStock: 2, reorderLevel: 10, batch: { productName: 'Legacy', batchNumber: 'B', expiryDate: '2027-01-01' } }], expiringSoon: [], overdueAccounts: [] }} />);
        expect(screen.getByText('1 product is below the reorder level')).toBeInTheDocument();
        expect(screen.getByText('Legacy')).toBeInTheDocument();
    });

    it('loading shows placeholders', () => {
        render(<AlertsRow isLoading />);
        expect(screen.getAllByRole('status')).toHaveLength(3);
    });
});

describe('PaymentMixCard', () => {
    it('lists every way of paying with its amount and share, adding up to the whole', () => {
        render(<PaymentMixCard kpi={kpi()} periodLabel="Today" />);
        const list = screen.getByRole('list');
        expect(within(list).getByText('Cash').parentElement).toHaveTextContent('40%');
        expect(within(list).getByText('₹4,000')).toBeInTheDocument();
        expect(within(list).getByText('₹3,000')).toBeInTheDocument();
        expect(within(list).getByText('₹1,000')).toBeInTheDocument();
        expect(within(list).getByText('₹2,000')).toBeInTheDocument();
        expect(screen.getByText('Today · how sales were paid')).toBeInTheDocument();
    });

    it('also gives the bar a text equivalent, and shows discount and GST', () => {
        render(<PaymentMixCard kpi={kpi()} periodLabel="Today" />);
        expect(screen.getByRole('img', { name: 'Cash 40%, UPI 30%, Card 10%, Credit 20%' })).toBeInTheDocument();
        expect(screen.getByText('Discount given').nextSibling).toHaveTextContent('₹300');
        expect(screen.getByText('GST in sales').nextSibling).toHaveTextContent('₹900');
    });

    it('omits a mode nobody used from the bar but still lists it as zero', () => {
        render(<PaymentMixCard kpi={kpi({ paymentBreakdown: { cash: 100, upi: 0, card: 0, credit: 0 } })} periodLabel="Today" />);
        expect(screen.getByRole('img', { name: 'Cash 100%' })).toBeInTheDocument();
        expect(screen.getByText('UPI').parentElement).toHaveTextContent('0%');
    });

    it('says so when there were no sales', () => {
        render(<PaymentMixCard kpi={kpi({ paymentBreakdown: { cash: 0, upi: 0, card: 0, credit: 0 } })} periodLabel="Today" />);
        expect(screen.getByText('No sales in this period')).toBeInTheDocument();
    });
});

describe('TopSellingTable', () => {
    const items = [
        { productId: 'p1', name: 'Dolo 650', qty: 12, qtyLoose: 3, revenue: 4000 },
        { productId: 'custom', name: 'Hand-typed item', qty: 1, revenue: 500 },
    ];

    it('ranks by revenue, shows loose units, and the share of the period\'s sales', () => {
        render(<TopSellingTable items={items} totalSales={10000} periodLabel="Today" />);
        expect(screen.getAllByText('12 packs + 3 loose')).toHaveLength(2);        // the Sold column, and under the amount on a phone
        expect(screen.getByText('40%')).toBeInTheDocument();
        expect(screen.getByText('Today · by revenue')).toBeInTheDocument();
        expect(screen.queryByText(/strips/)).not.toBeInTheDocument();             // not every product is sold in strips
    });

    it('links real products to their page and leaves custom lines as text', () => {
        render(<TopSellingTable items={items} totalSales={10000} periodLabel="Today" />);
        expect(screen.getByRole('link', { name: 'Dolo 650' })).toHaveAttribute('href', '/dashboard/inventory/p1');
        expect(screen.queryByRole('link', { name: 'Hand-typed item' })).not.toBeInTheDocument();
    });

    it('has an empty state and a loading state, and its label follows the period', () => {
        const { rerender } = render(<TopSellingTable items={[]} totalSales={0} periodLabel="Yesterday" />);
        expect(screen.getByText('No sales in this period')).toBeInTheDocument();
        expect(screen.getByText('Yesterday · by revenue')).toBeInTheDocument();
        rerender(<TopSellingTable items={[]} totalSales={0} isLoading periodLabel="Today" />);
        expect(screen.getByRole('status', { name: 'Loading top sellers' })).toBeInTheDocument();
    });
});

describe('StaffLeaderboard', () => {
    const staff = [
        { id: 's1', name: 'Asha Patil', role: 'manager', totalSales: 6000, billsCount: 12 },
        { id: 's2', name: 'Ravi', role: 'billing_staff', totalSales: 3000, billsCount: 8 },
    ];
    beforeEach(() => { mockCanManageStaff = true; });

    it('puts the amount first and the bills under it, and the period in the label', () => {
        render(<StaffLeaderboard leaderboard={staff} periodLabel="1 Mar – 12 Mar" />);
        const first = screen.getAllByRole('listitem')[0];
        expect(within(first).getByText('Asha Patil')).toBeInTheDocument();
        expect(within(first).getByText('₹6,000')).toBeInTheDocument();
        expect(within(first).getByText('12 bills')).toBeInTheDocument();
        expect(within(first).getByText('AP')).toBeInTheDocument();
        expect(screen.getByText('1 Mar – 12 Mar · by sales billed')).toBeInTheDocument();
    });

    it('shows up to five people, not three', () => {
        const many = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Person ${i}`, role: 'billing_staff', totalSales: 100 - i, billsCount: 1 }));
        render(<StaffLeaderboard leaderboard={many} periodLabel="Today" />);
        expect(screen.getAllByRole('listitem')).toHaveLength(5);
        expect(screen.getAllByText('1 bill')).toHaveLength(5);
    });

    it('offers the staff page only to people who manage staff', () => {
        const { rerender } = render(<StaffLeaderboard leaderboard={staff} periodLabel="Today" />);
        expect(screen.getByRole('link', { name: /Manage staff/ })).toHaveAttribute('href', '/dashboard/staff');
        mockCanManageStaff = false;
        rerender(<StaffLeaderboard leaderboard={staff} periodLabel="Today" />);
        expect(screen.queryByRole('link', { name: /Manage staff/ })).not.toBeInTheDocument();
    });

    it('empty state', () => {
        render(<StaffLeaderboard leaderboard={[]} periodLabel="Today" />);
        expect(screen.getByText('No billing in this period')).toBeInTheDocument();
    });
});

describe('HourlySalesChart', () => {
    it('names the busiest hour and gives every hour in a table for screen readers', () => {
        render(<HourlySalesChart data={[{ hour: '10:00', bills: 2, sales: 200 }, { hour: '15:00', bills: 5, sales: 900 }]} />);
        expect(screen.getByText('3 PM', { selector: 'span' })).toBeInTheDocument();
        expect(screen.getByText(/5 bills/)).toBeInTheDocument();
        const table = screen.getByRole('table', { hidden: true });
        expect(within(table).getAllByRole('row', { hidden: true }).length).toBe(1 + 13);       // header + 9 AM..9 PM
        expect(within(table).getByRole('rowheader', { name: '11 AM', hidden: true }).parentElement).toHaveTextContent('₹0');
    });

    it('says so when there were no sales, and shows a placeholder while loading', () => {
        const { rerender } = render(<HourlySalesChart data={[]} />);
        expect(screen.getByText('No sales in this period')).toBeInTheDocument();
        rerender(<HourlySalesChart data={[]} isLoading />);
        expect(screen.getByRole('status', { name: 'Loading chart' })).toBeInTheDocument();
    });
});
