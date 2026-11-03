import React, { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useGridNavigation } from '@/hooks/useGridNavigation';

function Grid({ onAddRow, dropdownOpen }: { onAddRow: () => void; dropdownOpen: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useGridNavigation(ref, onAddRow);
    return (
        <div ref={ref}>
            <table><tbody>
                <tr data-cart-row={0}>
                    <td><input data-testid="search" data-field="product-search" data-dropdown-open={dropdownOpen ? 'true' : 'false'} /></td>
                    <td><input data-testid="hsn" data-field="hsn" /></td>
                </tr>
            </tbody></table>
        </div>
    );
}

describe('useGridNavigation – product search dropdown', () => {
    it('does NOT add a row on ArrowDown/ArrowUp/Enter while the search dropdown is open', () => {
        const onAddRow = jest.fn();
        const { getByTestId } = render(<Grid onAddRow={onAddRow} dropdownOpen />);
        const input = getByTestId('search');
        input.focus();
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onAddRow).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(input); // focus must not be stolen either
    });

    it('still adds a row on ArrowDown from the last row when no dropdown is open', () => {
        const onAddRow = jest.fn();
        const { getByTestId } = render(<Grid onAddRow={onAddRow} dropdownOpen={false} />);
        const input = getByTestId('search');
        input.focus();
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(onAddRow).toHaveBeenCalledTimes(1);
    });
});
