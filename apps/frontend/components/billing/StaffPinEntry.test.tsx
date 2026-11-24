import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { StaffPinEntry } from './StaffPinEntry';
import { useBillingStore } from '@/store/billingStore';
import { staffApi } from '@/lib/apiClient';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/apiClient', () => ({ staffApi: { lookupByPin: jest.fn() } }));
jest.mock('@/store/authStore', () => ({
    useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: { name: 'Counter', outletId: 'outlet-1' } }),
}));
jest.mock('@/store/settingsStore', () => ({
    useSettingsStore: (pick: (s: unknown) => unknown) => pick({ selectedOutletId: null }),
}));

const lookupByPin = staffApi.lookupByPin as jest.Mock;
const STAFF = { id: 's1', name: 'Asha', role: 'billing_staff', maxDiscount: 5, canEditRate: false, billsToday: 0, totalSalesToday: 0 };

const press = (...keys: string[]) => keys.forEach((key) => fireEvent.keyDown(window, { key }));

describe('StaffPinEntry', () => {
    beforeEach(() => {
        lookupByPin.mockReset();
        useBillingStore.setState({ activeStaff: null, isPinVerified: false });
    });

    it('opens billing as soon as the server accepts the PIN, with no fixed pause', async () => {
        jest.useFakeTimers();
        try {
            lookupByPin.mockResolvedValue(STAFF);
            render(<StaffPinEntry />);
            press('1', '2', '3', '4');
            await act(async () => { await Promise.resolve(); });   // let the request finish; no timer is advanced

            expect(lookupByPin).toHaveBeenCalledTimes(1);
            expect(lookupByPin).toHaveBeenCalledWith('1234', 'outlet-1');
            expect(useBillingStore.getState().isPinVerified).toBe(true);
            expect(useBillingStore.getState().activeStaff).toEqual(STAFF);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps every digit and sends the PIN once when the keys arrive faster than the screen redraws', async () => {
        lookupByPin.mockResolvedValue(STAFF);
        render(<StaffPinEntry />);
        // all in one go, a fifth key included: no re-render happens between them
        act(() => { ['9', '8', '7', '6', '5'].forEach((key) => window.dispatchEvent(new KeyboardEvent('keydown', { key }))); });

        await waitFor(() => expect(useBillingStore.getState().isPinVerified).toBe(true));
        expect(lookupByPin).toHaveBeenCalledTimes(1);
        expect(lookupByPin).toHaveBeenCalledWith('9876', 'outlet-1');
    });

    it('lets the next try start at once after a wrong PIN', async () => {
        jest.useFakeTimers();
        try {
            lookupByPin.mockRejectedValueOnce({ error: { code: 'INVALID_PIN', message: 'Invalid PIN' } }).mockResolvedValueOnce(STAFF);
            render(<StaffPinEntry />);
            press('0', '0', '0', '0');
            await act(async () => { await Promise.resolve(); });
            expect(screen.getByTestId('pin-error')).toHaveTextContent('Invalid PIN');
            expect(useBillingStore.getState().isPinVerified).toBe(false);

            // typed straight away, while the dots are still shaking (no timer has run)
            press('1', '2', '3', '4');
            await act(async () => { await Promise.resolve(); });
            expect(lookupByPin).toHaveBeenLastCalledWith('1234', 'outlet-1');
            expect(useBillingStore.getState().isPinVerified).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('shows the server message when too many wrong PINs were tried', async () => {
        lookupByPin.mockRejectedValue({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong PIN attempts. Try again in 5 minute(s).' } });
        render(<StaffPinEntry />);
        press('1', '1', '1', '1');
        expect(await screen.findByTestId('pin-error')).toHaveTextContent('Too many wrong PIN attempts');
    });

    it('works from the on-screen number pad, with backspace', async () => {
        lookupByPin.mockResolvedValue(STAFF);
        render(<StaffPinEntry />);
        const tap = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
        tap('4'); tap('9');
        press('Backspace');
        tap('3'); tap('2'); tap('1');

        await waitFor(() => expect(lookupByPin).toHaveBeenCalledWith('4321', 'outlet-1'));
    });

    it('ignores shortcuts and a held-down key', () => {
        render(<StaffPinEntry />);
        fireEvent.keyDown(window, { key: '1', ctrlKey: true });
        fireEvent.keyDown(window, { key: '2', repeat: true });
        press('3', '3', '3');
        expect(lookupByPin).not.toHaveBeenCalled();
    });
});
