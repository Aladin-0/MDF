import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const push = jest.fn();
let routeParams: Record<string, string> = { token: 'tok-123' };
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn() }),
    usePathname: () => '/dashboard/purchases',
    useSearchParams: () => new URLSearchParams(''),
    useParams: () => routeParams,
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/hooks/usePurchases', () => ({ useDistributorList: () => ({ data: [{ id: 'd1', name: 'Sai Pharma' }, { id: 'd2', name: 'Gupta Agency' }], isLoading: false }) }));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({ Authorization: 'Bearer secret' }) }));

import { SendPOModal } from '../po/SendPOModal';
import { POConfirmModal } from '../po/POConfirmModal';
import { NewPurchaseOrderModal } from '../NewPurchaseOrderModal';
import { POSettingsTab } from '../POSettingsTab';
import PublicPurchaseOrderPage from '@/app/po/[token]/page';
import { PurchaseOrderSettingsSection } from '@/components/settings/PurchaseOrderSettingsSection';
import type { PODetail } from '@/lib/poApi';

global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));
Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn();
Element.prototype.releasePointerCapture = jest.fn();

const calls: { url: string; init?: RequestInit }[] = [];
const respond = (router: (url: string, init?: RequestInit) => { status?: number; json?: unknown }) => {
    (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const r = router(url, init);
        return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json ?? {} } as Response;
    });
};
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
beforeEach(() => { calls.length = 0; push.mockReset(); routeParams = { token: 'tok-123' }; });

const PO = (o: Partial<PODetail> = {}): PODetail => ({
    id: 'po1', poNumber: 'PO-20261107-001', status: 'SAVED', statusLabel: 'Draft', distributorId: 'd1', distributorName: 'Sai Pharma', orderDate: '2026-11-07', expectedDate: null, sentAt: null,
    sentVia: '', overdue: false, itemCount: 1, orderedQty: 5, receivedQty: 0, totalAmount: '250.00', closedShort: false, version: 1, notes: '', cancelReason: '', expiresAt: null,
    distributorPhone: '9876543210', distributorEmail: '', distributorLedger: null, shareToken: null, items: [], events: [], allowedActions: ['edit', 'send'],
    sendDefaults: { channel: 'whatsapp_link', template: '', expiryDays: 3, storeName: 'Demo Pharmacy' }, ...o,
} as PODetail);

