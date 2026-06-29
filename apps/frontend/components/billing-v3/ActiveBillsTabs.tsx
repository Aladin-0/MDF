'use client';

import { useBillingStore } from '@/store/billingStore';
import { Plus, X, User, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

export function ActiveBillsTabs() {
    const { drafts, activeDraftId, switchDraft, closeDraft, createDraft } = useBillingStore();
    const draftList = Object.values(drafts).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Global keyboard shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (!e.altKey) return;
            
            // New Bill (Alt + N)
            if (e.key.toLowerCase() === 'n') {
                e.preventDefault();
                if (!e.repeat) createDraft();
            }
            
            // Switch to Previous Bill (Alt + [) or (Alt + LeftArrow)
            if (e.key === '[' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const currentIndex = draftList.findIndex(d => d.id === activeDraftId);
                if (currentIndex > 0) {
                    switchDraft(draftList[currentIndex - 1].id);
                } else if (draftList.length > 0) {
                    // wrap around to the end
                    switchDraft(draftList[draftList.length - 1].id);
                }
            }
            
            // Switch to Next Bill (Alt + ]) or (Alt + RightArrow)
            if (e.key === ']' || e.key === 'ArrowRight') {
                e.preventDefault();
                const currentIndex = draftList.findIndex(d => d.id === activeDraftId);
                if (currentIndex >= 0 && currentIndex < draftList.length - 1) {
                    switchDraft(draftList[currentIndex + 1].id);
                } else if (draftList.length > 0) {
                    // wrap around to the beginning
                    switchDraft(draftList[0].id);
                }
            }
            
            // Switch to specific bill (Alt + 1...9)
            if (/^[1-9]$/.test(e.key)) {
                e.preventDefault();
                const index = parseInt(e.key) - 1;
                if (index < draftList.length) {
                    switchDraft(draftList[index].id);
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [createDraft, switchDraft, draftList, activeDraftId]);

    // Auto-create initial draft if empty
    useEffect(() => {
        if (draftList.length === 0) {
            createDraft();
        }
    }, [draftList.length, createDraft]);

    return (
        <div className="flex bg-[#F8FAFC] border-b border-slate-300 px-4 pt-2 items-end overflow-x-auto overflow-y-hidden min-h-[48px] shrink-0">
            {draftList.map((draft, idx) => {
                const isActive = activeDraftId === draft.id;
                const title = draft.customer ? draft.customer.name : 'WALK-IN';
                const amount = draft.cart.reduce((sum, item) => sum + item.totalAmount, 0);

                return (
                    <div
                        key={draft.id}
                        onClick={() => switchDraft(draft.id)}
                        className={cn(
                            "group flex flex-col justify-center px-4 min-w-[170px] h-[40px] cursor-pointer rounded-t border-x border-t transition-colors relative",
                            isActive 
                                ? "bg-white border-slate-300 border-t-2 border-t-blue-600 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10 -mb-px" 
                                : "bg-slate-200/30 border-transparent hover:bg-slate-200/70"
                        )}
                    >
                        <div className="flex justify-between items-start w-full">
                            <div className="flex items-center gap-1.5 relative">
                                <User className={cn("w-3 h-3", isActive ? "text-blue-600" : "text-slate-400")} />
                                <span className={cn("text-[10px] font-bold uppercase tracking-wider", isActive ? "text-blue-700" : "text-slate-600")}>
                                    {title}
                                </span>
                                {(draft.saveStatus === 'saving' || draft.saveStatus === 'error') && (
                                    <span className={cn("w-1.5 h-1.5 rounded-full", draft.saveStatus === 'error' ? "bg-red-500" : "bg-blue-400 animate-pulse")} />
                                )}
                            </div>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeDraft(draft.id);
                                }}
                                className={cn(
                                    "p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity -mr-1 -mt-0.5",
                                    isActive ? "hover:bg-slate-100 text-slate-400" : "hover:bg-slate-300 text-slate-500"
                                )}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={cn("text-xs font-bold", isActive ? "text-slate-800" : "text-slate-500")}>
                                DF-992{idx + 1} • ₹{amount.toFixed(2)}
                            </span>
                            {!isActive && (
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-200 px-1 rounded ml-auto">
                                    DRAFT
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Add New Draft Button */}
            <div 
                onClick={() => createDraft()}
                className="flex items-center justify-center gap-1.5 px-4 h-[36px] ml-1 cursor-pointer text-blue-600 hover:text-blue-800 transition-colors mb-0.5 font-bold text-xs"
                title="New Bill (Alt + N)"
            >
                <Plus className="w-3.5 h-3.5" />
                New Bill <span className="text-[9px] font-medium bg-blue-100 px-1 py-0.5 rounded text-blue-500 ml-1">Alt+N</span>
            </div>
            
            <div className="ml-auto flex items-center justify-center px-3 h-[36px] cursor-pointer text-slate-500 hover:text-slate-700 transition-colors mb-0.5 font-semibold text-xs gap-1 border-l border-slate-300">
                More (5) <ChevronDown className="w-3.5 h-3.5" />
            </div>
        </div>
    );
}
