import { createDebouncedJSONStorage, discardPendingStorageWrites, flushPendingStorageWrites } from '@/lib/debouncedStorage';

const val = (n: number) => ({ state: { n }, version: 0 });

describe('createDebouncedJSONStorage', () => {
    let setItem: jest.SpyInstance;
    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        setItem = jest.spyOn(Storage.prototype, 'setItem');
    });
    afterEach(() => {
        setItem.mockRestore();
        jest.useRealTimers();
    });

    it('writes once after a burst of changes, with the latest value', () => {
        const s = createDebouncedJSONStorage<{ n: number }>(() => localStorage, 300);
        for (let i = 1; i <= 25; i += 1) s.setItem('k', val(i));      // 25 keystrokes
        expect(setItem).not.toHaveBeenCalled();
        jest.advanceTimersByTime(300);
        expect(setItem).toHaveBeenCalledTimes(1);
        expect(JSON.parse(localStorage.getItem('k')!)).toEqual(val(25));
    });

    it('reads the value that is still waiting to be written', () => {
        const s = createDebouncedJSONStorage<{ n: number }>(() => localStorage, 300);
        s.setItem('k', val(7));
        expect(s.getItem('k')).toEqual(val(7));
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('writes at once when the page is hidden or closed, so nothing typed is lost', () => {
        const s = createDebouncedJSONStorage<{ n: number }>(() => localStorage, 300);
        s.setItem('k', val(3));
        window.dispatchEvent(new Event('pagehide'));
        expect(JSON.parse(localStorage.getItem('k')!)).toEqual(val(3));

        s.setItem('k', val(4));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(JSON.parse(localStorage.getItem('k')!)).toEqual(val(4));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    });

    it('"clear data" can drop pending writes so old drafts are not written back after the wipe', () => {
        const s = createDebouncedJSONStorage<{ n: number }>(() => localStorage, 300);
        s.setItem('k', val(9));
        discardPendingStorageWrites();
        localStorage.clear();
        jest.advanceTimersByTime(1000);
        flushPendingStorageWrites();
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('reads what an earlier session saved, and removeItem clears both', () => {
        localStorage.setItem('k', JSON.stringify(val(1)));
        const s = createDebouncedJSONStorage<{ n: number }>(() => localStorage, 300);
        expect(s.getItem('k')).toEqual(val(1));
        s.setItem('k', val(2));
        s.removeItem('k');
        jest.advanceTimersByTime(1000);
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('a full storage (quota) does not break the app', () => {
        const s = createDebouncedJSONStorage<{ n: number }>(() => localStorage, 300);
        setItem.mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        s.setItem('k', val(1));
        expect(() => jest.advanceTimersByTime(300)).not.toThrow();
        warn.mockRestore();
    });
});
