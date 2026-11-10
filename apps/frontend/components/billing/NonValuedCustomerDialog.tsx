'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/shared/ModalShell';

interface Props {
    open: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
}

/** Non-valued customer: the customer would rather not share a mobile number. Only a name is taken, and it is kept on the bill. */
export function NonValuedCustomerDialog({ open, onClose, onSave }: Props) {
    const [name, setName] = useState('');
    useEffect(() => { if (open) setName(''); }, [open]);
    const submit = () => { if (name.trim()) { onSave(name.trim()); onClose(); } };

    return (
        <ModalShell open={open} onClose={onClose} title="Non-Valued Customer" size="sm"
            footer={<>
                <Button onClick={submit} disabled={!name.trim()} className="flex-1">Continue</Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
            </>}>
            <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
                <div className="space-y-1.5">
                    <Label>Customer Name *</Label>
                    <Input aria-label="Customer name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Patel" />
                </div>
                <p className="text-xs text-muted-foreground">For a customer who prefers not to share a mobile number. Only the name is kept, on this bill.</p>
                <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
            </form>
        </ModalShell>
    );
}
