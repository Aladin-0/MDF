import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManavataA4Invoice } from '../ManavataA4Invoice';
import { SaleInvoice, PrintSettingsConfig } from '@/types';

// Mock invoice data
const mockInvoice: SaleInvoice = {
    id: 'test-invoice-1',
    invoiceNo: 'INV-001',
    createdAt: '2026-10-02T10:00:00Z',
    grandTotal: 1000,
    subtotal: 1000,
    discountAmount: 0,
    taxableAmount: 1000,
    cgst: 0,
    sgst: 0,
    items: [
        {
            productId: 'prod-1',
            name: 'Test Medicine',
            batchNo: 'B123',
            mrp: 100,
            rate: 90,
            ptr: 90,
            qtyStrips: 10,
            b_qty: 10,
            totalAmount: 900
        }
    ]
} as any;

const baseConfig: PrintSettingsConfig = {
    template: 'A4',
    header: {
        showLogo: true,
        showDrugLicense: true,
        showGstin: true,
        customText: 'TEST PHARMA'
    },
    footer: {
        bankDetails: 'Test Bank',
        terms: 'Test Terms'
    },
    columns: [
        { id: 'sn', label: 'Sn.', isVisible: true, order: 1, width: '10%' },
        { id: 'productName', label: 'Item Name', isVisible: true, order: 2, width: '40%' },
        { id: 'qty', label: 'Qty', isVisible: true, order: 3, width: '10%' },
        { id: 'amount', label: 'Total', isVisible: true, order: 4, width: '20%' },
    ]
};

describe('ManavataA4Invoice', () => {
    
    it('Case 1: Hides columns when isVisible is false', () => {
        const configHiddenQty: PrintSettingsConfig = {
            ...baseConfig,
            columns: [
                { id: 'sn', label: 'Sn.', isVisible: true, order: 1, width: '10%' },
                { id: 'productName', label: 'Item Name', isVisible: true, order: 2, width: '40%' },
                { id: 'qty', label: 'Qty', isVisible: false, order: 3, width: '10%' },
                { id: 'amount', label: 'Total', isVisible: true, order: 4, width: '20%' },
            ]
        };
        
        render(<ManavataA4Invoice invoice={mockInvoice} config={configHiddenQty} />);
        
        // "Item Name" and "Total" should be visible
        expect(screen.getByText('Item Name')).toBeInTheDocument();
        expect(screen.getByText('Total')).toBeInTheDocument();
        
        // "Qty" should NOT be visible
        const qtyEl = screen.queryByText('Qty');
        if (qtyEl) {
            screen.debug();
        }
        expect(qtyEl).not.toBeInTheDocument();
    });

    it('Case 2: Renders columns in the correct sorted order', () => {
        const configReordered: PrintSettingsConfig = {
            ...baseConfig,
            columns: [
                { id: 'amount', label: 'Total', isVisible: true, order: 1, width: '20%' },
                { id: 'qty', label: 'Qty', isVisible: true, order: 2, width: '10%' },
                { id: 'productName', label: 'Item Name', isVisible: true, order: 3, width: '40%' },
                { id: 'sn', label: 'Sn.', isVisible: true, order: 4, width: '10%' },
            ]
        };
        
        render(<ManavataA4Invoice invoice={mockInvoice} config={configReordered} />);
        
        const thElements = screen.getAllByRole('columnheader');
        // Filter out the tax summary table headers by just taking the first 4
        // The main grid should have these 4 headers in this exact order
        expect(thElements[0]).toHaveTextContent('Total');
        expect(thElements[1]).toHaveTextContent('Qty');
        expect(thElements[2]).toHaveTextContent('Item Name');
        expect(thElements[3]).toHaveTextContent('Sn.');
    });

    it('Case 3: Falls back gracefully if config is undefined', () => {
        // Without throwing
        render(<ManavataA4Invoice invoice={mockInvoice} config={undefined} />);
        
        // Should fallback to DEFAULT_WHOLESALE which usually has "Item" or similar
        // Just asserting it renders without crashing
        expect(screen.getByText('Test Medicine')).toBeInTheDocument();
    });
});
