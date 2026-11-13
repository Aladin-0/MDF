import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PurchaseHeaderCard, describeDetails } from './PurchaseHeaderCard';
import { PurchaseDetailsSheet } from './PurchaseDetailsSheet';
import { PurchaseTotalsSheet } from './PurchaseTotalsSheet';
import { PurchaseSummaryBar } from './PurchaseSummaryBar';
import { PurchaseBanners } from './PurchaseBanners';
import { PurchaseRevisionSheet } from './PurchaseRevisionSheet';
import { makeEntry } from './testEntry';

jest.mock('@/components/accounts/LedgerPicker', () => ({
    LedgerPicker: ({ placeholder, onChange }: any) => <button type="button" data-testid="picker" onClick={() => onChange({ id: 'l1', name: 'A.S. MEDICAL AGENCY' })}>{placeholder}</button>,
    formatLedgerBalance: (b?: number) => `₹${(b ?? 0).toFixed(2)} Cr`,
    getBalBadgeColor: () => 'border-amber-300',
}));

const party = { id: 'l1', name: 'A VERY LONG DISTRIBUTOR NAME PRIVATE LIMITED', groupName: 'Sundry Creditors', currentBalance: 9150, nature: 'credit' } as any;

describe('PurchaseHeaderCard', () => {
    it('with no party yet: the picker, then choosing one stores it and validates', () => {
        const entry = makeEntry();
        render(<PurchaseHeaderCard entry={entry} onOpenDetails={jest.fn()} />);
        fireEvent.click(screen.getByTestId('picker'));
        expect(entry.setPartyLedger).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
        expect(entry.setValue).toHaveBeenCalledWith('partyLedgerId', 'l1', { shouldValidate: true, shouldDirty: true });
    });

    it('with a party: the FULL name on its own line, the group and balance under it, and a Change button', () => {
        const entry = makeEntry({ partyLedger: party });
        render(<PurchaseHeaderCard entry={entry} onOpenDetails={jest.fn()} />);
        expect(screen.getByTestId('party-name')).toHaveTextContent('A VERY LONG DISTRIBUTOR NAME PRIVATE LIMITED');
        expect(screen.getByTestId('party-name').className).toContain('break-words');
        expect(screen.getByTestId('party-selected')).toHaveTextContent('Sundry Creditors');
        expect(screen.getByTestId('party-selected')).toHaveTextContent('₹9150.00 Cr');
        expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('party-change'));
        expect(entry.setPartyLedger).toHaveBeenCalledWith(null);
        expect(entry.setValue).toHaveBeenCalledWith('partyLedgerId', '', { shouldValidate: true, shouldDirty: true });
    });

    it('invoice number and date write to the form; the number revalidates only once it has an error', () => {
        const entry = makeEntry({}, { invoiceNo: '' });
        render(<PurchaseHeaderCard entry={entry} onOpenDetails={jest.fn()} />);
        fireEvent.change(screen.getByTestId('invoice-no'), { target: { value: 'INV-9' } });
        expect(entry.setValue).toHaveBeenCalledWith('invoiceNo', 'INV-9', { shouldDirty: true, shouldValidate: false });
        fireEvent.change(screen.getByTestId('invoice-date'), { target: { value: '2026-11-01' } });
        expect(entry.setValue).toHaveBeenCalledWith('invoiceDate', '2026-11-01', { shouldDirty: true });
    });

    it('an invoice-number error and a duplicate warning show under the boxes', () => {
        const { unmount } = render(<PurchaseHeaderCard entry={makeEntry({ errors: { invoiceNo: { message: 'Invoice No required' } } })} onOpenDetails={jest.fn()} />);
        expect(screen.getByTestId('invoice-error')).toHaveTextContent('Invoice No required');
        expect(screen.getByTestId('invoice-no')).toHaveAttribute('aria-invalid', 'true');
        unmount();
        render(<PurchaseHeaderCard entry={makeEntry({ isDuplicate: true })} onOpenDetails={jest.fn()} />);
        expect(screen.getByTestId('invoice-error')).toHaveTextContent('already entered');
    });

    it('the party error shows when no party was chosen', () => {
        render(<PurchaseHeaderCard entry={makeEntry({ errors: { partyLedgerId: { message: 'Select a party ledger' } } })} onOpenDetails={jest.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Select a party ledger');
    });

    it('one button sums up the other fields and opens More details', () => {
        const onOpen = jest.fn();
        render(<PurchaseHeaderCard entry={makeEntry()} onOpenDetails={onOpen} />);
        expect(screen.getByTestId('details-summary')).toHaveTextContent('Credit · 30 days · Main Store');
        fireEvent.click(screen.getByTestId('open-details'));
        expect(onOpen).toHaveBeenCalled();
    });

    it('describeDetails: cash has no days; a PO reference is added', () => {
        expect(describeDetails('cash', 30, 'cold_storage')).toBe('Cash · Cold Storage');
        expect(describeDetails('credit', 45, undefined, 'PO-7')).toBe('Credit · 45 days · Main Store · PO PO-7');
    });
});

describe('PurchaseDetailsSheet', () => {
    it('credit or cash: choosing cash sets the type and clears the due date; credit sets one', () => {
        const entry = makeEntry();
        render(<PurchaseDetailsSheet entry={entry} open onClose={jest.fn()} />);
        fireEvent.click(screen.getByTestId('type-cash'));
        expect(entry.setValue).toHaveBeenCalledWith('purchaseType', 'cash', { shouldDirty: true });
        expect(entry.setValue).toHaveBeenCalledWith('dueDate', undefined);
        fireEvent.click(screen.getByTestId('type-credit'));
        expect(entry.setValue).toHaveBeenCalledWith('dueDate', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
        expect(screen.getByTestId('type-credit')).toHaveAttribute('aria-checked', 'true');
    });

    it('credit days only for credit, and a custom number of days stays in the list', () => {
        const { unmount } = render(<PurchaseDetailsSheet entry={makeEntry({ creditDays: 50 })} open onClose={jest.fn()} />);
        expect(screen.getByTestId('credit-days')).toHaveValue('50');
        unmount();
        render(<PurchaseDetailsSheet entry={makeEntry({ watchedPurchaseType: 'cash' }, { purchaseType: 'cash' })} open onClose={jest.fn()} />);
        expect(screen.queryByTestId('credit-days')).not.toBeInTheDocument();
    });

    it('credit days, godown, PO ref and notes write through', () => {
        const entry = makeEntry();
        render(<PurchaseDetailsSheet entry={entry} open onClose={jest.fn()} />);
        fireEvent.change(screen.getByTestId('credit-days'), { target: { value: '60' } });
        expect(entry.setCreditDays).toHaveBeenCalledWith(60);
        fireEvent.change(screen.getByTestId('godown'), { target: { value: 'cold_storage' } });
        expect(entry.setValue).toHaveBeenCalledWith('godown', 'cold_storage', { shouldDirty: true });
        fireEvent.change(screen.getByTestId('po-ref'), { target: { value: 'PO-1' } });
        expect(entry.setValue).toHaveBeenCalledWith('purchaseOrderRef', 'PO-1', { shouldDirty: true });
        fireEvent.change(screen.getByTestId('notes'), { target: { value: 'urgent' } });
        expect(entry.setValue).toHaveBeenCalledWith('notes', 'urgent', { shouldDirty: true });
    });

    it('the PO reference is locked while the purchase is linked to an order', () => {
        render(<PurchaseDetailsSheet entry={makeEntry({ linkedPo: { id: 'po1', poNumber: 'PO-5' } })} open onClose={jest.fn()} />);
        expect(screen.getByTestId('po-ref')).toBeDisabled();
        expect(screen.getByText(/Linked to PO-5/)).toBeInTheDocument();
    });
});

describe('PurchaseTotalsSheet', () => {
    const numbers = { goodsValue: 1000, taxableValue: 1000, totalGST: 120, cgst: 60, sgst: 60, igst: 0, computedTotal: 1120, netPayable: 1120, totalUnits: 100 };
    it('shows the net payable and the whole breakdown (CGST + SGST for the same state)', () => {
        render(<PurchaseTotalsSheet entry={makeEntry(numbers)} open onClose={jest.fn()} />);
        expect(screen.getByTestId('totals-net')).toHaveTextContent('₹1,120.00');
        expect(screen.getByTestId('t-goods')).toHaveTextContent('₹1,000.00');
        expect(screen.getByTestId('t-cgst')).toHaveTextContent('₹60.00');
        expect(screen.getByTestId('t-sgst')).toHaveTextContent('₹60.00');
        expect(screen.queryByTestId('t-igst')).not.toBeInTheDocument();
        expect(screen.getByTestId('t-net')).toHaveTextContent('₹1,120.00');
        expect(screen.getByText('100 units')).toBeInTheDocument();
    });
    it('interstate shows IGST only', () => {
        render(<PurchaseTotalsSheet entry={makeEntry({ ...numbers, isInterstate: true, igst: 120, cgst: 0, sgst: 0 })} open onClose={jest.fn()} />);
        expect(screen.getByTestId('t-igst')).toHaveTextContent('₹120.00');
        expect(screen.queryByTestId('t-cgst')).not.toBeInTheDocument();
    });
    it('discounts, freight and a round-off appear only when there is one; a negative round-off reads −₹0.25', () => {
        render(<PurchaseTotalsSheet entry={makeEntry({ ...numbers, totalTradeDisc: 50, invoiceDiscount: 100, invoiceDiscountPct: 0.1, freight: 20, roundOff: -0.25 })} open onClose={jest.fn()} />);
        expect(screen.getByText('Trade discount')).toBeInTheDocument();
        expect(screen.getByText(/Invoice discount \(10.00%\)/)).toBeInTheDocument();
        expect(screen.getByText('Freight')).toBeInTheDocument();
        expect(screen.getByText('Round off').nextSibling).toHaveTextContent('− ₹0.25');
    });
    it('freight and invoice discount write to the form', () => {
        const entry = makeEntry(numbers);
        render(<PurchaseTotalsSheet entry={entry} open onClose={jest.fn()} />);
        fireEvent.change(screen.getByTestId('adj-freight'), { target: { value: '25.5' } });
        expect(entry.setValue).toHaveBeenCalledWith('freight', 25.5, { shouldDirty: true });
        fireEvent.change(screen.getByTestId('adj-discount'), { target: { value: '10' } });
        expect(entry.setValue).toHaveBeenCalledWith('invoiceDiscount', 10, { shouldDirty: true });
    });
    it('ledger adjustment: sign, amount and (once there is an amount) a reason', () => {
        const entry = makeEntry({ ...numbers, ledgerAdjustment: 0 });
        const { rerender } = render(<PurchaseTotalsSheet entry={entry} open onClose={jest.fn()} />);
        expect(screen.queryByTestId('adj-note')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('adj-sign-plus'));
        expect(entry.setAdjustmentSign).toHaveBeenCalledWith('+');
        fireEvent.change(screen.getByTestId('adj-amount'), { target: { value: '300' } });
        expect(entry.setLedgerAdjustment).toHaveBeenCalledWith(300);
        rerender(<PurchaseTotalsSheet entry={makeEntry({ ...numbers, ledgerAdjustment: 300, effectiveAdjustment: 300, netPayable: 820 })} open onClose={jest.fn()} />);
        expect(screen.getByTestId('adj-note')).toBeInTheDocument();
        expect(screen.getByText('Less: ledger adjustment')).toBeInTheDocument();
    });
});

describe('PurchaseSummaryBar', () => {
    const bar = (over: any = {}) => { const p = { medicines: 2, units: 1500, netPayable: 4104, label: 'Save purchase', disabledReason: null, onFix: jest.fn(), submitting: false, onSave: jest.fn(), onOpenTotals: jest.fn(), ...over }; render(<PurchaseSummaryBar {...p} />); return p; };
    it('shows the counts and the net payable, and tapping them opens the total', () => {
        const p = bar();
        expect(screen.getByTestId('bar-counts')).toHaveTextContent('2 medicines · 1,500 units');
        expect(screen.getByTestId('bar-net')).toHaveTextContent('₹4,104.00');
        fireEvent.click(screen.getByTestId('open-totals'));
        expect(p.onOpenTotals).toHaveBeenCalled();
    });
    it('ready: Save is on and there is no reason line', () => {
        const p = bar();
        expect(screen.queryByTestId('bar-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('save-purchase'));
        expect(p.onSave).toHaveBeenCalledTimes(1);
    });
    it('something missing: Save is off, the reason shows and tapping it goes to the fix', () => {
        const p = bar({ disabledReason: 'Select the party (distributor)' });
        expect(screen.getByTestId('save-purchase')).toBeDisabled();
        fireEvent.click(screen.getByTestId('bar-reason'));
        expect(p.onFix).toHaveBeenCalled();
    });
    it('saving: the button is off and says so', () => {
        bar({ submitting: true });
        expect(screen.getByTestId('save-purchase')).toBeDisabled();
        expect(screen.getByTestId('save-purchase')).toHaveTextContent('Saving…');
    });
    it('one medicine is singular', () => { bar({ medicines: 1 }); expect(screen.getByTestId('bar-counts')).toHaveTextContent('1 medicine ·'); });
});

describe('PurchaseBanners', () => {
    it('nothing to say: nothing is shown', () => {
        render(<PurchaseBanners entry={makeEntry()} />);
        expect(screen.getByTestId('purchase-banners')).toBeEmptyDOMElement();
    });
    it('a scan being read covers the screen with a message', () => {
        render(<PurchaseBanners entry={makeEntry({ ocrStatus: 'processing' })} />);
        expect(screen.getByTestId('ocr-processing')).toHaveTextContent('Reading the scanned bill');
    });
    it('a failed scan says why and can be retried (only for a scanned draft) or dismissed', () => {
        const entry = makeEntry({ ocrStatus: 'error', ocrError: 'blurry' });
        render(<PurchaseBanners entry={entry} invoiceToEdit={{ id: 'i1', status: 'SAVED' } as any} />);
        expect(screen.getByTestId('ocr-error')).toHaveTextContent('Scan failed: blurry');
        fireEvent.click(screen.getByText('Retry scan'));
        expect(entry.retryOcr).toHaveBeenCalled();
        fireEvent.click(screen.getByText('Dismiss'));
        expect(entry.setOcrStatus).toHaveBeenCalledWith('idle');
    });
    it('a finished scan asks for a check against the paper bill and lists the notes', () => {
        render(<PurchaseBanners entry={makeEntry({ ocrStatus: 'ready', ocrReviewNotes: ['Select the distributor ledger.', 'Enter the batch number on 2 medicine lines.'] })} />);
        expect(screen.getByTestId('ocr-review-banner')).toHaveTextContent('Check this scanned bill against the paper bill');
        expect(screen.getByText('Enter the batch number on 2 medicine lines.')).toBeInTheDocument();
    });
    it('a scan that needs manual review is an alert', () => {
        render(<PurchaseBanners entry={makeEntry({ ocrStatus: 'ready', ocrNeedsReview: true })} />);
        expect(screen.getByTestId('ocr-review-banner')).toHaveAttribute('role', 'alert');
    });
    it('the scanned bill can be opened and shows every page', () => {
        const entry = makeEntry({ scannedImage: 'http://x/1.jpg', scannedPages: ['http://x/1.jpg', 'http://x/2.jpg'] });
        render(<PurchaseBanners entry={entry} />);
        expect(screen.getByTestId('view-scan')).toHaveTextContent('2 pages');
        fireEvent.click(screen.getByTestId('view-scan'));
        expect(entry.setScannedImageModalOpen).toHaveBeenCalledWith(true);
    });
    it('a linked purchase order can be unlinked', () => {
        const entry = makeEntry({ linkedPo: { id: 'po1', poNumber: 'PO-5' } });
        render(<PurchaseBanners entry={entry} />);
        expect(screen.getByTestId('linked-po')).toHaveTextContent('Receiving against PO-5');
        fireEvent.click(screen.getByText('Unlink'));
        expect(entry.setLinkedPo).toHaveBeenCalledWith(null);
        expect(entry.setValue).toHaveBeenCalledWith('purchaseOrderRef', '');
    });
    it('open orders from the party can be linked', () => {
        const entry = makeEntry({ partyLedger: { name: 'ACME' }, openPos: { results: [{ id: 'po9', poNumber: 'PO-9', receivedQty: 2, orderedQty: 10 }] } });
        render(<PurchaseBanners entry={entry} />);
        fireEvent.click(screen.getByText('PO-9 · 2/10 received'));
        expect(entry.loadPo).toHaveBeenCalledWith('po9');
    });
    it('no open-orders offer while editing a saved purchase', () => {
        render(<PurchaseBanners entry={makeEntry({ openPos: { results: [{ id: 'po9', poNumber: 'PO-9', receivedQty: 0, orderedQty: 1 }] } })} invoiceToEdit={{ id: 'i', status: 'CONFIRMED' } as any} />);
        expect(screen.queryByTestId('open-pos')).not.toBeInTheDocument();
    });
    it('an unsaved draft can be restored or discarded', () => {
        const entry = makeEntry({ hasDraft: true });
        render(<PurchaseBanners entry={entry} />);
        fireEvent.click(screen.getByTestId('draft-restore'));
        expect(entry.restoreDraft).toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('draft-discard'));
        expect(entry.setHasDraft).toHaveBeenCalledWith(false);
    });
    it('medicines expiring within 90 days are called out', () => {
        render(<PurchaseBanners entry={makeEntry({ nearExpiryCount: 2 })} />);
        expect(screen.getByTestId('near-expiry')).toHaveTextContent('2 medicines expired or under 90 days');
    });
});

describe('PurchaseRevisionSheet', () => {
    const sheet = (over: any = {}) => { const p = { open: true, onClose: jest.fn(), code: '', text: '', onCode: jest.fn(), onText: jest.fn(), onConfirm: jest.fn(), ...over }; render(<PurchaseRevisionSheet {...p} />); return p; };
    it('needs a reason and at least 10 characters before it can save', () => {
        sheet();
        expect(screen.getByTestId('revision-confirm')).toBeDisabled();
    });
    it('a reason alone is not enough', () => { sheet({ code: 'OTHER', text: 'short' }); expect(screen.getByTestId('revision-confirm')).toBeDisabled(); });
    it('reason and a real explanation: Save changes is on and confirms', () => {
        const p = sheet({ code: 'RATE_CORRECTION', text: 'Rate was keyed wrong' });
        expect(screen.getByTestId('revision-confirm')).toBeEnabled();
        fireEvent.click(screen.getByTestId('revision-confirm'));
        expect(p.onConfirm).toHaveBeenCalled();
    });
    it('the reason list is the desktop one, and typing reaches the form', () => {
        const p = sheet();
        expect(screen.getByRole('option', { name: 'Rate Correction' })).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('revision-code'), { target: { value: 'QTY_CORRECTION' } });
        expect(p.onCode).toHaveBeenCalledWith('QTY_CORRECTION');
        fireEvent.change(screen.getByTestId('revision-text'), { target: { value: 'abc' } });
        expect(p.onText).toHaveBeenCalledWith('abc');
    });
    it('counts the characters', () => { sheet({ text: 'hello' }); expect(screen.getByText(/5 so far/)).toBeInTheDocument(); });
});
