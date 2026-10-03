'use client';

import { useBillingStore } from '@/store/billingStore';
import { LedgerPicker } from './LedgerPicker';
import { DoctorPicker } from './DoctorPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Search, Stethoscope, PlusSquare, Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BillingHeaderStrip() {
    const { drafts, activeDraftId, setCustomer, setDraftDocumentMode, setSaleType, updateDraftHeader } = useBillingStore();

    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;

    const { customer, customerLedger, doctor, hospitalName, documentMode, saleType, quotationId, transporterId, vehicleNo, transDistance, transMode, vehicleType } = activeDraft;
    // Only allow toggling if no quotationId (open/convert sets mode explicitly)
    const canToggleMode = !quotationId;

    return (
        <div className="w-full bg-white border-b border-slate-200 shadow-sm shrink-0">
            <div className="px-4 py-2">
                {/* Top row: context label + document type toggle */}
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-sm font-bold text-slate-800">Bill Context</h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setSaleType(activeDraftId, 'RETAIL')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                    saleType === 'RETAIL'
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Retail [F2]
                            </button>
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setSaleType(activeDraftId, 'WHOLESALE')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                    saleType === 'WHOLESALE'
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Wholesale [F3]
                            </button>
                        </div>
                        <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setDraftDocumentMode(activeDraftId, 'invoice')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                    documentMode === 'invoice'
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Invoice
                            </button>
                            <button
                                disabled={!canToggleMode}
                                onClick={() => setDraftDocumentMode(activeDraftId, 'quotation')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                    documentMode === 'quotation'
                                        ? 'bg-amber-500 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                } ${!canToggleMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Quotation
                            </button>
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-12 gap-4">
                    {/* Customer Search */}
                    <div className="col-span-5">
                        <label className="text-[11px] font-bold text-slate-600 mb-1 block">Customer Search</label>
                        <LedgerPicker 
                            currentLedger={customerLedger || null}
                            onSelect={(ledger) => {
                                const { setCustomerLedger, setCustomer } = useBillingStore.getState();
                                setCustomerLedger(ledger);
                                // Also set customer for backward compatibility if needed
                                if (ledger) {
                                    setCustomer({ 
                                        id: ledger.id, 
                                        name: ledger.name, 
                                        phone: ledger.phone || '', 
                                        gstin: ledger.gstin || '', 
                                        address: ledger.address || '',
                                        creditLimit: (ledger as any).creditLimit,
                                        dlNo20b: (ledger as any).dlNo20b,
                                        dlNo21b: (ledger as any).dlNo21b,
                                        dlExpiry: (ledger as any).dlExpiry,
                                        customerType: (ledger as any).customerType,
                                        stateCode: (ledger as any).stateCode,
                                    } as any);
                                } else {
                                    setCustomer(null);
                                }
                            }}
                            defaultGroupName="Sundry Debtors"
                            icon={<UserPlus className="w-4 h-4" />}
                            placeholder="Search Customer..."
                        />
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium h-4">
                            {customerLedger ? (
                                <>
                                    <span>{customerLedger.phone || 'No Mobile'}</span>
                                    <span className="text-slate-300">|</span>
                                    <span>{customerLedger.address || 'No Address Provided'}</span>
                                    {customerLedger.gstin && (
                                        <>
                                            <span className="text-slate-300">|</span>
                                            <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">GST: {customerLedger.gstin}</span>
                                        </>
                                    )}
                                </>
                            ) : (
                                <span>No Customer Selected</span>
                            )}
                            
                            {/* Wholesale Badges */}
                            {saleType === 'WHOLESALE' && customer && (
                                <div className="flex gap-2 ml-4">
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

                    {saleType === 'RETAIL' ? (
                        <>
                            {/* Prescribing Doctor */}
                            <div className="col-span-4 relative">
                                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Prescribing Doctor</label>
                                <DoctorPicker 
                                    currentDoctor={doctor}
                                    onSelect={(doc) => useBillingStore.getState().setDoctor(doc)}
                                />
                            </div>

                            {/* Hospital / Referral */}
                            <div className="col-span-3">
                                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Hospital / Referral</label>
                                <div className="relative">
                                    <PlusSquare className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                    <Input 
                                        value={hospitalName || ''}
                                        onChange={e => useBillingStore.getState().setHospitalName(e.target.value)}
                                        className="w-full h-9 pl-8 pr-3 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-blue-500 font-medium placeholder:text-slate-400 text-sm bg-white" 
                                        placeholder="Hospital Name..." 
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Transporter Details */}
                            <div className="col-span-3 relative">
                                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Transporter GSTIN</label>
                                <Input 
                                    value={transporterId || ''}
                                    onChange={e => updateDraftHeader(activeDraftId, { transporterId: e.target.value })}
                                    className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium placeholder:text-slate-400 text-sm bg-white" 
                                    placeholder="Enter GSTIN..." 
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Distance (km)</label>
                                <Input 
                                    type="number"
                                    value={transDistance === '' ? '' : transDistance || ''}
                                    onChange={e => updateDraftHeader(activeDraftId, { transDistance: e.target.value === '' ? '' : Number(e.target.value) })}
                                    className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium placeholder:text-slate-400 text-sm bg-white" 
                                    placeholder="e.g. 50" 
                                />
                            </div>
                            <div className="col-span-2">
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
                            <div className="col-span-2">
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
                            <div className="col-span-3">
                                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Vehicle No.</label>
                                <Input 
                                    value={vehicleNo || ''}
                                    onChange={e => updateDraftHeader(activeDraftId, { vehicleNo: e.target.value })}
                                    className="w-full h-9 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium placeholder:text-slate-400 text-sm bg-white uppercase" 
                                    placeholder="e.g. MH01AB1234" 
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Prescription Row (Only Retail) */}
                {saleType === 'RETAIL' && (
                    <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-600">Prescription</label>
                            <Input 
                                value={activeDraft.prescriptionNo || ''}
                                onChange={(e) => updateDraftHeader(activeDraftId, { prescriptionNo: e.target.value })}
                                className="w-48 h-9 border border-slate-300 rounded text-sm" 
                                placeholder="Rx Number..." 
                            />
                            <Button variant="outline" className="h-9 px-4 text-blue-600 border-blue-200 hover:bg-blue-50 font-semibold flex items-center gap-2">
                                <Upload className="w-4 h-4" /> Upload Rx
                            </Button>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-auto">
                            <span className="bg-[#D32F2F] text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider">RX REQUIRED</span>
                            <span className="bg-[#2E7D32] text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider">SCHEDULE H1</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
