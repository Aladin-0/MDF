'use client';

import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' } as const;

interface ModalShellProps {
    open: boolean;
    onClose: () => void;
    title: string;
    size?: keyof typeof SIZES;
    /** Rendered in the footer row (the project pattern: a full-width primary button, then an outline Cancel). */
    footer?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * The project's standard form modal, the same look as CreateLedgerModal (the billing "quick customer" form): dimmed overlay,
 * `bg-background rounded-lg shadow-xl` panel, bordered header with the title and an X, a scrolling body, a bordered footer.
 * Use it (not a one-off layout) for any new popup so every form in the app looks and behaves alike.
 */
export function ModalShell({ open, onClose, title, size = 'md', footer, children }: ModalShellProps) {
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby={titleId}
                className={cn('bg-background rounded-lg shadow-xl w-full mx-2 sm:mx-4 max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden', SIZES[size])}>
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b shrink-0">
                    <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                    <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>
                <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-6">{children}</div>
                {footer && <div className="flex gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t shrink-0">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

/** A section heading inside a ModalShell body, same as CreateLedgerModal's "Basic" / "Accounting". */
export function ModalSection({ title, children }: { title?: string; children: React.ReactNode }) {
    return (
        <div>
            {title && <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</h3>}
            {children}
        </div>
    );
}
