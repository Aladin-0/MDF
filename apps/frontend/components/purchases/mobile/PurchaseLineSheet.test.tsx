import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PurchaseLineSheet } from './PurchaseLineSheet';
import { EntryHarness, goodLine } from './testEntry';
import { emptyItem } from '@/lib/purchaseEntry';
import { productsApi } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ productsApi: { search: jest.fn() }, API_URL: 'http://api.test', getHeaders: () => ({}) }));
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => ({ data: { gstRegistered: true, landingCostIncludeGst: false, landingCostIncludeFreight: true } }) }));
const search = productsApi.search as jest.Mock;
const prod = (id: string, name: string, extra: any = {}) => ({ id, name, composition: 'PARACETAMOL', gstRate: 5, mrp: 32.1, packSize: 15, packUnit: 'Tablet', hsnCode: '3004', totalStock: 11.866666, ...extra });

let lastEntry: any;
function Host({ initial, index = 0, onClose = jest.fn() }: { initial: any[]; index?: number | null; onClose?: () => void }) {
    const [open, setOpen] = useState<number | null>(index);
    return (
        <EntryHarness initial={initial}>
            {(entry, items) => { lastEntry = entry; return (<><PurchaseLineSheet entry={entry} index={open} onClose={() => { onClose(); setOpen(null); }} /><span data-testid="count">{items.length}</span><span data-testid="first">{JSON.stringify(items[0])}</span></>); }}
        </EntryHarness>
    );
}
const first = () => JSON.parse(screen.getByTestId('first').textContent!);

beforeEach(() => { search.mockReset(); search.mockResolvedValue([]); });

describe('PurchaseLineSheet: choosing the medicine', () => {
    it('a new line opens on the search, asks for 2 letters, and shows nothing else yet', () => {
        render(<Host initial={[emptyItem()]} />);
        expect(screen.getByText('Find the medicine')).toBeInTheDocument();
        expect(screen.getByText('Type at least 2 letters.')).toBeInTheDocument();
        expect(screen.queryByTestId('line-batch')).not.toBeInTheDocument();
    });

    it('typing searches the purchase catalogue and lists name, GST, MRP and tidy stock', async () => {
        search.mockResolvedValue([prod('1', 'DOLO-650 TAB'), prod('2', 'DOLOCOLD SPRAY', { totalStock: 2690 })]);
        render(<Host initial={[emptyItem()]} />);
        fireEvent.change(screen.getByTestId('purchase-search-input'), { target: { value: 'dolo' } });
        const rows = await screen.findAllByTestId('purchase-search-result');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('DOLO-650 TAB');
        expect(rows[0]).toHaveTextContent('GST 5% · MRP ₹32.10 · Stock 11.9');           // not 11.866666
        expect(rows[1]).toHaveTextContent('Stock 2,690');
        expect(search).toHaveBeenCalledWith('dolo', 'o1', 'purchase', expect.any(AbortSignal));
    });

    it('tapping a result picks it and moves on to batch and expiry', async () => {
        search.mockResolvedValue([prod('1', 'DOLO-650 TAB')]);
        render(<Host initial={[emptyItem()]} />);
        fireEvent.change(screen.getByTestId('purchase-search-input'), { target: { value: 'dolo' } });
        fireEvent.click((await screen.findAllByTestId('purchase-search-result'))[0]);
        expect(await screen.findByTestId('line-batch')).toBeInTheDocument();
        expect(lastEntry.__calls.selected).toEqual([{ i: 0, id: '1' }]);
        expect(screen.getByTestId('line-product-name')).toHaveTextContent('DOLO-650 TAB');
        expect(first()).toMatchObject({ productId: '1', pkg: 15, gstRate: 5, mrp: 32.1, hsnCode: '3004' });
    });

    it('no result: says so and offers to add the typed name as a new product', async () => {
        render(<Host initial={[emptyItem()]} />);
        fireEvent.change(screen.getByTestId('purchase-search-input'), { target: { value: 'zzzz' } });
        expect(await screen.findByText(/No medicine found for “zzzz”/)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('add-new-product'));
        expect(lastEntry.__calls.opened).toEqual([{ i: 0, name: 'zzzz' }]);
    });

    it('a scanned line shows what the bill said and the suggested medicines', () => {
        render(<Host initial={[{ ...emptyItem(), ocrOriginalName: 'DOLLO 65', ocrSuggestions: [{ id: 's1', name: 'DOLO 650', packSize: 15, packUnit: 'Tablet', gstRate: 5, mrp: 32.1, hsnCode: '3004' } as any] }]} />);
        expect(screen.getByText(/The bill says: “DOLLO 65”/)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('ocr-suggestion'));
        expect(lastEntry.__calls.selected).toEqual([{ i: 0, id: 's1' }]);
    });

    it('Change goes back to the search', () => {
        render(<Host initial={[goodLine()]} />);
        fireEvent.click(screen.getByTestId('change-product'));
        expect(screen.getByText('Find the medicine')).toBeInTheDocument();
        expect(first().productId).toBe('');
    });
});

