'use client';

import { AlertTriangle, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SheetShell } from '@/components/billing/mobile/SheetShell';
import { T } from '@/components/billing/mobile/theme';
import type { PurchaseEntry } from '@/hooks/usePurchaseEntry';
import type { PurchaseInvoiceFull } from '@/types';

const box = 'rounded-xl border px-3 py-3 text-sm';

/** Everything the purchase screen says before the medicines: scanned-bill progress and review, linked purchase order, draft, near-expiry. */
export function PurchaseBanners({ entry, invoiceToEdit }: { entry: PurchaseEntry; invoiceToEdit?: PurchaseInvoiceFull | null }) {
    const {
        ocrStatus, ocrError, ocrNeedsReview, ocrReviewNotes, setOcrStatus, retryOcr, scannedImage, scannedPages, scannedImageModalOpen, setScannedImageModalOpen,
        linkedPo, setLinkedPo, setValue, openPos, loadPo, partyLedger, hasDraft, restoreDraft, setHasDraft, draftKey, nearExpiryCount,
    } = entry;
    const cap = ocrNeedsReview ? 8 : 5;
    return (
        <div className="space-y-2" data-testid="purchase-banners">
            {ocrStatus === 'processing' && (
                <div role="status" data-testid="ocr-processing" className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-white/90 px-6 text-center backdrop-blur-sm">
                    <Loader2 className="h-10 w-10 animate-spin text-sky-600" aria-hidden />
                    <p className="text-lg font-extrabold text-slate-900">Reading the scanned bill…</p>
                    <p className="text-sm text-slate-700">Finding the medicines, batches and prices. This can take a minute.</p>
                </div>
            )}

            {ocrStatus === 'error' && (
                <div role="alert" data-testid="ocr-error" className={cn(box, 'border-red-300 bg-red-50 text-red-900')}>
                    <p className="flex items-start gap-2 font-bold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Scan failed: {ocrError}</p>
                    <div className="mt-2 flex gap-2">
                        {invoiceToEdit?.status === 'SAVED' && <button type="button" onClick={retryOcr} className={cn(T.ctaOutline, 'min-h-[44px] flex-1 text-sm')}>Retry scan</button>}
                        <button type="button" onClick={() => setOcrStatus('idle')} className={cn(T.btn, 'min-h-[44px] flex-1 text-sm')}>Dismiss</button>
                    </div>
                </div>
            )}

            {ocrStatus === 'ready' && (
                <div data-testid="ocr-review-banner" role={ocrNeedsReview ? 'alert' : 'status'}
                    className={cn(box, ocrNeedsReview ? 'border-red-300 bg-red-50 text-red-950' : 'border-amber-300 bg-amber-50 text-amber-950')}>
                    <p className="font-extrabold">{ocrNeedsReview ? 'Manual review needed: the automatic checks could not confirm this scan' : 'Check this scanned bill against the paper bill before saving'}</p>
                    {ocrReviewNotes.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 font-medium">
                            {ocrReviewNotes.slice(0, cap).map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}
                            {ocrReviewNotes.length > cap && <li>{ocrReviewNotes.length - cap} more things to check.</li>}
                        </ul>
                    ) : <p className="mt-0.5 font-medium">All automatic checks passed. Nothing is saved until you press Save.</p>}
                </div>
            )}

            {scannedImage && (
                <>
                    <button type="button" data-testid="view-scan" onClick={() => setScannedImageModalOpen(true)} className={cn(T.btn, 'flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 text-sm')}>
                        <ImageIcon className="h-5 w-5" aria-hidden />View scanned bill{scannedPages.length > 1 ? ` (${scannedPages.length} pages)` : ''}
                    </button>
                    <SheetShell open={scannedImageModalOpen} onClose={() => setScannedImageModalOpen(false)} title="Scanned bill" full bodyClassName="bg-slate-100 space-y-3"
                        footer={<button type="button" onClick={() => setScannedImageModalOpen(false)} className={cn(T.cta, 'h-12 w-full text-base')}>Close</button>}>
                        {(scannedPages.length > 1 ? scannedPages : [scannedImage]).map((src, i, all) => (
                            <figure key={src} className="space-y-1">
                                {all.length > 1 && <figcaption className="text-xs font-bold text-slate-700">Page {i + 1} of {all.length}</figcaption>}
                                {/* a plain img: the URL is the API server's, not something next/image can optimise */}
                                <img src={src} alt={all.length > 1 ? `Scanned bill page ${i + 1}` : 'Scanned bill'} className="mx-auto w-full rounded-lg border border-slate-300 bg-white object-contain" />
                            </figure>
                        ))}
                    </SheetShell>
                </>
            )}

            {linkedPo && (
                <div data-testid="linked-po" className={cn(box, 'flex flex-wrap items-center gap-2 border-sky-300 bg-sky-50 text-sky-950')}>
                    <FileText className="h-5 w-5 shrink-0 text-sky-700" aria-hidden />
                    <span className="min-w-0 flex-1 font-bold">Receiving against {linkedPo.poNumber}<span className="block text-xs font-medium">Lines show what is still owed. Saving updates the order.</span></span>
                    <button type="button" onClick={() => { setLinkedPo(null); setValue('purchaseOrderRef', ''); }} className="min-h-[44px] px-2 text-sm font-bold text-sky-800 underline">Unlink</button>
                </div>
            )}
            {!linkedPo && !invoiceToEdit && (openPos?.results?.length ?? 0) > 0 && (
                <div data-testid="open-pos" className={cn(box, 'border-amber-300 bg-amber-50 text-amber-950')}>
                    <p className="font-bold">{openPos!.results.length} open order{openPos!.results.length > 1 ? 's' : ''} from {partyLedger?.name}. Link one?</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {openPos!.results.map((o) => (
                            <button key={o.id} type="button" onClick={() => loadPo(o.id)} className="min-h-[44px] rounded-lg border-2 border-amber-500 bg-white px-3 text-sm font-bold text-amber-950 active:bg-amber-100">
                                {o.poNumber} · {o.receivedQty}/{o.orderedQty} received
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {hasDraft && (
                <div data-testid="draft-banner" className={cn(box, 'border-amber-300 bg-amber-50 text-amber-950')}>
                    <p className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 shrink-0" aria-hidden />You have an unsaved draft from before.</p>
                    <div className="mt-2 flex gap-2">
                        <button type="button" data-testid="draft-restore" onClick={restoreDraft} className={cn(T.ctaOutline, 'min-h-[44px] flex-1 text-sm')}>Restore</button>
                        <button type="button" data-testid="draft-discard" onClick={() => { if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } } setHasDraft(false); }} className={cn(T.btn, 'min-h-[44px] flex-1 text-sm')}>Discard</button>
                    </div>
                </div>
            )}

            {nearExpiryCount > 0 && (
                <p data-testid="near-expiry" className={cn(box, 'flex items-start gap-2 border-orange-300 bg-orange-50 font-semibold text-orange-950')}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {nearExpiryCount} medicine{nearExpiryCount > 1 ? 's' : ''} expired or under 90 days: check with the distributor before accepting.
                </p>
            )}
        </div>
    );
}
