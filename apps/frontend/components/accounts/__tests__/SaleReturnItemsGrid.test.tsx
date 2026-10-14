import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaleReturnItemsGrid } from '../SaleReturnItemsGrid';
import { ReturnItemRow } from '@/hooks/useSaleReturnCart';

describe('SaleReturnItemsGrid component', () => {
    const mockItems: ReturnItemRow[] = [
        {
            id: 'row-1',
            productName: 'Augmentin 625 Duo',
            batchId: 'batch-101',
            batchNo: 'AUG-99',
            qtyStrips: '2',
            qtyLoose: '4',
            packSize: 10,
            rate: '150.00',
            gstRate: '12',
            total: 360.00,
        },
    ];

    it('renders strip and loose inputs correctly with batch number', () => {
        render(
            <SaleReturnItemsGrid
                items={mockItems}
                onUpdateItem={jest.fn()}
                onAddItem={jest.fn()}
                onRemoveItem={jest.fn()}
                mode="edit"
                readOnlyProductInfo={true}
            />
        );

        expect(screen.getByText('Augmentin 625 Duo')).toBeInTheDocument();
        expect(screen.getByText('Pack of 10')).toBeInTheDocument();
        expect(screen.getByText('AUG-99')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2')).toBeInTheDocument();
        expect(screen.getByDisplayValue('4')).toBeInTheDocument();
        expect(screen.getByText('₹360.00')).toBeInTheDocument();
    });

    it('triggers onUpdateItem when strip or loose values are modified', () => {
        const handleUpdate = jest.fn();
        render(
            <SaleReturnItemsGrid
                items={mockItems}
                onUpdateItem={handleUpdate}
                onAddItem={jest.fn()}
                onRemoveItem={jest.fn()}
                mode="edit"
            />
        );

        const stripsInput = screen.getByDisplayValue('2');
        fireEvent.change(stripsInput, { target: { value: '5' } });
        expect(handleUpdate).toHaveBeenCalledWith('row-1', 'qtyStrips', '5');

        const looseInput = screen.getByDisplayValue('4');
        fireEvent.change(looseInput, { target: { value: '8' } });
        expect(handleUpdate).toHaveBeenCalledWith('row-1', 'qtyLoose', '8');
    });

    it('triggers onRemoveItem when delete button is clicked', () => {
        const handleRemove = jest.fn();
        render(
            <SaleReturnItemsGrid
                items={mockItems}
                onUpdateItem={jest.fn()}
                onAddItem={jest.fn()}
                onRemoveItem={handleRemove}
            />
        );

        const deleteButton = screen.getByTitle('Remove item');
        fireEvent.click(deleteButton);
        expect(handleRemove).toHaveBeenCalledWith('row-1');
    });
});
