'use client';

import { useBillingStore } from '@/store/billingStore';
import { Plus, X, Calendar, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { format } from 'date-fns';

export function ActiveBillsTabs() {
    const { drafts, activeDraftId, switchDraft, closeDraft, createDraft, activeStaff, updateDraftHeader } = useBillingStore();
    const draftList = Object.values(drafts).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const activeDraft = activeDraftId ? drafts[activeDraftId] : null;

    // Auto-create initial draft if empty
    useEffect(() => {
        if (draftList.length === 0) {
            createDraft();
        }
    }, [draftList.length, createDraft]);

    return (
        <div className="w-full bg-[#F1F5F9] border-b border-slate-300 flex items-end justify-between h-[46px] shadow-sm select-none">

            {/* Left: Scrollable Bill Tabs Container */}
            {/* min-w-0 is CRITICAL here to allow the flex child to overflow and scroll on tablets */}
            <div className="flex-1 min-w-0 flex items-end overflow-x-auto gap-1 px-2 h-full scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] touch-pan-x">

                {draftList.map((draft, idx) => {
                    const isActive = activeDraftId === draft.id;
                    const customerName = draft.customer?.name || (draft.customerLedger as any)?.name || 'Walk-in';
                    const amount = draft.cart.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
                    const billLabel = draft.sourceInvoiceNo || draft.sourceQuotationNo || `Bill ${idx + 1}`;

                    return (
                        <div
                            key={draft.id}
                            onClick={() => switchDraft(draft.id)}
                            className={cn(
                                "group shrink-0 flex items-center justify-between gap-2 px-3 min-w-[140px] max-w-[200px] h-[38px] cursor-pointer rounded-t-lg border-x border-t transition-colors relative",
                                isActive
                                    ? "bg-white border-slate-300 border-t-[3px] border-t-blue-600 z-10 mb-[-1px]"
                                    : "bg-slate-200/60 border-transparent hover:bg-slate-200 hover:border-slate-300 mb-[1px]"
                            )}
                        >
                            <div className="flex flex-col min-w-0 flex-1 leading-tight justify-center h-full">
                                <div className="flex items-center gap-1.5">
                                    <span className={cn("text-[11px] font-bold truncate", isActive ? "text-blue-700" : "text-slate-600")}>
                                        {billLabel}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium truncate">
                                        • {customerName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[11px] font-bold text-slate-900">
                                        ₹{amount.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Close Tab Button */}
                            {draftList.length > 1 && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeDraft(draft.id);
                                    }}
                                    className={cn(
                                        "shrink-0 p-1 rounded-md transition-opacity",
                                        isActive ? "opacity-100 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                            : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 hover:bg-slate-300"
                                    )}
                                    title="Close Tab"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Add New Bill Button (Compact on tablet, expanded on desktop) */}
                <button
                    type="button"
                    onClick={() => createDraft()}
                    className="shrink-0 flex items-center justify-center gap-1.5 md:px-3 w-9 md:w-auto h-[34px] rounded-md hover:bg-blue-100/70 text-blue-700 font-bold text-xs transition-colors border border-dashed border-blue-300 bg-blue-50/50 mb-[5px] ml-1"
                    title="New Bill (Alt + N)"
                >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="hidden md:inline">New Bill</span>
                    <span className="hidden xl:inline text-[9px] font-mono bg-blue-200/70 text-blue-800 px-1 py-0.5 rounded font-semibold ml-0.5">Alt+N</span>
                </button>
            </div>

            {/* Right: Meta Data (Hidden/Compact on smaller screens to protect tab space) */}
            <div className="shrink-0 flex items-center gap-2 px-2 pb-1.5 ml-auto">

                {/* Save Status Badge (Hidden on small tablets to save space) */}
                {activeDraft && (
                    <div className="hidden md:flex items-center text-[10px] font-medium mr-1 select-none">
                        {activeDraft.saveStatus === 'saving' && (
                            <span className="text-slate-500 flex items-center gap-1 italic animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-500" /> Saving
                            </span>
                        )}
                        {activeDraft.saveStatus === 'saved' && (
                            <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved
                            </span>
                        )}
                        {activeDraft.saveStatus === 'error' && (
                            <span className="text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-red-500" /> Failed
                            </span>
                        )}
                    </div>
                )}

                {/* Staff User ID Badge (Hidden on everything except large desktops) */}
                <div className="hidden xl:flex items-center gap-1.5 bg-indigo-50 border border-indigo-200/80 px-2 py-1 rounded-md shadow-xs select-none">
                    <span className="w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-[9px] shrink-0">
                        {activeStaff?.name?.substring(0, 1).toUpperCase() || 'U'}
                    </span>
                    <span className="text-indigo-950 font-bold text-xs uppercase max-w-[130px] truncate">
                        {activeStaff?.name || 'Staff'}
                    </span>
                </div>

                {/* Date & Time Picker */}
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-1.5 rounded-md shadow-xs shrink-0 cursor-pointer hover:bg-slate-50 transition-colors">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                    {activeDraft?.documentMode === 'invoice' ? (
                        <input
                            type="datetime-local"
                            className="bg-transparent border-none outline-none cursor-pointer py-0 px-0 text-xs font-bold text-slate-800 w-[125px] sm:w-[140px]"
                            value={activeDraft.invoiceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                            onChange={(e) => {
                                if (activeDraftId) {
                                    updateDraftHeader(activeDraftId, { invoiceDate: e.target.value });
                                }
                            }}
                        />
                    ) : (
                        <span className="text-xs font-bold whitespace-nowrap">{format(new Date(), 'MMM dd, HH:mm')}</span>
                    )}
                </div>
            </div>
        </div>
    );
}