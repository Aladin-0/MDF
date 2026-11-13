import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BarcodeScanner, UNSUPPORTED_MESSAGE } from './BarcodeScanner';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

function setMediaDevices(value: any) {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
}
function fakeStream(extra: any = {}) {
    const track = { stop: jest.fn(), getCapabilities: jest.fn().mockReturnValue(extra.caps ?? {}), applyConstraints: jest.fn().mockResolvedValue(undefined) };
    return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}

afterEach(() => {
    delete (window as any).BarcodeDetector;
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else delete (navigator as any).mediaDevices;
    jest.useRealTimers();
});

describe('BarcodeScanner', () => {
    it('says so when BarcodeDetector does not exist, and Enter manually closes', async () => {
        const onClose = jest.fn();
        render(<BarcodeScanner open onClose={onClose} onCode={jest.fn()} />);
        expect(await screen.findByTestId('scanner-message')).toHaveTextContent(UNSUPPORTED_MESSAGE);
        fireEvent.click(screen.getByTestId('enter-manually'));
        expect(onClose).toHaveBeenCalled();
    });

    it('permission denied gets its own message', async () => {
        (window as any).BarcodeDetector = jest.fn();
        const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(err) });
        render(<BarcodeScanner open onClose={jest.fn()} onCode={jest.fn()} />);
        expect(await screen.findByTestId('scanner-message')).toHaveTextContent(/permission was denied/i);
    });

    it('no camera gets its own message', async () => {
        (window as any).BarcodeDetector = jest.fn();
        const err = Object.assign(new Error('none'), { name: 'NotFoundError' });
        setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(err) });
        render(<BarcodeScanner open onClose={jest.fn()} onCode={jest.fn()} />);
        expect(await screen.findByTestId('scanner-message')).toHaveTextContent(/no camera was found/i);
    });

    it('a browser with no mediaDevices (insecure page) does not throw', async () => {
        (window as any).BarcodeDetector = jest.fn();
        setMediaDevices(undefined);
        render(<BarcodeScanner open onClose={jest.fn()} onCode={jest.fn()} />);
        expect(await screen.findByTestId('scanner-message')).toHaveTextContent(/no camera was found/i);
    });

    it('opens the rear camera, reads a code once, closes, and stops the camera', async () => {
        const detect = jest.fn().mockResolvedValue([{ rawValue: '8901234567890' }]);
        (window as any).BarcodeDetector = jest.fn().mockImplementation(() => ({ detect }));
        const { track, stream } = fakeStream();
        const getUserMedia = jest.fn().mockResolvedValue(stream);
        setMediaDevices({ getUserMedia });
        Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
        HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);

        const onCode = jest.fn();
        const onClose = jest.fn();
        render(<BarcodeScanner open onClose={onClose} onCode={onCode} />);

        await waitFor(() => expect(onCode).toHaveBeenCalledWith('8901234567890'), { timeout: 2000 });
        expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } });
        expect((window as any).BarcodeDetector).toHaveBeenCalledWith({ formats: expect.arrayContaining(['ean_13', 'code_128', 'qr_code']) });
        await new Promise((r) => setTimeout(r, 500));       // more polls would have fired more codes
        expect(onCode).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(track.stop).toHaveBeenCalled();
    });

    it('shows a torch button only when the camera supports it, and toggles it', async () => {
        (window as any).BarcodeDetector = jest.fn().mockImplementation(() => ({ detect: jest.fn().mockResolvedValue([]) }));
        const { track, stream } = fakeStream({ caps: { torch: true } });
        setMediaDevices({ getUserMedia: jest.fn().mockResolvedValue(stream) });
        HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);

        render(<BarcodeScanner open onClose={jest.fn()} onCode={jest.fn()} />);
        const torch = await screen.findByTestId('torch-toggle');
        await act(async () => { fireEvent.click(torch); });
        expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
        expect(screen.getByTestId('torch-toggle')).toHaveAttribute('aria-pressed', 'true');
    });

    it('stops the camera when the scanner is closed or unmounted', async () => {
        (window as any).BarcodeDetector = jest.fn().mockImplementation(() => ({ detect: jest.fn().mockResolvedValue([]) }));
        const { track, stream } = fakeStream();
        setMediaDevices({ getUserMedia: jest.fn().mockResolvedValue(stream) });
        HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);

        const { rerender } = render(<BarcodeScanner open onClose={jest.fn()} onCode={jest.fn()} />);
        await waitFor(() => expect(screen.queryByText('Starting camera...')).not.toBeInTheDocument());
        rerender(<BarcodeScanner open={false} onClose={jest.fn()} onCode={jest.fn()} />);
        expect(track.stop).toHaveBeenCalled();
    });

    it('renders nothing and never touches the camera while closed', () => {
        const getUserMedia = jest.fn();
        (window as any).BarcodeDetector = jest.fn();
        setMediaDevices({ getUserMedia });
        render(<BarcodeScanner open={false} onClose={jest.fn()} onCode={jest.fn()} />);
        expect(screen.queryByTestId('scanner-video')).not.toBeInTheDocument();
        expect(getUserMedia).not.toHaveBeenCalled();
    });
});
