'use client';

import { useState, useRef, useEffect } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { Search, Package, AlertTriangle, X, Loader2, FileText, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getExpiryStatus } from '@/utils/expiry';
import { calculateLineMargin, calculateTotalMargin } from '@/lib/billingMarginUtils';
import { useProductSearch } from '@/hooks/useProductSearch';
import { Batch, ProductSearchResult, BillTotals } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { InlineRowEditor } from './InlineRowEditor';
import { useGridNavigation } from '@/hooks/useGridNavigation';

interface MainInvoiceWorkspaceProps {
    searchRef?: React.RefObject<HTMLElement>;
}

export function MainInvoiceWorkspace({ searchRef }: MainInvoiceWorkspaceProps = {}) {
    const { drafts, activeDraftId, addToCart, removeFromCart, updateCartItem, getDraftTotals, showMarginInfo, activeStaff } = useBillingStore();
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    
    // Quick Add State
    const [quickAddProduct, setQuickAddProduct] = useState<ProductSearchResult | null>(null);
    const [quickAddBatch, setQuickAddBatch] = useState<Batch | null>(null);

    // Editor State
    const [editingRowBatchId, setEditingRowBatchId] = useState<string | null>(null);

    // Qty Entry State
    const [qtyStrips, setQtyStrips] = useState('1');
    const [qtyLoose, setQtyLoose] = useState('');
    const [discountPct, setDiscountPct] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    
    const { data: searchResults = [], isFetching } = useProductSearch(searchQuery, 'billing');
    
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const [dropdownPlacement, setDropdownPlacement] = useState<'bottom' | 'top'>('bottom');

    useGridNavigation(tableContainerRef, () => {
        searchInputRef.current?.focus();
    });

    // Reset selected index when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchResults]);

    // Smart Dropdown Placement: Flip upward if close to viewport bottom on tablet
    useEffect(() => {
        if (!isSearchFocused || searchQuery.length < 2) return;
        if (searchContainerRef.current) {
            const rect = searchContainerRef.current.getBoundingClientRect();
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom;
            if (spaceBelow < 220 && rect.top > spaceBelow) {
                setDropdownPlacement('top');
            } else {
                setDropdownPlacement('bottom');
            }
        }
    }, [isSearchFocused, searchQuery, searchResults]);

    // Close search dropdown when clicking/tapping outside
    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener('pointerdown', handleClickOutside);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Close search popover when row editor opens
    useEffect(() => {
        if (editingRowBatchId) {
            setIsSearchFocused(false);
        }
    }, [editingRowBatchId]);

    if (!activeDraftId) return null;
    const activeDraft = drafts[activeDraftId];
    if (!activeDraft) return null;
    const cart = activeDraft.cart;
    const saleType = activeDraft.saleType || 'RETAIL';
    const fallbackTotals: BillTotals = {
        subtotal: 0,
        discountAmount: 0,
        extraDiscountAmount: 0,
        preExtraNet: 0,
        taxableAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        roundOff: 0,
        grandTotal: 0,
        amountPaid: 0,
        amountDue: 0,
        itemCount: 0,
        totalQty: 0,
        hasScheduleH: false,
        requiresDoctorDetails: false,
    };
    const totals = (typeof getDraftTotals === 'function' ? getDraftTotals(activeDraftId) : null) || fallbackTotals;
    const marginData = calculateTotalMargin(activeDraft.cart, totals.grandTotal, totals.extraDiscountAmount, activeDraft.extraDiscountPct || 0);

    // --- Editor Handlers ---
    const handleSaveEdit = (oldBatchId: string, updatedItem: any) => {
        if (oldBatchId === updatedItem.batchId) {
            updateCartItem(activeDraftId, oldBatchId, updatedItem);
        } else {
            removeFromCart(activeDraftId, oldBatchId);
            addToCart(activeDraftId, updatedItem);
        }
        setEditingRowBatchId(null);
        searchInputRef.current?.focus();
    };

    const handleCancelEdit = () => {
        setEditingRowBatchId(null);
        searchInputRef.current?.focus();
    };

    const handleRemoveItem = (batchId: string) => {
        removeFromCart(activeDraftId, batchId);
        setEditingRowBatchId(null);
        searchInputRef.current?.focus();
    };

    // --- Search Handlers ---

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
                handleSelectProduct(searchResults[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsSearchFocused(false);
            // Return focus to input (already there, just prevent blur)
            searchInputRef.current?.focus();
        }
    };

    const handleSelectProduct = (product: ProductSearchResult) => {
        // Force blur active element to instantly retract virtual keyboard on tablets
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        const availableBatches = product.batches || [];
        
        // Filter out expired batches and batches with no stock
        console.log("validBatches calculation started, availableBatches:", availableBatches);
        const validBatches = availableBatches.filter(b => {
            const isExpired = b.expiryDate ? new Date(b.expiryDate) < new Date() : false;
            const hasStock = b.qtyStrips > 0 || b.qtyLoose > 0;
            return !isExpired && hasStock;
        });

        console.log("validBatches evaluated to:", validBatches);
        if (validBatches.length === 0 && availableBatches.length > 0) {
            setErrorMsg(`No valid stock (unexpired, qty > 0) available for ${product.name}`);
            setTimeout(() => setErrorMsg(''), 3000);
            return;
        } else if (availableBatches.length === 0) {
            setErrorMsg(`No stock available for ${product.name}`);
            setTimeout(() => setErrorMsg(''), 3000);
            return;
        }

        setQuickAddProduct(product);
        setSearchQuery('');
        setIsSearchFocused(false);
        setErrorMsg('');

        if (validBatches.length === 1) {
            handleSelectBatch(validBatches[0]);
        } else {
            setQuickAddBatch(null);
            // Focus will be trapped in the batch selector component
        }
    };

    const handleSelectBatch = (batch: Batch) => {
        setQuickAddBatch(batch);
        setQtyStrips('1');
        setQtyLoose('');
        setDiscountPct('');
        // Only autofocus qty on desktop/mouse to avoid re-summoning virtual keyboard on touch tablets
        if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
            setTimeout(() => {
                qtyInputRef.current?.focus();
                qtyInputRef.current?.select();
            }, 50);
        }
    };

    const cancelQuickAdd = () => {
        setQuickAddProduct(null);
        setQuickAddBatch(null);
        searchInputRef.current?.focus();
    };

    const commitAdd = () => {
        if (!quickAddProduct || !quickAddBatch) return;

        const s = parseInt(qtyStrips) || 0;
        const l = parseInt(qtyLoose) || 0;
        if (s === 0 && l === 0) {
            qtyInputRef.current?.focus();
            return; // Needs qty
        }

        const canonicalPackType = quickAddBatch?.packType || quickAddProduct?.packType || '';
        const isStripBased = canonicalPackType.toLowerCase() === 'strip' || canonicalPackType.toLowerCase() === 'blister';
        const effectiveLoose = isStripBased ? l : 0;

        const totalQtyLoose = (s * quickAddBatch.packSize) + effectiveLoose;
        const totalQtyFractional = s + (effectiveLoose / quickAddBatch.packSize);
        
        if (totalQtyLoose > (quickAddBatch.qtyStrips * quickAddBatch.packSize + quickAddBatch.qtyLoose)) {
            alert('Warning: Added quantity exceeds available stock.');
        }

        const dPct = parseFloat(discountPct) || 0;
        const defaultRate = saleType === 'WHOLESALE' ? (quickAddBatch.pts || quickAddBatch.ptr || quickAddBatch.mrp) : quickAddBatch.mrp;
        const discountedRate = defaultRate * (1 - (dPct / 100));
        
        const taxableAmount = (discountedRate * totalQtyFractional) / (1 + quickAddProduct.gstRate / 100);
        const gstAmount = (discountedRate * totalQtyFractional) - taxableAmount;

        addToCart(activeDraftId, {
            batchId: quickAddBatch.id,
            productId: quickAddProduct.id,
            name: quickAddProduct.name,
            composition: quickAddProduct.composition,
            manufacturer: quickAddProduct.manufacturer,
            packSize: quickAddBatch.packSize,
            packUnit: quickAddBatch.packUnit || quickAddProduct.packUnit || 'units',
            packType: quickAddBatch.packType || quickAddProduct.packType || '',
            requiresPrescription: ['H', 'H1', 'X', 'Narcotic'].includes(quickAddProduct.scheduleType),
            batchNo: quickAddBatch.batchNo,
            expiryDate: quickAddBatch.expiryDate,
            scheduleType: quickAddProduct.scheduleType as any,
            hsn: quickAddProduct.hsnCode || '',
            mrp: quickAddBatch.mrp,
            ptr: quickAddBatch.ptr || 0,
            pts: quickAddBatch.pts || 0,
            saleRate: defaultRate,
            rate: defaultRate, // CRITICAL FIX: rate must be pre-discount PTS/PTR/MRP
            qtyStrips: s,
            qtyLoose: effectiveLoose,

            totalQty: totalQtyFractional,
            saleMode: 'strip',
            discountPct: dPct,
            gstRate: quickAddProduct.gstRate,
            taxableAmount,
            gstAmount,
            totalAmount: discountedRate * totalQtyFractional,
            purchaseRate: quickAddBatch.purchaseRate,
            landingRate: quickAddBatch.landingRate ?? quickAddBatch.purchaseRate,
        });

        // Reset
        setQuickAddProduct(null);
        setQuickAddBatch(null);
        
        // Retail Loop: Force focus back to search bar after DOM paints
        setTimeout(() => {
            if (searchRef && (searchRef as any).current) {
                (searchRef as any).current.focus();
                (searchRef as any).current.select();
            } else if (searchInputRef.current) {
                searchInputRef.current.focus();
                searchInputRef.current.select();
            }
        }, 50);
    };

    const handleQtyKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            cancelQuickAdd();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            commitAdd();
        }
    };

    // --- Render Helpers ---

    const renderQuickAddWidget = () => {
        if (!quickAddProduct) return null;

        return (
            <div className="absolute top-[100%] left-4 right-4 mt-2 bg-white border-2 border-blue-500 rounded-lg shadow-2xl z-50 p-4 animate-in slide-in-from-top-2">
                <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-100">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">{quickAddProduct.name}</h3>
                        <p className="text-xs text-slate-500 font-medium">{quickAddProduct.composition} • {quickAddProduct.manufacturer}</p>
                    </div>
                    <button onClick={cancelQuickAdd} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                {!quickAddBatch ? (
                    <div className="space-y-2">
                        <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">Select a Batch:</div>
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {quickAddProduct.batches.map((batch, idx) => {
                                const isExpired = batch.expiryDate ? new Date(batch.expiryDate) < new Date() : false;
                                return (
                                    <button 
                                        key={batch.id}
                                        type="button"
                                        onPointerDown={(e) => {
                                            if (e.pointerType === 'mouse' && !isExpired) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onClick={() => !isExpired && handleSelectBatch(batch)}
                                        className={cn(
                                            "flex-shrink-0 flex flex-col p-3 rounded-md border text-left transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none min-w-[140px] select-none",
                                            isExpired ? "opacity-50 border-red-200 bg-red-50 cursor-not-allowed" : "border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50 active:bg-blue-100"
                                        )}
                                    >
                                        <span className="font-mono font-bold text-slate-800 text-sm mb-1">{batch.batchNo}</span>
                                        <div className="text-xs w-full mb-2">
                                            <span className={cn(isExpired ? "text-red-500 font-bold" : "text-slate-500")}>Exp: {batch.expiryDate && !isNaN(new Date(batch.expiryDate).getTime()) ? format(new Date(batch.expiryDate), 'MM/yy') : String(batch.expiryDate || '—')}</span>
                                        </div>
                                        <div className="mt-auto pt-2 border-t border-slate-200/50 flex items-center">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase">
                                                {(() => {
                                                    const isStrip = batch.packType?.toLowerCase() === 'strip' || batch.packType?.toLowerCase() === 'blister';
                                                    if (!isStrip) return `${batch.qtyStrips} ${batch.packUnit || 'Unit'}`;
                                                    if (batch.qtyStrips > 0 && batch.qtyLoose > 0) return `${batch.qtyStrips} Str + ${batch.qtyLoose} Ls`;
                                                    if (batch.qtyStrips > 0) return `${batch.qtyStrips} Strips`;
                                                    if (batch.qtyLoose > 0) return `${batch.qtyLoose} Loose`;
                                                    return `0 Strips`;
                                                })()}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-end gap-3 bg-slate-50 p-3 md:p-4 rounded-md border border-slate-200">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Batch</label>
                            <div className="h-10 px-3 bg-white border border-slate-200 rounded flex items-center font-mono font-bold text-slate-700 text-sm">
                                {quickAddBatch.batchNo}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1 flex items-center justify-between">
                                Qty ({(quickAddBatch?.packType || quickAddProduct?.packType)?.toLowerCase() === 'strip' || (quickAddBatch?.packType || quickAddProduct?.packType)?.toLowerCase() === 'blister' ? 'Strips' : ((quickAddBatch?.packType || quickAddProduct?.packType) || 'Unit')}) <span className="text-[9px] font-normal text-slate-400 ml-2">max {quickAddBatch.qtyStrips}</span>
                            </label>
                            <Input 
                                ref={qtyInputRef}
                                type="number" 
                                min="0"
                                value={qtyStrips}
                                onChange={(e) => setQtyStrips(e.target.value)}
                                onKeyDown={handleQtyKeyDown}
                                data-testid="quick-qty-strips"
                                className="w-24 h-10 border-blue-300 focus-visible:ring-blue-500 font-bold text-lg text-center"
                            />
                        </div>

                        {((quickAddBatch?.packType || quickAddProduct?.packType)?.toLowerCase() === 'strip' || (quickAddBatch?.packType || quickAddProduct?.packType)?.toLowerCase() === 'blister') && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center justify-between">
                                    Loose <span className="text-[9px] font-normal text-slate-400 ml-2">of {quickAddBatch.packSize}</span>
                                </label>
                                <Input 
                                    type="number" 
                                    min="0"
                                    value={qtyLoose}
                                    onChange={(e) => setQtyLoose(e.target.value)}
                                    onKeyDown={handleQtyKeyDown}
                                    data-testid="quick-qty-loose"
                                    className="w-20 h-10 border-slate-300 focus-visible:ring-blue-500 font-bold text-lg text-center"
                                />
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Disc %</label>
                            <Input 
                                type="number" 
                                min="0"
                                max="100"
                                value={discountPct}
                                onChange={(e) => setDiscountPct(e.target.value)}
                                onKeyDown={handleQtyKeyDown}
                                className="w-20 h-10 border-slate-300 focus-visible:ring-blue-500 font-bold text-lg text-center text-green-700"
                            />
                        </div>

                        <div className="ml-auto text-right px-4 flex flex-col justify-end">
                            {saleType === 'WHOLESALE' ? (
                                <>
                                    <div className="flex gap-3 text-sm font-medium mb-1 justify-end items-center">
                                        <span className={cn("px-2 py-0.5 rounded", Number(quickAddBatch.pts) > 0 ? "bg-purple-100 text-purple-800 font-bold border border-purple-200" : "text-slate-500")}>
                                            PTS: ₹{quickAddBatch.pts || '0.00'}
                                        </span>
                                        <span className="text-slate-300">|</span>
                                        <span className={cn("px-2 py-0.5 rounded", Number(quickAddBatch.pts) <= 0 && Number(quickAddBatch.ptr) > 0 ? "bg-purple-100 text-purple-800 font-bold border border-purple-200" : "text-slate-500")}>
                                            PTR: ₹{quickAddBatch.ptr || '0.00'}
                                        </span>
                                        <span className="text-slate-300">|</span>
                                        <span className={cn("px-2 py-0.5 rounded", Number(quickAddBatch.pts) <= 0 && Number(quickAddBatch.ptr) <= 0 ? "bg-purple-100 text-purple-800 font-bold border border-purple-200" : "text-slate-500")}>
                                            MRP: ₹{quickAddBatch.mrp || '0.00'}
                                        </span>
                                    </div>
                                    <div className="font-bold text-3xl text-slate-900 flex items-center justify-end gap-2">
                                        <span className="text-sm text-slate-500 uppercase tracking-widest mt-1">Total:</span> 
                                        ₹{(() => {
                                            const s = parseInt(qtyStrips) || 0;
                                            const l = parseInt(qtyLoose) || 0;
                                            const d = parseFloat(discountPct) || 0;
                                            const isStrip = quickAddProduct?.packType?.toLowerCase() === 'strip' || quickAddProduct?.packType?.toLowerCase() === 'blister';
                                            const effectiveL = isStrip ? l : 0;
                                            const tQtyFractional = s + (effectiveL / quickAddBatch.packSize);
                                            const rate = Number(quickAddBatch.pts) > 0 ? Number(quickAddBatch.pts) : (Number(quickAddBatch.ptr) > 0 ? Number(quickAddBatch.ptr) : Number(quickAddBatch.mrp));
                                            return ((rate * (1 - d/100)) * tQtyFractional).toFixed(2);
                                        })()}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                        MRP: ₹{quickAddBatch.mrp || '0.00'}
                                    </div>
                                    <div className="font-bold text-2xl text-slate-800">
                                        ₹{(() => {
                                            const s = parseInt(qtyStrips) || 0;
                                            const l = parseInt(qtyLoose) || 0;
                                            const d = parseFloat(discountPct) || 0;
                                            const isStrip = quickAddProduct?.packType?.toLowerCase() === 'strip' || quickAddProduct?.packType?.toLowerCase() === 'blister';
                                            const effectiveL = isStrip ? l : 0;
                                            const tQtyFractional = s + (effectiveL / quickAddBatch.packSize);
                                            const rate = Number(quickAddBatch.mrp) || 0;
                                            return ((rate * (1 - d/100)) * tQtyFractional).toFixed(2);
                                        })()}
                                    </div>
                                </>
                            )}
                        </div>

                        <button 
                            onClick={commitAdd}
                            className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow-sm transition-colors flex items-center gap-2"
                        >
                            Add <span className="text-blue-200 text-xs font-normal">[Enter]</span>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const itemsNeedingReview = activeDraft.cart.filter(c => c.batchAvailabilityStatus && c.batchAvailabilityStatus !== 'AVAILABLE').length;

    return (
        <div className="flex flex-col h-full bg-white relative z-10 border-t border-slate-200">
            {/* Quotation Banner */}
            {activeDraft.documentMode === 'invoice' && activeDraft.quotationId && activeDraft.sourceQuotationNo && (
                <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center shadow-sm">
                    <FileText className="w-4 h-4 text-blue-600 mr-2" />
                    <span className="text-sm font-medium text-blue-900">
                        Pre-filled from Quotation {activeDraft.sourceQuotationNo} — Review items and save as Invoice
                    </span>
                </div>
            )}
            {/* Repeat Invoice Banner */}
            {activeDraft.documentMode === 'invoice' && activeDraft.sourceInvoiceId && activeDraft.sourceInvoiceNo && (
                <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center shadow-sm">
                    <Repeat className="w-4 h-4 text-emerald-600 mr-2" />
                    <span className="text-sm font-medium text-emerald-900 flex-1">
                        Pre-filled from Invoice {activeDraft.sourceInvoiceNo} — Batch and stock revalidated.
                    </span>
                    {itemsNeedingReview > 0 && (
                        <Badge variant="destructive" className="ml-4 whitespace-nowrap bg-red-600 hover:bg-red-700">
                            {itemsNeedingReview} item{itemsNeedingReview > 1 ? 's' : ''} need review
                        </Badge>
                    )}
                </div>
            )}
            {/* Search Bar Area */}
            <div className="px-4 py-3 bg-[#F8FAFC] border-b border-slate-200 shrink-0 relative" ref={searchContainerRef}>
                {/* Backdrop on tablet/mobile when search overlay is open - clears global navbar and tabs */}
                {isSearchFocused && searchQuery.length >= 2 && !quickAddProduct && (
                    <div 
                        className="fixed inset-x-0 bottom-0 top-[120px] md:top-[calc(env(safe-area-inset-top)+120px)] bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs"
                        onClick={() => {
                            setIsSearchFocused(false);
                            if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                                document.activeElement.blur();
                            }
                        }}
                    />
                )}

                <div className={cn(
                    "w-full transition-all",
                    isSearchFocused && searchQuery.length >= 2 && !quickAddProduct
                        ? "fixed inset-x-0 top-[120px] md:top-[calc(env(safe-area-inset-top)+120px)] h-[55vh] max-h-[calc(100dvh-130px)] z-50 bg-white shadow-2xl overflow-y-auto p-4 border-b-2 border-blue-500 lg:relative lg:inset-auto lg:top-auto lg:h-auto lg:max-h-none lg:shadow-none lg:overflow-visible lg:p-0 lg:border-none"
                        : "relative"
                )}>
                    {/* Sticky Search Bar: Stays sticky at top of 50vh overlay on tablet */}
                    <div className={cn(
                        "w-full relative",
                        isSearchFocused && searchQuery.length >= 2 && !quickAddProduct
                            ? "sticky top-0 z-20 bg-white pb-3 pt-1 border-b border-slate-100 flex items-center gap-2 lg:static lg:p-0 lg:border-none"
                            : ""
                    )}>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                            <Input 
                                ref={(node) => {
                                    if (searchInputRef) (searchInputRef as any).current = node;
                                    if (searchRef) (searchRef as any).current = node;
                                }}
                                className="w-full h-10 pl-10 pr-10 border-2 border-[#0EA5E9] rounded-md focus-visible:ring-0 focus-visible:border-[#0284C7] font-semibold text-sm shadow-sm"
                                placeholder="Search Medicine..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    if (e.target.value.length >= 2) {
                                        setIsSearchFocused(true);
                                    }
                                }}
                                onFocus={() => {
                                    setIsSearchFocused(true);
                                    if (searchContainerRef.current) {
                                        setTimeout(() => {
                                            searchContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                        }, 100);
                                    }
                                }}
                                onClick={() => {
                                    if (searchQuery.length >= 2) {
                                        setIsSearchFocused(true);
                                    }
                                }}
                                onPointerDown={() => {
                                    if (searchQuery.length >= 2) {
                                        setIsSearchFocused(true);
                                    }
                                }}
                                onKeyDown={handleSearchKeyDown}
                                disabled={!!quickAddProduct}
                            />
                            
                            {isFetching && (
                                <div className="absolute right-3 top-2.5">
                                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                                </div>
                            )}
                        </div>

                        {/* Tablet/Mobile Close Button */}
                        {isSearchFocused && searchQuery.length >= 2 && !quickAddProduct && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSearchFocused(false);
                                    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                                        document.activeElement.blur();
                                    }
                                }}
                                className="lg:hidden shrink-0 h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold text-xs flex items-center gap-1"
                            >
                                <X className="w-4 h-4" />
                                <span>Close</span>
                            </button>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded mt-1">
                            {errorMsg}
                        </div>
                    )}

                    {/* Floating Search Dropdown (Desktop) / Scrollable Results List (Mobile Overlay) */}
                    {isSearchFocused && searchQuery.length >= 2 && !quickAddProduct && (
                        <div 
                            className={cn(
                                "w-full bg-white divide-y divide-slate-100",
                                "lg:absolute lg:left-0 lg:w-full lg:bg-white lg:border lg:border-slate-300 lg:rounded-md lg:shadow-2xl lg:max-h-[min(45vh,340px)] lg:overflow-y-auto lg:overscroll-contain lg:touch-pan-y lg:scrollbar-thin lg:scrollbar-thumb-slate-300 lg:scrollbar-track-transparent lg:z-50",
                                dropdownPlacement === 'top' ? "lg:bottom-full lg:top-auto lg:mb-1" : "lg:top-full lg:mt-1"
                            )}
                        >
                            {isFetching && searchResults.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm font-medium">Searching...</div>
                            ) : searchResults.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm font-medium">No medicines found for "{searchQuery}"</div>
                            ) : (
                                <div className="flex flex-col py-1">
                                    {searchResults.map((product, idx) => {
                                        const isSelected = idx === selectedIndex;
                                        return (
                                            <div 
                                                key={product.id} 
                                                className={cn(
                                                    "p-2.5 px-3 min-h-[48px] cursor-pointer border-l-4 transition-colors select-none",
                                                    isSelected ? "bg-blue-50 border-blue-500" : "bg-white border-transparent hover:bg-slate-50 active:bg-blue-50"
                                                )}
                                                onPointerDown={(e) => {
                                                    // Prevent search input blur on desktop mouse click, while allowing touch scrolling on tablets
                                                    if (e.pointerType === 'mouse') {
                                                        e.preventDefault();
                                                    }
                                                }}
                                                onClick={() => handleSelectProduct(product)}
                                                onMouseEnter={() => setSelectedIndex(idx)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                            {product.name}
                                                            {product.isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                                            {product.composition} • {product.packSize} {product.packUnit}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold text-slate-700">₹{product.mrp.toFixed(2)}</div>
                                                        <div className={cn("text-xs font-bold mt-0.5", product.totalStock > 0 ? "text-emerald-600" : "text-red-500")}>
                                                            {(() => {
                                                                const isStrip = product.packType?.toLowerCase() === 'strip' || product.packType?.toLowerCase() === 'blister';
                                                                const totalQty = product.totalStock || 0;
                                                                if (!isStrip) return `${totalQty} in stock`;
                                                                const strips = Math.floor(totalQty);
                                                                const loose = Math.round((totalQty - strips) * (product.packSize || 1));
                                                                if (strips > 0 && loose > 0) return `${strips} strips + ${loose} loose in stock`;
                                                                if (strips > 0) return `${strips} strips in stock`;
                                                                if (loose > 0) return `${loose} loose in stock`;
                                                                return `0 in stock`;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Quick Add Widget */}
                {renderQuickAddWidget()}
            </div>

            {/* Dense Invoice Table Area */}
            <div className="flex-1 w-full overflow-x-auto border border-gray-200 rounded-md bg-slate-50 relative pb-56 lg:pb-0" ref={tableContainerRef}>
                <table className="w-full min-w-full lg:min-w-[1200px] text-left border-collapse">
                    <thead className="bg-slate-200 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-8 text-center border-r border-slate-300">#</th>
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-r border-slate-300 w-auto min-w-[160px] lg:w-[320px] lg:min-w-[280px] sticky left-0 z-20 bg-slate-200 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.1)]">Product & Composition</th>
                            <th className="hidden lg:table-cell px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20 border-r border-slate-300 text-center">HSN</th>
                            <th className="hidden lg:table-cell px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-24 border-r border-slate-300">Batch</th>
                            <th className="hidden lg:table-cell px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-center border-r border-slate-300">Exp</th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">MRP</th>
                            {saleType === 'WHOLESALE' && (
                                <>
                                    <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">PTR</th>
                                    <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">PTS</th>
                                </>
                            )}
                            {saleType === 'RETAIL' ? (
                                <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20 text-right border-r border-slate-300">Qty</th>
                            ) : (
                                <>
                                    <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">B-Qty</th>
                                    <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">F-Qty</th>
                                </>
                            )}
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">Disc %</th>
                            {saleType === 'WHOLESALE' && (
                                <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">GST %</th>
                            )}
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-24 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {cart.length === 0 ? (
                            <>
                                {Array.from({ length: 15 }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="pointer-events-none opacity-40 hover:bg-transparent">
                                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-300 text-center border-r border-slate-100">{i + 1}</td>
                                        <td className="px-3 py-1.5 border-r border-slate-100 sticky left-0 z-10 bg-white shadow-[4px_0_10px_-3px_rgba(0,0,0,0.1)] w-auto min-w-[160px] lg:w-[320px]">
                                            <div className="h-3 w-36 md:w-48 bg-slate-100 rounded mb-1"></div>
                                            <div className="h-2 w-24 md:w-32 bg-slate-50 rounded"></div>
                                        </td>
                                        <td className="hidden lg:table-cell px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-16 bg-slate-100 rounded mx-auto"></div></td>
                                        <td className="hidden lg:table-cell px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-16 bg-slate-100 rounded"></div></td>
                                        <td className="hidden lg:table-cell px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-10 bg-slate-100 rounded mx-auto"></div></td>
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                        {saleType === 'WHOLESALE' && (
                                            <>
                                                <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                                <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                            </>
                                        )}
                                        {saleType === 'RETAIL' ? (
                                            <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                        ) : (
                                            <>
                                                <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                                <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                            </>
                                        )}
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-8 bg-slate-100 rounded ml-auto"></div></td>
                                        {saleType === 'WHOLESALE' && (
                                            <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-8 bg-slate-100 rounded ml-auto"></div></td>
                                        )}
                                        <td className="px-3 py-1.5"><div className="h-3 w-16 bg-slate-100 rounded ml-auto"></div></td>
                                    </tr>
                                ))}
                            </>
                        ) : (
                            cart.map((item, index) => {
                                const isEditing = editingRowBatchId === item.batchId;
                                const expiryStatus = getExpiryStatus(item.expiryDate);
                                
                                let statusBorder = '';
                                let statusTooltip = '';
                                if (expiryStatus === 'expired') {
                                    statusBorder = 'border-l-[6px] border-l-red-500 bg-red-50/80 !text-red-700';
                                    statusTooltip = 'This batch has expired. Do not bill.';
                                } else if (expiryStatus === 'expiring_soon') {
                                    statusBorder = 'border-l-[6px] border-l-amber-500 bg-amber-50/80 !text-amber-700';
                                    statusTooltip = 'This batch expires within 90 days. Verify before billing.';
                                } else if (expiryStatus === 'near_expiry') {
                                    statusBorder = 'border-l-[6px] border-l-yellow-500 bg-yellow-50/80 !text-yellow-700';
                                } else if (expiryStatus === 'good') {
                                    statusBorder = 'border-l-[6px] border-l-emerald-500 bg-emerald-50/80 !text-emerald-700';
                                } else {
                                statusBorder = 'border-l-[6px] border-l-transparent';
                                }

                                if (isEditing) {
                                    return (
                                        <InlineRowEditor 
                                            key={`${item.productId}-${item.packType || 'unit'}-${item.batchId}-${index}-edit`}
                                            item={item}
                                            saleType={saleType}
                                            onSave={handleSaveEdit}
                                            onCancel={handleCancelEdit}
                                            onRemove={() => handleRemoveItem(item.batchId)}
                                        />
                                    );
                                }

                                const lineMargin = calculateLineMargin(item, activeDraft?.extraDiscountPct || 0);

                                return (
                                    <tr 
                                        key={`${item.batchId}-${index}`} 
                                        onClick={() => setEditingRowBatchId(item.batchId)}
                                        title={statusTooltip || undefined}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setEditingRowBatchId(item.batchId);
                                            }
                                        }}
                                        tabIndex={0}
                                        className="hover:bg-blue-50/50 focus-visible:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 cursor-pointer transition-colors group animate-in fade-in duration-300"
                                    >
                                        <td className={`px-2 py-1.5 text-[11px] font-bold text-slate-400 text-center border-r border-slate-100 ${statusBorder}`}>{index + 1}</td>
                                        <td className="px-3 py-1.5 border-r border-slate-100 sticky left-0 z-10 bg-white shadow-[4px_0_10px_-3px_rgba(0,0,0,0.1)] w-auto min-w-[160px] lg:w-[320px]">
                                            <div className="font-bold text-[13px] text-slate-800 leading-tight flex items-center gap-2">
                                                <span className="truncate">{item.name}</span>
                                                {item.batchAvailabilityStatus === 'BATCH_UNAVAILABLE' && (
                                                    <span title="Batch Unavailable" className="inline-flex items-center justify-center bg-red-100 text-red-600 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold shrink-0">
                                                        Out of Stock
                                                    </span>
                                                )}
                                                {item.batchAvailabilityStatus === 'BATCH_EXPIRED' && (
                                                    <span title="Batch Expired" className="inline-flex items-center justify-center bg-red-100 text-red-600 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold shrink-0">
                                                        Expired
                                                    </span>
                                                )}
                                                {item.batchAvailabilityStatus === 'LOW_STOCK' && (
                                                    <span title={`Only ${item.availableStock || 0} units available`} className="inline-flex items-center justify-center bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold shrink-0">
                                                        Low Stock
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-500 truncate max-w-[180px] md:max-w-[240px] leading-tight mt-0.5">{item.composition}</div>
                                            {/* Tablet/Mobile dense batch & expiry badge */}
                                            <div className="lg:hidden text-[9px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                <span className="bg-slate-100 px-1 py-0.2 rounded text-slate-700 font-bold border border-slate-200">B: {item.batchNo}</span>
                                                {item.expiryDate && (
                                                    <span className={cn(
                                                        "px-1 py-0.2 rounded font-semibold",
                                                        expiryStatus === 'expired' ? "bg-red-100 text-red-700" :
                                                        expiryStatus === 'expiring_soon' ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-600"
                                                    )}>
                                                        Exp: {typeof item.expiryDate === 'string' && item.expiryDate.includes('-') && item.expiryDate.length > 7 && !isNaN(new Date(item.expiryDate).getTime())
                                                            ? format(new Date(item.expiryDate), 'MM/yy')
                                                            : String(item.expiryDate)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="hidden lg:table-cell px-2 py-1.5 text-[10px] text-slate-500 text-center border-r border-slate-100 whitespace-nowrap">{item.hsn || '-'}</td>
                                        <td className="hidden lg:table-cell px-2 py-1.5 text-[11px] font-bold text-slate-600 border-r border-slate-100">{item.batchNo}</td>
                                        <td className="hidden lg:table-cell px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center border-r border-slate-100 whitespace-nowrap">
                                            {item.expiryDate
                                                ? (typeof item.expiryDate === 'string' && item.expiryDate.includes('-') && item.expiryDate.length > 7 && !isNaN(new Date(item.expiryDate).getTime())
                                                    ? format(new Date(item.expiryDate), 'MM/yy')
                                                    : String(item.expiryDate))
                                                : '—'}
                                            {expiryStatus === 'expired' && (
                                                <span className="ml-1 inline-flex items-center px-[6px] py-[2px] rounded-full text-[9px] font-bold uppercase bg-red-100 text-red-700">
                                                    Expired
                                                </span>
                                            )}
                                            {expiryStatus === 'expiring_soon' && (
                                                <span className="ml-1 inline-flex items-center px-[6px] py-[2px] rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-700">
                                                    Exp Soon
                                                </span>
                                            )}
                                            {expiryStatus === 'near_expiry' && (
                                                <span className="ml-1 inline-flex items-center px-[6px] py-[2px] rounded-full text-[9px] font-bold uppercase bg-yellow-100 text-yellow-700">
                                                    Near Exp
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-700 text-right border-r border-slate-100">
                                            ₹{item.mrp.toFixed(2)}
                                        </td>
                                        {saleType === 'WHOLESALE' && (
                                            <>
                                                <td className={cn("px-2 py-1.5 text-[11px] font-bold text-right border-r border-slate-100", item.rate === item.ptr && item.ptr > 0 ? "text-purple-700" : "text-slate-600")}>
                                                    ₹{(item.ptr || 0).toFixed(2)}
                                                </td>
                                                <td className={cn("px-2 py-1.5 text-[11px] font-bold text-right border-r border-slate-100", item.rate === item.pts && item.pts > 0 ? "text-purple-700" : "text-slate-600")}>
                                                    ₹{(item.pts || 0).toFixed(2)}
                                                </td>
                                            </>
                                        )}
                                        {saleType === 'RETAIL' ? (
                                            <td className="px-2 py-1.5 text-right border-r border-slate-100">
                                                <div className="text-[11px] font-bold text-blue-700">
                                                    <>
                                                        {item.qtyStrips > 0 ? `${item.qtyStrips}${item.packType?.toLowerCase() === 'strip' || item.packType?.toLowerCase() === 'blister' ? 'S' : ' ' + (item.packType || 'Unit')} ` : ''}
                                                        {item.qtyLoose > 0 && (item.packType?.toLowerCase() === 'strip' || item.packType?.toLowerCase() === 'blister') ? `${item.qtyLoose}L` : ''}
                                                    </>
                                                </div>
                                                {showMarginInfo && (
                                                    <div className={cn(
                                                        "text-[10px] font-medium whitespace-nowrap mt-0.5",
                                                        lineMargin.isLossSale ? "text-red-600 font-bold" : "text-emerald-600"
                                                    )}>
                                                        Landing ₹{lineMargin.costFloor.toFixed(2)} · Profit ₹{lineMargin.lineGrossProfit.toFixed(2)} ({lineMargin.marginPct.toFixed(1)}%)
                                                    </div>
                                                )}
                                            </td>
                                        ) : (
                                            <>
                                                <td className="px-2 py-1.5 text-right border-r border-slate-100">
                                                    <div className="text-[11px] font-bold text-blue-700">
                                                        {item.qtyStrips > 0 ? `${item.qtyStrips}S ` : ''}
                                                        {item.qtyLoose > 0 ? `${item.qtyLoose}L` : ''}
                                                    </div>
                                                    {showMarginInfo && (
                                                        <div className={cn(
                                                            "text-[10px] font-medium whitespace-nowrap mt-0.5",
                                                            lineMargin.isLossSale ? "text-red-600 font-bold" : "text-emerald-600"
                                                        )}>
                                                            Landing ₹{lineMargin.costFloor.toFixed(2)} · Profit ₹{lineMargin.lineGrossProfit.toFixed(2)} ({lineMargin.marginPct.toFixed(1)}%)
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-right border-r border-slate-100 text-[11px] font-bold text-amber-600">
                                                    {(item.freeQtyStrips || 0) > 0 ? `${item.freeQtyStrips}S ` : ''}
                                                    {(item.freeQtyLoose || 0) > 0 ? `${item.freeQtyLoose}L` : ''}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-500 text-right border-r border-slate-100">
                                            {item.discountPct > 0 ? <span className="text-emerald-600">{item.discountPct}%</span> : '-'}
                                        </td>
                                        {saleType === 'WHOLESALE' && (
                                            <td className="px-2 py-1.5 text-[11px] font-bold text-slate-500 text-right border-r border-slate-100">
                                                {item.gstPct ?? item.gstRate}%
                                            </td>
                                        )}
                                        <td 
                                            className={cn(
                                                "px-3 py-1.5 text-[13px] font-black text-right transition-colors",
                                                lineMargin.isLossSale 
                                                    ? "bg-red-50 text-red-600 border border-red-200" 
                                                    : "text-slate-800"
                                            )}
                                            title={lineMargin.isLossSale ? `Rate is below PTR (₹${lineMargin.costFloor.toFixed(2)})` : undefined}
                                        >
                                            <div className="flex flex-col items-end">
                                                <span>₹{item.totalAmount.toFixed(2)}</span>
                                                {lineMargin.isLossSale && (
                                                    <span 
                                                        className="text-[9px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded flex items-center gap-0.5 mt-0.5"
                                                        title={`Rate is below PTR (₹${lineMargin.costFloor.toFixed(2)})`}
                                                    >
                                                        Below PTR (₹{lineMargin.costFloor.toFixed(2)})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                    {cart.length > 0 && (
                        <tfoot className="sticky bottom-0 bg-slate-50 border-t-2 border-slate-300 font-bold text-xs text-slate-700 shadow-sm z-10">
                            <tr>
                                <td colSpan={saleType === 'WHOLESALE' ? 5 : 4} className="hidden lg:table-cell px-3 py-2 text-left font-bold text-slate-700">
                                    Total: {cart.length} {cart.length === 1 ? 'Item' : 'Items'} ({totals.itemCount} Units)
                                </td>
                                <td colSpan={saleType === 'WHOLESALE' ? 2 : 2} className="lg:hidden px-3 py-2 text-left font-bold text-slate-700">
                                    Total: {cart.length} {cart.length === 1 ? 'Item' : 'Items'} ({totals.itemCount} Units)
                                </td>
                                {saleType === 'WHOLESALE' && (
                                    <td className="px-2 py-2 text-right"></td>
                                )}
                                <td colSpan={saleType === 'WHOLESALE' ? 2 : 2} className="px-2 py-2 text-right">
                                    {showMarginInfo && marginData && (
                                        <div className="flex items-center justify-end gap-2 text-[11px]">
                                            <span className="font-semibold text-slate-600">Total Landing:</span>
                                            <span className="font-black text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                                ₹{marginData.totalLandingCost.toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td colSpan={saleType === 'WHOLESALE' ? 2 : 1} className="px-2 py-2 text-right">
                                    {showMarginInfo && marginData && (
                                        <div className="flex items-center justify-end gap-2 text-[11px]">
                                            <span className="font-semibold text-slate-600">Total Profit:</span>
                                            <span className={cn(
                                                "font-black px-2 py-0.5 rounded border",
                                                marginData.totalProfit >= 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"
                                            )}>
                                                {marginData.totalProfit >= 0 ? '+' : ''}₹{marginData.totalProfit.toFixed(2)} ({marginData.profitMarginPct.toFixed(1)}%)
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right text-sm font-black text-slate-900 whitespace-nowrap">
                                    ₹{totals.grandTotal.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}
