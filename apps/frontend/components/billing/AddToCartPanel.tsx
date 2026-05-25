'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ShoppingCart, X, AlertTriangle, ShieldAlert } from 'lucide-react'
import { ProductSearchResult, CartItem } from '@/types'
import { calculateItemTotals, formatCurrency } from '@/lib/gst'
import { cn, formatQty } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'

// Inline date helpers to avoid external date-fns dependency in Docker
const diffInDays = (dateStr: string) => Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))


interface AddToCartPanelProps {
    product: ProductSearchResult
    onAdd: (item: CartItem) => void
    onClose: () => void
    maxDiscount: number
}

export function AddToCartPanel({ product, onAdd, onClose, maxDiscount }: AddToCartPanelProps) {
    const { user } = useAuthStore()
    const defaultQtyMode = useSettingsStore(s => (s.defaultQuantityMode ?? 'loose')) as 'strip' | 'loose'
    const canViewRates = user?.canViewPurchaseRates ?? false
    const availableBatches = useMemo(() => 
        [...product.batches]
            .filter(b => b.qtyStrips > 0 || b.qtyLoose > 0)
            .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()),
        [product.batches]
    )

    const defaultBatch = availableBatches.length > 0 
        ? [...availableBatches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0]
        : null

    const [selectedBatchId, setSelectedBatchId] = useState<string>(defaultBatch?.id ?? '')

    const [qtyStrips, setQtyStrips] = useState<number | ''>('')
    const [qtyLoose, setQtyLoose] = useState<number | ''>('')

    // Per-sale mode: initialized from the outlet-level setting but toggleable per sale
    const [qtyMode, setQtyMode] = useState<'strip' | 'loose'>(defaultQtyMode)

    // Default discount handling (if product has a default, capped at maxDiscount)
    const [discountPct, setDiscountPct] = useState<number | ''>('')
    const [isDiscountCapped, setIsDiscountCapped] = useState(false)

    const qtyInputRef  = useRef<HTMLInputElement>(null)  // strips input
    const looseInputRef = useRef<HTMLInputElement>(null) // loose input

    // Reset state when product changes; auto-focus based on current mode
    useEffect(() => {
        const fifoBatch = availableBatches.length > 0
            ? [...availableBatches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0]
            : null

        setSelectedBatchId(fifoBatch?.id ?? '')
        setQtyStrips('')
        setQtyLoose('')
        setDiscountPct('')
        setIsDiscountCapped(false)

        // Auto-focus the primary input based on mode
        setTimeout(() => {
            if (qtyMode === 'loose') looseInputRef.current?.focus()
            else qtyInputRef.current?.focus()
        }, 50)
    }, [product, maxDiscount])

    // When mode changes, focus the appropriate input immediately
    useEffect(() => {
        setTimeout(() => {
            if (qtyMode === 'loose') looseInputRef.current?.focus()
            else qtyInputRef.current?.focus()
        }, 30)
    }, [qtyMode])

    const selectedBatch = useMemo(() => 
        availableBatches.find(b => b.id === selectedBatchId), [availableBatches, selectedBatchId])

    // Always use the batch's own packaging config (frozen at purchase time).
    // Never fall back to product.packSize — that changes when the master item is edited.
    const activePackSize = selectedBatch?.packSize ?? 1;
    const activePackUnit = selectedBatch?.packUnit ?? 'tablet';

    const handleDiscountChange = (val: string) => {
        if (val === '') {
            setDiscountPct('')
            setIsDiscountCapped(false)
            return
        }
        let num = parseFloat(val)
        if (isNaN(num)) return
        if (num > maxDiscount) {
            setDiscountPct(maxDiscount)
            setIsDiscountCapped(true)
        } else {
            setDiscountPct(num)
            setIsDiscountCapped(false)
        }
    }

    const totalQty = useMemo(() => {
        if (!selectedBatch) return 0
        return (qtyStrips || 0) + ((qtyLoose || 0) / activePackSize)
    }, [qtyStrips, qtyLoose, activePackSize, selectedBatch])

    // FIX: batch.saleRate is ALWAYS stored per-strip in the DB.
    // batch.mrp may be per-strip OR per-pack depending on how GRN was entered.
    // We use saleRate as the billing base (reliable per-strip).
    // For MRP cap: if mrp >> saleRate*packSize it must be per-pack → normalize.
    const billingRate = useMemo(() => {
        if (!selectedBatch) return 0
        // saleRate is per-strip; apply discount on top
        return selectedBatch.saleRate
    }, [selectedBatch])

    // Normalized per-strip MRP for display/validation cap
    const perStripMrp = useMemo(() => {
        if (!selectedBatch || activePackSize <= 0) return billingRate
        const { mrp, saleRate } = selectedBatch
        // If mrp looks like a per-pack MRP (much larger than per-strip saleRate),
        // divide by packSize to get per-strip MRP.
        // Otherwise treat mrp as already per-strip.
        const looksLikePackMrp = mrp > saleRate * activePackSize * 0.6
        return looksLikePackMrp ? mrp / activePackSize : mrp
    }, [selectedBatch, activePackSize, billingRate])

    const { taxableAmount, gstAmount, totalAmount } = useMemo(() => {
        if (!selectedBatch) return { taxableAmount: 0, gstAmount: 0, totalAmount: 0 }
        // billingRate = per-strip saleRate; totalQty = number of strips
        return calculateItemTotals(
            perStripMrp,   // MRP cap per strip (for validation)
            billingRate,   // actual per-strip selling rate
            totalQty,
            discountPct || 0,
            product.gstRate
        )
    }, [selectedBatch, perStripMrp, billingRate, totalQty, discountPct, product.gstRate])

    const discountAmount = useMemo(() => {
        if (!selectedBatch) return 0
        return (perStripMrp * totalQty) - totalAmount
    }, [selectedBatch, perStripMrp, totalQty, totalAmount])

    const isOutOfStock = !selectedBatch || (selectedBatch.qtyStrips === 0 && selectedBatch.qtyLoose === 0)

    // ── Stock sufficiency check ──
    // Convert everything to loose units for a single comparison
    const availableTotalLoose = selectedBatch
        ? (selectedBatch.qtyStrips * activePackSize) + selectedBatch.qtyLoose
        : 0
    const requestedTotalLoose = ((qtyStrips || 0) * activePackSize) + (qtyLoose || 0)
    const isInsufficientStock = requestedTotalLoose > 0 && requestedTotalLoose > availableTotalLoose
    const stockShortByLoose   = isInsufficientStock ? requestedTotalLoose - availableTotalLoose : 0
    // Express shortfall in human-friendly strips + loose
    const shortStrips = Math.floor(stockShortByLoose / activePackSize)
    const shortLoose  = stockShortByLoose % activePackSize

    const handleAdd = () => {
        if (isOutOfStock || isInsufficientStock || !selectedBatch || totalQty <= 0) return

        const item: CartItem = {
            productId: product.id,
            batchId: selectedBatch.id,
            name: product.name,
            composition: product.composition,
            packSize: activePackSize,
            packUnit: activePackUnit,
            batchNo: selectedBatch.batchNo,
            expiryDate: selectedBatch.expiryDate,
            // mrp = per-strip MRP (for subtotal display and validation)
            // rate = effective per-strip selling price after discount
            // saleRate = per-strip base for discount recalculation in cart
            mrp: perStripMrp,
            rate: billingRate * (1 - (discountPct || 0) / 100),
            saleRate: billingRate,
            gstRate: product.gstRate,
            qtyStrips: (qtyStrips || 0),
            qtyLoose: (qtyLoose || 0),
            totalQty: totalQty,
            saleMode: 'mixed',
            discountPct: discountPct || 0,
            taxableAmount: taxableAmount,
            gstAmount: gstAmount,
            totalAmount: totalAmount,
            scheduleType: product.scheduleType,
            requiresPrescription: ['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(product.scheduleType),
            purchaseRate: selectedBatch.purchaseRate,
        }

        onAdd(item)
        onClose()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    if (!selectedBatch) return null

    const isLooseAllowed = 
    ['tablet', 'capsule', 'unit', 'piece', 'drop'].includes(activePackUnit?.toLowerCase().trim() || '') || 
    (activePackSize && activePackSize > 1);
    
    // Progress bar for discount
    const discountProgressPercentage = maxDiscount > 0 ? ((discountPct || 0) / maxDiscount) * 100 : 0
    const progressColor = discountProgressPercentage > 90 ? 'bg-red-500' : discountProgressPercentage > 60 ? 'bg-amber-500' : 'bg-green-500'

    return (
        <div 
            className="bg-white border border-slate-200 rounded-xl shadow-lg p-5 mt-3 animate-in slide-in-from-bottom-4"
            onKeyDown={handleKeyDown}
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">{product.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{product.composition}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-slate-500">{product.manufacturer}</span>
                        {product.scheduleType !== 'OTC' && (
                            <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                                ['H1', 'X', 'Narcotic'].includes(product.scheduleType) ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"
                            )}>
                                Sch {product.scheduleType}
                            </span>
                        )}
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Batch Selector */}
            <div className="mb-4">
                <label className="text-sm font-medium text-slate-700 mb-2 block">Select Batch</label>
                {availableBatches.length === 0 ? (
                    <div className="p-4 bg-amber-50 text-amber-800 text-sm border border-amber-200 rounded-lg">
                        No stock available for this product.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {availableBatches.map(batch => {
                            const daysToExpiry = diffInDays(batch.expiryDate)
                            const isExpiringSoon = daysToExpiry < 90
                            
                            return (
                                <label 
                                    key={batch.id} 
                                    className={cn(
                                        "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors text-sm",
                                        selectedBatchId === batch.id ? "bg-primary/5 border-primary" : "hover:bg-slate-50 border-slate-200"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="radio" 
                                            name="batch" 
                                            value={batch.id}
                                            checked={selectedBatchId === batch.id}
                                            onChange={() => setSelectedBatchId(batch.id)}
                                            className="text-primary focus:ring-primary h-4 w-4"
                                        />
                                        <div>
                                            <div className="font-medium">{batch.batchNo}</div>
                                            <div className={cn("text-xs mt-0.5", isExpiringSoon ? "text-red-600 font-medium" : "text-muted-foreground")}>
                                                Exp: {new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-semibold text-slate-900">
                                            {formatCurrency(batch.saleRate)}
                                            <span className="text-[10px] text-muted-foreground font-normal ml-0.5">/ strip</span>
                                        </div>
                                        {canViewRates && batch.mrp > 0 && (
                                            <div className="text-[10px] text-slate-400">MRP: {formatCurrency(batch.mrp)}</div>
                                        )}
                                        <div className="text-xs font-medium text-slate-600 mt-0.5">
                                            Stk: <span className={batch.qtyStrips > 0 ? "text-emerald-600" : "text-red-400"}>{batch.qtyStrips}S</span> / <span className={batch.qtyLoose > 0 ? "text-emerald-600" : "text-slate-400"}>{batch.qtyLoose}L</span>
                                        </div>
                                    </div>
                                </label>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Quantity */}
                <div>
                    {/* Label + mode toggle */}
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Quantity</label>
                        {isLooseAllowed && (
                            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                                <button
                                    type="button"
                                    onClick={() => setQtyMode('strip')}
                                    className={cn(
                                        'px-2.5 py-1 transition-colors',
                                        qtyMode === 'strip'
                                            ? 'bg-primary text-white'
                                            : 'text-slate-500 hover:bg-slate-50'
                                    )}
                                >
                                    Strips
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setQtyMode('loose')}
                                    className={cn(
                                        'px-2.5 py-1 transition-colors',
                                        qtyMode === 'loose'
                                            ? 'bg-primary text-white'
                                            : 'text-slate-500 hover:bg-slate-50'
                                    )}
                                >
                                    Loose
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Inputs */}
                    <div className="flex gap-3">
                        {/* Strips input — always shown */}
                        <div className={cn('flex-1', qtyMode === 'loose' && isLooseAllowed && 'order-2')}>
                            <input
                                ref={qtyInputRef}
                                type="number"
                                min={0}
                                step={1}
                                placeholder="Strips"
                                value={qtyStrips}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') setQtyStrips('');
                                    else setQtyStrips(Math.max(0, parseInt(val) || 0));
                                }}
                                className={cn(
                                    'w-full h-10 px-3 border rounded-lg focus:outline-none focus:ring-1 text-sm',
                                    qtyMode === 'strip'
                                        ? 'border-primary focus:border-primary focus:ring-primary'
                                        : 'border-slate-200 focus:border-slate-400 focus:ring-slate-300 text-slate-500'
                                )}
                            />
                        </div>

                        {/* Loose tablets input — shown when allowed */}
                        {isLooseAllowed && (
                            <div className={cn('flex-1', qtyMode === 'loose' && 'order-1')}>
                                <input
                                    ref={looseInputRef}
                                    type="number"
                                    min={0}
                                    step={1}
                                    placeholder={`Loose ${activePackUnit}s`}
                                    value={qtyLoose}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') setQtyLoose('');
                                        else setQtyLoose(Math.max(0, parseInt(val) || 0));
                                    }}
                                    className={cn(
                                        'w-full h-10 px-3 border rounded-lg focus:outline-none focus:ring-1 text-sm',
                                        qtyMode === 'loose'
                                            ? 'border-primary focus:border-primary focus:ring-primary'
                                            : 'border-slate-300 focus:border-slate-400 focus:ring-slate-300'
                                    )}
                                />
                            </div>
                        )}
                    </div>

                    {/* Interpretation line */}
                    {isLooseAllowed && ((qtyStrips || 0) > 0 || (qtyLoose || 0) > 0) && (
                        <p className="text-xs font-medium text-indigo-600 mt-1.5">
                            Interpreted as: {formatQty(qtyStrips || 0, qtyLoose || 0, activePackSize)}
                        </p>
                    )}

                    {/* ── Insufficient Stock Warning ── */}
                    {isInsufficientStock && selectedBatch && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                                <span className="text-sm font-semibold text-red-700">Insufficient stock in this batch</span>
                            </div>
                            <div className="text-xs text-red-600 space-y-0.5 pl-6">
                                <div>
                                    <span className="font-medium">Available:</span>{' '}
                                    {selectedBatch.qtyStrips}S + {selectedBatch.qtyLoose}L
                                    <span className="text-red-400 ml-1">({availableTotalLoose} {activePackUnit}s total)</span>
                                </div>
                                <div>
                                    <span className="font-medium">Requested:</span>{' '}
                                    {requestedTotalLoose} {activePackUnit}s
                                </div>
                                <div className="font-semibold text-red-700 mt-0.5">
                                    Short by:{' '}
                                    {shortStrips > 0 && shortLoose > 0
                                        ? `${shortStrips} strip${shortStrips > 1 ? 's' : ''} + ${shortLoose} ${activePackUnit}${shortLoose > 1 ? 's' : ''}`
                                        : shortStrips > 0
                                        ? `${shortStrips} strip${shortStrips > 1 ? 's' : ''}`
                                        : `${stockShortByLoose} ${activePackUnit}${stockShortByLoose > 1 ? 's' : ''}`
                                    }
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Discount */}
                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Discount %</label>
                        <span className="text-xs text-slate-500">Max: {maxDiscount}%</span>
                    </div>
                    <input
                        data-testid="discount-0"
                        type="number"
                        min={0}
                        max={maxDiscount}
                        step={0.5}
                        value={discountPct}
                        onChange={(e) => handleDiscountChange(e.target.value)}
                        className={cn(
                            "w-full h-10 px-3 border rounded-lg focus:outline-none focus:ring-1 text-sm transition-colors",
                            isDiscountCapped ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500" : "border-slate-300 focus:border-primary focus:ring-primary"
                        )}
                    />
                    
                    {isDiscountCapped && (
                        <p className="text-xs text-amber-600 mt-1.5 font-medium animate-in fade-in">
                            Capped at {maxDiscount}% for your role
                        </p>
                    )}
                    
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                        <div 
                            className={cn("h-full transition-all duration-300", progressColor)} 
                            style={{ width: `${discountProgressPercentage}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Live Totals Box */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-4">
                <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-600">
                        <span>MRP ({totalQty.toFixed(2)} × {formatCurrency(perStripMrp)})</span>
                        <span>{formatCurrency(perStripMrp * totalQty)}</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between text-red-500">
                            <span>Discount ({discountPct}%)</span>
                            <span>-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-slate-500 text-xs mt-1 pt-1 border-t border-slate-200">
                        <span>Taxable</span>
                        <span>{formatCurrency(taxableAmount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-xs pb-1">
                        <span>GST ({product.gstRate}%)</span>
                        <span>+{formatCurrency(gstAmount)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                        <span>Total Amount</span>
                        <span>{formatCurrency(totalAmount)}</span>
                    </div>
                    {canViewRates && (
                        <>
                            <div className="pt-2 mt-1 border-t border-dashed border-slate-200" />
                            <div className="flex justify-between text-slate-500 text-xs">
                                <span>Purchase Rate</span>
                                <span>{formatCurrency(selectedBatch.purchaseRate)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-600 text-xs font-medium">
                                <span>Margin</span>
                                <span>
                                    {formatCurrency(selectedBatch.saleRate - selectedBatch.purchaseRate)}
                                    {selectedBatch.purchaseRate > 0 && (
                                        <span className="ml-1 text-emerald-500">
                                            ({(((selectedBatch.saleRate - selectedBatch.purchaseRate) / selectedBatch.purchaseRate) * 100).toFixed(1)}%)
                                        </span>
                                    )}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Alerts */}
            {['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(product.scheduleType) && (
                <div className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border mb-4 text-sm animate-in fade-in",
                    ['H1', 'X', 'C', 'Narcotic'].includes(product.scheduleType) ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                )}>
                    {['H1', 'X', 'C', 'Narcotic'].includes(product.scheduleType) ? (
                        <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                        <div className="font-semibold">Schedule {product.scheduleType} Drug</div>
                        <div className="text-xs opacity-90 mt-0.5">
                            {['H1', 'X', 'C', 'Narcotic'].includes(product.scheduleType)
                                ? "Doctor details MUST be provided before saving bill"
                                : "Prescription required at dispensing"}
                        </div>
                    </div>
                </div>
            )}

            {/* Submit Button */}
            <button
                data-testid="add-to-cart-btn"
                onClick={handleAdd}
                disabled={isOutOfStock || isInsufficientStock || totalQty <= 0}
                className={cn(
                    "w-full h-12 flex items-center justify-center gap-2 font-semibold rounded-xl text-base transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
                    isInsufficientStock
                        ? "bg-red-100 text-red-500 border border-red-300 disabled:opacity-100"
                        : "bg-primary text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-primary"
                )}
            >
                <ShoppingCart className="w-5 h-5" />
                {isOutOfStock
                    ? "Out of Stock"
                    : isInsufficientStock
                    ? "Stock too low — reduce quantity"
                    : `Add ${formatCurrency(totalAmount)} to Cart`}
            </button>
        </div>
    )
}
