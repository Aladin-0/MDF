import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditPage from '@/app/admin/audit/page';
import * as api from '@/lib/auditApi';
import { usePermissions } from '@/hooks/usePermissions';

jest.mock('@/hooks/usePermissions', () => ({ usePermissions: jest.fn() }));
jest.mock('@/lib/auditApi');
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/stockledger/InvoiceViewer', () => ({ InvoiceViewer: () => null }));

const perms = usePermissions as jest.Mock;
const m = api as jest.Mocked<typeof api>;

const summary = (total: number) => ({ newFlags: { critical: total ? 1 : 0, warning: 0, notice: 0, total }, eventsToday: 3, lastEventAt: new Date().toISOString(), failedWrites: 0, retentionDays: 365, lastPurgeAt: null });
const flag = { id: 'f1', rule: 'bill_cancel_spike', severity: 'critical', title: 'Asha cancelled 6 bills today (usual: 1)', why: 'A cancelled bill removes a sale.', evidence: {}, status: 'new',
    createdAt: new Date().toISOString(), person: { id: 'u1', name: 'Asha' }, eventId: 'e1', event: { occurredAt: new Date().toISOString(), summary: 's', entity: { type: '', id: '', label: '', viewer: null }, amount: null, device: 'Chrome on Android', ip: null, insideNetwork: false }, review: { by: '', at: null, note: '' } };
const event = { id: 'e1', occurredAt: new Date().toISOString(), code: 'bill.cancelled', action: 'X', module: 'billing', category: 'money', categoryLabel: 'Money & bills', label: 'Bill cancelled', summary: 'Asha cancelled bill INV-9 (₹1,240)', severity: 'warning',
    actor: { id: 'u1', name: 'Asha', role: 'billing_staff' }, outlet: 'Main', entity: { type: 'SaleInvoice', id: 's1', label: 'INV-9', viewer: { kind: 'sale', id: 's1' } }, amount: 1240, changes: [], reason: '', device: 'Chrome on Android', ip: null, insideNetwork: null, source: 'web', requestId: null, flags: [] };

function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><AuditPage /></QueryClientProvider>);
}

beforeEach(() => {
    jest.resetAllMocks();
    perms.mockReturnValue({ hasPermission: (p: string) => p === 'view_audit_trail' });
    m.fetchSummary.mockResolvedValue(summary(1));
    m.fetchPeople.mockResolvedValue({ days: 30, results: [] });
    m.fetchFlags.mockResolvedValue({ results: [flag as any], count: 1 });
    m.fetchEvents.mockResolvedValue({ results: [event as any], count: 1, pagination: { page: 1, pageSize: 50, pages: 1, total: 1 } });
});

describe('Audit page', () => {
    it('is closed to anyone without the audit permission and asks the server for nothing', () => {
        perms.mockReturnValue({ hasPermission: () => false });
        renderPage();
        expect(screen.getByText(/Only the owner can open the audit trail/)).toBeInTheDocument();
        expect(m.fetchSummary).not.toHaveBeenCalled();
        expect(m.fetchEvents).not.toHaveBeenCalled();
    });

    it('opens on what needs attention, with the count and the reason', async () => {
        renderPage();
        expect(await screen.findByText(/Asha cancelled 6 bills today/)).toBeInTheDocument();
        expect(screen.getByText(/Why this matters/)).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Needs attention/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('1 to look at')).toBeInTheDocument();
    });

    it('opens on Activity when nothing needs a look', async () => {
        m.fetchSummary.mockResolvedValue(summary(0));
        renderPage();
        expect(await screen.findByText('Asha cancelled bill INV-9 (₹1,240)')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    });

    it('marking a flag "not a problem" needs a reason, then saves it', async () => {
        m.reviewFlag.mockResolvedValue({ ...flag, status: 'dismissed' } as any);
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Not a problem' }));
        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toBeDisabled();
        await userEvent.type(screen.getByLabelText('Why is this not a problem'), 'Training bills');
        await userEvent.click(save);
        await waitFor(() => expect(m.reviewFlag).toHaveBeenCalledWith('f1', 'dismissed', 'Training bills'));
    });

    it('searching sends the text to the server and the activity opens a detail with an "Open bill" link', async () => {
        m.fetchSummary.mockResolvedValue(summary(0));
        renderPage();
        await userEvent.type(await screen.findByLabelText('Search'), 'INV-9');
        await waitFor(() => expect(m.fetchEvents.mock.calls.some(([p]) => (p as URLSearchParams).get('q') === 'INV-9')).toBe(true));
        m.fetchEvent.mockResolvedValue({ ...event, related: [] } as any);
        await userEvent.click(await screen.findByText('Asha cancelled bill INV-9 (₹1,240)'));
        expect(await screen.findByRole('button', { name: /Open bill/ })).toBeInTheDocument();
    });
});
