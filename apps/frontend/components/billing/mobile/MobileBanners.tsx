'use client';

import { FileText, Pencil, Repeat } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';

/**
 * One banner at a time under the phone top bar (the offline bar is global and is not repeated here):
 * amber while a saved bill is being edited, blue for a bill pre-filled from a quotation, green for one pre-filled from an old invoice.
 * The quotation / invoice conditions are the same as the desktop banners in MainInvoiceWorkspace; the edit banner is new (desktop has none).
 */
export function MobileBanners() {
    const draft = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId] : null));
    if (!draft) return null;

    if (draft.editingSaleId) {
        // EditSaleHydrator does not store the invoice number yet; sourceInvoiceNo is used when something has set it
        const no = draft.sourceInvoiceNo;
        return (
            <div role="status" data-testid="banner-editing" className="flex items-start gap-2 border-b border-amber-400 bg-amber-100 px-3 py-2.5 text-amber-900">
                <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                <span className="text-sm font-bold">
                    {no ? `Editing ${no}` : 'Editing a saved bill'}
                    <span className="block text-sm font-medium text-amber-900">Your changes replace the saved bill when you save.</span>
                </span>
            </div>
        );
    }

    if (draft.documentMode === 'invoice' && draft.quotationId && draft.sourceQuotationNo) {
        return (
            <div role="status" data-testid="banner-quotation" className="flex items-start gap-2 border-b border-blue-300 bg-blue-100 px-3 py-2.5 text-blue-900">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden />
                <span className="text-sm font-bold">Pre-filled from Quotation {draft.sourceQuotationNo}. Review the items, then save as an invoice.</span>
            </div>
        );
    }

    if (draft.documentMode === 'invoice' && draft.sourceInvoiceId && draft.sourceInvoiceNo) {
        const review = draft.cart.filter((c) => c.batchAvailabilityStatus && c.batchAvailabilityStatus !== 'AVAILABLE').length;
        return (
            <div role="status" data-testid="banner-repeat" className="flex items-start gap-2 border-b border-green-300 bg-green-100 px-3 py-2.5 text-green-900">
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden />
                <span className="text-sm font-bold">
                    Pre-filled from Invoice {draft.sourceInvoiceNo}
                    {review > 0
                        ? <> · <span className="font-bold text-red-800">{review} item{review > 1 ? 's' : ''} need review</span></>
                        : <> · batch and stock rechecked</>}
                </span>
            </div>
        );
    }

    return null;
}
