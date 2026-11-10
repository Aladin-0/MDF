import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the purchase-order API, so the PO screens can be driven in a real browser with no login, no database and no
 * side effects. It follows the same rules as the server (apps/purchases/po_services.py) closely enough for the screens: Draft is stored as SAVED,
 * sending locks it, cancelling / closing short returns the unreceived part to the Shortbook, a stale version is refused.
 * The server's own rules are covered by the pytest suite; this file exists to prove the screens use them correctly.
 */

const ME = {
    id: 'u1', name: 'Pratik', phone: '7066121911', role: 'admin', outletId: 'o1', organizationId: 'org1', isSuperAdmin: false,
    outlet: { id: 'o1', organizationId: 'org1', name: 'Demo Pharmacy', address: 'MG Road, Pune', city: 'Pune', state: 'Maharashtra', stateCode: '27', pincode: '411001', phone: '9000000000', gstin: '27AAAAA0000A1Z5', drugLicenseNo: 'DL-1', logoUrl: null, invoiceFooter: null },
    permissions: ['cancel_purchase_orders', 'create_bills', 'create_purchases', 'edit_purchases', 'manage_po_settings', 'manage_settings', 'send_purchase_orders', 'view_outlet', 'view_purchase_rates', 'view_purchases'],
    canEditRate: true, canViewPurchaseRates: true, canCreatePurchases: true, canEditPurchases: true,
};

type Status = 'SAVED' | 'SENT' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
const LABEL: Record<Status, string> = { SAVED: 'Draft', SENT: 'Sent', PARTIAL: 'Partial', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };
const SB_LABEL: Record<string, string> = { PENDING: 'Pending', IN_DRAFT: 'In draft PO', ORDERED: 'Ordered', RECEIVED: 'Received', REMOVED: 'Removed' };
const SRC_LABEL: Record<string, string> = { low_stock: 'Low stock', billing: 'Billing', customer: 'Customer request', manual: 'Manual' };
const DISTRIBUTORS = [{ id: 'd1', name: 'Sai Pharma', phone: '9876543210' }, { id: 'd2', name: 'Gupta Agency', phone: '9123456780' }];
const PRODUCTS: Record<string, { name: string; rate: string }> = { p1: { name: 'Paracetamol 500mg', rate: '28.50' }, p2: { name: 'Azithromycin 500', rate: '95.00' }, p3: { name: 'Cetirizine 10mg', rate: '12.00' } };

interface Line { id: string; productId: string; qty: number; received: number; rate: string; sb?: string }
interface PO { id: string; no: string; status: Status; dist: string; lines: Line[]; version: number; notes: string; expected: string | null; sentAt: string | null; token: string | null; cancelReason: string; closedShort: boolean; events: { id: string; action: string; at: string; payload: Record<string, unknown> }[] }
interface SB { id: string; productId: string; qty: number; source: string; status: string; dist: string | null; customer: string }

export class FakePoBackend {
    shortbook: SB[] = [];
    orders: PO[] = [];
    settings: Record<string, unknown> = { autoRulesEnabled: false, expiryDays: 3, defaultChannel: 'whatsapp_link', whatsappTemplate: '', numberPrefix: 'PO', showRateToDistributor: false, countFreeQty: false };
    password = 'right-password';
    /** every write the screens made, in order, e.g. "POST /purchases/orders/x/send/" */
    writes: string[] = [];
    /** every Shortbook read: 'groups', 'items:<distributor>:p<page>', 'counts' or 'all' */
    shortbookReads: string[] = [];
    private n = 0;
    private id = (p: string) => `${p}${++this.n}`;

