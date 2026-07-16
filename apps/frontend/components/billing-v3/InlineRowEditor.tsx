'use client';

import { useState, useEffect, useRef } from 'react';
import { CartItem, Batch, ProductSearchResult } from '@/types';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getExpiryStatus } from '@/utils/expiry';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Check, X, Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface InlineRowEditorProps {
    item: CartItem;
    onSave: (oldBatchId: string, newItem: CartItem) => void;
    onCancel: () => void;
    onRemove: () => void;
}

export function InlineRowEditor({ item, onSave, onCancel, onRemove }: InlineRowEditorProps) {
    const outletId = useOutletId();

    const [qtyStrips, setQtyStrips] = useState(item.qtyStrips.toString());
    const [qtyLoose, setQtyLoose] = useState(item.qtyLoose.toString());
    const [discountType, setDiscountType] = useState<'percentage' | 'amount'>(item.discountType || 'percentage');
    const [discountValue, setDiscountValue] = useState(
        item.discountType === 'amount' 
            ? (item.discountAmount?.toString() || '0')
            : (item.discountPct?.toString() || '0')
    );
    const [selectedBatchId, setSelectedBatchId] = useState(item.batchId);
    
    const qtyInputRef = useRef<HTMLInputElement>(null);

    // Fetch the product details to get all available batches
    const { data: searchResults, isFetching } = useQuery({
        queryKey: ['product', 'search', item.name, outletId],
        queryFn: () => {
            if (!outletId) return Promise.resolve([]);
            // Searching by name usually brings it up as the first result
            return productsApi.search(item.name, outletId, 'billing');
        },
        enabled: !!outletId,
    });

    const productInfo: ProductSearchResult | undefined = searchResults?.find((p: ProductSearchResult) => p.id === item.productId);
    
    // We can fall back to a mock batch if the API hasn't returned yet, so the UI doesn't crash
    const availableBatches: Batch[] = productInfo?.batches || [
        {
            id: item.batchId,
            outletId: '',
            outletProductId: '',
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            mrp: item.mrp,
            purchaseRate: 0,
            saleRate: item.rate,
            qtyStrips: 0,
            qtyLoose: 0,
            packSize: item.packSize || 1,
            packUnit: item.packUnit || 'units',
            packType: 'Strip',
            isActive: true,
            createdAt: new Date().toISOString()
        }
    ];

    const currentBatch = availableBatches.find(b => b.id === selectedBatchId) || availableBatches[0];

    // Focus input on mount
    useEffect(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
    }, []);

    // Live Calculations
    const s = parseInt(qtyStrips) || 0;
    const l = parseInt(qtyLoose) || 0;
    const dVal = parseFloat(discountValue) || 0;
    const tQtyLoose = (s * currentBatch.packSize) + l;
    const tQtyFractional = s + (l / currentBatch.packSize);
    
    const saleRate = currentBatch.saleRate ?? currentBatch.mrp;
    const rawTotal = saleRate * tQtyFractional;

    let dPct = 0;
    let dAmount = 0;
    if (discountType === 'percentage') {
        dPct = dVal;
        dAmount = rawTotal * (dPct / 100);
    } else {
        dAmount = dVal;
        dPct = rawTotal > 0 ? (dAmount / rawTotal) * 100 : 0;
    }

    const rate = saleRate * (1 - (dPct / 100));
    const sellAmount = rate * tQtyFractional;
    
    // Purchase rate per pack
    const totalCost = (currentBatch.purchaseRate || 0) * tQtyFractional;
    
    const marginAmount = sellAmount - totalCost;
    const marginPct = sellAmount > 0 ? (marginAmount / sellAmount) * 100 : 0;

    const isLowMargin = marginPct < 10 && marginPct >= 0;
    const isNegativeMargin = marginPct < 0;
    const exceedsStock = tQtyLoose > (currentBatch.qtyStrips * currentBatch.packSize + currentBatch.qtyLoose);
    const isDiscountInvalid = discountType === 'percentage' 
        ? (dVal < 0 || dVal > 100) 
        : (dVal < 0 || dVal > rawTotal);
    const isQtyZero = tQtyFractional === 0;

    const isValid = !isDiscountInvalid && !isQtyZero && !isNegativeMargin;

    const commitSave = () => {
        if (!isValid) return;
        
        const currentBatch = availableBatches.find(b => b.id === selectedBatchId);
        if (!currentBatch) return;

        const taxableAmount = (rate * tQtyFractional) / (1 + item.gstRate / 100);
        const gstAmount = (rate * tQtyFractional) - taxableAmount;

        onSave(item.batchId, {
            ...item,
            batchId: currentBatch.id,
            batchNo: currentBatch.batchNo,
            expiryDate: currentBatch.expiryDate,
            qtyStrips: s,
            qtyLoose: l,
            totalQty: tQtyFractional,
            discountPct: dPct,
            discountType: discountType,
            discountAmount: discountType === 'amount' ? dAmount : undefined,
            rate: rate,
            totalAmount: sellAmount,
            mrp: currentBatch.mrp,
            saleRate: saleRate,
            purchaseRate: currentBatch.purchaseRate,
            packSize: currentBatch.packSize,
            packUnit: currentBatch.packUnit,
            taxableAmount,
            gstAmount
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };
    const expiryStatus = getExpiryStatus(item.expiryDate);
    let statusBorder = '';
    if (expiryStatus === 'expired') {
        statusBorder = 'border-l-[6px] border-l-red-500';
    } else if (expiryStatus === 'expiring_soon') {
        statusBorder = 'border-l-[6px] border-l-amber-500';
    } else if (expiryStatus === 'near_expiry') {
        statusBorder = 'border-l-[6px] border-l-yellow-500';
    } else if (expiryStatus === 'good') {
        statusBorder = 'border-l-[6px] border-l-emerald-500';
    } else {
        statusBorder = 'border-l-[6px] border-l-transparent';
    }

    return (
        <tr className="bg-blue-50/80 border-y-2 border-blue-400 shadow-[inset_0_2px_8px_rgba(0,0,0,0.05)] relative z-20">
            <td colSpan={8} className={`p-0 ${statusBorder}`}>
                <div className="flex flex-col p-4 gap-4">
                    {/* Header Row */}
                    <div className="flex justify-between items-start border-b border-blue-200 pb-3">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                {item.name}
                                {isFetching && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                                {item.composition} • 1 Strip = {currentBatch.packSize} {currentBatch.packUnit}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={onRemove}
                                className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-100 hover:bg-red-200 rounded flex items-center gap-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                            <button 
                                onClick={onCancel}
                                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded flex items-center gap-1 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                            <button 
                                onClick={commitSave}
                                disabled={!isValid}
                                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 rounded flex items-center gap-1 shadow-sm transition-colors"
                            >
                                <Check className="w-3.5 h-3.5" /> Save [Enter]
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-6">
                        {/* Left Column: Batches */}
                        <div className="w-[45%] border-r border-blue-200 pr-6">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Select Batch</label>
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                                {availableBatches.map(batch => {
                                    const isSelected = batch.id === selectedBatchId;
                                    const batchExpiryStatus = getExpiryStatus(batch.expiryDate);
                                    const isExpired = batchExpiryStatus === 'expired';
                                    return (
                                        <div 
                                            key={batch.id}
                                            onClick={() => !isExpired && setSelectedBatchId(batch.id)}
                                            className={cn(
                                                "p-2 rounded border flex flex-col cursor-pointer transition-all",
                                                isSelected ? "border-blue-500 bg-blue-100 ring-1 ring-blue-500" : "border-slate-200 bg-white hover:border-blue-300",
                                                isExpired ? "opacity-50 cursor-not-allowed bg-slate-50" : ""
                                            )}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-mono font-bold text-slate-800 text-sm">{batch.batchNo}</span>
                                                <span className={cn("text-xs font-bold flex items-center gap-1", isExpired ? "text-red-500" : "text-slate-600")}>
                                                    Exp: {batch.expiryDate ? (typeof batch.expiryDate === 'string' && batch.expiryDate.includes('-') && batch.expiryDate.length > 7 && !isNaN(new Date(batch.expiryDate).getTime()) ? format(new Date(batch.expiryDate), 'MM/yy') : String(batch.expiryDate)) : '—'}
                                                    {batchExpiryStatus === 'expired' && (
                                                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-red-100 text-red-700">Expired</span>
                                                    )}
                                                    {batchExpiryStatus === 'expiring_soon' && (
                                                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-100 text-amber-700">Exp Soon</span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-slate-700">₹{batch.mrp.toFixed(2)}</span>
                                                <span className={cn("font-semibold", batch.qtyStrips > 0 ? "text-emerald-600" : "text-red-500")}>
                                                    {batch.qtyStrips} {batch.packUnit} stock
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Column: Qty & Disocunt */}
                        <div className="flex-1 flex flex-col gap-4">
                            <div className="flex gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                                        Qty (Strips)
                                    </label>
                                    <Input 
                                        ref={qtyInputRef}
                                        type="number" 
                                        min="0"
                                        value={qtyStrips}
                                        onChange={(e) => setQtyStrips(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        className="w-24 border-blue-400 focus-visible:ring-blue-600 font-bold text-center"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Loose
                                    </label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={qtyLoose}
                                        onChange={(e) => setQtyLoose(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        className="w-20 border-slate-300 focus-visible:ring-blue-500 font-bold text-center"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1 gap-2">
                                        <label className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                                            Discount
                                        </label>
                                        <div className="flex bg-blue-100/50 rounded items-center overflow-hidden border border-blue-200">
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setDiscountType('percentage');
                                                    setDiscountValue('0');
                                                }}
                                                className={cn("px-1.5 py-[1px] text-[9px] font-bold transition-colors", discountType === 'percentage' ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-200")}
                                            >
                                                %
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setDiscountType('amount');
                                                    setDiscountValue('0');
                                                }}
                                                className={cn("px-1.5 py-[1px] text-[9px] font-bold transition-colors", discountType === 'amount' ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-200")}
                                            >
                                                ₹
                                            </button>
                                        </div>
                                    </div>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        max={discountType === 'percentage' ? "100" : undefined}
                                        value={discountValue}
                                        onChange={(e) => setDiscountValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        className="w-24 border-blue-400 focus-visible:ring-blue-600 font-bold text-center text-blue-700"
                                    />
                                </div>
                            </div>

                            {/* Profitability Footer */}
                            <div className="mt-auto bg-white p-3 rounded border border-slate-200 flex justify-between items-center shadow-sm">
                                <div className="flex gap-6">
                                    <div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase">Est. Cost</div>
                                        <div className="text-sm font-semibold text-slate-600">₹{totalCost.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase">Margin</div>
                                        <div className={cn("text-sm font-bold", isLowMargin ? "text-amber-600" : "text-emerald-600")}>
                                            ₹{marginAmount.toFixed(2)} ({marginPct.toFixed(1)}%)
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Sell Amount</div>
                                    <div className="text-2xl font-black text-slate-800">
                                        ₹{sellAmount.toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            {isNegativeMargin && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 mt-1">
                                    <AlertTriangle className="w-4 h-4" /> Loss-making sale: selling below cost price.
                                </div>
                            )}
                            {isDiscountInvalid && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 mt-1">
                                    <AlertTriangle className="w-4 h-4" /> Discount must be between 0 and 100%.
                                </div>
                            )}
                            {isQtyZero && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 mt-1">
                                    <AlertTriangle className="w-4 h-4" /> Quantity must be greater than 0.
                                </div>
                            )}
                            {exceedsStock && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1">
                                    <AlertTriangle className="w-4 h-4" /> Warning: Qty exceeds available stock.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    );
}
