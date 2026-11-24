import { inventoryApi, reportsApi } from '@/lib/apiClient';
import { fetchAllStock, MAX_PAGE_SIZE } from '@/lib/inventoryApi';

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response);

describe('inventory API requests', () => {
    const fetchMock = jest.fn();
    beforeEach(() => { fetchMock.mockReset(); (global as any).fetch = fetchMock; });

    it('sends the sort DIRECTION the server reads (sortOrder). It used to send nothing, so "descending" was ignored', async () => {
        fetchMock.mockImplementation(() => ok({ data: [] }));
        await inventoryApi.getStock('o1', { sortBy: 'stock', sortOrder: 'desc', page: 2, pageSize: 25 });
        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain('sortBy=stock');
        expect(url).toContain('sortOrder=desc');
        expect(url).not.toMatch(/[?&]order=/);
    });

    it('sends the outlet in the QUERY STRING of the adjust call (the endpoint reads it from there) with the body it requires', async () => {
        fetchMock.mockImplementation(() => ok({ success: true }));
        await inventoryApi.adjustStock({ batchId: 'b1', outletId: 'o 1', type: 'damage', qty: -3, adjustUnit: 'loose', reason: 'Broken', pin: '4321' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toMatch(/\/inventory\/adjust\/\?outletId=o%201$/);
        expect(JSON.parse(init.body)).toEqual({ batchId: 'b1', type: 'damage', qty: -3, adjustUnit: 'loose', reason: 'Broken', pin: '4321', outletId: 'o 1' });
    });

    it('defaults the adjust unit to whole packs', async () => {
        fetchMock.mockImplementation(() => ok({ success: true }));
        await inventoryApi.adjustStock({ batchId: 'b1', outletId: 'o1', type: 'correction', qty: 2, pin: '1' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).adjustUnit).toBe('strips');
    });
});

describe('fetchAllStock', () => {
    const fetchMock = jest.fn();
    beforeEach(() => { fetchMock.mockReset(); (global as any).fetch = fetchMock; });
    const page = (n: number, totalPages: number) => ok({ data: [{ id: `p${n}a` }, { id: `p${n}b` }], pagination: { page: n, totalPages, totalRecords: totalPages * 2 } });

    it('walks every page at the server maximum, so a list longer than 100 is not cut off', async () => {
        fetchMock.mockImplementationOnce(() => page(1, 3)).mockImplementationOnce(() => page(2, 3)).mockImplementationOnce(() => page(3, 3));
        const result = await fetchAllStock('o1', { expiringSoon: true });
        expect(result.products.map((p: any) => p.id)).toEqual(['p1a', 'p1b', 'p2a', 'p2b', 'p3a', 'p3b']);
        expect(result.totalRecords).toBe(6);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        for (const [url] of fetchMock.mock.calls) {
            expect(String(url)).toContain(`pageSize=${MAX_PAGE_SIZE}`);
            expect(String(url)).toContain('expiringSoon=true');
        }
        expect(String(fetchMock.mock.calls[2][0])).toContain('page=3');
    });

    it('stops straight away when there is one page', async () => {
        fetchMock.mockImplementationOnce(() => page(1, 1));
        const result = await fetchAllStock('o1', { lowStock: true });
        expect(result.products).toHaveLength(2);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const pageNo = (url: unknown) => Number(/[?&]page=(\d+)/.exec(String(url))![1]);

    it('keeps the server order even when later pages answer first, and never asks for more than 2 pages at once', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        fetchMock.mockImplementation((url: string) => {
            const n = pageNo(url);
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            const delay = n === 1 ? 0 : (7 - n) * 5;            // page 6 answers first, page 2 last
            return new Promise((resolve) => setTimeout(() => { inFlight -= 1; resolve(page(n, 6)); }, delay));
        });
        const result = await fetchAllStock('o1', { expiringSoon: true });
        expect(result.products.map((p: any) => p.id)).toEqual(
            [1, 2, 3, 4, 5, 6].flatMap((n) => [`p${n}a`, `p${n}b`]),
        );
        expect(result.totalRecords).toBe(12);
        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(maxInFlight).toBeLessThanOrEqual(2);              // the server has few workers: one tab must not take them all
        expect(new Set(fetchMock.mock.calls.map(([url]) => pageNo(url)))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    });

    it('cancels: the signal reaches the request, and no further page is asked for after leaving the tab', async () => {
        const controller = new AbortController();
        fetchMock.mockImplementation((url: string, init: RequestInit) => {
            expect(init.signal).toBe(controller.signal);
            if (pageNo(url) === 2) controller.abort();          // the user leaves while page 2 loads
            return page(pageNo(url), 50);
        });
        await expect(fetchAllStock('o1', { lowStock: true }, controller.signal)).rejects.toThrow(/abort/i);
        expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);   // was: all 50 pages, one after another
    });

    it('reports a list longer than the safety limit as truncated', async () => {
        fetchMock.mockImplementation((url: string) => page(pageNo(url), 150));
        const result = await fetchAllStock('o1', { lowStock: true });
        expect(fetchMock).toHaveBeenCalledTimes(100);
        expect(result.truncated).toBe(true);
    });
});

describe('stock valuation request', () => {
    const fetchMock = jest.fn();
    beforeEach(() => { fetchMock.mockReset(); (global as any).fetch = fetchMock; fetchMock.mockImplementation(() => ok({ data: {} })); });

    it('asks for the small summary when the page only needs totals (the full answer was ~580 KB)', async () => {
        await reportsApi.getStockValuation('o1', { summary: true });
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/valuation\/\?outletId=o1&summary=true$/);
    });

    it('and the full report is still the default for the reports page', async () => {
        await reportsApi.getStockValuation('o1');
        expect(String(fetchMock.mock.calls[0][0])).not.toContain('summary');
    });
});
