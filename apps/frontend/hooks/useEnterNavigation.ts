import { useEffect, useRef } from 'react';

export function useEnterNavigation(refs: React.RefObject<HTMLElement>[]) {
    // Keep a stable reference to the latest refs array to prevent unnecessary re-binds on every render
    const refsRef = useRef(refs);
    useEffect(() => {
        refsRef.current = refs;
    }, [refs]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                const activeEl = document.activeElement as HTMLElement;
                
                const currentRefs = refsRef.current;
                
                // Find the index of the currently focused element or if it's inside one of our refs
                const currentIndex = currentRefs.findIndex(ref => ref.current === activeEl || ref.current?.contains(activeEl));
                
                if (currentIndex !== -1 && currentIndex < currentRefs.length - 1) {
                    e.preventDefault();
                    
                    // Find next valid ref
                    let nextIndex = currentIndex + 1;
                    while (nextIndex < currentRefs.length && !currentRefs[nextIndex].current) {
                        nextIndex++;
                    }
                    
                    if (nextIndex < currentRefs.length && currentRefs[nextIndex].current) {
                        const nextEl = currentRefs[nextIndex].current;
                        // Push focus action to the end of the event loop (Suspect B Fix)
                        setTimeout(() => {
                            if (nextEl?.tagName === 'INPUT' || nextEl?.tagName === 'TEXTAREA') {
                                nextEl.focus();
                            } else {
                                const focusable = nextEl?.querySelector('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') as HTMLElement;
                                if (focusable) {
                                    focusable.focus();
                                } else {
                                    nextEl?.focus();
                                }
                            }
                        }, 0);
                    }
                }
            }
        };

        // Use bubble phase so that components can prevent default/propagation
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);
}