describe('PurchaseLineSheet: filling the line', () => {
    const open = (item = goodLine({ batchNo: '', expiryDate: '', qty: 0, freeQty: 0, purchaseRate: 0, mrp: 0 })) => render(<Host initial={[item]} />);

    it('has the desktop row\'s columns, with the desktop names and in the desktop order', () => {
        open();
        const labels = Array.from(document.querySelectorAll('[data-slot="field-label"]')).map((e) => (e.textContent || '').trim());
        expect(labels).toEqual(['HSN', 'Batch', 'Expiry', 'Pkg', 'Qty', 'Free', 'MRP', 'Rate', 'GST%', 'PTR', 'PTS', 'Disc%']);
        for (const t of ['Item', 'Quantity', 'Price']) expect(screen.getByText(t)).toBeInTheDocument();
    });

    it('QTY is there, called Qty (not "Packs"), as are Free and Pkg', () => {
        open();
        expect(screen.getByLabelText('Qty')).toBe(screen.getByTestId('line-qty'));
        expect(screen.getByLabelText('Free')).toBe(screen.getByTestId('line-free'));
        expect(screen.getByLabelText('Pkg')).toBe(screen.getByTestId('line-pkg'));
        expect(screen.queryByText(/Packs|Units per pack|Purchase rate/i)).not.toBeInTheDocument();
    });

    it('a required box is only called wrong once the clerk has been in it, and then says what to do', () => {
        open(goodLine({ batchNo: '', qty: 0, purchaseRate: 0, mrp: 0 }));
        expect(screen.queryByText('Enter the batch number')).not.toBeInTheDocument();
        fireEvent.blur(screen.getByTestId('line-batch'));
        expect(screen.getByText('Enter the batch number')).toBeInTheDocument();
        expect(screen.getByTestId('line-batch')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByTestId('line-batch').getAttribute('aria-describedby')).toContain('line-batch-error');
        fireEvent.blur(screen.getByTestId('line-qty'));
        fireEvent.blur(screen.getByTestId('line-rate'));
        fireEvent.blur(screen.getByTestId('line-mrp'));
        for (const t of ['Enter the quantity', 'Enter the purchase rate', 'Enter the MRP']) expect(screen.getByText(t)).toBeInTheDocument();
    });

    it('the header shows the AMOUNT and the landing cost floor while the fields scroll', () => {
        open();
        expect(screen.getByText(/^AMOUNT ₹/)).toBeInTheDocument();
        expect(screen.getByText(/LANDING COST FLOOR ₹/)).toBeInTheDocument();
    });

    it('batch is typed as-is; expiry types digits and becomes MM/YYYY, then the stored first-of-month date when you leave it', () => {
        open();
        fireEvent.change(screen.getByTestId('line-batch'), { target: { value: 'ab12' } });
        expect(first().batchNo).toBe('ab12');
        const exp = screen.getByTestId('line-expiry');
        expect(exp).toHaveAttribute('inputmode', 'numeric');
        fireEvent.change(exp, { target: { value: '1228' } });
        expect((exp as HTMLInputElement).value).toBe('12/28');
        fireEvent.blur(exp);
        expect(first().expiryDate).toBe('2028-12-01');
        expect((screen.getByTestId('line-expiry') as HTMLInputElement).value).toBe('12/2028');
    });

    it('an expired or soon-to-expire batch shows a warning in words', () => {
        const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
        const { unmount } = open(goodLine({ expiryDate: d(-3) }));
        expect(screen.getByTestId('line-expiry-warning')).toHaveTextContent('already expired');
        unmount();
        open(goodLine({ expiryDate: d(30) }));
        expect(screen.getByTestId('line-expiry-warning')).toHaveTextContent('within 90 days');
    });

    it('quantity, free and pack size are whole numbers, and the units are worked out', () => {
        open();
        fireEvent.change(screen.getByTestId('line-qty'), { target: { value: '10' } });
        fireEvent.change(screen.getByTestId('line-free'), { target: { value: '2' } });
        expect(screen.getByTestId('line-qty')).toHaveAttribute('inputmode', 'numeric');
        expect(first()).toMatchObject({ qty: 10, freeQty: 2 });
        expect(screen.getByTestId('line-units')).toHaveTextContent('= 150 units + 30 free');
        fireEvent.change(screen.getByTestId('line-pkg'), { target: { value: '10' } });
        expect(screen.getByTestId('line-units')).toHaveTextContent('= 100 units + 20 free');
    });

    it('rates take decimals; GST is picked from the slabs', () => {
        open();
        fireEvent.change(screen.getByTestId('line-rate'), { target: { value: '22.5' } });
        fireEvent.change(screen.getByTestId('line-disc'), { target: { value: '7.5' } });
        expect(first()).toMatchObject({ purchaseRate: 22.5, discountPct: 7.5 });
        expect(screen.getByTestId('line-rate')).toHaveAttribute('inputmode', 'decimal');
        fireEvent.click(screen.getByTestId('gst-12'));
        expect(first().gstRate).toBe(12);
        expect(screen.getByTestId('gst-12')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('gst-5')).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('radiogroup', { name: 'GST%' })).toBeInTheDocument();
    });

    it('an unusual GST rate from a scanned bill still shows as a choice', () => {
        open(goodLine({ gstRate: 3 }));
        expect(screen.getByTestId('gst-3')).toHaveAttribute('aria-checked', 'true');
    });

    it('typing the MRP fills PTR and PTS like the desktop grid (only when they are empty)', () => {
        open(goodLine({ mrp: 0, ptr: 0, pts: 0, gstRate: 12 }));
        fireEvent.change(screen.getByTestId('line-mrp'), { target: { value: '100' } });
        expect(first()).toMatchObject({ mrp: 100, ptr: 71.43, pts: 67.86 });
    });

    it('typing the MRP does not overwrite a PTR the clerk already entered', () => {
        open(goodLine({ mrp: 0, ptr: 60, pts: 55, gstRate: 12 }));
        fireEvent.change(screen.getByTestId('line-mrp'), { target: { value: '100' } });
        expect(first()).toMatchObject({ ptr: 60, pts: 55 });
    });

    it('HSN, PTR and PTS are on the page like the desktop columns; only Pricing Details (Cess%, Freight/Unit, Other/Unit) is folded away', () => {
        open();
        for (const id of ['line-hsn', 'line-ptr', 'line-pts']) expect(screen.getByTestId(id)).toBeInTheDocument();
        expect(screen.queryByTestId('more-pricing-fields')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('more-pricing'));
        const fields = screen.getByTestId('more-pricing-fields');
        for (const id of ['line-cess', 'line-freight', 'line-other']) expect(within(fields).getByTestId(id)).toBeInTheDocument();
        expect(screen.getByTestId('more-pricing')).toHaveTextContent('Pricing Details');
        fireEvent.change(screen.getByTestId('line-cess'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('line-freight'), { target: { value: '0.5' } });
        expect(first()).toMatchObject({ cess: 1, freightPerUnit: 0.5 });
    });

    it('the navy panel shows the line total and the landing cost, and what is still needed', () => {
        open(goodLine({ expiryDate: '2099-12-01', batchNo: '' }));
        expect(screen.getByTestId('line-total')).toHaveTextContent('₹236.25');
        expect(screen.getByTestId('line-landing')).toHaveTextContent(/₹\d/);
        expect(screen.getByTestId('line-open-issues')).toHaveTextContent('Still needed: batch');
    });

    it('no "still needed" line when the medicine is complete', () => {
        open(goodLine());
        expect(screen.queryByTestId('line-open-issues')).not.toBeInTheDocument();
    });
});

