'use client';

import { useBillingStore } from '@/store/billingStore';
import { LedgerPicker } from './LedgerPicker';
import { DoctorPicker } from './DoctorPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Search, Stethoscope, PlusSquare, Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BillingHeaderStrip() {
    const { drafts, activeDraftId, setCustomer, setDraftDocumentMode } = useBillingStore();

    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;

    const { customerLedger, doctor, hospitalName, documentMode, quotationId } = activeDraft;
    // Only allow toggling if no quotationId (open/convert sets mode explicitly)
    const canToggleMode = !quotationId;

    return (
        <div className="w-full bg-white border-b border-slate-200 shadow-sm shrink-0">
            <div className="px-4 py-2">
                {/* Top row: context label + document type toggle */}
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-sm font-bold text-slate-800">Bill Context</h2>
                    {canToggleMode && (
                        <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
                            <button
                                onClick={() => setDraftDocumentMode(activeDraftId, 'invoice')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                    documentMode === 'invoice'
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Invoice
                            </button>
                            <button
                                onClick={() => setDraftDocumentMode(activeDraftId, 'quotation')}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                    documentMode === 'quotation'
                                        ? 'bg-amber-500 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Quotation
                            </button>
                        </div>
                    )}
                    {!canToggleMode && documentMode === 'quotation' && (
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                            Quotation Mode
                        </span>
                    )}
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
                                    setCustomer({ id: ledger.id, name: ledger.name, phone: ledger.phone || '', gstin: ledger.gstin || '' } as any);
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
                                <span>Walk-in / Cash Sale</span>
                            )}
                        </div>
                    </div>

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
                </div>

                {/* Prescription Row */}
                <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-600">Prescription</label>
                        <Input 
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
            </div>
        </div>
    );
}
