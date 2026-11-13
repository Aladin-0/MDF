import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SuggestInput, Highlight, describeSuggestion } from './SuggestInput';
import { clearSuggestionMemory } from '@/hooks/useCatalogSuggestions';
import { productsApi } from '@/lib/apiClient';
import type { ProductSuggestion } from '@/types';

jest.mock('@/lib/apiClient', () => ({ productsApi: { suggest: jest.fn() }, API_URL: 'http://api.test', getHeaders: () => ({}) }));
const suggest = productsApi.suggest as jest.Mock;

beforeAll(() => {
    (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView = jest.fn();
    (Element.prototype as any).hasPointerCapture = () => false;
});

const cipla: ProductSuggestion[] = [{ value: 'CIPLA LIMITED', count: 350 }, { value: 'CIPLA', count: 84 }];
const comp: ProductSuggestion[] = [{ value: 'PARACETAMOL', count: 49, hsnCode: '3004', gstRate: 5 }, { value: 'PARACETAMOL+CAFFEINE', count: 2, hsnCode: '3004', gstRate: 5, scheduleType: 'H' }];

function Host({ field = 'manufacturer', initial = '', onPick, spyChange }: { field?: 'manufacturer' | 'composition'; initial?: string; onPick?: (s: ProductSuggestion) => void; spyChange?: (t: string) => void }) {
    const [v, setV] = useState(initial);
    return (<><label htmlFor="box">Box</label><SuggestInput field={field} id="box" value={v} onChange={(t) => { setV(t); spyChange?.(t); }} onPick={onPick} /><span data-testid="value">{v}</span></>);
}
const box = () => screen.getByRole('combobox') as HTMLInputElement;
const type = async (t: string) => { fireEvent.focus(box()); fireEvent.change(box(), { target: { value: t } }); };
const options = () => screen.queryAllByTestId('suggestion');

beforeEach(() => { suggest.mockReset(); suggest.mockResolvedValue([]); clearSuggestionMemory(); });

describe('SuggestInput', () => {
    it('is an ordinary labelled text box until it is used: nothing is asked of the server', () => {
        render(<Host />);
        expect(screen.getByLabelText('Box')).toBe(box());
        expect(box()).toHaveAttribute('aria-autocomplete', 'list');
        expect(box()).toHaveAttribute('aria-expanded', 'false');
        expect(suggest).not.toHaveBeenCalled();
    });

    it('typing asks the catalogue for that field and lists the answers with how many products use each', async () => {
        suggest.mockResolvedValue(cipla);
        render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        expect(suggest).toHaveBeenCalledWith('manufacturer', 'cip', expect.any(AbortSignal));
        expect(options()[0]).toHaveTextContent('CIPLA LIMITED');
        expect(options()[0]).toHaveTextContent('350 products');
        expect(box()).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('listbox', { name: 'Manufacturers' })).toBeInTheDocument();
    });

    it('focusing an empty box offers the most used values', async () => {
        suggest.mockResolvedValue(cipla);
        render(<Host />);
        fireEvent.focus(box());
        await waitFor(() => expect(options()).toHaveLength(2));
        expect(suggest).toHaveBeenCalledWith('manufacturer', '', expect.any(AbortSignal));
    });

    it('tapping an option fills the box, tells the form which option it was, and closes the list', async () => {
        suggest.mockResolvedValue(cipla);
        const onPick = jest.fn();
        render(<Host onPick={onPick} />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        fireEvent.click(options()[0]);
        expect(screen.getByTestId('value')).toHaveTextContent('CIPLA LIMITED');
        expect(onPick).toHaveBeenCalledWith(cipla[0]);
        await waitFor(() => expect(options()).toHaveLength(0));
    });

    it('picking does not take the cursor out of the box (pointer-down on an option is cancelled, so the phone keyboard stays)', async () => {
        suggest.mockResolvedValue(cipla);
        render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
        act(() => { options()[0].dispatchEvent(down); });
        expect(down.defaultPrevented).toBe(true);
    });

    it('keyboard: ArrowDown moves through the options, Enter takes the highlighted one', async () => {
        suggest.mockResolvedValue(cipla);
        render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        fireEvent.keyDown(box(), { key: 'ArrowDown' });
        fireEvent.keyDown(box(), { key: 'ArrowDown' });
        expect(options()[1]).toHaveAttribute('aria-selected', 'true');
        expect(box().getAttribute('aria-activedescendant')).toBe(options()[1].id);
        fireEvent.keyDown(box(), { key: 'Enter' });
        expect(screen.getByTestId('value')).toHaveTextContent(/^CIPLA$/);
    });

    it('Enter with nothing highlighted is left alone (it must not pick by surprise)', async () => {
        suggest.mockResolvedValue(cipla);
        const onPick = jest.fn();
        render(<Host onPick={onPick} />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        act(() => { box().dispatchEvent(ev); });
        expect(onPick).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
    });

    it('Escape closes the list and keeps what was typed', async () => {
        suggest.mockResolvedValue(cipla);
        render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        fireEvent.keyDown(box(), { key: 'Escape' });
        await waitFor(() => expect(options()).toHaveLength(0));
        expect(box()).toHaveValue('cip');
    });

    it('leaving the box closes the list (Tab moves on without choosing)', async () => {
        suggest.mockResolvedValue(cipla);
        render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        fireEvent.blur(box());
        await waitFor(() => expect(options()).toHaveLength(0));
        expect(box()).toHaveValue('cip');
    });

    it('anything can still be typed: a name that is in no list is kept as typed, and no empty list is shown', async () => {
        suggest.mockResolvedValue([]);
        const spy = jest.fn();
        render(<Host spyChange={spy} />);
        await type('Brand New Labs');
        await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
        expect(options()).toHaveLength(0);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(spy).toHaveBeenLastCalledWith('Brand New Labs');
    });

    it('if the server cannot be reached it is just a text box', async () => {
        suggest.mockRejectedValue(new Error('offline'));
        render(<Host />);
        await type('cip');
        await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
        expect(options()).toHaveLength(0);
        expect(box()).toHaveValue('cip');
    });

    it('an answer is remembered: the same text does not ask again', async () => {
        suggest.mockResolvedValue(cipla);
        const { unmount } = render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        unmount();
        render(<Host />);
        await type('cip');
        await waitFor(() => expect(options()).toHaveLength(2));
        expect(suggest).toHaveBeenCalledTimes(1);
    });

    it('a composition option says what its products usually have', async () => {
        suggest.mockResolvedValue(comp);
        render(<Host field="composition" />);
        await type('parac');
        await waitFor(() => expect(options()).toHaveLength(2));
        expect(options()[0]).toHaveTextContent('49 products · HSN 3004 · GST 5%');
        expect(options()[1]).toHaveTextContent('Schedule H');
        expect(screen.getByRole('listbox', { name: 'Compositions' })).toBeInTheDocument();
    });

    it('an option that is only a copy of what is typed is not offered back', async () => {
        suggest.mockResolvedValue([{ value: 'CIPLA', count: 84 }]);
        render(<Host initial="cipla" />);
        fireEvent.focus(box());
        await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
        expect(options()).toHaveLength(0);
    });
});

describe('helpers', () => {
    it('Highlight puts the typed words in bold, in any case', () => {
        const { container } = render(<Highlight text="Sun Pharma Labs" query="pharma sun" />);
        expect(Array.from(container.querySelectorAll('strong')).map((e) => e.textContent)).toEqual(['Sun', 'Pharma']);
    });
    it('Highlight copes with regex characters and an empty query', () => {
        const { container } = render(<><Highlight text="A+B (X)" query="+ (" /><Highlight text="plain" query="" /></>);
        expect(container).toHaveTextContent('A+B (X)plain');
    });
    it('describeSuggestion', () => {
        expect(describeSuggestion({ value: 'X', count: 1 })).toBe('1 product');
        expect(describeSuggestion({ value: 'X', count: 1234, hsnCode: '3004', gstRate: 12, scheduleType: 'H1' })).toBe('1,234 products · HSN 3004 · GST 12% · Schedule H1');
    });
});
