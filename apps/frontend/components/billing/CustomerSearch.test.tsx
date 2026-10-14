import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerSearch } from './CustomerSearch';

jest.mock('@/hooks/useOutletId', () => ({
    useOutletId: () => 'test-outlet-id',
}));

const mockLedgers = [
    { id: '1', name: 'John Customer', phone: '9999999999', groupName: 'Sundry Debtors' },
    { id: '2', name: 'Jane Customer', phone: '8888888888', groupName: 'Sundry Debtors' },
    { id: '3', name: 'Bob Customer', phone: '7777777777', groupName: 'Sundry Debtors' },
];

jest.mock('@tanstack/react-query', () => ({
    useQuery: () => ({
        data: mockLedgers,
        isFetching: false,
    }),
}));

describe('CustomerSearch Keyboard Navigation', () => {
    it('navigates with ArrowDown and selects with Enter', () => {
        const handleSelect = jest.fn();
        render(<CustomerSearch onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Search Customer...');
        fireEvent.focus(input);
        expect(screen.getByText('John Customer')).toBeInTheDocument();

        // ArrowDown moves highlight to index 1 (Jane Customer)
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(handleSelect).toHaveBeenCalledWith(mockLedgers[1]);
    });

    it('wraps around with ArrowUp navigation', () => {
        const handleSelect = jest.fn();
        render(<CustomerSearch onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Search Customer...');
        fireEvent.focus(input);

        // ArrowUp from index 0 wraps to last index (Bob Customer)
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(handleSelect).toHaveBeenCalledWith(mockLedgers[2]);
    });

    it('collapses dropdown on Escape', () => {
        const handleSelect = jest.fn();
        render(<CustomerSearch onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Search Customer...');
        fireEvent.focus(input);
        expect(screen.getByText('John Customer')).toBeInTheDocument();

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByText('John Customer')).not.toBeInTheDocument();
    });

    it('selects customer on touch/pointerDown without requiring Enter key', () => {
        const handleSelect = jest.fn();
        render(<CustomerSearch onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Search Customer...');
        fireEvent.focus(input);
        expect(screen.getByText('Jane Customer')).toBeInTheDocument();

        // Tapping / touch on tablet fires pointerdown
        const customerOption = screen.getByText('Jane Customer');
        fireEvent.pointerDown(customerOption);

        expect(handleSelect).toHaveBeenCalledWith(mockLedgers[1]);
    });

    it('allows changing customer via touch/pointerDown on Change button', () => {
        const handleSelect = jest.fn();
        render(<CustomerSearch currentLedger={mockLedgers[0]} onSelect={handleSelect} />);

        const changeBtn = screen.getByRole('button', { name: /change/i });
        fireEvent.pointerDown(changeBtn);

        expect(handleSelect).toHaveBeenCalledWith(null);
    });
});
