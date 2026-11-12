import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const post = jest.fn();
jest.mock('@/lib/api', () => ({ api: { post: (...args: unknown[]) => post(...args) } }));
jest.mock('@/lib/compressImage', () => ({ compressImage: (f: File) => Promise.resolve(f) }));

import { ScanBillDialog, MAX_SCAN_PAGES } from '../ScanBillDialog';

beforeAll(() => {
    // jsdom has no object URLs
    (URL as any).createObjectURL = jest.fn(() => 'blob:preview');
    (URL as any).revokeObjectURL = jest.fn();
});

beforeEach(() => {
    post.mockReset();
    let n = 0;
    post.mockImplementation(() => Promise.resolve({ data: { draftId: `draft-${++n}` } }));
});

const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const pick = (testId: string, files: File[]) =>
    fireEvent.change(screen.getByTestId(testId), { target: { files } });
const imagesSent = (call: number) => (post.mock.calls[call][1] as FormData).getAll('image') as File[];

function setup() {
    const onUploaded = jest.fn();
    render(<ScanBillDialog open onClose={jest.fn()} outletId="o1" onUploaded={onUploaded} />);
    return onUploaded;
}

describe('ScanBillDialog', () => {
    it('offers Camera and Gallery; camera opens the back camera, gallery allows several photos', () => {
        setup();
        expect(screen.getByTestId('scan-camera')).toBeInTheDocument();
        expect(screen.getByTestId('scan-gallery')).toBeInTheDocument();
        expect(screen.getByTestId('scan-camera-input')).toHaveAttribute('capture', 'environment');
        expect(screen.getByTestId('scan-gallery-input')).toHaveAttribute('multiple');
        expect(screen.getByTestId('scan-gallery-input')).not.toHaveAttribute('capture');
    });

    it('camera: page 1, Add page, page 2, Done -> ONE upload with both pages in order', async () => {
        const onUploaded = setup();
        pick('scan-camera-input', [photo('page1.jpg')]);
        expect(await screen.findByText('Page 1')).toBeInTheDocument();
        expect(screen.getByTestId('scan-add-camera')).toBeInTheDocument();
        pick('scan-camera-input', [photo('page2.jpg')]);
        expect(await screen.findByText('Page 2')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('scan-done'));
        await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ draftIds: ['draft-1'], failed: 0 }));
        expect(post).toHaveBeenCalledTimes(1);
        expect(imagesSent(0).map((f) => f.name)).toEqual(['page1.jpg', 'page2.jpg']);
    });

    it('a removed page is not uploaded', async () => {
        setup();
        pick('scan-camera-input', [photo('a.jpg')]);
        pick('scan-camera-input', [photo('b.jpg')]);
        fireEvent.click(await screen.findByLabelText('Remove page 1'));
        fireEvent.click(screen.getByTestId('scan-done'));
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
        expect(imagesSent(0).map((f) => f.name)).toEqual(['b.jpg']);
    });

    it('gallery with several photos asks; "separate bills" uploads one draft per photo', async () => {
        const onUploaded = setup();
        pick('scan-gallery-input', [photo('1.jpg'), photo('2.jpg'), photo('3.jpg')]);
        fireEvent.click(await screen.findByText('3 separate bills'));
        await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ draftIds: ['draft-1', 'draft-2', 'draft-3'], failed: 0 }));
        expect(post).toHaveBeenCalledTimes(3);
        expect(imagesSent(2).map((f) => f.name)).toEqual(['3.jpg']);
    });

    it('gallery with several photos as "pages of one bill" uploads them together', async () => {
        setup();
        pick('scan-gallery-input', [photo('p1.jpg'), photo('p2.jpg')]);
        fireEvent.click(await screen.findByText('Pages of one bill'));
        expect(await screen.findByText('Page 2')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('scan-done'));
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
        expect(imagesSent(0)).toHaveLength(2);
    });

    it('a single gallery photo goes straight to the page list', async () => {
        setup();
        pick('scan-gallery-input', [photo('only.jpg')]);
        expect(await screen.findByText('Page 1')).toBeInTheDocument();
        expect(screen.queryByText(/separate bills/)).not.toBeInTheDocument();
    });

    it(`stops at ${MAX_SCAN_PAGES} pages`, async () => {
        setup();
        pick('scan-gallery-input', Array.from({ length: MAX_SCAN_PAGES + 2 }, (_, i) => photo(`${i}.jpg`)));
        expect(await screen.findByText('Pages of one bill').then((el) => el.closest('button'))).toBeDisabled();
    });

    it('keeps the pages and shows the error when the upload fails', async () => {
        post.mockReset();
        post.mockRejectedValue({ response: { data: { error: { message: 'Server busy' } } } });
        setup();
        pick('scan-camera-input', [photo('a.jpg')]);
        fireEvent.click(await screen.findByTestId('scan-done'));
        expect(await screen.findByText('Server busy')).toBeInTheDocument();
        expect(screen.getByText('Page 1')).toBeInTheDocument();
    });
});
