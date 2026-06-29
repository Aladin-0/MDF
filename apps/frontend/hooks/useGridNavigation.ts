import { useEffect, useRef } from 'react';

export function useGridNavigation(containerRef: React.RefObject<HTMLElement>) {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement as HTMLElement;
            if (!activeEl || !container.contains(activeEl)) return;

            const row = activeEl.getAttribute('data-cart-row');
            const col = activeEl.getAttribute('data-cart-col');

            if (!row || !col) return;

            const rowIndex = parseInt(row, 10);

            let nextRowIndex = rowIndex;
            let nextCol = col;
            let shouldMove = false;

            if (e.key === 'ArrowUp') {
                nextRowIndex = rowIndex - 1;
                shouldMove = true;
            } else if (e.key === 'ArrowDown') {
                nextRowIndex = rowIndex + 1;
                shouldMove = true;
            } else if (e.key === 'ArrowRight' && activeEl.tagName !== 'INPUT') {
                // Simplified right/left for non-inputs to prevent breaking text cursor
                shouldMove = true;
                // Complex horizontal traversal is skipped for simplicity, 
                // but we could map col names to an array: ['delete', 'strips', 'loose', 'rate']
            }

            if (shouldMove) {
                // Only move if we are not actively typing in an input where up/down matters
                // For number inputs, up/down changes value. We'll intercept it if Shift is held, or if the user prefers grid nav.
                // Let's explicitly override ArrowUp/Down for inputs to mean grid nav unless Alt is held.
                
                // For fast entry, we want ArrowUp/Down to move rows.
                if (activeEl.tagName === 'INPUT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    // Stop native number increment
                    e.preventDefault();
                }

                const nextSelector = `[data-cart-row="${nextRowIndex}"][data-cart-col="${nextCol}"]`;
                const nextEl = container.querySelector(nextSelector) as HTMLElement;

                if (nextEl) {
                    nextEl.focus();
                }
            }
            
            // Delete row shortcut
            if ((e.key === 'Delete' || (e.key === 'Backspace' && e.altKey)) && activeEl.tagName !== 'INPUT') {
                const deleteBtn = container.querySelector(`[data-cart-row="${rowIndex}"][data-cart-col="delete"]`) as HTMLElement;
                if (deleteBtn) {
                    e.preventDefault();
                    deleteBtn.click();
                }
            }
        };

        container.addEventListener('keydown', handleKeyDown);
        return () => container.removeEventListener('keydown', handleKeyDown);
    }, [containerRef]);
}
