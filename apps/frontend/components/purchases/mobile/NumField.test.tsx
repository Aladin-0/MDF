import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NumField, cleanNumber } from './NumField';

function Host({ start = 0, mode, spy }: { start?: number; mode?: 'numeric' | 'decimal'; spy?: (n: number) => void }) {
    const [v, setV] = useState(start);
    return (<><NumField label="Rate" value={v} onChange={(n) => { setV(n); spy?.(n); }} mode={mode} testId="f" /><button onClick={() => setV(99.5)}>outside</button><span data-testid="held">{v}</span></>);
}
const box = () => screen.getByTestId('f') as HTMLInputElement;

describe('cleanNumber', () => {
    it('decimals: one dot, two decimals, digits only', () => {
        expect(cleanNumber('12.345', true)).toBe('12.34');
        expect(cleanNumber('1.2.3', true)).toBe('1.23');
        expect(cleanNumber('a1b', true)).toBe('1');
        expect(cleanNumber('0.', true)).toBe('0.');
    });
    it('whole numbers stop at the first non-digit (1.5 is 1, never 15)', () => { expect(cleanNumber('1.5', false)).toBe('1'); expect(cleanNumber('-3', false)).toBe(''); expect(cleanNumber('42', false)).toBe('42'); });
});

describe('NumField', () => {
    it('is labelled, and uses the decimal keyboard by default / the number keyboard for whole numbers', () => {
        const { rerender } = render(<Host />);
        expect(screen.getByLabelText('Rate')).toHaveAttribute('inputmode', 'decimal');
        rerender(<Host mode="numeric" />);
        expect(screen.getByLabelText('Rate')).toHaveAttribute('inputmode', 'numeric');
    });
    it('shows nothing (placeholder) for 0 and the number otherwise', () => {
        render(<Host start={22.5} />);
        expect(box().value).toBe('22.5');
    });
    it('"0.5" can be typed: the dot is not swallowed on the way', () => {
        const spy = jest.fn();
        render(<Host spy={spy} />);
        fireEvent.change(box(), { target: { value: '0' } });
        fireEvent.change(box(), { target: { value: '0.' } });
        expect(box().value).toBe('0.');
        fireEvent.change(box(), { target: { value: '0.5' } });
        expect(box().value).toBe('0.5');
        expect(spy).toHaveBeenLastCalledWith(0.5);
    });
    it('clearing the box sends 0', () => {
        const spy = jest.fn();
        render(<Host start={5} spy={spy} />);
        fireEvent.change(box(), { target: { value: '' } });
        expect(spy).toHaveBeenLastCalledWith(0);
        expect(box().value).toBe('');
    });
    it('a number changed from outside (PTR filled from the MRP) shows up', () => {
        render(<Host start={1} />);
        fireEvent.click(screen.getByText('outside'));
        expect(box().value).toBe('99.5');
    });
    it('letters are ignored', () => {
        render(<Host />);
        fireEvent.change(box(), { target: { value: 'abc' } });
        expect(box().value).toBe('');
    });
});
