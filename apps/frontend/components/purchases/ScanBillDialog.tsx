'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Images, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { api } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';

/** Must match MAX_SCAN_PAGES in apps/purchases/views.py. */
export const MAX_SCAN_PAGES = 6;

interface Page { id: string; file: File; url: string; }

export interface ScanUploadResult {
    /** Draft ids created, in upload order. One per bill. */
    draftIds: string[];
    failed: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    outletId: string;
    onUploaded: (result: ScanUploadResult) => void;
}

let pageSeq = 0;
const toPage = (file: File): Page => ({ id: `p${++pageSeq}`, file, url: URL.createObjectURL(file) });

/**
 * Scan a purchase bill from a phone.
 * - Camera: take page 1, "Add page" for page 2, 3 ... then "Scan" reads all pages as ONE bill.
 * - Gallery: pick one or several photos; with several, staff say whether they are
 *   separate bills (one draft each) or pages of one bill.
 * Nothing is saved as a purchase here — every scan becomes a draft that staff review.
 */
export function ScanBillDialog({ open, onClose, outletId, onUploaded }: Props) {
    const cameraRef = useRef<HTMLInputElement>(null);
    const galleryRef = useRef<HTMLInputElement>(null);
    const [pages, setPages] = useState<Page[]>([]);
    const [pendingGallery, setPendingGallery] = useState<File[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Free preview memory when pages are removed or the dialog closes.
    const pagesRef = useRef<Page[]>([]);
    pagesRef.current = pages;
    useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

    const reset = () => {
        pages.forEach((p) => URL.revokeObjectURL(p.url));
        setPages([]);
        setPendingGallery(null);
        setBusy(null);
        setError(null);
    };

    const close = () => {
        if (busy) return;
        reset();
        onClose();
    };

    const addPages = (files: File[]) => {
        setError(null);
        setPages((prev) => {
            const room = MAX_SCAN_PAGES - prev.length;
            if (files.length > room) setError(`A bill can have at most ${MAX_SCAN_PAGES} pages.`);
            return [...prev, ...files.slice(0, Math.max(room, 0)).map(toPage)];
        });
    };

    const removePage = (id: string) => setPages((prev) => {
        const gone = prev.find((p) => p.id === id);
        if (gone) URL.revokeObjectURL(gone.url);
        return prev.filter((p) => p.id !== id);
    });

    const onCamera = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) addPages(files);
    };

    const onGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (!files.length) return;
        // Adding to a bill already being built, or a single photo: they are pages.
        if (pages.length > 0 || files.length === 1) addPages(files);
        else setPendingGallery(files);   // several photos: ask what they are
    };

    const uploadBill = async (files: File[]): Promise<string> => {
        const form = new FormData();
        form.append('outletId', outletId);
        for (const f of files) form.append('image', await compressImage(f));
        const res = await api.post('/purchases/scan/upload/', form, { params: { outletId }, timeout: 120000 });
        return res.data.draftId as string;
    };

    const errorText = (err: any) =>
        err?.error?.message || err?.response?.data?.error?.message || err?.response?.data?.message
        || (err?.code === 'ECONNABORTED' ? 'Upload timed out. Check the internet connection and try again.' : err?.message)
        || 'Upload failed.';

    const scanAsOneBill = async (files: File[]) => {
        setBusy(files.length > 1 ? `Uploading ${files.length} pages…` : 'Uploading…');
        setError(null);
        try {
            const id = await uploadBill(files);
            reset();
            onUploaded({ draftIds: [id], failed: 0 });
        } catch (err) {
            setError(errorText(err));
            setBusy(null);
        }
    };

    const scanAsSeparateBills = async (files: File[]) => {
        setPendingGallery(null);
        const ids: string[] = [];
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
            setBusy(`Uploading bill ${i + 1} of ${files.length}…`);
            try {
                ids.push(await uploadBill([files[i]]));
            } catch {
                failed += 1;
            }
        }
        reset();
        onUploaded({ draftIds: ids, failed });
    };

    const inputs = (
        <>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={onCamera} data-testid="scan-camera-input" />
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
                onChange={onGallery} data-testid="scan-gallery-input" />
        </>
    );

    // Step: several gallery photos picked — separate bills or pages of one bill?
    if (pendingGallery) {
        const n = pendingGallery.length;
        return (
            <ModalShell open={open} onClose={close} title="Scan Bill" size="sm"
                footer={<Button variant="outline" className="flex-1" onClick={() => setPendingGallery(null)}>Back</Button>}>
                {inputs}
                <p className="text-sm text-muted-foreground">You picked {n} photos. What are they?</p>
                <div className="grid gap-3">
                    <Button className="h-auto justify-start py-3 text-left" onClick={() => scanAsSeparateBills(pendingGallery)}>
                        <span>
                            <span className="block font-semibold">{n} separate bills</span>
                            <span className="block text-xs opacity-80">Each photo becomes its own draft</span>
                        </span>
                    </Button>
                    <Button variant="outline" className="h-auto justify-start py-3 text-left"
                        disabled={n > MAX_SCAN_PAGES}
                        onClick={() => { const files = pendingGallery; setPendingGallery(null); addPages(files); }}>
                        <span>
                            <span className="block font-semibold">Pages of one bill</span>
                            <span className="block text-xs text-muted-foreground">
                                {n > MAX_SCAN_PAGES ? `At most ${MAX_SCAN_PAGES} pages per bill` : 'Read together as one purchase, in the order picked'}
                            </span>
                        </span>
                    </Button>
                </div>
            </ModalShell>
        );
    }

    const full = pages.length >= MAX_SCAN_PAGES;
    return (
        <ModalShell open={open} onClose={close} title="Scan Bill" size="md"
            footer={pages.length > 0 ? (
                <>
                    <Button className="flex-1" disabled={!!busy} onClick={() => scanAsOneBill(pages.map((p) => p.file))}
                        data-testid="scan-done">
                        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{busy}</>
                            : `Done — scan ${pages.length} page${pages.length > 1 ? 's' : ''}`}
                    </Button>
                    <Button variant="outline" disabled={!!busy} onClick={close}>Cancel</Button>
                </>
            ) : undefined}>
            {inputs}
            {pages.length === 0 ? (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <Button className="h-24 flex-col gap-2 text-base" disabled={!!busy}
                            onClick={() => cameraRef.current?.click()} data-testid="scan-camera">
                            <Camera className="h-7 w-7" /> Camera
                        </Button>
                        <Button variant="outline" className="h-24 flex-col gap-2 text-base" disabled={!!busy}
                            onClick={() => galleryRef.current?.click()} data-testid="scan-gallery">
                            <Images className="h-7 w-7" /> Gallery
                        </Button>
                    </div>
                    {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{busy}</p>}
                    <ModalSection title="For a clear scan">
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            <li>Lay the bill flat with all four corners in the photo.</li>
                            <li>Good light, no shadow of the phone. Any rotation is fine.</li>
                            <li>Bill has more pages? Take page 1, then tap <b>Add page</b>.</li>
                        </ul>
                    </ModalSection>
                </>
            ) : (
                <ModalSection title={`Pages of this bill (${pages.length}/${MAX_SCAN_PAGES})`}>
                    <div className="grid grid-cols-3 gap-2">
                        {pages.map((p, i) => (
                            <div key={p.id} className="relative overflow-hidden rounded-md border bg-muted">
                                <img src={p.url} alt={`Page ${i + 1}`} className="h-28 w-full object-cover" />
                                <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 text-[11px] font-semibold">
                                    Page {i + 1}
                                </span>
                                {!busy && (
                                    <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => removePage(p.id)}
                                        className="absolute right-1 top-1 rounded bg-background/90 p-0.5 hover:bg-destructive hover:text-destructive-foreground">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button variant="outline" disabled={full || !!busy} onClick={() => cameraRef.current?.click()}
                            data-testid="scan-add-camera">
                            <Plus className="mr-1 h-4 w-4" /><Camera className="mr-1.5 h-4 w-4" />Add page
                        </Button>
                        <Button variant="outline" disabled={full || !!busy} onClick={() => galleryRef.current?.click()}>
                            <Plus className="mr-1 h-4 w-4" /><Images className="mr-1.5 h-4 w-4" />From gallery
                        </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        All pages are read together as one bill. Nothing is saved until you review it and press Save.
                    </p>
                </ModalSection>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </ModalShell>
    );
}