describe('PurchaseLineSheet: leaving', () => {
    it('Done closes and keeps the line', () => {
        const onClose = jest.fn();
        render(<Host initial={[goodLine()]} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('line-done'));
        expect(onClose).toHaveBeenCalled();
        expect(screen.getByTestId('count')).toHaveTextContent('1');
        expect(first().productName).toBe('DOLO 650');
    });

    it('Remove deletes the line', () => {
        render(<Host initial={[goodLine(), goodLine({ productId: 'p2', productName: 'LOSAR' })]} />);
        fireEvent.click(screen.getByTestId('line-remove'));
        expect(screen.getByTestId('count')).toHaveTextContent('1');
        expect(first().productName).toBe('LOSAR');
    });

    it('closing a row nobody filled in drops it (but never the last row)', () => {
        const { unmount } = render(<Host initial={[goodLine(), emptyItem()]} index={1} />);
        fireEvent.click(screen.getByTestId('line-done'));                         // "Cancel" on the search step
        expect(screen.getByTestId('count')).toHaveTextContent('1');
        unmount();
        render(<Host initial={[emptyItem()]} index={0} />);
        fireEvent.click(screen.getByTestId('line-done'));
        expect(screen.getByTestId('count')).toHaveTextContent('1');
    });

    it('nothing is shown when no line is open', () => {
        render(<Host initial={[goodLine()]} index={null} />);
        expect(screen.queryByTestId('line-batch')).not.toBeInTheDocument();
        expect(screen.queryByText('Find the medicine')).not.toBeInTheDocument();
    });
});