    /** test setup helpers */
    addShortbook(productId: string, qty: number, dist: string | null = 'd1', source = 'low_stock') {
        const row: SB = { id: this.id('sb'), productId, qty, source, status: 'PENDING', dist, customer: '' };
        this.shortbook.push(row);
        return row;
    }
    addOrder(status: Status, lines: [string, number, number][], dist = 'd1'): PO {
        const po: PO = { id: this.id('po'), no: `PO-20261107-${String(this.orders.length + 1).padStart(3, '0')}`, status, dist, version: 1, notes: '', expected: '2026-11-09',
            sentAt: status === 'SAVED' ? null : '2026-11-07T10:00:00', token: status === 'SAVED' ? null : `tok-${this.n}`, cancelReason: '', closedShort: false,
            lines: lines.map(([p, q, r]) => ({ id: this.id('l'), productId: p, qty: q, received: r, rate: PRODUCTS[p].rate })), events: [] };
        po.events.push({ id: this.id('e'), action: 'created', at: '2026-11-07T09:00:00', payload: {} });
        this.orders.push(po);
        return po;
    }
    /** what the purchase invoice does on the server: add received quantity, then Partial / Completed */
    receive(poId: string, perLine: number[]) {
        const po = this.orders.find((o) => o.id === poId)!;
        po.lines.forEach((l, i) => { l.received = Math.min(l.qty, l.received + (perLine[i] ?? 0)); });
        po.status = po.lines.every((l) => l.received >= l.qty) ? 'COMPLETED' : 'PARTIAL';
        po.events.push({ id: this.id('e'), action: 'received', at: '2026-11-08T11:00:00', payload: { invoice: 'INV-1' } });
    }

    /** a Shortbook with `n` pending items for one distributor, for paging tests */
    fillShortbook(dist: string, n: number, source = 'low_stock') {
        const ids = Object.keys(PRODUCTS);
        for (let i = 0; i < n; i++) {
            const pid = `bulk${dist}${i}`;
            PRODUCTS[pid] = { name: `${dist === 'd1' ? 'Sai' : 'Gupta'} Bulk ${String(i).padStart(3, '0')}`, rate: '10.00' };
            this.addShortbook(pid, 3, dist, source);
        }
        return ids.length;
    }

    private actions(po: PO): string[] {
        return ({ SAVED: ['edit', 'send', 'delete', 'duplicate', 'cancel'], SENT: ['receive', 'resend', 'cancel', 'duplicate'], PARTIAL: ['receive', 'close_short', 'duplicate'],
            COMPLETED: ['duplicate'], CANCELLED: ['duplicate'], EXPIRED: ['duplicate'] } as Record<Status, string[]>)[po.status];
    }
    private summary(po: PO) {
        const ordered = po.lines.reduce((s, l) => s + l.qty, 0), got = po.lines.reduce((s, l) => s + l.received, 0);
        const total = po.lines.reduce((s, l) => s + l.qty * Number(l.rate), 0);
        return { id: po.id, poNumber: po.no, status: po.status, statusLabel: LABEL[po.status], distributorId: po.dist, distributorName: DISTRIBUTORS.find((d) => d.id === po.dist)!.name,
            orderDate: '2026-11-07', expectedDate: po.expected, sentAt: po.sentAt, sentVia: po.sentAt ? 'manual' : '', overdue: false, itemCount: po.lines.length, orderedQty: ordered,
            receivedQty: got, totalAmount: total.toFixed(2), closedShort: po.closedShort };
    }
    private detail(po: PO) {
        const d = DISTRIBUTORS.find((x) => x.id === po.dist)!;
        return { ...this.summary(po), version: po.version, notes: po.notes, cancelReason: po.cancelReason, expiresAt: null, distributorPhone: d.phone, distributorEmail: '', distributorLedger: null,
            shareToken: po.token, allowedActions: this.actions(po), sendDefaults: { channel: this.settings.defaultChannel, template: '', expiryDays: this.settings.expiryDays, storeName: 'Demo Pharmacy' },
            items: po.lines.map((l) => ({ id: l.id, productId: l.productId, productName: PRODUCTS[l.productId].name, packLabel: '10 strip', qty: l.qty, receivedQty: l.received, remainingQty: l.qty - l.received,
                estRate: l.rate, lineTotal: (l.qty * Number(l.rate)).toFixed(2), currentStock: 3, minQty: 12, onOrder: 0, lastPurchaseRate: l.rate, shortbookItemId: l.sb ?? null })),
            events: po.events.map((e) => ({ ...e, userName: 'Pratik' })) };
    }
    private sbRow(r: SB) {
        return { id: r.id, productId: r.productId, productName: PRODUCTS[r.productId].name, packLabel: '10 strip', qtyNeeded: r.qty, source: r.source, sourceLabel: SRC_LABEL[r.source], status: r.status,
            statusLabel: SB_LABEL[r.status], note: '', customerName: r.customer, customerPhone: '', distributorId: r.dist, distributorName: DISTRIBUTORS.find((d) => d.id === r.dist)?.name ?? null,
            currentStock: 3, minQty: 12, onOrder: 0, lastRate: PRODUCTS[r.productId].rate, addedOn: '2026-11-07T09:00:00' };
    }
    /** the unreceived part of a closed order goes back to the Shortbook as Pending (merging into an open row for the same product) */
    private release(po: PO) {
        for (const l of po.lines) {
            const left = l.qty - l.received;
            if (left <= 0) continue;
            const open = this.shortbook.find((r) => r.productId === l.productId && ['PENDING', 'IN_DRAFT', 'ORDERED'].includes(r.status) && r.id !== l.sb);
            const own = this.shortbook.find((r) => r.id === l.sb);
            if (open) open.qty += left;
            else if (own) { own.status = 'PENDING'; own.qty = left; }
            else this.shortbook.push({ id: this.id('sb'), productId: l.productId, qty: left, source: 'manual', status: 'PENDING', dist: po.dist, customer: '' });
        }
    }

