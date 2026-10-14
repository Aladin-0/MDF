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

    it('Case 4: Dynamically renders store details from outlet prop', () => {
        const customOutlet = {
            id: 'out-123',
            organizationId: 'org-1',
            name: 'Apex City Pharmacy',
            address: '101 Medical Lane, Sector 4',
            city: 'Pune',
            state: 'Maharashtra',
            pincode: '411001',
            phone: '+91-9988776655',
            gstin: '27AAAAA0000A1Z5',
            drugLicenseNo: 'DL-PUN-999',
            dl20b: '20B-MH-PUN-11111',
            dl21b: '21B-MH-PUN-22222',
            upiId: 'apexpharma@icici',
            bankDetails: 'HDFC Bank, A/C: 987654321, IFSC: HDFC0001234',
            terms: 'Custom terms: No returns after 7 days.',
            isActive: true,
            createdAt: '2026-01-01',
        };

        const { container } = render(<ManavataA4Invoice invoice={mockInvoice} outlet={customOutlet as any} />);

        // Header check
        expect(screen.getByText('Apex City Pharmacy')).toBeInTheDocument();
        expect(screen.getByText('101 Medical Lane, Sector 4')).toBeInTheDocument();
        expect(screen.getByText('Pune, Maharashtra, 411001')).toBeInTheDocument();
        expect(container.textContent).toContain('+91-9988776655');
        expect(container.textContent).toContain('27AAAAA0000A1Z5');
        expect(container.textContent).toContain('20B: 20B-MH-PUN-11111 | 21B: 21B-MH-PUN-22222');

        // Footer check
        expect(screen.getByText('HDFC Bank, A/C: 987654321, IFSC: HDFC0001234')).toBeInTheDocument();
        expect(screen.getByText('Custom terms: No returns after 7 days.')).toBeInTheDocument();
        expect(screen.getByText('apexpharma@icici')).toBeInTheDocument();
        expect(screen.getByText('For Apex City Pharmacy')).toBeInTheDocument();
    });

    it('Case 5: Gracefully hides empty header and footer elements without dangling labels', () => {
        const bareInvoice = {
            ...mockInvoice,
            customer: undefined,
            items: [],
        };
        const emptyConfig: PrintSettingsConfig = {
            template: 'A4',
            columns: [],
            header: { showLogo: false, showDrugLicense: true, showGstin: true, customText: 'Minimal Pharmacy' },
            footer: { bankDetails: '', terms: '', upiId: '' },
        };

        const { container } = render(<ManavataA4Invoice invoice={bareInvoice as any} config={emptyConfig} outlet={undefined} />);

        // Store name should be there
        expect(screen.getByText('Minimal Pharmacy')).toBeInTheDocument();

        // No GSTIN or Phone labels should be dangling
        expect(container.textContent).not.toContain('GSTIN:');
        expect(container.textContent).not.toContain('Ph:');
        expect(container.textContent).not.toContain('DL:');
        expect(container.textContent).not.toContain('Pay via UPI');
        expect(container.textContent).not.toContain('Bank Details');
    });

    it('Case 6: Legacy hardcoded customText does not override active outlet name and supports custom tagline & footer', () => {
        const outletWithDetails = {
            id: 'out-sai',
            name: 'SAI Medical',
            address: 'Jubilee Park, Aurangabad',
            city: 'Aurangabad',
            state: 'Maharashtra',
            pincode: '431001',
            phone: '8484846611',
            gstin: '27AAPCM1753L2ZX',
            drugLicenseNo: '20-612209 / 21-612210',
            invoiceHeader: 'Quality Medicines Since 2018',
            invoiceFooter: 'Wishing you good health and fast recovery!',
        };

        const legacyBleedConfig: PrintSettingsConfig = {
            template: 'A4',
            columns: [],
            header: {
                showLogo: true,
                showDrugLicense: true,
                showGstin: true,
                customText: 'S.P.S MANAVATA PHARMA', // legacy default in DB
            },
            footer: {
                bankDetails: 'Bank: HDFC, A/C: 1234...', // dummy placeholder in DB
                terms: 'Goods once sold cannot be returned.',
            },
        };

        const { container } = render(
            <ManavataA4Invoice
                invoice={mockInvoice}
                config={legacyBleedConfig}
                outlet={outletWithDetails as any}
            />
        );

        // Active outlet name should take precedence over legacy "S.P.S MANAVATA PHARMA"
        expect(screen.getByText('SAI Medical')).toBeInTheDocument();
        expect(screen.getByText('For SAI Medical')).toBeInTheDocument();
        expect(container.textContent).not.toContain('S.P.S MANAVATA PHARMA');

        // Custom tagline and footer
        expect(screen.getByText('Quality Medicines Since 2018')).toBeInTheDocument();
        expect(screen.getByText('Wishing you good health and fast recovery!')).toBeInTheDocument();

        // Dummy bank details should be suppressed
        expect(container.textContent).not.toContain('Bank: HDFC, A/C: 1234...');
    });
});

