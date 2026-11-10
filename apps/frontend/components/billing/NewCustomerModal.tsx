'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import type { Ledger } from '@/types';

interface Props {
    open: boolean;
    onClose: () => void;
    outletId: string;
    /** What the cashier had typed in the customer search; a 10-digit number pre-fills the mobile, anything else the first name. */
    initialQuery?: string;
    onCreated: (ledger: Ledger) => void;
}

/** Billing: Add New Customer. A customer with a mobile number unlocks order history, WhatsApp invoices and payment reminders. */
export function NewCustomerModal({ open, onClose, outletId, initialQuery = '', onCreated }: Props) {
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [pincode, setPincode] = useState('');
    const [discount, setDiscount] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const q = initialQuery.trim();
        setPhone(/^\d{10}$/.test(q) ? q : '');
        setFirst(q && !/^\d+$/.test(q) ? q : '');
        setLast(''); setEmail(''); setAddress(''); setCity(''); setPincode(''); setDiscount(''); setError(null);
    }, [open, initialQuery]);

    const phoneOk = /^[6-9]\d{9}$/.test(phone);
    const canSave = !!first.trim() && phoneOk && !busy;

    const save = async () => {
        if (!canSave) return;
        setBusy(true);
        setError(null);
        try {
            const res = await api.post('/customers/', {
                outletId,
                name: [first.trim(), last.trim()].filter(Boolean).join(' '),
                phone,
                email: email.trim() || undefined,
                address: [address.trim(), city.trim(), pincode.trim()].filter(Boolean).join(', ') || undefined,
                fixedDiscount: parseFloat(discount) || 0,
            });
            const d = res.data;
            onCreated({
                id: d.ledgerId, name: `${d.name} (${d.phone})`, groupId: '', groupName: 'Sundry Debtors', nature: 'asset', openingBalance: 0, balanceType: 'Dr',
                currentBalance: 0, phone: d.phone, address: d.address ?? '', gstin: d.gstin ?? '', linkedCustomerId: d.id, creditLimit: d.creditLimit ?? 0,
                isFamilyAccount: false, familyMembers: [],
            } as unknown as Ledger);
            onClose();
        } catch (err) {
            setError((err as any)?.response?.data?.detail ?? apiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ModalShell open={open} onClose={onClose} title="Add New Customer" size="lg"
            footer={<>
                <Button onClick={save} disabled={!canSave} className="flex-1">{busy ? 'Saving...' : 'Add'}</Button>
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            </>}>
            <form autoComplete="off" className="space-y-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
                <ModalSection title="Basic">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>First Name *</Label>
                            <Input aria-label="First Name" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="e.g. Ramesh" autoFocus={!first} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Last Name</Label>
                            <Input aria-label="Last Name" value={last} onChange={(e) => setLast(e.target.value)} placeholder="e.g. Patel" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Mobile Number *</Label>
                            <Input aria-label="Mobile Number" type="tel" inputMode="numeric" value={phone} autoFocus={!!first}
                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number"
                                className={cn(phone && !phoneOk && 'border-red-400')} />
                            {phone && !phoneOk && <p className="text-xs text-red-500">Enter a valid 10-digit mobile number</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                        </div>
                    </div>
                </ModalSection>

                <ModalSection title="Address & Discount">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label>Address</Label>
                            <Input aria-label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, Colony, Area..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label>City</Label>
                            <Input aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Pincode</Label>
                            <Input aria-label="Pincode" inputMode="numeric" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="400001" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Default Discount (%)</Label>
                            <Input aria-label="Default Discount %" type="number" min={0} max={100} step={0.5} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                        </div>
                    </div>
                </ModalSection>

                <p className="text-xs text-muted-foreground">With a mobile number you get order history, WhatsApp invoice sharing and payment reminders.</p>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
            </form>
        </ModalShell>
    );
}