    async install(context: BrowserContext | Page) {
        await context.route(/\/api\/v1\//, (route) => this.handle(route));
    }

    private json(route: Route, body: unknown, status = 200) { return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }

    private async handle(route: Route) {
        const req = route.request();
        const url = new URL(req.url());
        const path = url.pathname.replace(/^.*\/api\/v1/, '');
        const method = req.method();
        const body = (() => { try { return req.postDataJSON() ?? {}; } catch { return {}; } })();
        if (method !== 'GET') this.writes.push(`${method} ${path}`);
        const m = (re: RegExp) => path.match(re);
        const ok = (b: unknown, s = 200) => this.json(route, b, s);
        const fail = (detail: string, code: string, s = 400) => this.json(route, { detail, code }, s);

        if (path === '/auth/me/') return ok(ME);
        if (path === '/purchases/distributors/') return ok(DISTRIBUTORS);
        if (path === '/purchases/shortbook/product-info/') {
            const pid = url.searchParams.get('productId') || '';
            const prod = PRODUCTS[pid];
            if (!prod) return this.json(route, { detail: 'That product was not found.', code: 'NO_PRODUCT' }, 404);
            const open = this.shortbook.find((r) => r.productId === pid && ['PENDING', 'IN_DRAFT', 'ORDERED'].includes(r.status));
            return ok({ productId: pid, name: prod.name, manufacturer: 'Cipla', packLabel: '10 strip', currentStock: 3, minQty: 12, onOrder: 0, lastRate: prod.rate,
                lastDistributor: { id: 'd2', name: 'Gupta Agency' }, inShortbook: open ? { id: open.id, qty: open.qty, status: open.status, statusLabel: SB_LABEL[open.status] } : null });
        }
        if (path === '/products/catalog/search/') {
            const q = (url.searchParams.get('q') || '').toLowerCase();
            return ok({ data: Object.entries(PRODUCTS).filter(([, p]) => p.name.toLowerCase().includes(q)).map(([id, p]) => ({ id, name: p.name, manufacturer: 'Cipla', packSize: 10, packType: 'strip', mrp: 50 })) });
        }

        // ── public page (no login) ──
        let g = m(/^\/purchases\/public\/po\/([^/]+)\/$/);
        if (g) {
            const po = this.orders.find((o) => o.token === g![1]);
            if (!po || po.status === 'SAVED') return fail('This link is not valid.', 'NOT_FOUND', 404);
            return ok({ storeName: 'Demo Pharmacy', storePhone: '9000000000', storeAddress: 'MG Road, Pune', poNumber: po.no, status: po.status, statusLabel: LABEL[po.status], orderDate: '2026-11-07',
                expectedDate: po.expected, distributorName: DISTRIBUTORS.find((d) => d.id === po.dist)!.name, notes: po.notes, cancelReason: po.status === 'CANCELLED' ? po.cancelReason : '',
                items: po.lines.map((l) => ({ productName: PRODUCTS[l.productId].name, packLabel: '10 strip', qty: l.qty, mrp: '100.00' })), showRates: false, totalAmount: null });
        }

        // ── settings ──
        if (path === '/purchases/settings/po/') {
            if (method === 'GET') return ok(this.settings);
            if (body.password !== this.password) return fail('Your password is not correct.', 'BAD_PASSWORD', 403);
            const { password, outletId, ...rest } = body; void password; void outletId;
            Object.assign(this.settings, rest);
            return ok(this.settings);
        }

        // ── shortbook ──
        if (path === '/purchases/shortbook/' && method === 'GET') {
            const open = this.shortbook.filter((r) => ['PENDING', 'IN_DRAFT', 'ORDERED'].includes(r.status));
            const c = (s: string) => this.shortbook.filter((r) => r.status === s).length;
            const counts = { pending: c('PENDING'), inDraft: c('IN_DRAFT'), ordered: c('ORDERED') };
            const sp = url.searchParams;
            const search = (sp.get('search') || '').toLowerCase();
            const visible = open.filter((r) => !search || PRODUCTS[r.productId].name.toLowerCase().includes(search));
            const paged = <T,>(rows: T[], dflt: number, cap: number) => {
                const size = Math.min(cap, Number(sp.get('pageSize') || dflt)), page = Number(sp.get('page') || 1);
                return { slice: rows.slice((page - 1) * size, page * size), pagination: { page, pageSize: size, totalRecords: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / size)) } };
            };
            this.shortbookReads.push(sp.get('view') === 'groups' ? 'groups' : sp.get('distributorId') ? `items:${sp.get('distributorId')}:p${sp.get('page') || 1}` : sp.get('countsOnly') ? 'counts' : 'all');
            if (sp.get('view') === 'groups') {
                const keys = Array.from(new Set(visible.map((r) => r.dist ?? 'none')));
                const all = keys.map((k) => { const mine = visible.filter((r) => (r.dist ?? 'none') === k); return { key: k, distributorId: k === 'none' ? null : k, name: k === 'none' ? 'No distributor chosen' : DISTRIBUTORS.find((d) => d.id === k)!.name,
                    items: mine.length, pending: mine.filter((r) => r.status === 'PENDING').length, qty: mine.reduce((s, r) => s + r.qty, 0) }; })
                    .sort((a, b) => Number(a.key !== 'none') - Number(b.key !== 'none') || a.name.localeCompare(b.name));
                const { slice, pagination } = paged(all, 10, 50);
                return ok({ groups: slice, pagination, counts });
            }
            if (sp.get('distributorId')) {
                const k = sp.get('distributorId')!;
                const mine = visible.filter((r) => (r.dist ?? 'none') === k).sort((a, b) => PRODUCTS[a.productId].name.localeCompare(PRODUCTS[b.productId].name));
                const { slice, pagination } = paged(mine, 25, 100);
                return ok({ results: slice.map((r) => this.sbRow(r)), pagination, counts });
            }
            if (sp.get('countsOnly')) return ok({ results: [], counts });
            return ok({ results: visible.map((r) => this.sbRow(r)), counts });
        }
        if (path === '/purchases/shortbook/' && method === 'POST') {
            const existing = this.shortbook.find((r) => r.productId === body.productId && ['PENDING', 'IN_DRAFT', 'ORDERED'].includes(r.status));
            if (existing) { existing.qty += Number(body.qty); return ok(this.sbRow(existing), 201); }
            const row = this.addShortbook(body.productId, Number(body.qty), body.distributorId ?? 'd1', body.source ?? 'manual');
            row.customer = body.customerName || '';
            return ok(this.sbRow(row), 201);
        }
        if (path === '/purchases/shortbook/create-pos/') {
            const rows = this.shortbook.filter((r) => ((body.itemIds as string[]).includes(r.id) || (body.distributorIds as string[] ?? []).includes(r.dist ?? '')) && r.status === 'PENDING');
            if (!rows.length) return fail('Pick at least one pending item.', 'NO_ITEMS');
            const missing = rows.filter((r) => !r.dist).map((r) => PRODUCTS[r.productId].name);
            if (missing.length) return fail(`Choose a distributor for: ${missing.join(', ')}`, 'NO_DISTRIBUTOR');
            const made: PO[] = [];
            for (const dist of Array.from(new Set(rows.map((r) => r.dist!)))) {
                const mine = rows.filter((r) => r.dist === dist);
                const po = this.addOrder('SAVED', [], dist);
                po.lines = mine.map((r) => ({ id: this.id('l'), productId: r.productId, qty: r.qty, received: 0, rate: PRODUCTS[r.productId].rate, sb: r.id }));
                mine.forEach((r) => { r.status = 'IN_DRAFT'; });
                made.push(po);
            }
            return ok({ created: made.map((p) => ({ id: p.id, poNumber: p.no, distributorName: DISTRIBUTORS.find((d) => d.id === p.dist)!.name, itemCount: p.lines.length, totalAmount: this.summary(p).totalAmount })) }, 201);
        }
        g = m(/^\/purchases\/shortbook\/([^/]+)\/$/);
        if (g) {
            const row = this.shortbook.find((r) => r.id === g![1]);
            if (!row) return fail('Shortbook item not found.', 'NOT_FOUND', 404);
            if (method === 'PATCH') { if ('qtyNeeded' in body) row.qty = Number(body.qtyNeeded); if ('distributorId' in body) row.dist = body.distributorId; return ok(this.sbRow(row)); }
            if (method === 'DELETE') { row.status = 'REMOVED'; return route.fulfill({ status: 204 }); }
        }

