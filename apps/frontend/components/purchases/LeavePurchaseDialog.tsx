'use client';

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface LeavePurchaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** A new purchase can be kept as a draft; a saved purchase being changed cannot */
    canSaveDraft: boolean;
    onSaveDraft: () => void;
    onDiscard: () => void;
}

/**
 * "Leave this purchase?": asked when Cancel is pressed with typed-in work, so a mis-tap does not throw away a long bill.
 * Used by both layouts (grid and phone).
 */
export function LeavePurchaseDialog({ open, onOpenChange, canSaveDraft, onSaveDraft, onDiscard }: LeavePurchaseDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent data-testid="leave-dialog">
                <AlertDialogHeader>
                    <AlertDialogTitle>Leave this purchase?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {canSaveDraft
                            ? 'What you entered is not saved yet. Keep it as a draft to carry on later, or discard it.'
                            : 'Your changes to this purchase are not saved. If you leave now they are lost.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="max-sm:flex-col-reverse max-sm:gap-2 max-sm:space-x-0">
                    <AlertDialogCancel data-testid="leave-keep" className="max-sm:mt-0 max-sm:h-11 max-sm:w-full">Keep editing</AlertDialogCancel>
                    <AlertDialogAction
                        data-testid="leave-discard"
                        onClick={onDiscard}
                        className={cn('max-sm:h-11 max-sm:w-full bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600')}
                    >
                        {canSaveDraft ? 'Discard' : 'Discard changes'}
                    </AlertDialogAction>
                    {canSaveDraft && (
                        <AlertDialogAction data-testid="leave-save-draft" onClick={onSaveDraft} className="max-sm:h-11 max-sm:w-full">Save draft & leave</AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
