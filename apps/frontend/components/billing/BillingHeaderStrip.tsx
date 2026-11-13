'use client';

import { useEffect, useRef, useState } from 'react';
import { AddFamilyMemberDialog } from './AddFamilyMemberDialog';
import { BillingFor } from './BillingFor';
import { NewCustomerModal } from './NewCustomerModal';
import type { FamilyMember } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useBillingStore } from '@/store/billingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { LedgerPicker } from './LedgerPicker';
import { DoctorPicker } from './DoctorPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, UserX, Receipt, MoreVertical, Search, Stethoscope, PlusSquare, Upload, FileText, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BillingHeaderStripProps {
    customerRef?: React.RefObject<HTMLInputElement>;
    doctorRef?: React.RefObject<HTMLInputElement>;
    medicineSearchRef?: React.RefObject<HTMLInputElement>; // Added to complete the retail loop
}

export function BillingHeaderStrip({ customerRef, doctorRef, medicineSearchRef }: BillingHeaderStripProps = {}) {
    // Cleanly destructure all necessary state and actions from the store
    const {
        drafts,
        activeDraftId,
        setCustomer,
        setCustomerLedger,
        setPatient,
        setDoctor,
        setHospitalName,
        setDraftDocumentMode,
        setSaleType,
        updateDraftHeader
    } = useBillingStore();

    const enableEwayBill = useSettingsStore(s => s.enableEwayBill);

    const [showSecondaryDetails, setShowSecondaryDetails] = useState(false);
    const [addPersonOpen, setAddPersonOpen] = useState(false);
    const [newCustomerOpen, setNewCustomerOpen] = useState(false);
    const [newCustomerQuery, setNewCustomerQuery] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const outletIdForFamily = useAuthStore((s) => s.user?.outlet?.id);
    const { setWalkInName, startCounterBill } = useBillingStore();

    useEffect(() => {
        const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
        document.addEventListener('mousedown', away);
        return () => document.removeEventListener('mousedown', away);
    }, []);

    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;

    const { customer, customerLedger, patient, walkInName, doctor, hospitalName, documentMode, saleType, quotationId, transporterId, vehicleNo, transDistance, transMode, vehicleType } = activeDraft;

    // One place that puts a customer (and, for a family, who it is for) on the bill: the picker and the new-customer popup both use it.
    const selectCustomer = (ledger: any | null, member: FamilyMember | null) => {
        setCustomerLedger(ledger);                 // (also clears the previous patient and any walk-in name)
        setPatient(saleType === 'WHOLESALE' ? null : (member ?? null));   // null = Self; wholesale bills one party, never a family member
        if (ledger) {
            setCustomer({
                // the real customer record when the ledger has one; the server also accepts a ledger id
                id: ledger.linkedCustomerId || ledger.id,
                name: ledger.name,
                phone: ledger.phone || '',
                gstin: ledger.gstin || '',
                address: ledger.address || '',
                creditLimit: ledger.creditLimit,
                dlNo20b: ledger.dlNo20b,
                dlNo21b: ledger.dlNo21b,
                dlExpiry: ledger.dlExpiry,
                customerType: ledger.customerType,
                stateCode: ledger.stateCode,
            } as any);
        } else {
            setCustomer(null);
        }
    };

    // Only allow toggling if no quotationId (open/convert sets mode explicitly)
    const canToggleMode = !quotationId;

    return (
        <div className="w-full bg-white border-b border-slate-200 shadow-sm shrink-0">
            <div className="px-4 py-2">
                {/* Top row: context label + document type toggle */}
                <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-800">Bill Context</h2>
                        <button
                            type="button"
                            onClick={() => setShowSecondaryDetails(!showSecondaryDetails)}
                            className="lg:hidden text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                        >
                            {showSecondaryDetails ? (
                                <>Less Details <ChevronUp className="w-3 h-3" /></>
                            ) : (
                                <>+ Hospital / Rx <ChevronDown className="w-3 h-3" /></>
                            )}
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setSaleType(activeDraftId, 'RETAIL')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${saleType === 'RETAIL'
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Retail
                            </button>
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setSaleType(activeDraftId, 'WHOLESALE')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${saleType === 'WHOLESALE'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Wholesale
                            </button>
                        </div>
                        <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setDraftDocumentMode(activeDraftId, 'invoice')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${documentMode === 'invoice'
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Invoice
                            </button>
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setDraftDocumentMode(activeDraftId, 'quotation')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${documentMode === 'quotation'
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Quotation
                            </button>
                        </div>
                    </div>
                </div>

                {/* Primary Inputs: Customer and Doctor (Stack on mobile, 2-col on md: and desktop) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2">
                    {/* Customer Search */}
                    <div data-shortcut-target="customer-search" className={cn('order-1', saleType === 'WHOLESALE' ? 'col-span-1 md:col-span-2 lg:col-span-12' : 'col-span-1 lg:col-span-5')}>
                        <div className="h-6 flex items-center justify-between gap-2">
                            <label className="text-[11px] font-bold text-slate-600 block">Customer Search</label>
                            <div className="flex items-center gap-1" ref={menuRef}>
                                {saleType !== 'WHOLESALE' && <button type="button" data-testid="counter-bill" onClick={() => { startCounterBill(); }}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100">
                                    Counter Bill <kbd className="ml-0.5 rounded bg-slate-100 px-1 font-mono text-[9px] text-slate-500">Alt+C</kbd>
                                </button>}
                                <div className="relative">
                                    <button type="button" aria-label="More customer options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}
                                        className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button>
                                    {menuOpen && (
                                        <div role="menu" className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl">
                                            <button role="menuitem" type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                                                onClick={() => { setMenuOpen(false); setNewCustomerQuery(''); setNewCustomerOpen(true); }}>
                                                <UserPlus className="h-4 w-4 text-blue-600" /> Add New Customer
                                            </button>
                                            {saleType !== 'WHOLESALE' && <button role="menuitem" type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
                                                onClick={() => { setMenuOpen(false); startCounterBill(); }}>
                                                <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-emerald-600" /> Create as Counter Bill</span>
                                                <kbd className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">Alt+C</kbd>
                                            </button>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {walkInName && !customerLedger ? (
                            <div data-testid="walk-in-chip" className="flex h-9 items-center justify-between rounded border-2 border-slate-300 bg-slate-50 pl-3 pr-1">
                                <span className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                                    <UserX className="h-4 w-4 text-slate-500" /> {walkInName}
                                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">Walk-in · no mobile</span>
                                </span>
                                <button type="button" aria-label="Remove walk-in customer" className="rounded px-2 py-1 text-xs font-bold uppercase text-slate-600 hover:bg-slate-200" onClick={() => setWalkInName(null)}>Change</button>
                            </div>
                        ) : (
                        <LedgerPicker
                            inputRef={customerRef}
                            nextInputRef={doctorRef}
                            currentLedger={customerLedger || null}
                            matchFamilyMember={saleType !== 'WHOLESALE'}
                            showFamily={saleType !== 'WHOLESALE'}
                            onAddNew={(q) => { setNewCustomerQuery(q); setNewCustomerOpen(true); }}
                            onSelect={(ledger, member) => selectCustomer(ledger, member ?? null)}
                            defaultGroupName="Sundry Debtors"
                            icon={<UserPlus className="w-4 h-4" />}
                            placeholder="Search by name or mobile number…"
                        />
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-medium min-h-[16px]">
                            {customerLedger ? (
                                <>
                                    <span>{customerLedger.phone || 'No Mobile'}</span>
                                    <span className="text-slate-300">|</span>
                                    <span className="truncate">{customerLedger.address || 'No Address Provided'}</span>
                                    {customerLedger.gstin && (
                                        <>
                                            <span className="text-slate-300">|</span>
                                            <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded shrink-0">GST: {customerLedger.gstin}</span>
                                        </>
                                    )}
                                </>
                            ) : (
                                <span>{walkInName ? 'Name only · no mobile number · history is not kept' : 'No Customer Selected'}</span>
                            )}

                            {saleType !== 'WHOLESALE' && customerLedger && !(customerLedger as any).isMock && (Number(customerLedger.currentBalance) > 0 || Number((customer as any)?.creditLimit) > 0) && (
                                <div className="flex gap-2 ml-2 shrink-0" data-testid="family-account-money">
                                    <span className={cn("px-1.5 rounded text-[10px] font-bold border", Number(customerLedger.currentBalance) > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-700 border-slate-200")}>
                                        Due: ₹{Math.round(Number(customerLedger.currentBalance) || 0).toLocaleString('en-IN')}
                                    </span>
                                    {Number((customer as any)?.creditLimit) > 0 && (
                                        <span className="bg-emerald-50 text-emerald-700 px-1.5 rounded text-[10px] font-bold border border-emerald-200">
                                            Limit: ₹{Number((customer as any).creditLimit).toLocaleString('en-IN')}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Wholesale Badges */}
                            {saleType === 'WHOLESALE' && customer && (
                                <div className="flex gap-2 ml-4 shrink-0">
                                    <span className="bg-slate-100 text-slate-700 px-1.5 rounded text-[10px] font-bold border border-slate-200">
                                        DL: {customer.dlNo20b || customer.dlNo21b || 'N/A'}
                                    </span>
                                    <span className="bg-emerald-50 text-emerald-700 px-1.5 rounded text-[10px] font-bold border border-emerald-200">
                                        Limit: ₹{customer.creditLimit?.toLocaleString('en-IN') || '0'}
                                    </span>
                                    <span className={cn("px-1.5 rounded text-[10px] font-bold border", (customer.outstanding || 0) > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-700 border-slate-200")}>
                                        Out: ₹{customer.outstanding?.toLocaleString('en-IN') || '0'}
                                    </span>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Billing For: retail only. Wholesale sells to one person / business, so there is no family to choose from. */}
                    {saleType !== 'WHOLESALE' && (
                        <div className={'order-2 md:order-3 lg:order-2 lg:col-span-3'}>
                            {customerLedger && (customerLedger as any).isMock ? (
                                <div data-testid="billing-for">
                                    <label className="text-[11px] font-bold text-slate-600 h-6 flex items-center">Billing For</label>
                                    <div className="h-9 px-3 border-2 border-blue-400 rounded bg-blue-50/50 flex items-center text-sm font-semibold text-blue-900 truncate">
                                        {patient?.name ?? 'Self'}
                                    </div>
                                </div>
                            ) : (
                                <BillingFor
                                    ledger={customerLedger && (customerLedger as any).linkedCustomerId ? customerLedger : null}
                                    patient={patient}
                                    onSelect={setPatient}
                                    onAdd={() => setAddPersonOpen(true)}
                                />
                            )}
                        </div>
                    )}

                    {/* Prescribing Doctor */}
                    {saleType === 'RETAIL' && (
                        <div className="relative order-3 md:order-2 lg:order-3 lg:col-span-4">
                            <label className="text-[11px] font-bold text-slate-600 h-6 flex items-center">Prescribing Doctor</label>
                            <DoctorPicker
                                inputRef={doctorRef}
                                nextInputRef={medicineSearchRef}
                                currentDoctor={doctor}
                                onSelect={(doc) => setDoctor(doc)}
                            />
                        </div>
                    )}
                </div>

                {/* Secondary Inputs: Hospital & Prescription (Collapsible on tablet portrait < lg) */}
                {saleType === 'RETAIL' && (
                    <div className={cn("grid-cols-1 md:grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100", showSecondaryDetails ? "grid" : "hidden lg:grid")}>
                        {/* Hospital / Referral */}
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Hospital / Referral</label>
                            <div className="relative">
                                <PlusSquare className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <Input
                                    value={hospitalName || ''}
                                    onChange={e => setHospitalName(e.target.value)}
                                    className="w-full h-9 pl-8 pr-3 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-blue-500 font-medium placeholder:text-slate-400 text-sm bg-white"
                                    placeholder="Hospital Name..."
                                />
                            </div>
                        </div>

                        {/* Prescription Upload & Number */}
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Prescription Details</label>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={activeDraft.prescriptionNo || ''}
                                    onChange={(e) => updateDraftHeader(activeDraftId, { prescriptionNo: e.target.value })}
                                    className="flex-1 h-9 border border-slate-300 rounded text-sm"
                                    placeholder="Rx Number..."
                                />
                                <div className="relative">
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        className="hidden"
                                        id="rx-upload"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (e) => {
                                                    const dataUrl = e.target?.result as string;
                                                    updateDraftHeader(activeDraftId, { prescriptionImageUrl: dataUrl });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => document.getElementById('rx-upload')?.click()}
                                        className={cn("h-9 px-3 font-semibold flex items-center gap-1.5 text-xs",
                                            activeDraft.prescriptionImageUrl
                                                ? "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                : "text-blue-600 border-blue-200 hover:bg-blue-50"
                                        )}
                                    >
                                        {activeDraft.prescriptionImageUrl ? <Check className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                                        {activeDraft.prescriptionImageUrl ? 'Rx Uploaded' : 'Upload Rx'}
                                    </Button>
                                    {activeDraft.prescriptionImageUrl && (
                                        <button
                                            onClick={() => updateDraftHeader(activeDraftId, { prescriptionImageUrl: null })}
                                            className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-0.5 hover:bg-red-200"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Wholesale Eway Details (Collapsible on tablet portrait < lg) */}
                {saleType === 'WHOLESALE' && enableEwayBill && (
                    <div className={cn("grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-2 pt-2 border-t border-slate-100", showSecondaryDetails ? "grid" : "hidden lg:grid")}>
                        <div className="relative">
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Transporter GSTIN</label>
                            <Input
                                value={transporterId || ''}
                                onChange={e => updateDraftHeader(activeDraftId, { transporterId: e.target.value })}
                                className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium placeholder:text-slate-400 text-sm bg-white"
                                placeholder="Enter GSTIN..."
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Distance (km)</label>
                            <Input
                                type="number"
                                value={transDistance === '' ? '' : transDistance || ''}
                                onChange={e => updateDraftHeader(activeDraftId, { transDistance: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium placeholder:text-slate-400 text-sm bg-white"
                                placeholder="e.g. 50"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Mode</label>
                            <select
                                value={transMode || 1}
                                onChange={e => updateDraftHeader(activeDraftId, { transMode: Number(e.target.value) })}
                                className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium text-sm bg-white"
                            >
                                <option value={1}>Road</option>
                                <option value={2}>Rail</option>
                                <option value={3}>Air</option>
                                <option value={4}>Ship</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Vehicle Type</label>
                            <select
                                value={vehicleType || 'R'}
                                onChange={e => updateDraftHeader(activeDraftId, { vehicleType: e.target.value })}
                                className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium text-sm bg-white"
                            >
                                <option value="R">Regular</option>
                                <option value="O">ODC</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Vehicle No.</label>
                            <Input
                                value={vehicleNo || ''}
                                onChange={e => updateDraftHeader(activeDraftId, { vehicleNo: e.target.value })}
                                className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium placeholder:text-slate-400 text-sm bg-white uppercase"
                                placeholder="e.g. MH01AB1234"
                            />
                        </div>
                    </div>
                )}
            </div>
            {saleType !== 'WHOLESALE' && customerLedger && (customerLedger as any).linkedCustomerId && outletIdForFamily && (
                <AddFamilyMemberDialog
                    open={addPersonOpen}
                    onClose={() => setAddPersonOpen(false)}
                    outletId={outletIdForFamily}
                    ownerId={(customerLedger as any).linkedCustomerId}
                    ownerName={customerLedger.name.replace(/\s*\(\d{8,}\)\s*$/, '')}
                    ownerPhone={customerLedger.phone || ''}
                    onAdded={(member) => {
                        // the first person added turns a plain customer into a family: list the owner too, then select the new person
                        const owner: FamilyMember = {
                            id: (customerLedger as any).linkedCustomerId, name: customerLedger.name.replace(/\s*\(\d{8,}\)\s*$/, ''),
                            isAccountHolder: true, relationship: 'Account holder', phone: customerLedger.phone,
                        };
                        const existing = customerLedger.familyMembers?.length ? customerLedger.familyMembers : [owner];
                        updateDraftHeader(activeDraftId, {
                            customerLedger: { ...customerLedger, isFamilyAccount: true, familyMembers: [...existing, member] },
                            patient: member,
                        });
                    }}
                />
            )}
            {outletIdForFamily && (
                <NewCustomerModal
                    open={newCustomerOpen}
                    onClose={() => setNewCustomerOpen(false)}
                    outletId={outletIdForFamily}
                    initialQuery={newCustomerQuery}
                    onCreated={(ledger) => selectCustomer(ledger, null)}
                />
            )}
        </div>
    );
}