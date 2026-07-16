'use client';

import { useState, useRef, useEffect } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { Search, Package, AlertTriangle, X, Loader2, FileText, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getExpiryStatus } from '@/utils/expiry';
import { useProductSearch } from '@/hooks/useProductSearch';
import { Batch, ProductSearchResult } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { InlineRowEditor } from './InlineRowEditor';

export function MainInvoiceWorkspace() {
    const { drafts, activeDraftId, addToCart, removeFromCart, updateCartItem } = useBillingStore();
    
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

    // Focus search on mount
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    // Global F2 Shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Reset selected index when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchResults]);

    // Close search dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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
        const availableBatches = product.batches || [];
        
        // Filter out expired batches and batches with no stock
        console.log("validBatches calculation started, availableBatches:", availableBatches);
        const validBatches = availableBatches.filter(b => {
            const isExpired = b.expiryDate ? new Date(b.expiryDate) < new Date() : false;
            return !isExpired && b.qtyStrips > 0;
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
        setTimeout(() => {
            qtyInputRef.current?.focus();
            qtyInputRef.current?.select();
        }, 50);
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

        const totalQtyLoose = (s * quickAddBatch.packSize) + l;
        const totalQtyFractional = s + (l / quickAddBatch.packSize);
        
        if (totalQtyLoose > (quickAddBatch.qtyStrips * quickAddBatch.packSize + quickAddBatch.qtyLoose)) {
            alert('Warning: Added quantity exceeds available stock.');
        }

        const saleRate = quickAddBatch.saleRate ?? quickAddBatch.mrp;
        const dPct = parseFloat(discountPct) || 0;
        const baseRate = saleRate * (1 - (dPct / 100));
        
        const taxableAmount = (baseRate * totalQtyFractional) / (1 + quickAddProduct.gstRate / 100);
        const gstAmount = (baseRate * totalQtyFractional) - taxableAmount;

        addToCart(activeDraftId, {
            batchId: quickAddBatch.id,
            productId: quickAddProduct.id,
            name: quickAddProduct.name,
            composition: quickAddProduct.composition,
            manufacturer: quickAddProduct.manufacturer,
            packSize: quickAddBatch.packSize,
            packUnit: quickAddBatch.packUnit,
            requiresPrescription: ['H', 'H1', 'X', 'Narcotic'].includes(quickAddProduct.scheduleType),
            batchNo: quickAddBatch.batchNo,
            expiryDate: quickAddBatch.expiryDate,
            scheduleType: quickAddProduct.scheduleType as any,
            mrp: quickAddBatch.mrp,
            saleRate: saleRate,
            rate: baseRate,
            qtyStrips: s,
            qtyLoose: l,
            totalQty: totalQtyFractional,
            saleMode: 'strip',
            discountPct: dPct,
            gstRate: quickAddProduct.gstRate,
            taxableAmount,
            gstAmount,
            totalAmount: baseRate * totalQtyFractional,
            purchaseRate: quickAddBatch.purchaseRate,
        });

        // Reset
        setQuickAddProduct(null);
        setQuickAddBatch(null);
        searchInputRef.current?.focus();
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
                                        autoFocus={idx === 0}
                                        onClick={() => !isExpired && handleSelectBatch(batch)}
                                        className={cn(
                                            "flex-shrink-0 flex flex-col p-3 rounded-md border text-left transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none min-w-[140px]",
                                            isExpired ? "opacity-50 border-red-200 bg-red-50 cursor-not-allowed" : "border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"
                                        )}
                                    >
                                        <span className="font-mono font-bold text-slate-800 text-sm mb-1">{batch.batchNo}</span>
                                        <div className="flex justify-between text-xs w-full mb-1">
                                            <span className={cn(isExpired ? "text-red-500 font-bold" : "text-slate-500")}>Exp: {batch.expiryDate && !isNaN(new Date(batch.expiryDate).getTime()) ? format(new Date(batch.expiryDate), 'MM/yy') : String(batch.expiryDate || '—')}</span>
                                        </div>
                                        <div className="flex justify-between text-xs w-full mt-auto pt-2 border-t border-slate-200/50">
                                            <span className="font-bold text-slate-700">₹{batch.mrp.toFixed(2)}</span>
                                            <span className="text-blue-600 font-semibold">{batch.qtyStrips} {batch.packUnit}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-end gap-4 bg-slate-50 p-4 rounded-md border border-slate-200">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Batch</label>
                            <div className="h-10 px-3 bg-white border border-slate-200 rounded flex items-center font-mono font-bold text-slate-700 text-sm">
                                {quickAddBatch.batchNo}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1 flex items-center justify-between">
                                Qty (Strips) <span className="text-[9px] font-normal text-slate-400 ml-2">max {quickAddBatch.qtyStrips}</span>
                            </label>
                            <Input 
                                ref={qtyInputRef}
                                type="number" 
                                min="0"
                                value={qtyStrips}
                                onChange={(e) => setQtyStrips(e.target.value)}
                                onKeyDown={handleQtyKeyDown}
                                className="w-24 h-10 border-blue-300 focus-visible:ring-blue-500 font-bold text-lg text-center"
                            />
                        </div>

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
                                className="w-20 h-10 border-slate-300 focus-visible:ring-blue-500 font-bold text-lg text-center"
                            />
                        </div>

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

                        <div className="ml-auto text-right px-4">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sell Amount</div>
                            <div className="font-bold text-2xl text-slate-800">
                                ₹{(() => {
                                    const s = parseInt(qtyStrips) || 0;
                                    const l = parseInt(qtyLoose) || 0;
                                    const d = parseFloat(discountPct) || 0;
                                    const tQtyFractional = s + (l / quickAddBatch.packSize);
                                    const rate = quickAddBatch.saleRate ?? quickAddBatch.mrp;
                                    return ((rate * (1 - d/100)) * tQtyFractional).toFixed(2);
                                })()}
                            </div>
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
                <div className="relative w-full">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                    <Input 
                        ref={searchInputRef}
                        className="w-full h-10 pl-10 pr-10 border-2 border-[#0EA5E9] rounded-md focus-visible:ring-0 focus-visible:border-[#0284C7] font-semibold text-sm shadow-sm"
                        placeholder="Search Medicine [F2]..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        onKeyDown={handleSearchKeyDown}
                        disabled={!!quickAddProduct}
                    />
                    
                    {isFetching && (
                        <div className="absolute right-3 top-2.5">
                            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                        </div>
                    )}

                    {errorMsg && (
                        <div className="absolute -bottom-6 left-0 text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">
                            {errorMsg}
                        </div>
                    )}

                    {/* Floating Search Dropdown */}
                    {isSearchFocused && searchQuery.length >= 2 && !quickAddProduct && (
                        <div className="absolute top-11 left-0 w-full bg-white border border-slate-300 rounded-md shadow-2xl z-50 max-h-[320px] overflow-y-auto">
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
                                                    "p-2 px-3 cursor-pointer border-l-4 transition-colors",
                                                    isSelected ? "bg-blue-50 border-blue-500" : "bg-white border-transparent hover:bg-slate-50"
                                                )}
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
                                                            {product.totalStock} in stock
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
            <div className="flex-1 overflow-auto bg-slate-50 relative">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-200 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-8 text-center border-r border-slate-300">#</th>
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-r border-slate-300">Product & Composition</th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-24 border-r border-slate-300">Batch</th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-center border-r border-slate-300">Exp</th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20 text-right border-r border-slate-300">MRP</th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20 text-right border-r border-slate-300">Qty</th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">Disc %</th>
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-24 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {cart.length === 0 ? (
                            <>
                                {Array.from({ length: 15 }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="pointer-events-none opacity-40 hover:bg-transparent">
                                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-300 text-center border-r border-slate-100">{i + 1}</td>
                                        <td className="px-3 py-1.5 border-r border-slate-100">
                                            <div className="h-3 w-48 bg-slate-100 rounded mb-1"></div>
                                            <div className="h-2 w-32 bg-slate-50 rounded"></div>
                                        </td>
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-16 bg-slate-100 rounded"></div></td>
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-10 bg-slate-100 rounded mx-auto"></div></td>
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-12 bg-slate-100 rounded ml-auto"></div></td>
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-8 bg-slate-100 rounded ml-auto"></div></td>
                                        <td className="px-2 py-1.5 border-r border-slate-100"><div className="h-3 w-8 bg-slate-100 rounded ml-auto"></div></td>
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
                                            key={`${item.batchId}-${index}-edit`}
                                            item={item}
                                            onSave={handleSaveEdit}
                                            onCancel={handleCancelEdit}
                                            onRemove={() => handleRemoveItem(item.batchId)}
                                        />
                                    );
                                }

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
                                        <td className="px-3 py-1.5 border-r border-slate-100">
                                            <div className="font-bold text-[13px] text-slate-800 leading-tight flex items-center gap-2">
                                                {item.name}
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
                                            <div className="text-[10px] text-slate-500 truncate max-w-[250px] leading-tight mt-0.5">{item.composition}</div>
                                        </td>
                                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-600 border-r border-slate-100">{item.batchNo}</td>
                                        <td className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center border-r border-slate-100 whitespace-nowrap">
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
                                        <td className="px-2 py-1.5 text-right border-r border-slate-100">
                                            <div className="text-[11px] font-bold text-blue-700">
                                                {item.qtyStrips > 0 ? `${item.qtyStrips}S ` : ''}
                                                {item.qtyLoose > 0 ? `${item.qtyLoose}L` : ''}
                                            </div>
                                        </td>
                                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-500 text-right border-r border-slate-100">
                                            {item.discountPct > 0 ? <span className="text-emerald-600">{item.discountPct}%</span> : '-'}
                                        </td>
                                        <td className="px-3 py-1.5 text-[13px] font-black text-slate-800 text-right">
                                            ₹{item.totalAmount.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
