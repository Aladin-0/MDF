import { renderHook, act } from '@testing-library/react';
import { useIsPhone } from './useIsPhone';

function mockMatchMedia(matches: boolean) {
    const listeners: Array<() => void> = [];
    const mq: any = { matches, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: jest.fn() };
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: jest.fn().mockReturnValue(mq) });
    return { mq, fire: () => listeners.forEach((fn) => fn()) };
}

describe('useIsPhone', () => {
    const original = window.matchMedia;
    afterEach(() => { Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: original }); });

    it('is true on a phone-width window and asks for max-width 767px', () => {
        mockMatchMedia(true);
        const { result } = renderHook(() => useIsPhone());
        expect(result.current).toBe(true);
        expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
    });

    it('is false on a tablet / desktop window', () => {
        mockMatchMedia(false);
        expect(renderHook(() => useIsPhone()).result.current).toBe(false);
    });

    it('follows the window when it is rotated or resized', () => {
        const m = mockMatchMedia(true);
        const { result } = renderHook(() => useIsPhone());
        expect(result.current).toBe(true);
        act(() => { m.mq.matches = false; m.fire(); });
        expect(result.current).toBe(false);
    });

    it('falls back to the standard layout when matchMedia does not exist', () => {
        Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: undefined });
        expect(renderHook(() => useIsPhone()).result.current).toBe(false);
    });
});
