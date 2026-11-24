import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/dashboard/reports/sales-book' }));
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), loading: jest.fn() }) }));
const mockGet = jest.fn();
jest.mock('@/lib/apiClient', () => ({ getErpSalesBook: (...a: unknown[]) => mockGet(...a), exportErpReport: jest.fn() }));

import SalesBookPage from '@/app/dashboard/reports/sales-book/page';

const row = (i: number) => ({ date: '2026-11-01', bill_no: `INV-${i}`, party_name: `Party ${i}`, gstin: '', taxable: 100, tax_5: 5, tax_12: 0,
    tax_18: 0, tax_28: 0, total_gst: 5, exempted: 0, round_off: 0, net_total: 105, is_return: false });

it('a month of 450 invoices opens with 200 drawn; the totals still cover all 450', async () => {
    mockGet.mockResolvedValue({
        rows: Array.from({ length: 450 }, (_, i) => row(i + 1)),
        summary: { total_taxable: 45000, total_tax_5: 2250, total_tax_12: 0, total_tax_18: 0, total_tax_28: 0, total_gst: 2250,
            total_exempted: 0, total_round_off: 0, total_net_sales: 47250, invoice_count: 450 },
    });
    render(<QueryClientProvider client={new QueryClient()}><SalesBookPage /></QueryClientProvider>);
    expect(await screen.findByText('INV-1')).toBeInTheDocument();
    expect(screen.getByText('INV-200')).toBeInTheDocument();
    expect(screen.queryByText('INV-201')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 200 of 450 rows/)).toBeInTheDocument();
    expect(screen.getAllByText(/47,250/).length).toBeGreaterThan(0);          // server total, all 450
    fireEvent.click(screen.getByRole('button', { name: 'Show 200 more' }));
    expect(screen.getByText('INV-400')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(screen.getByText('INV-450')).toBeInTheDocument();
});
