import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockToast = jest.fn();
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (...a: unknown[]) => mockToast(...a) }), toast: (...a: unknown[]) => mockToast(...a) }));
const DISTS = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, name: i === 7 ? 'PARAG TRADERS' : i === 3 ? 'NILESH AGENCIES' : `Distributor ${String(i).padStart(2, '0')}` }));
jest.mock('@/hooks/usePurchases', () => ({ useDistributorList: () => ({ data: DISTS, isLoading: false }) }));
// the real list is tested elsewhere: this stub just lets a test "pick" a medicine, and records that it was asked to open itself
let mockAutoOpen: boolean | undefined;
jest.mock('@/components/inventory/ProductSearchDropdown', () => ({
    ProductSearchDropdown: ({ onSelect, defaultOpen }: any) => { mockAutoOpen = defaultOpen; return <button type="button" onClick={() => onSelect({ id: 'p1', name: 'PARACAIN EYE DROP 1' })}>pick medicine</button>; },
}));

import { AddToShortbook } from '../ShortbookTab';
import { DistributorCombobox } from '@/components/shared/DistributorCombobox';

Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn();
Element.prototype.releasePointerCapture = jest.fn();
global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));

const calls: { url: string; init?: RequestInit }[] = [];
const INFO = (o: Record<string, unknown> = {}) => ({ productId: 'p1', name: 'PARACAIN EYE DROP 1', manufacturer: 'SUNWAYS', packLabel: '1 strip', currentStock: 3, minQty: 12, onOrder: 4, lastRate: '28.50',
    lastDistributor: { id: 'd7', name: 'PARAG TRADERS' }, inShortbook: null, ...o });
const api = (info: Record<string, unknown> = {}, onAdd?: (b: any) => { status?: number; json?: unknown }) => {
    (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes('product-info')) return { ok: true, status: 200, json: async () => INFO(info) } as Response;
        const r = onAdd ? onAdd(JSON.parse(String(init?.body))) : { status: 201, json: { id: 's1' } };
        return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json ?? {} } as Response;
    });
};
const posts = () => calls.filter((c) => c.init?.method === 'POST').map((c) => JSON.parse(String(c.init!.body)));
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const openPopup = (over: Partial<React.ComponentProps<typeof AddToShortbook>> = {}) => { const onClose = jest.fn(); wrap(<AddToShortbook open onClose={onClose} {...over} />); return { onClose }; };
beforeEach(() => { calls.length = 0; mockToast.mockReset(); mockAutoOpen = undefined; });

