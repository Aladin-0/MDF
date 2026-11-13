import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoreDetailsSheet, prescriptionDataUrl } from './MoreDetailsSheet';
import { useBillingStore } from '@/store/billingStore';
import { useSettingsStore } from '@/store/settingsStore';

function seed(updates: Record<string, unknown> = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates } as any } }));
}
const active = () => { const s = useBillingStore.getState(); return s.drafts[s.activeDraftId!]; };

beforeEach(() => {
    useSettingsStore.setState({ enableEwayBill: false } as any);
});

describe('MoreDetailsSheet: retail', () => {
    it('hospital and Rx number are labelled fields that write to the draft as you type', () => {
        seed();
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        fireEvent.change(screen.getByLabelText('Hospital / referral'), { target: { value: 'City Hospital' } });
        fireEvent.change(screen.getByLabelText('Rx number'), { target: { value: 'RX-4411' } });
        expect(active().hospitalName).toBe('City Hospital');
        expect(active().prescriptionNo).toBe('RX-4411');
        expect(screen.getByLabelText('Hospital / referral')).toHaveClass('h-12');
    });

    it('shows no e-way fields on a retail bill, even with the outlet setting on', () => {
        useSettingsStore.setState({ enableEwayBill: true } as any);
        seed();
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        expect(screen.queryByLabelText('Transporter GSTIN')).not.toBeInTheDocument();
    });

    it('Add Rx photo: camera input (image/*, capture) stores the photo as a data URL in prescriptionImageUrl, with a preview', async () => {
        seed();
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        const camera = screen.getByTestId('rx-camera-input') as HTMLInputElement;
        expect(camera).toHaveAttribute('accept', 'image/*');
        expect(camera).toHaveAttribute('capture');
        expect(screen.getByTestId('rx-gallery-input')).not.toHaveAttribute('capture');

        const file = new File(['pretend-image-bytes'], 'rx.png', { type: 'image/png' });
        fireEvent.change(camera, { target: { files: [file] } });

        await waitFor(() => expect(active().prescriptionImageUrl).toMatch(/^data:image\/png;base64,/));
        expect(await screen.findByAltText('Prescription photo preview')).toHaveAttribute('src', active().prescriptionImageUrl!);
        expect(screen.getByText('Rx photo added')).toBeInTheDocument();
    });

    it('Remove photo clears prescriptionImageUrl', () => {
        seed({ prescriptionImageUrl: 'data:image/png;base64,AAAA' });
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Remove photo/ }));
        expect(active().prescriptionImageUrl).toBeNull();
        expect(screen.queryByAltText('Prescription photo preview')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Add Rx photo/ })).toBeInTheDocument();
    });

    it('a small photo is stored exactly as read; no resizing', async () => {
        const file = new File(['abc'], 'rx.jpg', { type: 'image/jpeg' });
        expect(await prescriptionDataUrl(file)).toBe('data:image/jpeg;base64,YWJj');
    });
});

describe('MoreDetailsSheet: wholesale', () => {
    it('e-way fields appear only when the outlet has e-way bills on', () => {
        seed({ saleType: 'WHOLESALE' });
        const { unmount } = render(<MoreDetailsSheet open onClose={jest.fn()} />);
        expect(screen.queryByLabelText('Transporter GSTIN')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Hospital / referral')).not.toBeInTheDocument();       // no Rx on wholesale
        unmount();

        useSettingsStore.setState({ enableEwayBill: true } as any);
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        for (const label of ['Transporter GSTIN', 'Distance (km)', 'Mode', 'Vehicle type', 'Vehicle no.']) expect(screen.getByLabelText(label)).toBeInTheDocument();
    });

    it('e-way fields write to the draft; distance is a numeric keypad field that keeps digits only', () => {
        useSettingsStore.setState({ enableEwayBill: true } as any);
        seed({ saleType: 'WHOLESALE' });
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        fireEvent.change(screen.getByLabelText('Transporter GSTIN'), { target: { value: '27ABCDE1234F1Z5' } });
        fireEvent.change(screen.getByLabelText('Vehicle no.'), { target: { value: 'MH01AB1234' } });
        fireEvent.change(screen.getByLabelText('Mode'), { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('Vehicle type'), { target: { value: 'O' } });
        const distance = screen.getByLabelText('Distance (km)');
        expect(distance).toHaveAttribute('inputmode', 'numeric');
        fireEvent.change(distance, { target: { value: '5a0' } });

        const d = active();
        expect(d.transporterId).toBe('27ABCDE1234F1Z5');
        expect(d.vehicleNo).toBe('MH01AB1234');
        expect(d.transMode).toBe(2);
        expect(d.vehicleType).toBe('O');
        expect(d.transDistance).toBe(50);
    });
});

describe('MoreDetailsSheet: invoice date', () => {
    it('invoice mode has a datetime-local field that sets invoiceDate', () => {
        seed({ documentMode: 'invoice' });
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        const date = screen.getByLabelText('Invoice date and time');
        expect(date).toHaveAttribute('type', 'datetime-local');
        fireEvent.change(date, { target: { value: '2026-11-12T09:30' } });
        expect(active().invoiceDate).toBe('2026-11-12T09:30');
    });

    it('quotation mode has no invoice date', () => {
        seed({ documentMode: 'quotation' });
        render(<MoreDetailsSheet open onClose={jest.fn()} />);
        expect(screen.queryByLabelText('Invoice date and time')).not.toBeInTheDocument();
    });

    it('Done closes the sheet', () => {
        seed();
        const onClose = jest.fn();
        render(<MoreDetailsSheet open onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalled();
    });
});
