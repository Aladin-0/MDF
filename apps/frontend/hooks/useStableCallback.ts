import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes but which always runs the latest version of `fn`.
 *
 * For event handlers handed to memoised children (purchase rows, bill lines): a new function on every render made
 * every child re-render whenever anything in the parent changed. Only call the result from events / effects, never
 * during render (it would see the previous render's values).
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    const ref = useRef(fn);
    useLayoutEffect(() => {
        ref.current = fn;
    });
    return useCallback((...args: A) => ref.current(...args), []);
}