describe('DistributorCombobox (type to search)', () => {
    const mount = (value = '', onChange = jest.fn()) => { render(<DistributorCombobox value={value} onChange={onChange} distributors={DISTS} clearLabel="Last supplier (automatic)" />); return onChange; };

    it('has a search box and narrows 40 distributors to the matches as you type', async () => {
        const user = userEvent.setup();
        mount();
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        expect(screen.getAllByRole('option').length).toBeGreaterThan(30);
        await user.type(screen.getByPlaceholderText('Search distributor…'), 'parag');
        expect(screen.getAllByRole('option')).toHaveLength(1);
        expect(screen.getByRole('option', { name: 'PARAG TRADERS' })).toBeInTheDocument();
    });

    it('matches what you type as part of the name (not loosely scattered letters), best match first', async () => {
        const user = userEvent.setup();
        render(<DistributorCombobox value="" onChange={jest.fn()} distributors={[{ id: 'a', name: 'PUSHKAR AGENCY' }, { id: 'b', name: 'ANAND PRAYAG PHARMA' }, { id: 'c', name: 'PARAG TRADERS' }, { id: 'd', name: 'SHREE PARAG MEDICOS' }]} />);
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.type(screen.getByPlaceholderText('Search distributor…'), 'parag');
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['PARAG TRADERS', 'SHREE PARAG MEDICOS']);      // starts-with first; PUSHKAR / PRAYAG are not matches
        await user.clear(screen.getByPlaceholderText('Search distributor…'));
        await user.type(screen.getByPlaceholderText('Search distributor…'), 'shree med');
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['SHREE PARAG MEDICOS']);                        // every word must appear
    });

    it('typing straight into the field (no click first) opens the list already filtered, and Enter picks the match', async () => {
        const user = userEvent.setup();
        const onChange = mount();
        screen.getByRole('combobox', { name: 'Distributor' }).focus();
        await user.keyboard('nilesh');
        expect(screen.getByPlaceholderText('Search distributor…')).toHaveValue('nilesh');         // the first letter was not lost
        expect(screen.getAllByRole('option')).toHaveLength(1);
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith('d3');
    });

    it('Arrow-down opens the list; closing it forgets the search so the next open starts fresh', async () => {
        const user = userEvent.setup();
        mount();
        screen.getByRole('combobox', { name: 'Distributor' }).focus();
        await user.keyboard('{ArrowDown}');
        expect(screen.getAllByRole('option').length).toBeGreaterThan(30);
        await user.keyboard('zzz');
        expect(screen.getByText('No distributor matches.')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        expect(screen.getByPlaceholderText('Search distributor…')).toHaveValue('');
    });

    it('says when nothing matches', async () => {
        const user = userEvent.setup();
        mount();
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.type(screen.getByPlaceholderText('Search distributor…'), 'zzzz');
        expect(screen.getByText('No distributor matches.')).toBeInTheDocument();
    });

    it('picking one reports its id and shows its name; the automatic choice clears it', async () => {
        const user = userEvent.setup();
        const onChange = mount();
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.type(screen.getByPlaceholderText('Search distributor…'), 'nilesh');
        await user.click(screen.getByRole('option', { name: 'NILESH AGENCIES' }));
        expect(onChange).toHaveBeenCalledWith('d3');
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.click(screen.getByRole('option', { name: 'Last supplier (automatic)' }));
        expect(onChange).toHaveBeenLastCalledWith('');
    });

    it('keyboard: type, arrow and Enter choose without the mouse', async () => {
        const user = userEvent.setup();
        const onChange = mount();
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.keyboard('parag');
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith('d7');
    });
});

