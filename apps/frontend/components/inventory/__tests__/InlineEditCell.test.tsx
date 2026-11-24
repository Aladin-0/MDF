import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineEditCell, QUICK_EDIT_LABELS } from '../InlineEditCell';

const product = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'ENERZAL ZERO ORANGE', composition: '.', manufacturer: 'FDC PHARMA LTD', drugType: 'allopathy',
    scheduleType: 'OTC', hsnCode: '2202', gstRate: 40, packSize: 1, packUnit: 'Piece', packType: 'piece', ...over,
}) as any;

describe('Quick edit (inventory list)', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.releasePointerCapture = jest.fn();
    });

    it('offers the salt, the maker and the type, not only the tax and pack fields', () => {
        expect(Object.keys(QUICK_EDIT_LABELS)).toEqual(
            ['composition', 'manufacturer', 'drugType', 'gstRate', 'hsnCode', 'scheduleType', 'packType', 'packSize', 'packUnit']);
        expect(QUICK_EDIT_LABELS).toMatchObject({ composition: 'Salt (Composition)', manufacturer: 'Maker', drugType: 'Type' });
    });

    it('saves a salt typed into the cell', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(<InlineEditCell product={product()} field="composition" onSave={onSave} />);
        const input = screen.getByLabelText('Salt (Composition) for ENERZAL ZERO ORANGE');
        expect(input).toHaveValue('.');
        await userEvent.clear(input);
        await userEvent.type(input, 'Electrolytes{enter}');
        await waitFor(() => expect(onSave).toHaveBeenCalledWith('Electrolytes'));
    });

    it('changes the type from a list', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(<InlineEditCell product={product()} field="drugType" onSave={onSave} />);
        await userEvent.click(screen.getByRole('combobox', { name: 'Type for ENERZAL ZERO ORANGE' }));
        await userEvent.click(await screen.findByRole('option', { name: 'General / FMCG' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith('general'));
    });

    it('sends a GST rate of 40 as a number, and nothing for an empty box', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(<InlineEditCell product={product({ gstRate: 18 })} field="gstRate" onSave={onSave} />);
        const input = screen.getByLabelText('GST Rate (%) for ENERZAL ZERO ORANGE');
        await userEvent.clear(input);
        await userEvent.keyboard('{enter}');
        expect(onSave).not.toHaveBeenCalled();                 // an emptied box is not "0%"
        await userEvent.type(input, '40{enter}');
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(40));
    });
});
