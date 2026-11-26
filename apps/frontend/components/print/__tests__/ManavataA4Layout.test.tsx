/** The A4 invoice must fit the page and add up: the bill from the shop's screenshot (INV-2026-000032). */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManavataA4Invoice } from '../ManavataA4Invoice';

jest.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Staff' } }) }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o' }));

// exactly what an outlet that never saved its printer settings has (core.models.default_print_settings_retail)
const column = (id: string, label: string, order: number, width: string, isVisible = true) => ({ id, label, order, width, isVisible });
const serverDefault: any = {
    template: 'Thermal_80mm', header: { showGstin: true, customText: '' }, footer: { terms: 'T' },
    columns: [column('sn', 'Sn.', 1, '10%'), column('productName', 'Item', 2, '40%'), column('qty', 'Qty', 3, '15%'), column('mrp', 'M.R.P', 4, '15%'),
              column('amount', 'Amt', 5, '20%'), column('ptr', 'PTR', 6, '0%', false), column('pts', 'PTS', 7, '0%', false), column('batch', 'Batch', 8, '0%'),
              column('hsn', 'HSN', 9, '0%', false)],
};
const item = { name: 'BELOW KNEE STO', batchNo: '93900112', packSize: 1, qtyStrips: 1, qtyLoose: 0, mrp: 939, rate: 600, ptr: 400, gstRate: 5, discountPct: 36.1,
               totalAmount: 600, taxableAmount: 571.43, gstAmount: 28.57 };
const bill = (over: any = {}) => ({ invoiceNo: 'INV-2026-000032', invoiceDate: '2026-11-26', saleType: 'RETAIL', grandTotal: 600, subtotal: 571.43,
                                    discountAmount: 339, roundOff: 0, items: [item], ...over } as any);

const widths = (c: HTMLElement) => Array.from(c.querySelectorAll('table.pdf-table thead th')).map((th) => parseFloat((th as HTMLElement).style.width));
const headings = (c: HTMLElement) => Array.from(c.querySelectorAll('table.pdf-table thead th')).map((th) => th.textContent);
const totals = () => screen.getByTestId('invoice-totals');
const row = (label: RegExp) => within(totals()).getByText(label).closest('div') as HTMLElement;

describe('columns', () => {
    it('every column drawn has room: the unlaid-out default prints as the A4 layout Settings shows', () => {
        const { container } = render(<ManavataA4Invoice invoice={bill()} config={serverDefault} />);
        expect(headings(container)).toEqual(['SN', 'Item Name & Company', 'Batch', 'Exp', 'Qty', 'MRP', 'Rate', 'Disc', 'Amount(₹)']);
        widths(container).forEach((w) => expect(w).toBeGreaterThan(3));
        expect(widths(container).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    });

    it('a layout the shop saved keeps its columns, spread over the full width', () => {
        const saved = { ...serverDefault, columns: [column('sn', 'Sn.', 1, '10%'), column('productName', 'Item', 2, '40%'), column('amount', 'Amt', 3, '20%')] };
        const { container } = render(<ManavataA4Invoice invoice={bill()} config={saved} />);
        expect(headings(container)).toEqual(['Sn.', 'Item', 'Amt']);
        expect(widths(container).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    });
});

describe('totals add up', () => {
    it('retail: MRP total less the discount is the grand total', () => {
        render(<ManavataA4Invoice invoice={bill()} config={serverDefault} />);
        expect(row(/MRP Total/)).toHaveTextContent('₹939.00');
        expect(row(/Discount Savings/)).toHaveTextContent('-₹339.00');
        expect(within(totals()).queryByText(/Round Off/)).not.toBeInTheDocument();
        expect(totals()).not.toHaveTextContent('571.43');
    });

    it('retail: the rupee rounding is shown', () => {
        render(<ManavataA4Invoice invoice={bill({ grandTotal: 601, items: [{ ...item, totalAmount: 600.6 }] })} config={serverDefault} />);
        expect(row(/MRP Total/)).toHaveTextContent('₹939.00');
        expect(row(/Discount Savings/)).toHaveTextContent('-₹338.40');
        expect(row(/Round Off/)).toHaveTextContent('+₹0.40');
    });

    it('an old bill whose lines do not carry its bill discount counts it as discount, never as rounding', () => {
        render(<ManavataA4Invoice invoice={bill({ grandTotal: 550 })} config={serverDefault} />);   // lines 600, billed 550
        expect(row(/MRP Total/)).toHaveTextContent('₹939.00');
        expect(row(/Discount Savings/)).toHaveTextContent('-₹389.00');
        expect(within(totals()).queryByText(/Round Off/)).not.toBeInTheDocument();
    });

    it('a total well above its lines is called an adjustment, not rounding', () => {
        render(<ManavataA4Invoice invoice={bill({ grandTotal: 650 })} config={serverDefault} />);
        expect(row(/Adjustment/)).toHaveTextContent('+₹50.00');
        expect(within(totals()).queryByText(/Round Off/)).not.toBeInTheDocument();
    });

    it('a bill with nothing off MRP shows its subtotal and no negative discount', () => {
        render(<ManavataA4Invoice invoice={bill({ grandTotal: 600, items: [{ ...item, mrp: 571.43, totalAmount: 600 }] })} config={serverDefault} />);
        expect(row(/Subtotal/)).toHaveTextContent('₹600.00');
        expect(row(/Discount Savings/)).toHaveTextContent('-₹0.00');
    });

    it('wholesale: taxable plus GST is the grand total', () => {
        const wholesale = bill({ saleType: 'WHOLESALE', grandTotal: 630, items: [{ ...item, qtyStrips: 2, rate: 300, totalAmount: 630, taxableAmount: 600, gstAmount: 30 }] });
        render(<ManavataA4Invoice invoice={wholesale} />);
        expect(row(/Taxable Amount/)).toHaveTextContent('₹600.00');
        expect(row(/^GST$/)).toHaveTextContent('+₹30.00');
        expect(totals()).not.toHaveTextContent('Discount Savings');
    });

    it('CGST and SGST add up to the tax, split as the server books it', () => {
        render(<ManavataA4Invoice invoice={bill()} config={serverDefault} />);
        expect(screen.getByText('₹14.28')).toBeInTheDocument();
        expect(screen.getByText('₹14.29')).toBeInTheDocument();
    });
});