        // ── orders ──
        if (path === '/purchases/orders/' && method === 'GET') {
            const want = (url.searchParams.get('status') || 'ALL').toUpperCase();
            const all = this.orders.map((o) => this.summary(o));
            const count = (s: string) => all.filter((o) => o.status === s).length;
            const counts: Record<string, number> = { SAVED: count('SAVED'), SENT: count('SENT'), PARTIAL: count('PARTIAL'), COMPLETED: count('COMPLETED'), CANCELLED: count('CANCELLED'), EXPIRED: count('EXPIRED') };
            counts.OPEN = counts.SAVED + counts.SENT + counts.PARTIAL; counts.ALL = all.length;
            const open = ['SAVED', 'SENT', 'PARTIAL'];
            const rows = want === 'ALL' ? all : want === 'OPEN' ? all.filter((o) => open.includes(o.status)) : all.filter((o) => want.split(',').includes(o.status));
            return ok({ results: rows, pagination: { page: 1, pageSize: 25, totalPages: 1, totalRecords: rows.length }, statusCounts: counts,
                totals: { count: rows.length, amount: rows.reduce((s, o) => s + Number(o.totalAmount), 0).toFixed(2) } });
        }
        if (path === '/purchases/orders/open/') return ok({ results: this.orders.filter((o) => o.dist === url.searchParams.get('distributorId') && ['SENT', 'PARTIAL'].includes(o.status)).map((o) => this.summary(o)) });
        if (path === '/purchases/orders/items/') return ok({ results: [], pagination: { page: 1, pageSize: 25, totalPages: 1, totalRecords: 0 } });
        if (path === '/purchases/orders/by-distributor/') return ok({ results: [] });
        g = m(/^\/purchases\/orders\/([^/]+)\/(send|cancel|close-short|duplicate)?\/?$/);
        if (g && g[1] !== 'open' && g[1] !== 'items') {
            const po = this.orders.find((o) => o.id === g![1]);
            if (!po) return fail('Purchase order not found.', 'NOT_FOUND', 404);
            const act = g[2];
            const log = (action: string, payload: Record<string, unknown> = {}) => po.events.push({ id: this.id('e'), action, at: '2026-11-08T12:00:00', payload });
            if (!act && method === 'GET') return ok(this.detail(po));
            if (!act && method === 'PUT') {
                if (po.status !== 'SAVED') return fail(`${po.no} is ${LABEL[po.status]}. Only a Draft can be edited.`, 'LOCKED', 409);
                if (Number(body.version) !== po.version) return fail('This PO was changed by someone else. Reload it and try again.', 'STALE', 409);
                po.lines = (body.items as { productId: string; orderQty: number; estRate: string; shortbookItemId?: string }[]).map((i) => ({ id: this.id('l'), productId: i.productId, qty: Number(i.orderQty), received: 0, rate: String(i.estRate), sb: i.shortbookItemId ?? undefined }));
                po.version += 1; po.notes = body.notes ?? po.notes; po.expected = body.expectedDate ?? po.expected; log('edited');
                return ok(this.detail(po));
            }
            if (!act && method === 'DELETE') {
                if (po.status !== 'SAVED') return fail('Only a Draft can be deleted: cancel it instead.', 'LOCKED', 409);
                po.lines.forEach((l) => { const r = this.shortbook.find((x) => x.id === l.sb); if (r) r.status = 'PENDING'; });
                this.orders = this.orders.filter((o) => o !== po);
                return route.fulfill({ status: 204 });
            }
            if (act === 'send') {
                if (po.lines.length === 0) return fail('Add at least one item before sending.', 'EMPTY', 409);
                po.status = 'SENT'; po.sentAt = '2026-11-08T12:00:00'; po.expected = body.expectedDate ?? po.expected;
                po.lines.forEach((l) => { const r = this.shortbook.find((x) => x.id === l.sb); if (r) r.status = 'ORDERED'; });
                if (body.channel !== 'manual') po.token = po.token ?? `tok-${po.id}`;
                log('sent', { channel: body.channel });
                return ok({ po: this.detail(po), shareUrl: po.token ? `http://localhost:3000/po/${po.token}` : '', waUrl: po.token ? 'https://wa.me/919876543210?text=hello' : '', message: 'hello' });
            }
            if (act === 'cancel') {
                if (!String(body.reason || '').trim()) return fail('Say why you are cancelling it.', 'NO_REASON');
                po.status = 'CANCELLED'; po.cancelReason = body.reason; this.release(po); log('cancelled', { reason: body.reason });
                return ok(this.detail(po));
            }
            if (act === 'close-short') {
                po.status = 'COMPLETED'; po.closedShort = true; this.release(po); log('closed_short');
                return ok(this.detail(po));
            }
            if (act === 'duplicate') {
                const copy = this.addOrder('SAVED', po.lines.map((l) => [l.productId, l.qty, 0] as [string, number, number]), po.dist);
                log('duplicated', { copy: copy.no });
                return ok(this.detail(copy), 201);
            }
        }
        return ok(method === 'GET' ? { data: [], results: [] } : {});            // anything the page chrome asks for that the PO screens do not care about
    }
}

/** log in without a server: the app only needs an access_token cookie and its stored user */
export async function fakeLogin(context: BrowserContext, origin = 'http://localhost:3000', extraPermissions: string[] = []) {
    const url = new URL(origin);
    const me = { ...ME, permissions: Array.from(new Set([...ME.permissions, ...extraPermissions])) };
    await context.addCookies([{ name: 'access_token', value: 'e2e-fake-token', domain: url.hostname, path: '/' }]);
    await context.addInitScript((me) => {
        try { localStorage.setItem('mediflow-auth', JSON.stringify({ state: { user: me, outlet: me.outlet, isAuthenticated: true }, version: 0 })); } catch { /* ignore */ }
    }, me);
}
