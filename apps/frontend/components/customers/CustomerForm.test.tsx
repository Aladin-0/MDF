import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/hooks/useCustomers', () => ({
    useCreateCustomer: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUpdateCustomer: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import CustomerForm from './CustomerForm';

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('Add customer popup', () => {
    it('opens as a centred dialog (not a side panel) with the family section', () => {
        wrap(<CustomerForm open onClose={jest.fn()} />);
        const dialog = screen.getByRole('dialog');
        expect(dialog.className).toMatch(/left-\[50%\]/);                 // centred on screen
        expect(dialog.className).not.toMatch(/slide-in-from-left|inset-y-0|right-0/);   // no slide-in from a side
        // wide on desktop, nearly edge-to-edge on a phone, scrolls inside itself on a short screen
        expect(dialog.className).toMatch(/max-w-4xl/);
        expect(dialog.className).toMatch(/w-\[calc\(100vw-1rem\)\]/);
        expect(dialog.className).toMatch(/max-h-\[92vh\]/);
        expect(screen.getByTestId('family-fields')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);      // one close button, not two stacked
    });

    it('lays the sections out in two columns from tablet up and one on a phone', () => {
        wrap(<CustomerForm open onClose={jest.fn()} />);
        const grid = screen.getByTestId('family-fields').closest('.grid');
        expect(grid?.className).toMatch(/grid-cols-1/);
        expect(grid?.className).toMatch(/md:grid-cols-2/);
        // person details and the family / credit section are in different columns
        expect(grid?.children).toHaveLength(2);
        expect(grid?.children[0]).not.toContainElement(screen.getByTestId('family-fields'));
        expect(grid?.children[1]).toContainElement(screen.getByTestId('family-fields'));
    });

    it('renders nothing while closed', () => {
        wrap(<CustomerForm open={false} onClose={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
