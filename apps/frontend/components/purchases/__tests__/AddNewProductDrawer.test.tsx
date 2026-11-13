import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AddNewProductDrawer } from '../AddNewProductDrawer';
import { clearSuggestionMemory } from '@/hooks/useCatalogSuggestions';
import { productsApi } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ productsApi: { suggest: jest.fn(), create: jest.fn() }, API_URL: 'http://api.test', getHeaders: () => ({}) }));
const suggest = productsApi.suggest as jest.Mock;
const create = productsApi.create as jest.Mock;

beforeAll(() => {
    (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView = jest.fn();
    (Element.prototype as any).hasPointerCapture = () => false;
    (Element.prototype as any).releasePointerCapture = () => {};
});

const PARACETAMOL = { value: 'PARACETAMOL', count: 49, hsnCode: '3004', gstRate: 12 };
const TRAMADOL = { value: 'TRAMADOL', count: 8, hsnCode: '3004', gstRate: 5, scheduleType: 'H1' };
const ODD = { value: 'ODD COMPOSITION', count: 2, hsnCode: '30049099XX', gstRate: 7.5, scheduleType: 'NotASchedule' };
const CIPLA = { value: 'CIPLA LIMITED', count: 350 };

const answers = (field: string, q: string) => {
    if (field === 'manufacturer') return Promise.resolve([CIPLA]);
    const t = q.toLowerCase();
    return Promise.resolve([PARACETAMOL, TRAMADOL, ODD].filter((s) => !t || s.value.toLowerCase().includes(t)));
};

function renderDrawer(onSuccess = jest.fn()) {
    render(<AddNewProductDrawer open onOpenChange={jest.fn()} initialName="Yamir" onSuccess={onSuccess} />);
    return onSuccess;
}
const comp = () => screen.getByTestId('composition-input') as HTMLInputElement;
const mfg = () => screen.getByTestId('manufacturer-input') as HTMLInputElement;
const hsn = () => screen.getByLabelText(/HSN Code/) as HTMLInputElement;
/** The option whose text matches (matched on text, not accessible name: the bold fragments make jsdom insert spaces into the name) */
const findOption = async (text: RegExp) => waitFor(() => {
    const hit = screen.queryAllByRole('option').find((o) => text.test(o.textContent || ''));
    if (!hit) throw new Error(`no option matching ${text}`);
    return hit;
});
const pickComposition = async (typed: string, option: RegExp) => {
    fireEvent.focus(comp());
    fireEvent.change(comp(), { target: { value: typed } });
    fireEvent.click(await findOption(option));
};

beforeEach(() => { suggest.mockReset(); create.mockReset(); clearSuggestionMemory(); suggest.mockImplementation((f: string, q: string) => answers(f, q)); });

describe('Add New Product: composition and manufacturer come from the catalogue', () => {
    it('both boxes are labelled and offer options as you type', async () => {
        renderDrawer();
        expect(screen.getByLabelText('Composition')).toBe(comp());
        expect(screen.getByLabelText('Manufacturer')).toBe(mfg());
        fireEvent.focus(mfg());
        fireEvent.change(mfg(), { target: { value: 'cip' } });
        expect(await findOption(/CIPLA LIMITED/)).toBeInTheDocument();
        expect(suggest).toHaveBeenCalledWith('manufacturer', 'cip', expect.any(AbortSignal));
    });

    it('picking a manufacturer fills the box with the catalogue\'s spelling', async () => {
        renderDrawer();
        fireEvent.focus(mfg());
        fireEvent.change(mfg(), { target: { value: 'cip' } });
        fireEvent.click(await findOption(/CIPLA LIMITED/));
        expect(mfg()).toHaveValue('CIPLA LIMITED');
    });

    it('picking a composition fills the EMPTY HSN and GST boxes, and says what it did', async () => {
        renderDrawer();
        await pickComposition('parac', /PARACETAMOL/);
        expect(comp()).toHaveValue('PARACETAMOL');
        expect(hsn()).toHaveValue('3004');
        expect(screen.getByLabelText(/GST %/)).toHaveTextContent('12%');
        const note = screen.getByTestId('autofill-note');
        expect(note).toHaveTextContent('Filled HSN 3004, GST 12% from the 49 products with this composition. Check them before saving.');
        expect(note).toHaveAttribute('role', 'status');
    });

    it('never fills the schedule from the default: no schedule is offered for PARACETAMOL, so that box stays for the clerk to choose', async () => {
        renderDrawer();
        await pickComposition('parac', /PARACETAMOL/);
        expect(screen.getByLabelText(/Schedule Type/)).toHaveTextContent('Select Schedule');
    });

    it('a real schedule from the products (H1) is filled', async () => {
        renderDrawer();
        await pickComposition('tram', /TRAMADOL/);
        expect(screen.getByLabelText(/Schedule Type/)).toHaveTextContent('Schedule H1');
        expect(screen.getByTestId('autofill-note')).toHaveTextContent('Schedule H1');
    });

    it('never overwrites what was already typed or chosen', async () => {
        renderDrawer();
        fireEvent.change(hsn(), { target: { value: '9999' } });
        await pickComposition('parac', /PARACETAMOL/);
        expect(hsn()).toHaveValue('9999');                          // kept
        expect(screen.getByLabelText(/GST %/)).toHaveTextContent('12%');   // the empty one was filled
        expect(screen.getByTestId('autofill-note')).toHaveTextContent('Filled GST 12%');
        expect(screen.getByTestId('autofill-note')).not.toHaveTextContent('HSN');
    });

    it('says nothing when there was nothing to fill', async () => {
        renderDrawer();
        fireEvent.change(hsn(), { target: { value: '9999' } });
        await pickComposition('parac', /PARACETAMOL/);
        fireEvent.change(hsn(), { target: { value: '9999' } });
        // pick again: HSN kept, GST already chosen -> nothing left to fill
        await pickComposition('tram', /TRAMADOL/);
        expect(screen.getByLabelText(/Schedule Type/)).toHaveTextContent('Schedule H1');       // the only empty box that could be filled
    });

    it('skips values this form cannot hold (an HSN longer than 8, a GST rate that is not a slab, an unknown schedule)', async () => {
        renderDrawer();
        await pickComposition('odd', /ODD COMPOSITION/);
        expect(hsn()).toHaveValue('30049099');                      // cut to the 8 digits the box takes
        expect(screen.getByLabelText(/GST %/)).toHaveTextContent('Select GST');
        expect(screen.getByLabelText(/Schedule Type/)).toHaveTextContent('Select Schedule');
    });

    it('typing a composition without picking changes nothing else', async () => {
        renderDrawer();
        fireEvent.focus(comp());
        fireEvent.change(comp(), { target: { value: 'Paracetamol 650mg' } });
        expect(hsn()).toHaveValue('');
        expect(screen.queryByTestId('autofill-note')).not.toBeInTheDocument();
    });

    it('the note goes away once the clerk changes a box it filled', async () => {
        renderDrawer();
        await pickComposition('parac', /PARACETAMOL/);
        expect(screen.getByTestId('autofill-note')).toBeInTheDocument();
        fireEvent.change(hsn(), { target: { value: '3005' } });
        expect(screen.getByTestId('autofill-note')).toHaveTextContent('Filled GST 12%');
        expect(screen.getByTestId('autofill-note')).not.toHaveTextContent('HSN');
    });

    it('a filled HSN clears its "required" error', async () => {
        renderDrawer();
        fireEvent.click(screen.getByRole('button', { name: 'Save & Add to Row' }));
        expect(await screen.findByText('HSN code is required')).toBeInTheDocument();
        await pickComposition('parac', /PARACETAMOL/);
        expect(screen.queryByText('HSN code is required')).not.toBeInTheDocument();
    });

    it('what was picked is what is sent when the product is created', async () => {
        create.mockResolvedValue({ id: 'p1', name: 'Yamir' });
        const onSuccess = renderDrawer();
        await pickComposition('tram', /TRAMADOL/);                    // fills HSN 3004, GST 5, Schedule H1
        fireEvent.focus(mfg());
        fireEvent.change(mfg(), { target: { value: 'cip' } });
        fireEvent.click(await findOption(/CIPLA LIMITED/));
        fireEvent.change(screen.getByLabelText(/MRP/), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save & Add to Row' }));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        expect(create.mock.calls[0][0]).toMatchObject({ name: 'Yamir', composition: 'TRAMADOL', manufacturer: 'CIPLA LIMITED', hsnCode: '3004', gstRate: 5, scheduleType: 'H1', mrp: 50 });
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('PARACETAMOL leaves the schedule empty, so saving asks for it (the default is never assumed)', async () => {
        const onSuccess = renderDrawer();
        await pickComposition('parac', /PARACETAMOL/);
        fireEvent.change(screen.getByLabelText(/MRP/), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save & Add to Row' }));
        expect(await screen.findByText('Schedule type is required')).toBeInTheDocument();
        expect(create).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('the list is closed again after a pick, and a failing server leaves plain text boxes', async () => {
        suggest.mockRejectedValue(new Error('offline'));
        renderDrawer();
        fireEvent.focus(mfg());
        fireEvent.change(mfg(), { target: { value: 'anything' } });
        await new Promise((r) => setTimeout(r, 300));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(mfg()).toHaveValue('anything');
    });
});
