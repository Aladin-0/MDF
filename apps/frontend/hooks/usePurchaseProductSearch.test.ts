import { renderHook, act, waitFor } from '@testing-library/react';
import { usePurchaseProductSearch } from './usePurchaseProductSearch';
import { productsApi } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ productsApi: { search: jest.fn() } }));
const search = productsApi.search as jest.Mock;
const p = (id: string, name: string) => ({ id, name } as any);

beforeEach(() => { search.mockReset(); search.mockResolvedValue([]); });

describe('usePurchaseProductSearch', () => {
    it('does not search for 0 or 1 letters', async () => {
        const { result, rerender } = renderHook(({ q }) => usePurchaseProductSearch(q, 'o1', 10), { initialProps: { q: '' } });
        rerender({ q: 'd' });
        await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
        expect(search).not.toHaveBeenCalled();
        expect(result.current).toEqual({ results: [], searching: false });
    });

    it('searches the purchase catalogue for the outlet after the pause and returns the results', async () => {
        search.mockResolvedValue([p('1', 'DOLO 650')]);
        const { result } = renderHook(() => usePurchaseProductSearch('dolo', 'o1', 10));
        expect(result.current.searching).toBe(true);
        await waitFor(() => expect(result.current.results).toEqual([p('1', 'DOLO 650')]));
        expect(search).toHaveBeenCalledWith('dolo', 'o1', 'purchase', expect.any(AbortSignal));
        expect(result.current.searching).toBe(false);
    });

    it('waits for the typing to stop: only the last text is searched', async () => {
        const { rerender } = renderHook(({ q }) => usePurchaseProductSearch(q, 'o1', 30), { initialProps: { q: 'do' } });
        rerender({ q: 'dol' }); rerender({ q: 'dolo' });
        await waitFor(() => expect(search).toHaveBeenCalled());
        expect(search).toHaveBeenCalledTimes(1);
        expect(search.mock.calls[0][0]).toBe('dolo');
    });

    it('an answer for old text never shows (and results clear as soon as the text changes)', async () => {
        let resolveOld: (v: any) => void = () => {};
        search.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
        search.mockResolvedValueOnce([p('2', 'LOSAR')]);
        const { result, rerender } = renderHook(({ q }) => usePurchaseProductSearch(q, 'o1', 5), { initialProps: { q: 'dolo' } });
        await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
        rerender({ q: 'losar' });
        await waitFor(() => expect(result.current.results).toEqual([p('2', 'LOSAR')]));
        await act(async () => { resolveOld([p('1', 'DOLO 650')]); });
        expect(result.current.results).toEqual([p('2', 'LOSAR')]);
    });

    it('a failed search shows no results and stops the spinner', async () => {
        search.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => usePurchaseProductSearch('dolo', 'o1', 5));
        await waitFor(() => expect(result.current.searching).toBe(false));
        expect(result.current.results).toEqual([]);
    });

    it('needs an outlet', async () => {
        renderHook(() => usePurchaseProductSearch('dolo', undefined, 5));
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(search).not.toHaveBeenCalled();
    });
});
