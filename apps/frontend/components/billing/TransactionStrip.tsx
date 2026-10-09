'use client';

import { useBillingStore } from '@/store/billingStore';
import { Calendar, Printer, Download, Settings, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch'; // Assuming a switch component exists or I'll use native
import { format } from 'date-fns';

export function TransactionStrip() {
    const { drafts, activeDraftId, setDraftDocumentMode, activeStaff } = useBillingStore();
    
    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;

    return (
        <div className="w-full bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0 shadow-sm z-40 relative">
            {/* Left side: Breadcrumb & Status */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded">
                        <span className="w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-[10px]">
                            {activeStaff?.name?.substring(0, 2).toUpperCase() || 'U'}
                        </span>
                        <span className="text-indigo-900 font-bold text-xs uppercase">
                            {activeStaff?.name || 'Unknown User'}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-indigo-500 bg-indigo-200 px-1 py-0.5 rounded font-bold">
                            {activeStaff?.role?.replace('_', ' ') || 'STAFF'}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {activeDraft.saveStatus === 'saving' && (
                            <span className="text-[10px] font-medium text-slate-500 ml-2 italic animate-pulse">• Saving...</span>
                        )}
                        {activeDraft.saveStatus === 'saved' && (
                            <span className="text-[10px] font-medium text-emerald-600 ml-2 italic">• Saved just now</span>
                        )}
                        {activeDraft.saveStatus === 'error' && (
                            <span className="text-[10px] font-medium text-red-600 ml-2 italic">• Sync failed</span>
                        )}
                    </div>
                </div>

                <div className="w-px h-4 bg-slate-300 mx-2"></div>

                <button className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors flex items-center border border-blue-200 bg-white">
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Queue
                </button>
            </div>

            {/* Right side: Toggles, Date, Actions */}
            <div className="flex items-center gap-5">
                {/* Date/Time */}
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {activeDraft.documentMode === 'invoice' ? (
                        <input 
                            type="datetime-local" 
                            className="bg-transparent border-none outline-none cursor-pointer hover:bg-slate-200 py-1 px-1 rounded transition-colors text-xs font-bold text-slate-700"
                            value={activeDraft.invoiceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                            onChange={(e) => {
                                useBillingStore.getState().updateDraftHeader(activeDraftId, { invoiceDate: e.target.value });
                            }}
                        />
                    ) : (
                        <span>{format(new Date(), 'MMM dd, HH:mm')}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
