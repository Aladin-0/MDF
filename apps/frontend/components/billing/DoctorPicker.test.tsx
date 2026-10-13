import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { DoctorPicker } from './DoctorPicker';

jest.mock('@/hooks/useOutletId', () => ({
    useOutletId: () => 'test-outlet-id',
}));

const mockDoctors = [
    { id: '1', name: 'Dr. John Doe', regNo: 'REG123', specialty: 'Cardiology' },
    { id: '2', name: 'Dr. Jane Smith', regNo: 'REG456', specialty: 'Pediatrics' },
    { id: '3', name: 'Dr. Alice Williams', regNo: 'REG789', specialty: 'Neurology' },
];

jest.mock('@tanstack/react-query', () => ({
    useQuery: () => ({
        data: mockDoctors,
        isFetching: false,
    }),
}));

describe('DoctorPicker Keyboard Navigation', () => {
    it('navigates with ArrowDown/ArrowUp and selects with Enter', () => {
        const handleSelect = jest.fn();
        render(<DoctorPicker currentDoctor={null} onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Dr. Name / Reg No...');
        
        // Focus opens dropdown and defaults to index 0
        fireEvent.focus(input);
        expect(screen.getByText('Dr. John Doe')).toBeInTheDocument();

        // ArrowDown moves highlight to index 1 (Dr. Jane Smith)
        fireEvent.keyDown(input, { key: 'ArrowDown' });

        // Enter selects the currently highlighted option (Dr. Jane Smith)
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(handleSelect).toHaveBeenCalledWith(mockDoctors[1]);
    });

    it('wraps around and handles ArrowUp navigation', () => {
        const handleSelect = jest.fn();
        render(<DoctorPicker currentDoctor={null} onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Dr. Name / Reg No...');
        fireEvent.focus(input);

        // ArrowUp from index 0 wraps to last index (Dr. Alice Williams)
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(handleSelect).toHaveBeenCalledWith(mockDoctors[2]);
    });

    it('collapses dropdown on Escape', () => {
        const handleSelect = jest.fn();
        render(<DoctorPicker currentDoctor={null} onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Dr. Name / Reg No...');
        fireEvent.focus(input);
        expect(screen.getByText('Dr. John Doe')).toBeInTheDocument();

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByText('Dr. John Doe')).not.toBeInTheDocument();
    });

    it('selects doctor on touch/pointerDown without requiring Enter key', () => {
        const handleSelect = jest.fn();
        render(<DoctorPicker currentDoctor={null} onSelect={handleSelect} />);

        const input = screen.getByPlaceholderText('Dr. Name / Reg No...');
        fireEvent.focus(input);
        expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();

        // Tapping / touch on tablet fires pointerdown
        const doctorOption = screen.getByText('Dr. Jane Smith');
        fireEvent.pointerDown(doctorOption);

        expect(handleSelect).toHaveBeenCalledWith(mockDoctors[1]);
    });

    it('allows changing doctor via touch/pointerDown on Change button', () => {
        const handleSelect = jest.fn();
        render(<DoctorPicker currentDoctor={mockDoctors[0]} onSelect={handleSelect} />);

        const changeBtn = screen.getByRole('button', { name: /change/i });
        fireEvent.pointerDown(changeBtn);

        expect(handleSelect).toHaveBeenCalledWith(null);
    });
});
