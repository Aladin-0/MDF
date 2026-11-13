'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraOff, Flashlight, FlashlightOff, Keyboard, Loader2, ScanLine } from 'lucide-react';
import { SheetShell } from './SheetShell';

type ScanState = 'starting' | 'scanning' | 'unsupported' | 'denied' | 'nocamera' | 'error';

export const UNSUPPORTED_MESSAGE = 'Camera scanning is not supported on this browser. Use a barcode scanner or type the code.';
const MESSAGES: Record<Exclude<ScanState, 'starting' | 'scanning'>, string> = {
    unsupported: UNSUPPORTED_MESSAGE,
    denied: 'Camera permission was denied. Allow the camera for this site in the browser settings, or type the code.',
    nocamera: 'No camera was found (or the page is not on a secure https connection). Use a barcode scanner or type the code.',
    error: 'The camera could not be started. Close other apps that use it and try again, or type the code.',
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
const POLL_MS = 200;

interface BarcodeScannerProps {
    open: boolean;
    onClose: () => void;
    /** A code was read (fires once per opening, then the scanner closes itself) */
    onCode: (code: string) => void;
}

/**
 * Full-screen camera scanner using the browser's `BarcodeDetector`. Where that does not exist (iOS Safari, Firefox) it says so and offers
 * "Enter manually" (hardware / Bluetooth scanners still type into the search box). Never throws: every browser API is feature-detected.
 */
export function BarcodeScanner({ open, onClose, onCode }: BarcodeScannerProps) {
    const [video, setVideo] = useState<HTMLVideoElement | null>(null);
    const [state, setState] = useState<ScanState>('starting');
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const trackRef = useRef<MediaStreamTrack | null>(null);
    const onCodeRef = useRef(onCode);
    const onCloseRef = useRef(onClose);
    onCodeRef.current = onCode;
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open || !video) return;

        let cancelled = false;
        let fired = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stream: MediaStream | null = null;

        const stop = () => {
            if (timer) clearTimeout(timer);
            try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
            stream = null;
            trackRef.current = null;
            try { video.srcObject = null; } catch { /* jsdom */ }
        };

        const start = async () => {
            setState('starting');
            setTorchAvailable(false);
            setTorchOn(false);

            const Detector = typeof window !== 'undefined' ? (window as any).BarcodeDetector : undefined;
            if (!Detector) { setState('unsupported'); return; }
            const getUserMedia = typeof navigator !== 'undefined' ? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) : undefined;
            if (!getUserMedia) { setState('nocamera'); return; }

            let detector: any;
            try {
                detector = new Detector({ formats: FORMATS });
            } catch {
                try { detector = new Detector(); } catch { setState('unsupported'); return; }
            }

            try {
                stream = await getUserMedia({ video: { facingMode: 'environment' } });
            } catch (err: any) {
                if (cancelled) return;
                const name = err?.name || '';
                if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') setState('denied');
                else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') setState('nocamera');
                else setState('error');
                return;
            }
            if (cancelled) { stop(); return; }

            const track = stream?.getVideoTracks?.()[0] ?? null;
            trackRef.current = track;
            try {
                const caps = (track as any)?.getCapabilities?.();
                setTorchAvailable(!!caps && 'torch' in caps && !!caps.torch);
            } catch { setTorchAvailable(false); }

            try {
                video.srcObject = stream;
                await video.play?.();
            } catch { /* autoplay refusal is not fatal: the muted, playsInline video normally plays */ }
            if (cancelled) { stop(); return; }
            setState('scanning');

            let busy = false;
            const tick = async () => {
                if (cancelled || fired) return;
                if (!busy && video.readyState >= 2) {
                    busy = true;
                    try {
                        const found = await detector.detect(video);
                        const code = String(found?.[0]?.rawValue ?? '').trim();
                        if (code && !cancelled && !fired) {
                            fired = true;
                            stop();
                            onCodeRef.current(code);
                            onCloseRef.current();
                            return;
                        }
                    } catch { /* a frame that cannot be read: try the next one */ }
                    busy = false;
                }
                if (!cancelled && !fired) timer = setTimeout(tick, POLL_MS);
            };
            timer = setTimeout(tick, POLL_MS);
        };

        void start();
        return () => { cancelled = true; stop(); };
    }, [open, video]);

    const toggleTorch = async () => {
        const track = trackRef.current;
        if (!track) return;
        const next = !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: next } as any] });
            setTorchOn(next);
        } catch { setTorchAvailable(false); }
    };

    const failed = state !== 'starting' && state !== 'scanning';

    const footer = (
        <div className="flex gap-2">
            {torchAvailable && state === 'scanning' && (
                <button
                    type="button"
                    data-testid="torch-toggle"
                    aria-pressed={torchOn}
                    onClick={() => void toggleTorch()}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 active:bg-slate-100"
                >
                    {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
                    {torchOn ? 'Torch off' : 'Torch on'}
                </button>
            )}
            <button
                type="button"
                data-testid="enter-manually"
                onClick={onClose}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground active:opacity-90"
            >
                <Keyboard className="h-5 w-5" /> Enter manually
            </button>
        </div>
    );

    return (
        <SheetShell open={open} onClose={onClose} title="Scan barcode" description="Point the camera at the barcode on the pack" full footer={footer}>
            <div className="flex h-full flex-col items-center justify-center gap-3">
                {failed && (
                    <div role="alert" data-testid="scanner-message" className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-slate-50 p-6 text-center">
                        <CameraOff className="h-10 w-10 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-700">{MESSAGES[state as keyof typeof MESSAGES]}</p>
                    </div>
                )}
                {/* the video stays mounted (hidden after a failure) so reopening the scanner can try the camera again */}
                <div className={failed ? 'hidden' : 'relative w-full overflow-hidden rounded-xl bg-black'}>
                    <video ref={setVideo} muted playsInline autoPlay className="aspect-[3/4] w-full object-cover" data-testid="scanner-video" />
                    <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 flex -translate-y-1/2 items-center justify-center">
                        <div className="h-28 w-full rounded-lg border-2 border-white/80" />
                        <ScanLine className="absolute h-8 w-8 text-white/80" />
                    </div>
                    {state === 'starting' && (
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm font-semibold text-white">
                            <Loader2 className="h-5 w-5 animate-spin" /> Starting camera...
                        </div>
                    )}
                </div>
                {state === 'scanning' && <p className="text-xs font-medium text-slate-600" aria-live="polite">Hold steady: it reads the code on its own.</p>}
            </div>
        </SheetShell>
    );
}
