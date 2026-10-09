import { useEffect } from 'react';

export function useGridNavigation(containerRef: React.RefObject<HTMLElement>, onAddRow?: () => void) {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement as HTMLElement;
            if (!activeEl || !container.contains(activeEl)) return;

            const rowElement = activeEl.closest('[data-cart-row]');
            if (!rowElement) return;
            
            const rowStr = rowElement.getAttribute('data-cart-row');
            if (!rowStr) return;
            
            const rowIndex = parseInt(rowStr, 10);
            
            // Get all focusable cells in the current row
            let rowCells = Array.from(rowElement.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
            // If no inputs, the row itself is the only focusable "cell"
            if (rowCells.length === 0 && (rowElement as HTMLElement).hasAttribute('tabindex')) {
                rowCells = [rowElement as HTMLElement];
            }
            
            const colIndex = rowCells.indexOf(activeEl);
            
            let shouldMove = false;
            let targetEl: HTMLElement | null = null;
            
            if (e.key === 'ArrowRight') {
                if (activeEl.tagName === 'INPUT') {
                    const inputEl = activeEl as HTMLInputElement;
                    if (inputEl.type !== 'number' && inputEl.selectionEnd !== inputEl.value.length) return;
                }
                if (colIndex !== -1 && colIndex < rowCells.length - 1) {
                    targetEl = rowCells[colIndex + 1];
                    shouldMove = true;
                }
            } else if (e.key === 'ArrowLeft') {
                if (activeEl.tagName === 'INPUT') {
                    const inputEl = activeEl as HTMLInputElement;
                    if (inputEl.type !== 'number' && inputEl.selectionStart !== 0) return;
                }
                if (colIndex > 0) {
                    targetEl = rowCells[colIndex - 1];
                    shouldMove = true;
                }
            } else if (e.key === 'ArrowUp') {
                const prevRow = container.querySelector(`[data-cart-row="${rowIndex - 1}"]`);
                if (prevRow) {
                    let prevCells = Array.from(prevRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
                    if (prevCells.length === 0 && (prevRow as HTMLElement).hasAttribute('tabindex')) {
                        prevCells = [prevRow as HTMLElement];
                    }
                    targetEl = prevCells[colIndex !== -1 ? colIndex : 0] || prevCells[prevCells.length - 1];
                    shouldMove = true;
                }
            } else if (e.key === 'ArrowDown') {
                const nextRow = container.querySelector(`[data-cart-row="${rowIndex + 1}"]`);
                if (nextRow) {
                    let nextCells = Array.from(nextRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
                    if (nextCells.length === 0 && (nextRow as HTMLElement).hasAttribute('tabindex')) {
                        nextCells = [nextRow as HTMLElement];
                    }
                    targetEl = nextCells[colIndex !== -1 ? colIndex : 0] || nextCells[nextCells.length - 1];
                    shouldMove = true;
                } else if (onAddRow) {
                    e.preventDefault();
                    onAddRow();
                    setTimeout(() => {
                        const newFirstCellRow = container.querySelector(`[data-cart-row="${rowIndex + 1}"]`);
                        if (newFirstCellRow) {
                            let newCells = Array.from(newFirstCellRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
                            if (newCells.length === 0 && (newFirstCellRow as HTMLElement).hasAttribute('tabindex')) {
                                newCells = [newFirstCellRow as HTMLElement];
                            }
                            if (newCells[0]) newCells[0].focus();
                        }
                    }, 50);
                    return;
                }
            }

            if (shouldMove && targetEl) {
                e.preventDefault();
                targetEl.focus();
                if (targetEl.tagName === 'INPUT') {
                    (targetEl as HTMLInputElement).select();
                }
            }
        };

        container.addEventListener('keydown', handleKeyDown);
        return () => container.removeEventListener('keydown', handleKeyDown);
    }, [containerRef, onAddRow]);
}
