'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/shared/ModalShell';

interface Props {
    open: boolean;
    onClose: () => void;
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    destructive?: boolean;
    /** Ask for a written reason (required) and pass it to onConfirm. */
    reasonLabel?: string;
    onConfirm: (reason: string) => Promise<void> | void;
}

/** Confirmation for the actions that cost something to undo: send, cancel, close short, delete. */
export function POConfirmModal({ open, onClose, title, message, confirmLabel, destructive, reasonLabel, onConfirm }: Props) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (open) { setReason(''); setError(null); setBusy(false); } }, [open]);

    const go = async () => {
        setBusy(true); setError(null);
        try { await onConfirm(reason.trim()); onClose(); }
        catch (e: any) { setError(e?.message || 'Something went wrong.'); }
        finally { setBusy(false); }
    };

    return (
        <ModalShell open={open} onClose={onClose} title={title} size="sm"
            footer={<>
                <Button onClick={go} disabled={busy || (!!reasonLabel && !reason.trim())} variant={destructive ? 'destructive' : 'default'} className="flex-1">{busy ? 'Please wait...' : confirmLabel}</Button>
                <Button variant="outline" onClick={onClose} disabled={busy}>Keep it</Button>
            </>}>
            <div className="text-sm text-muted-foreground space-y-3">{message}</div>
            {reasonLabel && (
                <div className="space-y-1.5">
                    <Label>{reasonLabel} *</Label>
                    <Input aria-label={reasonLabel} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong distributor" />
                </div>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </ModalShell>
    );
}
