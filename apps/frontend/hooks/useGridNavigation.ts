import { useEffect, useRef } from 'react';

export function useGridNavigation(containerRef: React.RefObject<HTMLElement>, onAddRow?: () => void) {
    const onAddRowRef = useRef(onAddRow);
    useEffect(() => {
        onAddRowRef.current = onAddRow;
    }, [onAddRow]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const container = containerRef.current;
            if (!container) return;

            const activeEl = (e.target || document.activeElement) as HTMLElement;
            if (!activeEl || !container.contains(activeEl)) return;

            const rowElement = activeEl.closest('[data-cart-row]');
            if (!rowElement) return;
            
            const rowStr = rowElement.getAttribute('data-cart-row');
            if (!rowStr) return;
            
            const rowIndex = parseInt(rowStr, 10);
            
            // Focusable data inputs in the current row
            const rowInputs = Array.from(
                rowElement.querySelectorAll('input:not([disabled]):not([type="hidden"])')
            ) as HTMLInputElement[];

            // ── Enter key handling ──────────────────────────────────────────
            if (e.key === 'Enter') {
                // If Ctrl or Cmd is held, let it bubble up for invoice submission (Ctrl + Enter)
                if (e.ctrlKey || e.metaKey) return;

                // Immediately stop Enter from submitting the form or bubbling
                e.preventDefault();
                e.stopPropagation();

                const inputIndex = rowInputs.indexOf(activeEl as HTMLInputElement);
                if (inputIndex === -1) return;

                if (e.shiftKey) {
                    // Shift + Enter: Move backwards
                    if (inputIndex > 0) {
                        const prevInput = rowInputs[inputIndex - 1];
                        prevInput.focus();
                        prevInput.select?.();
                        prevInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    } else if (rowIndex > 0) {
                        const prevRow = container.querySelector(`[data-cart-row="${rowIndex - 1}"]`);
                        if (prevRow) {
                            const prevInputs = Array.from(
                                prevRow.querySelectorAll('input:not([disabled]):not([type="hidden"])')
                            ) as HTMLInputElement[];
                            if (prevInputs.length > 0) {
                                const lastInput = prevInputs[prevInputs.length - 1];
                                lastInput.focus();
                                lastInput.select?.();
                                lastInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                            }
                        }
                    }
                    return;
                }

                // Plain Enter: Forward navigation
                if (inputIndex < rowInputs.length - 1) {
                    // Move to the next input in the same row
                    const nextInput = rowInputs[inputIndex + 1];
                    nextInput.focus();
                    nextInput.select?.();
                    nextInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } else {
                    // On the LAST input of this row (e.g. PTS)
                    const nextRow = container.querySelector(`[data-cart-row="${rowIndex + 1}"]`);
                    if (nextRow) {
                        // Move to first input of existing next row
                        const nextInputs = Array.from(
                            nextRow.querySelectorAll('input:not([disabled]):not([type="hidden"])')
                        ) as HTMLInputElement[];
                        if (nextInputs.length > 0) {
                            nextInputs[0].focus();
                            nextInputs[0].select?.();
                            nextInputs[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
                        }
                    } else {
                        // Automatically add a new row and focus its first input
                        onAddRowRef.current?.();

                        const focusNewRow = (retries = 12) => {
                            const newRow = container.querySelector(`[data-cart-row="${rowIndex + 1}"]`);
                            if (newRow) {
                                const target = (newRow.querySelector('input[data-field="product-search"]') ||
                                    newRow.querySelector('input:not([disabled]):not([type="hidden"])')) as HTMLInputElement | null;
                                if (target) {
                                    target.focus();
                                    target.select?.();
                                    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                                    return;
                                }
                            }
                            if (retries > 0) {
                                setTimeout(() => focusNewRow(retries - 1), 30);
                            }
                        };
                        setTimeout(() => focusNewRow(12), 30);
                    }
                }
                return;
            }

            // ── Arrow key navigation ────────────────────────────────────────
            let rowCells = Array.from(
                rowElement.querySelectorAll('input:not([disabled]), button:not([disabled])')
            ) as HTMLElement[];
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
                    let prevCells = Array.from(
                        prevRow.querySelectorAll('input:not([disabled]), button:not([disabled])')
                    ) as HTMLElement[];
                    if (prevCells.length === 0 && (prevRow as HTMLElement).hasAttribute('tabindex')) {
                        prevCells = [prevRow as HTMLElement];
                    }
                    targetEl = prevCells[colIndex !== -1 ? colIndex : 0] || prevCells[prevCells.length - 1];
                    shouldMove = true;
                }
            } else if (e.key === 'ArrowDown') {
                const nextRow = container.querySelector(`[data-cart-row="${rowIndex + 1}"]`);
                if (nextRow) {
                    let nextCells = Array.from(
                        nextRow.querySelectorAll('input:not([disabled]), button:not([disabled])')
                    ) as HTMLElement[];
                    if (nextCells.length === 0 && (nextRow as HTMLElement).hasAttribute('tabindex')) {
                        nextCells = [nextRow as HTMLElement];
                    }
                    targetEl = nextCells[colIndex !== -1 ? colIndex : 0] || nextCells[nextCells.length - 1];
                    shouldMove = true;
                } else {
                    e.preventDefault();
                    onAddRowRef.current?.();
                    const focusNewDownRow = (retries = 10) => {
                        const newFirstCellRow = container.querySelector(`[data-cart-row="${rowIndex + 1}"]`);
                        if (newFirstCellRow) {
                            let newCells = Array.from(
                                newFirstCellRow.querySelectorAll('input:not([disabled]), button:not([disabled])')
                            ) as HTMLElement[];
                            if (newCells.length === 0 && (newFirstCellRow as HTMLElement).hasAttribute('tabindex')) {
                                newCells = [newFirstCellRow as HTMLElement];
                            }
                            if (newCells[0]) {
                                newCells[0].focus();
                                if (newCells[0].tagName === 'INPUT') {
                                    (newCells[0] as HTMLInputElement).select?.();
                                }
                                newCells[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
                                return;
                            }
                        }
                        if (retries > 0) {
                            setTimeout(() => focusNewDownRow(retries - 1), 30);
                        }
                    };
                    setTimeout(() => focusNewDownRow(10), 30);
                    return;
                }
            }

            if (shouldMove && targetEl) {
                e.preventDefault();
                targetEl.focus();
                if (targetEl.tagName === 'INPUT') {
                    (targetEl as HTMLInputElement).select?.();
                }
                targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [containerRef]);
}
