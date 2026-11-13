import "@testing-library/jest-dom";
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QtyStepper } from './QtyStepper';

function Harness(props: any) {
    const [v, setV] = useState(props.start ?? 1);
    return <QtyStepper label="Strips" value={v} onChange={setV} {...props} />;
}

describe('QtyStepper', () => {
    it('plus and minus step by one and respect the limits', () => {
        render(<Harness start={1} min={1} max={3} />);
        const field = screen.getByLabelText('Strips') as HTMLInputElement;
        fireEvent.click(screen.getByLabelText('Strips increase'));
        fireEvent.click(screen.getByLabelText('Strips increase'));
        expect(field.value).toBe('3');
        expect(screen.getByLabelText('Strips increase')).toBeDisabled();       // max reached
        fireEvent.click(screen.getByLabelText('Strips decrease'));
        fireEvent.click(screen.getByLabelText('Strips decrease'));
        expect(field.value).toBe('1');
        expect(screen.getByLabelText('Strips decrease')).toBeDisabled();       // min reached
    });

    it('typing is clamped and strips non-digits', () => {
        render(<Harness start={1} min={0} max={10} />);
        const field = screen.getByLabelText('Strips') as HTMLInputElement;
        fireEvent.change(field, { target: { value: '99' } });
        expect(field.value).toBe('10');
        fireEvent.change(field, { target: { value: '4a' } });
        expect(field.value).toBe('4');
        fireEvent.change(field, { target: { value: '' } });
        expect(field.value).toBe('0');
    });

    it('asks for the numeric keypad', () => {
        render(<Harness />);
        expect(screen.getByLabelText('Strips')).toHaveAttribute('inputmode', 'numeric');
    });
});