describe('SendPOModal', () => {
    const open = (po = PO(), extra: Partial<React.ComponentProps<typeof SendPOModal>> = {}) => {
        const props = { open: true, onClose: jest.fn(), outletId: 'o1', po, onSent: jest.fn(), onDownload: jest.fn().mockResolvedValue(undefined), ...extra };
        render(<SendPOModal {...props} />);
        return props;
    };

    it('starts on the outlet default, previews the message with real names and warns the lock', () => {
        open(PO({ sendDefaults: { channel: 'pdf_whatsapp', template: 'Order {po_no} for {distributor} from {store}: {link}', expiryDays: 3, storeName: 'Demo Pharmacy' } }));
        expect(screen.getByRole('radio', { name: /Share PDF/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText(/Order PO-20261107-001 for Sai Pharma from Demo Pharmacy/)).toBeInTheDocument();
        expect(screen.getByText(/Sending locks the lines/)).toBeInTheDocument();
    });

    it('warns when the distributor has no phone, but only for channels that need one', async () => {
        open(PO({ distributorPhone: '' }));
        expect(screen.getByText(/has no phone number saved/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: /Already ordered by phone/ }));
        expect(screen.queryByText(/has no phone number saved/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();           // nothing is sent, so no message to edit
        expect(screen.getByRole('button', { name: 'Mark as ordered' })).toBeInTheDocument();
    });

    it('a resend cannot be turned into "already ordered"', () => {
        open(PO({ status: 'SENT', allowedActions: ['resend'] }));
        expect(screen.queryByRole('radio', { name: /Already ordered by phone/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Resend PO' })).toBeInTheDocument();
        expect(screen.queryByText(/Sending locks the lines/)).not.toBeInTheDocument();
    });

    it('sending posts the channel, date and edited message, opens WhatsApp and shows the secure link', async () => {
        const sent = PO({ status: 'SENT' });
        respond(() => ({ json: { po: sent, shareUrl: 'https://app.test/po/abc', waUrl: 'https://wa.me/919876543210?text=hi' } }));
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
        const props = open();
        fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please supply {po_no}' } });
        fireEvent.change(screen.getByLabelText('Expected date'), { target: { value: '2026-11-09' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send PO' }));
        expect(await screen.findByText('Order sent')).toBeInTheDocument();
        expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ channel: 'whatsapp_link', expectedDate: '2026-11-09', message: 'Please supply {po_no}' });
        expect(props.onSent).toHaveBeenCalledWith(sent);
        expect(openSpy).toHaveBeenCalledWith('https://wa.me/919876543210?text=hi', '_blank', 'noopener');
        expect(screen.getByLabelText('Secure link')).toHaveValue('https://app.test/po/abc');
        openSpy.mockRestore();
    });

    it('the phone-order option records it and closes without opening anything', async () => {
        respond(() => ({ json: { po: PO({ status: 'SENT' }), shareUrl: '', waUrl: '' } }));
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
        const props = open();
        fireEvent.click(screen.getByRole('radio', { name: /Already ordered by phone/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark as ordered' }));
        await waitFor(() => expect(props.onClose).toHaveBeenCalled());
        expect(openSpy).not.toHaveBeenCalled();
        expect(JSON.parse(String(calls[0].init?.body)).channel).toBe('manual');
        openSpy.mockRestore();
    });

    it('the PDF option downloads first, then sends', async () => {
        respond(() => ({ json: { po: PO({ status: 'SENT' }), shareUrl: 'https://app.test/po/x', waUrl: 'https://wa.me/?text=hi' } }));
        jest.spyOn(window, 'open').mockImplementation(() => null);
        const props = open();
        fireEvent.click(screen.getByRole('radio', { name: /Share PDF/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Send PO' }));
        await screen.findByText('Order sent');
        expect(props.onDownload).toHaveBeenCalledWith('pdf');
    });

    it('a refusal from the server is shown and the order is not marked sent', async () => {
        respond(() => ({ status: 409, json: { detail: 'Add at least one item before sending.', code: 'EMPTY' } }));
        const props = open();
        fireEvent.click(screen.getByRole('button', { name: 'Send PO' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one item before sending.');
        expect(props.onSent).not.toHaveBeenCalled();
        expect(screen.queryByText('Order sent')).not.toBeInTheDocument();
    });
});

describe('POConfirmModal', () => {
    it('will not confirm without a reason when one is asked for, and passes the trimmed reason on', async () => {
        const onConfirm = jest.fn().mockResolvedValue(undefined); const onClose = jest.fn();
        render(<POConfirmModal open onClose={onClose} title="Cancel this PO?" message="It goes back to the Shortbook." confirmLabel="Cancel PO" reasonLabel="Reason" destructive onConfirm={onConfirm} />);
        const go = screen.getByRole('button', { name: 'Cancel PO' });
        expect(go).toBeDisabled();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
        expect(go).toBeDisabled();                                                     // spaces are not a reason
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '  wrong supplier  ' } });
        fireEvent.click(go);
        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('wrong supplier'));
        expect(onClose).toHaveBeenCalled();
    });

    it('stays open and shows why when the action fails', async () => {
        const onClose = jest.fn();
        render(<POConfirmModal open onClose={onClose} title="Delete?" message="Gone for good." confirmLabel="Delete" onConfirm={async () => { throw new Error('Only a Draft can be deleted.'); }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(await screen.findByText('Only a Draft can be deleted.')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('"Keep it" closes without doing anything', () => {
        const onConfirm = jest.fn(); const onClose = jest.fn();
        render(<POConfirmModal open onClose={onClose} title="Close short?" message="m" confirmLabel="Close short" onConfirm={onConfirm} />);
        fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
        expect(onClose).toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });
});

describe('NewPurchaseOrderModal', () => {
    it('needs a distributor, then goes to the editor for that distributor without saving anything', async () => {
        const user = userEvent.setup(); const onOpenChange = jest.fn();
        respond(() => ({ json: {} }));
        render(<NewPurchaseOrderModal open onOpenChange={onOpenChange} />);
        expect(screen.getByRole('button', { name: 'Start building PO' })).toBeDisabled();
        await user.click(screen.getByRole('combobox', { name: 'Distributor' }));
        await user.click(await screen.findByRole('option', { name: 'Gupta Agency' }));
        await user.click(screen.getByRole('button', { name: 'Start building PO' }));
        expect(push).toHaveBeenCalledWith('/dashboard/purchases/orders/new?distributorId=d2');
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(calls).toHaveLength(0);                                                  // nothing is created until Save
    });
});

describe('PO settings form', () => {
    const SETTINGS = { autoRulesEnabled: false, expiryDays: 3, defaultChannel: 'whatsapp_link', whatsappTemplate: '', numberPrefix: 'PO', showRateToDistributor: false, countFreeQty: false };
    const settingsApi = (put?: (body: any) => { status?: number; json?: unknown }) => respond((url, init) => {
        if (init?.method === 'PUT') return put ? put(JSON.parse(String(init.body))) : { json: SETTINGS };
        return { json: SETTINGS };
    });

    it('loads the saved values and keeps Save off until something changes', async () => {
        settingsApi();
        wrap(<POSettingsTab />);
        expect(await screen.findByLabelText('Expiry days')).toHaveValue(3);
        expect(screen.getByLabelText('PO prefix')).toHaveValue('PO');
        expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Expiry days'), { target: { value: '5' } });
        expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });

    it('the prefix is upper-cased and shown in the example number', async () => {
        settingsApi();
        wrap(<POSettingsTab />);
        fireEvent.change(await screen.findByLabelText('PO prefix'), { target: { value: 'ord' } });
        expect(screen.getByLabelText('PO prefix')).toHaveValue('ORD');
        expect(screen.getByText(/ORD-20261107-001/)).toBeInTheDocument();
    });

    it('turning the automatic rules on first explains them in plain words; "Not now" leaves it off', async () => {
        settingsApi();
        wrap(<POSettingsTab />);
        fireEvent.click(await screen.findByRole('switch', { name: 'Use the Shortbook and automatic order rules' }));
        expect(await screen.findByText('Before you turn this on')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).getByText(/added to the Shortbook/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
        expect(screen.getByRole('switch', { name: 'Use the Shortbook and automatic order rules' })).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(screen.getByRole('switch', { name: 'Use the Shortbook and automatic order rules' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
        expect(screen.getByRole('switch', { name: 'Use the Shortbook and automatic order rules' })).toHaveAttribute('aria-checked', 'true');
    });

    it('turning it off needs no explanation', async () => {
        respond(() => ({ json: { ...SETTINGS, autoRulesEnabled: true } }));
        wrap(<POSettingsTab />);
        fireEvent.click(await screen.findByRole('switch', { name: 'Use the Shortbook and automatic order rules' }));
        expect(screen.queryByText('Before you turn this on')).not.toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Use the Shortbook and automatic order rules' })).toHaveAttribute('aria-checked', 'false');
    });

    it('saving asks for the password and sends it with the changes', async () => {
        settingsApi();
        wrap(<POSettingsTab />);
        fireEvent.change(await screen.findByLabelText('Expiry days'), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
        expect(await screen.findByText('Confirm with your password')).toBeInTheDocument();
        const confirm = screen.getByRole('button', { name: 'Confirm and save' });
        expect(confirm).toBeDisabled();                                                  // no password yet
        expect(calls.filter((c) => c.init?.method === 'PUT')).toHaveLength(0);           // nothing saved before the password
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my-password' } });
        fireEvent.click(confirm);
        await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
        const put = JSON.parse(String(calls.find((c) => c.init?.method === 'PUT')!.init?.body));
        expect(put).toMatchObject({ outletId: 'o1', expiryDays: 7, password: 'my-password' });
    });

    it('a wrong password shows the server message and keeps the form', async () => {
        settingsApi(() => ({ status: 403, json: { detail: 'Your password is not correct.', code: 'BAD_PASSWORD' } }));
        wrap(<POSettingsTab />);
        fireEvent.change(await screen.findByLabelText('Expiry days'), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
        fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'nope' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Your password is not correct.');
        expect(screen.getByText('Confirm with your password')).toBeInTheDocument();      // still open to retry
    });

    it('lives in Settings with its own heading and the same form', async () => {
        settingsApi();
        wrap(<PurchaseOrderSettingsSection />);
        expect(await screen.findByRole('heading', { name: 'Purchase Orders' })).toBeInTheDocument();
        expect(await screen.findByLabelText('Expiry days')).toBeInTheDocument();
    });
});

describe('Distributor page (public, no login)', () => {
    const PUBLIC = (o: Record<string, unknown> = {}) => ({ storeName: 'Demo Pharmacy', storePhone: '9000000000', storeAddress: 'MG Road, Pune', poNumber: 'PO-1', status: 'SENT', statusLabel: 'Sent',
        orderDate: '2026-11-07', expectedDate: '2026-11-09', distributorName: 'Sai Pharma', notes: 'Deliver before noon', cancelReason: '', showRates: false, totalAmount: null,
        items: [{ productName: 'Paracetamol 500mg', packLabel: '10 strip', qty: 10, mrp: '35.00' }, { productName: 'Azithromycin 500', packLabel: '10 strip', qty: 5, mrp: '120.00' }], ...o });

    it('shows the order and sends no login credentials', async () => {
        respond(() => ({ json: PUBLIC() }));
        render(<PublicPurchaseOrderPage />);
        expect(await screen.findByText('Demo Pharmacy')).toBeInTheDocument();
        expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
        expect(screen.getByText(/Deliver before noon/)).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();                              // total quantity
        expect(calls[0].url).toBe('http://api.test/purchases/public/po/tok-123/');
        expect(JSON.stringify(calls[0].init ?? {})).not.toMatch(/Authorization|Bearer|secret/);
    });

    it('hides rates and totals unless the store allows them', async () => {
        respond(() => ({ json: PUBLIC() }));
        const { unmount } = render(<PublicPurchaseOrderPage />);
        await screen.findByText('Demo Pharmacy');
        expect(screen.queryByText('Rate')).not.toBeInTheDocument();
        expect(screen.queryByText('Amount')).not.toBeInTheDocument();
        unmount();
        respond(() => ({ json: PUBLIC({ showRates: true, totalAmount: '850.00', items: [{ productName: 'Paracetamol 500mg', packLabel: '10 strip', qty: 10, mrp: '35.00', rate: '28.00', lineTotal: '280.00' }] }) }));
        render(<PublicPurchaseOrderPage />);
        expect(await screen.findByText('Rate')).toBeInTheDocument();
        expect(screen.getByText('₹850.00')).toBeInTheDocument();
    });

    it('says plainly when the store cancelled it, with the reason', async () => {
        respond(() => ({ json: PUBLIC({ status: 'CANCELLED', statusLabel: 'Cancelled', cancelReason: 'ordered elsewhere' }) }));
        render(<PublicPurchaseOrderPage />);
        expect(await screen.findByText(/Cancelled by the store: ordered elsewhere/)).toBeInTheDocument();
    });

    it('a dead or wrong link explains itself instead of showing a blank page', async () => {
        respond(() => ({ status: 404, json: { detail: 'This link is not valid.' } }));
        render(<PublicPurchaseOrderPage />);
        expect(await screen.findByText('This order link is not available')).toBeInTheDocument();
        expect(screen.getByText(/ask the store to send it again/)).toBeInTheDocument();
    });

    it('offers print and a call button, and is read-only (no inputs)', async () => {
        respond(() => ({ json: PUBLIC() }));
        const { container } = render(<PublicPurchaseOrderPage />);
        await screen.findByText('Demo Pharmacy');
        expect(screen.getByRole('button', { name: /Print/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Call Demo Pharmacy/ })).toHaveAttribute('href', 'tel:9000000000');
        expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    });
});