describe('PurchaseLineSheet: PKG', () => {
    const open = (item = goodLine(), extra?: Record<string, unknown>) => render(
        <EntryHarness initial={[item]} extra={extra}>{(entry) => <PurchaseLineSheet entry={entry} index={0} onClose={jest.fn()} />}</EntryHarness>,
    );
    const pkg = () => screen.getByTestId('line-pkg') as HTMLInputElement;

    it('takes digits only', () => {
        open();
        fireEvent.change(pkg(), { target: { value: '12.5' } });
        expect(pkg().value).toBe('12');                              // never 125
        fireEvent.change(pkg(), { target: { value: 'ab' } });
        expect(pkg().value).toBe('');
    });

    it('a blank PKG is an error once the box was visited, and says what to enter (it is never 1)', () => {
        open(goodLine({ pkg: '' as any }));
        expect(screen.queryByText('Enter units per pack (Pkg)')).not.toBeInTheDocument();      // not shouted at before it was touched
        fireEvent.blur(pkg());
        expect(screen.getByText('Enter units per pack (Pkg)')).toBeInTheDocument();
        expect(pkg()).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByTestId('line-open-issues')).toHaveTextContent('Still needed: pkg');
    });

    it('a number over 1000 is called wrong at once', () => {
        open(goodLine({ pkg: 15 }));
        fireEvent.change(pkg(), { target: { value: '1001' } });
        expect(screen.getByText('Pkg must be 1 to 1000')).toBeInTheDocument();
    });

    it('under the box: the unit, and "Catalogue: 10" when the catalogue has another real size', () => {
        open(goodLine({ pkg: 15, catalogPkg: 10, packUnitLabel: 'Tablet' }));
        expect(screen.getByText('Tablet · Catalogue: 10')).toBeInTheDocument();
    });

    it('no warning when the catalogue size is 1 (never filled in)', () => {
        open(goodLine({ pkg: 15, catalogPkg: 1, packUnitLabel: 'Tablet' }));
        const hint = document.getElementById(pkg().getAttribute('aria-describedby')!)!;
        expect(hint).toHaveTextContent(/^Tablet$/);                 // the unit only, no "Catalogue: ..." warning
        expect(screen.queryByText(/Catalogue:/)).not.toBeInTheDocument();
    });

    it('the server\'s reason for refusing this line\'s pack size is shown under the box', () => {
        open(goodLine({ pkg: 15 }), { pkgServerIssue: { index: 0, message: 'Batch B1 is already in stock as packs of 10.' } });
        expect(screen.getByText('Batch B1 is already in stock as packs of 10.')).toBeInTheDocument();
        expect(pkg()).toHaveAttribute('aria-invalid', 'true');
    });

    it('a server reason for ANOTHER line is not shown here', () => {
        open(goodLine({ pkg: 15 }), { pkgServerIssue: { index: 3, message: 'Batch B9 is already in stock.' } });
        expect(screen.queryByText('Batch B9 is already in stock.')).not.toBeInTheDocument();
    });

    it('the units line follows the PKG, and is blank when the PKG is not valid', () => {
        open(goodLine({ pkg: 10, qty: 4, freeQty: 1 }));
        expect(screen.getByTestId('line-units')).toHaveTextContent('= 40 units + 10 free');
        fireEvent.change(pkg(), { target: { value: '' } });
        expect(screen.getByTestId('line-units')).toHaveTextContent('');
    });
});

