'use client';

import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useBackToClose } from '@/hooks/useBackToClose';
import { cn } from '@/lib/utils';

interface SheetShellProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Shown under the title (and read by screen readers) */
    description?: string;
    children: ReactNode;
    /** Pinned under the scrolling body: the sheet's main button(s). Gets safe-area padding. */
    footer?: ReactNode;
    /** Full screen step (search, payment) instead of a bottom sheet */
    full?: boolean;
    /** Extra classes for the scrolling body */
    bodyClassName?: string;
    /** `dark` = the navy dock look of the desktop payment area (payment sheet); default is a light sheet */
    tone?: 'light' | 'dark';
}

/**
 * The one bottom-sheet every phone billing popup uses: rounded top, drag-free, max 92% of the screen (or full screen), a scrolling body,
 * a pinned footer with safe-area padding, a title bar, and the Back button closing it (useBackToClose).
 * Every control inside should be >= 44px tall; numeric fields use inputMode="decimal"/"numeric".
 */
export function SheetShell({ open, onClose, title, description, children, footer, full = false, bodyClassName, tone = 'light' }: SheetShellProps) {
    const dark = tone === 'dark';
    useBackToClose(open, onClose);
    return (
        <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            <SheetContent
                side="bottom"
                className={cn(
                    'flex flex-col gap-0 p-0 z-[70]',
                    // quick slide: the shared sheet takes 500ms to open and 300ms to close, which feels like lag on a phone
                    'data-[state=open]:duration-200 data-[state=closed]:duration-150',
                    // the shared sheet's close X is ~32px: make it a 44px touch target here
                    '[&>button.absolute]:right-2 [&>button.absolute]:top-2 [&>button.absolute]:flex [&>button.absolute]:h-11 [&>button.absolute]:w-11 [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:p-0',
                    full ? 'h-dvh max-h-dvh rounded-none' : 'max-h-[92dvh] rounded-t-2xl',
                    'touch-manipulation',
                    dark && 'border-slate-700 bg-slate-900 text-white [&>button.absolute]:text-white [&>button.absolute]:opacity-90',
                )}
                onOpenAutoFocus={(e) => e.preventDefault()}   // do not pop the keyboard just because a sheet opened
                {...(description ? {} : { 'aria-describedby': undefined })}
            >
                <div className={cn('shrink-0 border-b px-4 pb-3 pt-4 pr-14', dark ? 'border-slate-700' : 'border-slate-300')}>
                    <SheetTitle className={cn('text-lg font-extrabold', dark ? 'text-white' : 'text-slate-900')}>{title}</SheetTitle>
                    {description && <SheetDescription className={cn('mt-0.5 text-sm', dark ? 'text-slate-300' : 'text-slate-600')}>{description}</SheetDescription>}
                </div>
                <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3', bodyClassName)}>{children}</div>
                {footer && (
                    <div className={cn('shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]', dark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white')}>{footer}</div>
                )}
            </SheetContent>
        </Sheet>
    );
}
