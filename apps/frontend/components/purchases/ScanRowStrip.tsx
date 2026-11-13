'use client';

import { useEffect, useState } from 'react';

/** Where a scanned row sits on its (straightened) page: [ymin, xmin, ymax, xmax] in 0..1000. */
export interface ScanRowBox { page: number; box: number[]; }

/** Lines of context shown above and below the row (in 0..1000 page units, ~one printed line). */
export const STRIP_CONTEXT = 30;

/** Vertical window shown: the row plus context, clamped to the page. */
export function stripWindow(box: number[], padding = STRIP_CONTEXT) {
    const [y0, , y1] = box;
    return { top: Math.max(0, y0 - padding), bottom: Math.min(1000, y1 + padding) };
}

/**
 * CSS for showing only one row of a page photo (plus context), cropped with
 * background-size / background-position. No extra image is made or stored — it
 * is the same page photo the server already keeps (deleted 24 h after scanning).
 */
export function rowStripStyle(src: string, box: number[], pageSize: [number, number], padding = STRIP_CONTEXT): React.CSSProperties {
    const [, x0, , x1] = box;
    const { top, bottom } = stripWindow(box, padding);
    const bw = Math.max((x1 - x0) / 1000, 0.001);
    const bh = Math.max((bottom - top) / 1000, 0.001);
    const [w, h] = pageSize;
    const pos = (start: number, span: number) => (span >= 1 ? 0 : ((start / 1000) / (1 - span)) * 100);
    return {
        width: '100%',
        aspectRatio: `${(bw * w) / (bh * h)}`,
        backgroundImage: `url("${src}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${100 / bw}% ${100 / bh}%`,
        backgroundPosition: `${pos(x0, bw)}% ${pos(top, bh)}%`,
    };
}

export function ScanRowStrip({ src, box, pageSize }: { src: string; box: number[]; pageSize?: number[] | null }) {
    const known = pageSize && pageSize.length === 2 && pageSize[0] > 0 && pageSize[1] > 0;
    const [natural, setNatural] = useState<[number, number] | null>(null);

    useEffect(() => {
        if (known) return;
        const img = new Image();
        img.onload = () => setNatural([img.naturalWidth || 1, img.naturalHeight || 1]);
        img.src = src;
    }, [src, known]);

    const size = (known ? pageSize : natural) as [number, number] | null;
    if (!size) return <div className="h-16 animate-pulse rounded bg-muted" />;
    // Mark the matched line inside the window (context lines stay visible around it).
    const { top, bottom } = stripWindow(box);
    const span = Math.max(bottom - top, 1);
    return (
        <div
            role="img"
            aria-label="This row on the scanned bill"
            data-testid="scan-row-strip"
            className="relative rounded border border-slate-300 bg-white"
            style={rowStripStyle(src, box, size)}
        >
            <div
                aria-hidden
                data-testid="scan-row-highlight"
                className="pointer-events-none absolute inset-x-0 rounded-sm border-2 border-amber-500/80 bg-amber-300/15"
                style={{ top: `${((box[0] - top) / span) * 100}%`, height: `${((box[2] - box[0]) / span) * 100}%` }}
            />
        </div>
    );
}
