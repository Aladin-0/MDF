import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionReasonSheet } from './RevisionReasonSheet';

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }) });
});

function setup(open = true) {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    const utils = render(<RevisionReasonSheet open={open} onClose={onClose} onSubmit={onSubmit} />);
    return { onSubmit, onClose, ...utils };
}

describe('RevisionReasonSheet', () => {
    it('lists the six reason codes as radio rows >= 48px', () => {
        setup();
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(6);
        radios.forEach((r) => expect(r.className).toContain('min-h-[48px]'));
        expect(screen.getByRole('radio', { name: /Doctor \/ header change/ })).toBeInTheDocument();
    });

    it('confirming empty shows inline errors for both fields and does not submit (no alert)', () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        const { onSubmit } = setup();
        fireEvent.click(screen.getByTestId('revision-confirm'));
        expect(screen.getByText('Choose a reason code.')).toBeInTheDocument();
        expect(screen.getByText('Write a short explanation.')).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
        alertSpy.mockRestore();
    });

    it('a code without an explanation (or only spaces) is still refused', () => {
        const { onSubmit } = setup();
        fireEvent.click(screen.getByRole('radio', { name: /Other/ }));
        fireEvent.change(screen.getByLabelText(/Explanation/), { target: { value: '   ' } });
        fireEvent.click(screen.getByTestId('revision-confirm'));
        expect(screen.queryByText('Choose a reason code.')).not.toBeInTheDocument();
        expect(screen.getByText('Write a short explanation.')).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('confirm sends the code and the trimmed explanation', () => {
        const { onSubmit } = setup();
        fireEvent.click(screen.getByRole('radio', { name: /Entry error: quantity/ }));
        expect(screen.getByRole('radio', { name: /Entry error: quantity/ })).toHaveAttribute('aria-checked', 'true');
        fireEvent.change(screen.getByLabelText(/Explanation/), { target: { value: '  typed 5 not 2 ' } });
        fireEvent.click(screen.getByTestId('revision-confirm'));
        expect(onSubmit).toHaveBeenCalledWith('ENTRY_ERROR_QTY', 'typed 5 not 2');
    });

    it('Cancel closes without submitting', () => {
        const { onSubmit, onClose } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('starts clean each time it opens', () => {
        const onSubmit = jest.fn();
        const { rerender } = render(<RevisionReasonSheet open onClose={jest.fn()} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('radio', { name: /Other/ }));
        fireEvent.change(screen.getByLabelText(/Explanation/), { target: { value: 'x' } });
        rerender(<RevisionReasonSheet open={false} onClose={jest.fn()} onSubmit={onSubmit} />);
        rerender(<RevisionReasonSheet open onClose={jest.fn()} onSubmit={onSubmit} />);
        expect((screen.getByLabelText(/Explanation/) as HTMLTextAreaElement).value).toBe('');
        expect(screen.getByRole('radio', { name: /Other/ })).toHaveAttribute('aria-checked', 'false');
    });
});