describe('Add to Shortbook popup', () => {
    it('opens with the medicine list ready (no extra click) and nothing else to fill first', () => {
        api(); openPopup();
        expect(mockAutoOpen).toBe(true);
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();                       // no medicine yet
    });

    it('picking a medicine shows its card: pack, maker, stock, minimum, on order and last rate', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        expect(await screen.findByText('1 strip · SUNWAYS')).toBeInTheDocument();
        const chips = within(screen.getByLabelText('Stock details'));
        expect(chips.getByText('3')).toBeInTheDocument();
        expect(chips.getByText('12')).toBeInTheDocument();
        expect(chips.getByText('4')).toBeInTheDocument();
        expect(chips.getByText('₹28.50')).toBeInTheDocument();
    });

    it('the distributor field names the last supplier it will use, and Change returns to the search', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');                                             // the product details have loaded
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Distributor' })).toHaveTextContent('Last supplier (PARAG TRADERS)'));
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(screen.getByText('pick medicine')).toBeInTheDocument();
    });

    it('offers a suggested quantity that reaches the minimum, counting what is already on order', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        const sug = await screen.findByRole('button', { name: /Suggested/ });
        expect(sug).toHaveTextContent('Suggested 5');                                             // min 12 - stock 3 - on order 4
        fireEvent.click(sug);
        expect(screen.getByLabelText('Quantity')).toHaveValue(5);
    });

    it('no suggestion when stock plus on-order is already above the minimum', async () => {
        api({ currentStock: 20 }); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        expect(screen.queryByRole('button', { name: /Suggested/ })).not.toBeInTheDocument();
    });

    it('warns when the medicine is already in the Shortbook and says the amount is added to it', async () => {
        api({ inShortbook: { id: 's9', qty: 20, status: 'PENDING', statusLabel: 'Pending' } }); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        const note = await screen.findByText(/Already in the Shortbook/);
        expect(note.closest('p')).toHaveTextContent('needs 20 (Pending). What you add here is added to that.');
    });

    it('quantity: stepper, quick amounts, and a bad value is flagged and blocks Add', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
        expect(screen.getByLabelText('Quantity')).toHaveValue(2);
        fireEvent.click(screen.getByRole('button', { name: '20' }));
        expect(screen.getByLabelText('Quantity')).toHaveValue(20);
        fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
        expect(screen.getByLabelText('Quantity')).toHaveValue(19);
        fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0' } });
        expect(screen.getByRole('alert')).toHaveTextContent('whole number, at least 1');
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2.5' } });
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));               // the stepper never goes below 1
        fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
        expect(screen.getByLabelText('Quantity')).toHaveValue(1);
    });

    it('adds a stock need with the chosen distributor and closes', async () => {
        api();
        const { onClose } = openPopup();
        const user = userEvent.setup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.click(screen.getByRole('button', { name: '10' }));
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.type(screen.getByPlaceholderText('Search distributor…'), 'nilesh');
        await user.click(screen.getByRole('option', { name: 'NILESH AGENCIES' }));
        fireEvent.change(screen.getByLabelText('Note'), { target: { value: ' urgent ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(posts()[0]).toMatchObject({ productId: 'p1', qty: 10, source: 'manual', distributorId: 'd3', customerName: '', customerPhone: '', note: 'urgent' });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Added to the Shortbook', description: 'PARACAIN EYE DROP 1 × 10' }));
    });

    it('left alone, the distributor is not sent (the server uses the last supplier)', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(posts()).toHaveLength(1));
        expect(posts()[0].distributorId).toBeUndefined();
    });

    it('a customer request asks who, needs a name, checks the mobile, and is sent as a customer request', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        expect(screen.queryByLabelText('Customer name')).not.toBeInTheDocument();                  // hidden until it applies
        fireEvent.click(screen.getByRole('radio', { name: /Customer request/ }));
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();                       // a name is needed
        fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Ramesh Patel' } });
        fireEvent.change(screen.getByLabelText('Customer mobile'), { target: { value: '98765' } });
        expect(screen.getByRole('alert')).toHaveTextContent('10-digit mobile');
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Customer mobile'), { target: { value: '98765 43210' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(posts()).toHaveLength(1));
        expect(posts()[0]).toMatchObject({ source: 'customer', customerName: 'Ramesh Patel', customerPhone: '9876543210' });
    });

    it('switching back to stock needed drops the customer details', async () => {
        api(); openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.click(screen.getByRole('radio', { name: /Customer request/ }));
        fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Ramesh' } });
        fireEvent.click(screen.getByRole('radio', { name: /Stock needed/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(posts()).toHaveLength(1));
        expect(posts()[0]).toMatchObject({ source: 'manual', customerName: '', customerPhone: '' });
    });

    it('"Add & next" keeps the popup open, clears the entry, confirms what was added and is ready for the next medicine', async () => {
        api();
        const { onClose } = openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.click(screen.getByRole('button', { name: '20' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add & next' }));
        expect(await screen.findByRole('status')).toHaveTextContent('Added PARACAIN EYE DROP 1 × 20');
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('pick medicine')).toBeInTheDocument();                              // back to the search
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        expect(screen.getByLabelText('Quantity')).toHaveValue(1);                                  // not left on the last quantity
    });

    it('Enter in the quantity box adds it', async () => {
        api();
        const { onClose } = openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.keyDown(screen.getByLabelText('Quantity'), { key: 'Enter' });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(posts()).toHaveLength(1);
    });

    it('a refusal from the server is shown and nothing is closed', async () => {
        api({}, () => ({ status: 400, json: { detail: 'That product was not found.', code: 'NO_PRODUCT' } }));
        const { onClose } = openPopup();
        fireEvent.click(screen.getByText('pick medicine'));
        await screen.findByText('1 strip · SUNWAYS');
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(await screen.findByText('That product was not found.')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('opened from Inventory with a medicine already chosen, it starts on that medicine', async () => {
        api(); openPopup({ initialProduct: { id: 'p1', name: 'PARACAIN EYE DROP 1' } });
        expect(await screen.findByText('1 strip · SUNWAYS')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    });
});
