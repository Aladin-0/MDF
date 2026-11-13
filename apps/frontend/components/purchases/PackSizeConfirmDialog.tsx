'use client';

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { PackMismatch } from '@/lib/purchasePack';

interface PackSizeConfirmDialogProps {
    /** The lines whose PKG contradicts the catalogue; null/empty = closed */
    mismatches: PackMismatch[] | null;
    /** "Save as entered" */
    onConfirm: () => void;
    /** "Go back and check": the first line in doubt is passed so the phone layout can open it */
    onReview: (firstIndex: number | undefined) => void;
}

/**
 * Asked once before saving when a line's PKG is not the catalogue's pack size (catalogue 10 per strip, line says 15). PKG sets how much stock
 * the line adds and the pack size of its batch, so a slip would silently create or lose stock: this puts the numbers in front of the clerk.
 * (A catalogue size of 1 usually means "never filled in": it is not asked about.)
 */
export function PackSizeConfirmDialog({ mismatches, onConfirm, onReview }: PackSizeConfirmDialogProps) {
    const open = !!mismatches && mismatches.length > 0;
    return (
        <AlertDialog open={open} onOpenChange={(o) => { if (!o) onReview(mismatches?.[0]?.index); }}>
            <AlertDialogContent data-testid="pack-confirm">
                <AlertDialogHeader>
                    <AlertDialogTitle>Check the pack sizes</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div>
                            <p>{mismatches && mismatches.length === 1 ? 'This line uses' : 'These lines use'} a different pack size from the catalogue. Stock is added as packs of the size you entered.</p>
                            <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto" data-testid="pack-confirm-list">
                                {(mismatches || []).map((m) => (
                                    <li key={m.index} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                        <span className="block font-bold">{m.name}</span>
                                        <span className="block tabular-nums">Pkg <strong>{m.pkg}</strong> (catalogue {m.catalogPkg}) · {m.packs} {m.packs === 1 ? 'pack' : 'packs'} = <strong>{m.units.toLocaleString('en-IN')} units</strong> added</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="max-sm:flex-col-reverse max-sm:gap-2 max-sm:space-x-0">
                    <AlertDialogCancel data-testid="pack-review" className="max-sm:mt-0 max-sm:h-11 max-sm:w-full">Go back and check</AlertDialogCancel>
                    <AlertDialogAction data-testid="pack-confirm-save" onClick={onConfirm} className="max-sm:h-11 max-sm:w-full">Save as entered</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
