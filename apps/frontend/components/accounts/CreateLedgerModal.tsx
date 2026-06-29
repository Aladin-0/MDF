'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { voucherApi } from '@/lib/apiClient';
import { Ledger, LedgerGroup } from '@/types';
import { INDIAN_STATES } from '@/types';

interface CreateLedgerModalProps {
    initialName?: string;
    outletId: string;
    ledgerToEdit?: Ledger;
    /**
     * When set, the Account Group is locked to this value and the field is
     * shown as a read-only badge (so billing staff never see the dropdown).
     */
    defaultGroupName?: string;
    onSave: (ledger: Ledger) => void;
    onClose: () => void;
}

const LEDGER_CATEGORIES = ['OTHERS', 'CUSTOMER', 'SUPPLIER', 'BANK', 'CASH', 'EXPENSE', 'INCOME'];

export function CreateLedgerModal({
    initialName = '',
    outletId,
    ledgerToEdit,
    defaultGroupName,
    onSave,
    onClose,
}: CreateLedgerModalProps) {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    const [groups, setGroups] = useState<LedgerGroup[]>([]);

    // New Group modal state
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupParentId, setNewGroupParentId] = useState('');
    const [newGroupNature, setNewGroupNature] = useState<'asset' | 'liability' | 'income' | 'expense'>('asset');
    const [savingGroup, setSavingGroup] = useState(false);

    // Basic
    const [name, setName] = useState(ledgerToEdit?.name ?? initialName);
    const [groupId, setGroupId] = useState(ledgerToEdit?.groupId ?? '');
    const [openingBalance, setOpeningBalance] = useState(String(ledgerToEdit?.openingBalance ?? '0'));
    const [balanceType, setBalanceType] = useState<'Dr' | 'Cr'>(ledgerToEdit?.balanceType ?? 'Dr');
    const [balancingMethod, setBalancingMethod] = useState<'bill_by_bill' | 'on_account'>(ledgerToEdit?.balancingMethod ?? 'bill_by_bill');
    const [station, setStation] = useState(ledgerToEdit?.station ?? '');

    // Contact
    const [mailTo, setMailTo] = useState(ledgerToEdit?.mailTo ?? '');
    const [address, setAddress] = useState(ledgerToEdit?.address ?? '');
    const [pincode, setPincode] = useState(ledgerToEdit?.pincode ?? '');
    const [email, setEmail] = useState(ledgerToEdit?.email ?? '');
    const [website, setWebsite] = useState(ledgerToEdit?.website ?? '');
    const [contactPerson, setContactPerson] = useState(ledgerToEdit?.contactPerson ?? '');
    const [designation, setDesignation] = useState(ledgerToEdit?.designation ?? '');
    const [phone, setPhone] = useState(ledgerToEdit?.phone ?? '');
    const [phoneOffice, setPhoneOffice] = useState(ledgerToEdit?.phoneOffice ?? '');
    const [phoneResidence, setPhoneResidence] = useState(ledgerToEdit?.phoneResidence ?? '');
    const [faxNo, setFaxNo] = useState(ledgerToEdit?.faxNo ?? '');

    // Compliance
    const [freezeUpto, setFreezeUpto] = useState(ledgerToEdit?.freezeUpto ?? '');
    const [dlNo, setDlNo] = useState(ledgerToEdit?.dlNo ?? '');
    const [dlExpiry, setDlExpiry] = useState(ledgerToEdit?.dlExpiry ?? '');
    const [gstHeading, setGstHeading] = useState<'local' | 'central' | 'exempt'>(ledgerToEdit?.gstHeading ?? 'local');
    const [gstin, setGstin] = useState(ledgerToEdit?.gstin ?? '');
    const [vatNo, setVatNo] = useState(ledgerToEdit?.vatNo ?? '');
    const [vatExpiry, setVatExpiry] = useState(ledgerToEdit?.vatExpiry ?? '');
    const [stNo, setStNo] = useState(ledgerToEdit?.stNo ?? '');
    const [stExpiry, setStExpiry] = useState(ledgerToEdit?.stExpiry ?? '');
    const [foodLicenceNo, setFoodLicenceNo] = useState(ledgerToEdit?.foodLicenceNo ?? '');
    const [foodLicenceExpiry, setFoodLicenceExpiry] = useState(ledgerToEdit?.foodLicenceExpiry ?? '');
    const [extraHeadingNo, setExtraHeadingNo] = useState(ledgerToEdit?.extraHeadingNo ?? '');
    const [extraHeadingExpiry, setExtraHeadingExpiry] = useState(ledgerToEdit?.extraHeadingExpiry ?? '');
    const [itPanNo, setItPanNo] = useState(ledgerToEdit?.itPanNo ?? '');

    // Settings
    const [billExport, setBillExport] = useState<'gstn' | 'non_gstn'>(ledgerToEdit?.billExport ?? 'gstn');
    const [ledgerCategory, setLedgerCategory] = useState(ledgerToEdit?.ledgerCategory ?? 'OTHERS');
    const [state, setState] = useState(ledgerToEdit?.state ?? '');
    const [country, setCountry] = useState(ledgerToEdit?.country ?? 'India');
    const [ledgerType, setLedgerType] = useState<'registered' | 'unregistered' | 'composition' | 'consumer'>(ledgerToEdit?.ledgerType ?? 'registered');
    const [color, setColor] = useState<'normal' | 'red' | 'green' | 'blue'>(ledgerToEdit?.color ?? 'normal');
    const [isHidden, setIsHidden] = useState(ledgerToEdit?.isHidden ?? false);
    const [retailioId, setRetailioId] = useState(ledgerToEdit?.retailioId ?? '');

    useEffect(() => {
        voucherApi.getLedgerGroups(outletId).then((loaded) => {
            setGroups(loaded);
            // Auto-select the group if defaultGroupName is provided (e.g. from billing)
            // Always apply, even if groupId is already set, to handle the locked-group case.
            if (defaultGroupName) {
                const match = loaded.find(
                    (g: LedgerGroup) => g.name.toLowerCase() === defaultGroupName.toLowerCase()
                );
                if (match) setGroupId(match.id);
            }
        }).catch(() => {});
    }, [outletId, defaultGroupName]);

    async function handleSaveNewGroup() {
        if (!newGroupName.trim()) {
            toast({ variant: 'destructive', title: 'Group name is required' });
            return;
        }
        setSavingGroup(true);
        try {
            const created = await voucherApi.createLedgerGroup({
                outletId,
                name: newGroupName.trim(),
                nature: newGroupNature,
                parentId: newGroupParentId || undefined,
            });
            setGroups((prev) => [...prev, created]);
            setGroupId(created.id);
            setShowNewGroup(false);
            setNewGroupName('');
            setNewGroupParentId('');
            setNewGroupNature('asset');
            toast({ title: 'Account Group created successfully' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to create group', description: err?.detail || String(err) });
        } finally {
            setSavingGroup(false);
        }
    }

    // Handle Escape key
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    async function handleSave() {
        if (!name.trim()) {
            toast({ variant: 'destructive', title: 'Ledger name is required' });
            return;
        }
        if (!groupId) {
            toast({ variant: 'destructive', title: 'Account group is required' });
            return;
        }
        setSaving(true);
        try {
            const payload = {
                outletId,
                name: name.trim(),
                groupId,
                openingBalance: parseFloat(openingBalance) || 0,
                balanceType,
                balancingMethod,
                phone,
                gstin,
                address,
                // Contact
                station, mailTo, pincode, email, website,
                contactPerson, designation,
                phoneOffice, phoneResidence, faxNo,
                // Compliance
                freezeUpto: freezeUpto || null,
                dlNo, dlExpiry: dlExpiry || null,
                gstHeading,
                vatNo, vatExpiry: vatExpiry || null,
                stNo, stExpiry: stExpiry || null,
                foodLicenceNo, foodLicenceExpiry: foodLicenceExpiry || null,
                extraHeadingNo, extraHeadingExpiry: extraHeadingExpiry || null,
                itPanNo,
                // Settings
                billExport, ledgerCategory, state, country,
                ledgerType, color,
                isHidden, retailioId,
            };

            let ledger: Ledger;
            if (ledgerToEdit) {
                ledger = await voucherApi.updateLedger(ledgerToEdit.id, payload);
            } else {
                ledger = await voucherApi.createLedger(payload);
            }
            toast({ title: ledgerToEdit ? 'Ledger updated' : 'Ledger created' });
            onSave(ledger);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err?.detail || String(err) });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                    <h2 className="text-lg font-semibold">
                        {ledgerToEdit ? 'Edit Ledger' : 'Create Ledger'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-muted">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
                    {/* Section 1 — Basic */}
                    <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Basic</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 col-span-2">
                                <Label>Ledger Name *</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Pharma" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Station</Label>
                                <Input value={station} onChange={(e) => setStation(e.target.value)} placeholder="City / Station" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Account Group *</Label>
                                {defaultGroupName ? (
                                    // Locked mode — called from billing / a context that enforces the group.
                                    // Show a read-only badge so staff don't need to touch this field.
                                    <div className="flex items-center h-10 px-3 rounded-md border border-input bg-slate-50 text-sm text-slate-700 gap-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                        <span className="font-medium">{defaultGroupName}</span>
                                        <span className="text-xs text-slate-400 ml-auto">auto-selected</span>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <select
                                            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                                            value={groupId}
                                            onChange={(e) => setGroupId(e.target.value)}
                                        >
                                            <option value="">Select group...</option>
                                            {groups.map((g) => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 h-10 px-3 text-xs"
                                            onClick={() => setShowNewGroup(true)}
                                        >
                                            + New Group
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label>Balancing Method</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={balancingMethod}
                                    onChange={(e) => setBalancingMethod(e.target.value as 'bill_by_bill' | 'on_account')}
                                >
                                    <option value="bill_by_bill">Bill by Bill</option>
                                    <option value="on_account">On Account</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Opening Balance</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={openingBalance}
                                        onChange={(e) => setOpeningBalance(e.target.value)}
                                        className="flex-1"
                                    />
                                    <div className="flex rounded-md border overflow-hidden">
                                        {(['Dr', 'Cr'] as const).map((bt) => (
                                            <button
                                                key={bt}
                                                type="button"
                                                onClick={() => setBalanceType(bt)}
                                                className={`px-3 text-sm font-medium transition-colors ${
                                                    balanceType === bt
                                                        ? 'bg-primary text-white'
                                                        : 'bg-background text-muted-foreground hover:bg-muted'
                                                }`}
                                            >
                                                {bt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 2 — Contact */}
                    <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Mail To</Label>
                                <Input value={mailTo} onChange={(e) => setMailTo(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Address</Label>
                                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Pin Code</Label>
                                <Input value={pincode} onChange={(e) => setPincode(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>E-Mail</Label>
                                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Web Site</Label>
                                <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Contact Person</Label>
                                <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Designation</Label>
                                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Phone (Office)</Label>
                                <Input type="tel" value={phoneOffice} onChange={(e) => setPhoneOffice(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Phone (Residence)</Label>
                                <Input type="tel" value={phoneResidence} onChange={(e) => setPhoneResidence(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Mobile</Label>
                                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Fax No.</Label>
                                <Input type="tel" value={faxNo} onChange={(e) => setFaxNo(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* Section 3 — Compliance */}
                    <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Compliance</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Freeze Upto</Label>
                                <Input type="date" value={freezeUpto ?? ''} onChange={(e) => setFreezeUpto(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>GST Heading</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={gstHeading}
                                    onChange={(e) => setGstHeading(e.target.value as 'local' | 'central' | 'exempt')}
                                >
                                    <option value="local">Local</option>
                                    <option value="central">Central</option>
                                    <option value="exempt">Exempt</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>D.L. No.</Label>
                                <Input value={dlNo} onChange={(e) => setDlNo(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>D.L. Expiry</Label>
                                <Input type="date" value={dlExpiry ?? ''} onChange={(e) => setDlExpiry(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>GSTIN No.</Label>
                                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="15-char GSTIN" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>VAT No.</Label>
                                <Input value={vatNo} onChange={(e) => setVatNo(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>VAT Expiry</Label>
                                <Input type="date" value={vatExpiry ?? ''} onChange={(e) => setVatExpiry(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>S.T. No.</Label>
                                <Input value={stNo} onChange={(e) => setStNo(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>S.T. Expiry</Label>
                                <Input type="date" value={stExpiry ?? ''} onChange={(e) => setStExpiry(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Food Licence No.</Label>
                                <Input value={foodLicenceNo} onChange={(e) => setFoodLicenceNo(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Food Licence Expiry</Label>
                                <Input type="date" value={foodLicenceExpiry ?? ''} onChange={(e) => setFoodLicenceExpiry(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Extra Heading No.</Label>
                                <Input value={extraHeadingNo} onChange={(e) => setExtraHeadingNo(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Extra Heading Expiry</Label>
                                <Input type="date" value={extraHeadingExpiry ?? ''} onChange={(e) => setExtraHeadingExpiry(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>I.T. PAN No.</Label>
                                <Input value={itPanNo} onChange={(e) => setItPanNo(e.target.value)} maxLength={10} />
                            </div>
                        </div>
                    </div>

                    {/* Section 4 — Settings */}
                    <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Settings</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Bill Export</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={billExport}
                                    onChange={(e) => setBillExport(e.target.value as 'gstn' | 'non_gstn')}
                                >
                                    <option value="gstn">GSTN</option>
                                    <option value="non_gstn">Non-GSTN</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Ledger Category</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={ledgerCategory}
                                    onChange={(e) => setLedgerCategory(e.target.value)}
                                >
                                    {LEDGER_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>State</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={state}
                                    onChange={(e) => setState(e.target.value)}
                                >
                                    <option value="">Select state...</option>
                                    {INDIAN_STATES.map((s) => (
                                        <option key={s.code} value={s.name}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Country</Label>
                                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Ledger Type</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={ledgerType}
                                    onChange={(e) => setLedgerType(e.target.value as 'registered' | 'unregistered' | 'composition' | 'consumer')}
                                >
                                    <option value="registered">Registered</option>
                                    <option value="unregistered">Unregistered</option>
                                    <option value="composition">Composition</option>
                                    <option value="consumer">Consumer</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Color</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value as 'normal' | 'red' | 'green' | 'blue')}
                                >
                                    <option value="normal">Normal</option>
                                    <option value="red">Red</option>
                                    <option value="green">Green</option>
                                    <option value="blue">Blue</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Hide</Label>
                                <div className="flex gap-2">
                                    {[false, true].map((v) => (
                                        <button
                                            key={String(v)}
                                            type="button"
                                            onClick={() => setIsHidden(v)}
                                            className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                                                isHidden === v
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border text-muted-foreground hover:border-primary/30'
                                            }`}
                                        >
                                            {v ? 'Yes' : 'No'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Retailio ID</Label>
                                <Input value={retailioId} onChange={(e) => setRetailioId(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t shrink-0">
                    <Button onClick={handleSave} disabled={saving} className="flex-1">
                        {saving ? 'Saving...' : ledgerToEdit ? 'Update' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                </div>
            </div>

            {/* New Group Modal */}
            {showNewGroup && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
                    <div className="bg-background rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b">
                            <h3 className="font-semibold">New Account Group</h3>
                            <button type="button" onClick={() => setShowNewGroup(false)} className="p-1.5 rounded hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-5 py-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label>Group Name *</Label>
                                <Input
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="e.g. Sundry Debtors"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Parent Group (optional)</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={newGroupParentId}
                                    onChange={(e) => setNewGroupParentId(e.target.value)}
                                >
                                    <option value="">None (top-level)</option>
                                    {groups.map((g) => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Nature *</Label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={newGroupNature}
                                    onChange={(e) => setNewGroupNature(e.target.value as 'asset' | 'liability' | 'income' | 'expense')}
                                >
                                    <option value="asset">Assets</option>
                                    <option value="liability">Liabilities</option>
                                    <option value="income">Income</option>
                                    <option value="expense">Expense</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 px-5 py-4 border-t">
                            <Button onClick={handleSaveNewGroup} disabled={savingGroup} className="flex-1">
                                {savingGroup ? 'Creating...' : 'Create Group'}
                            </Button>
                            <Button variant="outline" onClick={() => setShowNewGroup(false)} disabled={savingGroup}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
