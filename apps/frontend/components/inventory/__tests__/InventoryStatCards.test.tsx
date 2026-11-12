import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryStatCards } from '../InventoryStatCards';
import { useInventoryStore } from '@/store/inventoryStore';
import { useInventorySummary } from '@/hooks/useInventorySummary';

jest.mock('@/hooks/useInventorySummary', () => ({ useInventorySummary: jest.fn() }));
const summaryMock = useInventorySummary as jest.Mock;

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });
const loading = () => ({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
const failed = () => ({ data: undefined, isLoading: false, isError: true, refetch: jest.fn() });

const valuationOk = ok({ data: { total_value_purchase: 100000, total_value_landing: 120000, total_value_mrp: 150000, activeBatches: 3 } });

const give = (over: Record<string, unknown> = {}) =>
    summaryMock.mockReturnValue({
        total: ok({}), expiring: ok({}), lowStock: ok({}), valuation: valuationOk,
        counts: { total: 1234, expiring: 7, lowStock: 12 }, ...over,
    });

describe('InventoryStatCards', () => {
    beforeEach(() => { jest.clearAllMocks(); useInventoryStore.setState({ valuationMode: 'PURCHASE' }); });

    it('shows the figures from the single source, and counts PRODUCTS (one card said "batches" for a product count)', () => {
        give();
        render(<InventoryStatCards />);
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('3 active batches')).toBeInTheDocument();
        expect(screen.getByText('7 products')).toBeInTheDocument();
        expect(screen.getByText('12 products')).toBeInTheDocument();
        expect(screen.queryByText(/batches$/, { selector: 'p.text-2xl' })).not.toBeInTheDocument();
    });

    it('a figure that failed to load says so, with a retry, and never shows a made-up zero', async () => {
        const valuation = failed();
        give({ valuation });
        render(<InventoryStatCards />);
        expect(screen.getByText(/couldn.t load this figure/i)).toBeInTheDocument();
        expect(screen.queryByText('₹0')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(valuation.refetch).toHaveBeenCalled();
        // the other cards still show their real numbers
        expect(screen.getByText('1,234')).toBeInTheDocument();
    });

    it('cards load independently: a slow stock value does not hide the others', () => {
        give({ valuation: loading() });
        render(<InventoryStatCards />);
        expect(screen.getByRole('status', { name: /loading stock value/i })).toBeInTheDocument();
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('7 products')).toBeInTheDocument();
    });

    it('the expiring and low-stock cards are real buttons that open their tab', async () => {
        give();
        const onTabChange = jest.fn();
        render(<InventoryStatCards onTabChange={onTabChange} />);
        await userEvent.click(screen.getByRole('button', { name: /expiring soon: 7 products/i }));
        expect(onTabChange).toHaveBeenLastCalledWith('expiring');
        await userEvent.click(screen.getByRole('button', { name: /low stock: 12 products/i }));
        expect(onTabChange).toHaveBeenLastCalledWith('low_stock');
    });

    it('the valuation switch lives in the Stock Value card and changes what it shows', async () => {
        give();
        render(<InventoryStatCards />);
        const switcher = screen.getByRole('group', { name: /value stock at/i });
        expect(screen.getByText('₹1,00,000')).toBeInTheDocument();
        await userEvent.click(within(switcher).getByRole('button', { name: 'MRP' }));
        expect(screen.getByText('₹1,50,000')).toBeInTheDocument();
        expect(screen.getByText('At MRP')).toBeInTheDocument();
        expect(within(switcher).getByRole('button', { name: 'MRP' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('uses the singular for one product', () => {
        give({ counts: { total: 1, expiring: 1, lowStock: 1 } });
        render(<InventoryStatCards />);
        expect(screen.getAllByText('1 product')).toHaveLength(2);
    });
});
