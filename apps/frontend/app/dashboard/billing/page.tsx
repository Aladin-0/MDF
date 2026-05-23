'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Keyboard, Loader2, Calculator, AlertTriangle } from 'lucide-react'
import { CalculatorWidget } from '@/components/ui/Calculator'
import { useBillingStore } from '@/store/billingStore'
import { StaffPinEntry } from '@/components/billing/StaffPinEntry'
import { StaffActiveBadge } from '@/components/billing/StaffActiveBadge'
import { ProductSearchBar } from '@/components/billing/ProductSearchBar'
import { AddToCartPanel } from '@/components/billing/AddToCartPanel'
import { BillingCart, MobileCartFAB } from '@/components/billing/BillingCart'
import { BillingEmptyState } from '@/components/billing/BillingEmptyState'
import { CustomerSelector } from '@/components/billing/CustomerSelector'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { ProductSearchResult, ScheduleHData, PaymentSplit, CartItem } from '@/types'
import { ScheduleHModal } from '@/components/billing/ScheduleHModal'
import { PaymentModal } from '@/components/billing/PaymentModal'
import { BillSuccessScreen } from '@/components/billing/BillSuccessScreen'
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal'
import { useSaveBill } from '@/hooks/useSaveBill'
import { useToast } from '@/hooks/use-toast'

export default function BillingPage() {
    const {
        isPinVerified,
        activeStaff,
        cart,
        getTotals,
        customer,
        customerLedger,
        scheduleHData,
        setScheduleHData,
        removeFromCart,
        addToCart,
        lastInvoice,
        setLastInvoice,
        resetBilling,
        billsToday,
        editingSaleId,
        editingReturnInfo,
    } = useBillingStore()

    const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null)
    const [showShortcuts, setShowShortcuts] = useState(false)
    const [showScheduleH, setShowScheduleH] = useState(false)
    const [showPayment, setShowPayment] = useState(false)
    const [showInvoicePreview, setShowInvoicePreview] = useState(false)
    const [showCalc, setShowCalc] = useState(false)

    const desktopSearchRef = useRef<HTMLInputElement>(null)
    const mobileSearchRef = useRef<HTMLInputElement>(null)
    const { saveBill, isLoading } = useSaveBill()
    const { toast } = useToast()

    const handleProductSelect = (product: ProductSearchResult) => {
        setSelectedProduct(product)
    }

    // Extracted proper handler — no more useBillingStore.getState() in JSX
    const handleAddToCart = useCallback((item: CartItem) => {
        addToCart(item)
    }, [addToCart])

    const initiateCheckout = useCallback(() => {
        if (cart.length === 0 || !isPinVerified) return
        const totals = getTotals()
        // Show Schedule H modal for ANY schedule drug (H/H1/X/Narcotic) if not already filled
        if ((totals.requiresDoctorDetails || totals.hasScheduleH) && !scheduleHData) {
            setShowScheduleH(true)
        } else {
            setShowPayment(true)
        }
    }, [cart, isPinVerified, scheduleHData, getTotals])

    useKeyboardShortcuts({
        '/': () => {
            if (window.innerWidth >= 640) {
                desktopSearchRef.current?.focus()
            } else {
                mobileSearchRef.current?.focus()
            }
        },
        'Escape': () => {
            setSelectedProduct(null)
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        },
        'Ctrl+s': initiateCheckout,
        'F2': () => document.getElementById('add-customer-btn')?.click(),
        'F4': () => document.querySelector<HTMLInputElement>('input[type="number"]')?.focus(),
        'Ctrl+z': () => {
            if (cart.length > 0) removeFromCart(cart[cart.length - 1].batchId)
        },
        'Ctrl+Shift+c': () => setShowCalc(prev => !prev),
        '?': () => setShowShortcuts(prev => !prev)
    }, isPinVerified && !showPayment && !showScheduleH && !lastInvoice)

    const handleScheduleHSubmit = (data: Omit<ScheduleHData, 'prescriptionNo'> & { prescriptionNo?: string }) => {
        const fullData: ScheduleHData = {
            ...data,
            prescriptionNo: data.prescriptionNo || ''
        }
        setScheduleHData(fullData)
        setShowScheduleH(false)
        setShowPayment(true)
    }

    const handlePaymentConfirm = async (payment: PaymentSplit) => {
        try {
            await saveBill(payment)
            setShowPayment(false);
        } catch (err: any) {
            const data = err?.response?.data || err?.error || err;
            if (data?.batchId && data?.sale_rate) {
                useBillingStore.getState().setBackendRateError(data.batchId, data.sale_rate);
                setShowPayment(false);
                toast({ variant: 'destructive', title: 'Pricing Error', description: 'Please resolve the pricing errors in your cart before saving.' });
                return;
            }

            const msg = err?.detail ?? err?.error?.message ?? err?.message ?? data?.detail ?? 'Failed to save bill. Please try again.'
            toast({ variant: 'destructive', title: 'Bill save failed', description: msg })
            setShowPayment(true)
        }
    }

    const handleStartNewBill = () => {
        resetBilling()
        setLastInvoice(null)
        setShowInvoicePreview(false)
        setTimeout(() => {
            if (window.innerWidth >= 640) {
                desktopSearchRef.current?.focus()
            } else {
                mobileSearchRef.current?.focus()
            }
        }, 100)
    }

    if (lastInvoice && !showInvoicePreview) {
        return (
            <div className="h-[calc(100vh-4rem)] flex items-center justify-center -m-4 sm:-m-6 bg-slate-50">
                <BillSuccessScreen
                    invoice={lastInvoice}
                    onNewBill={handleStartNewBill}
                    onPrint={() => setShowInvoicePreview(true)}
                    onViewInvoice={() => setShowInvoicePreview(true)}
                />
            </div>
        )
    }

    const totals = getTotals()

    return (
        <>
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden -m-4 sm:-m-6 relative">

            {!isPinVerified && <StaffPinEntry />}

            {/* Save Bill Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-slate-600 font-medium text-sm">Saving bill, please wait...</p>
                </div>
            )}

            {/* Billing Header Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm flex-shrink-0 z-10">
                <div className="flex-1 lg:flex-none mr-4">
                    <StaffActiveBadge />
                </div>

                <div className="flex-1 max-w-2xl mx-auto px-4 hidden sm:block">
                    <ProductSearchBar
                        ref={desktopSearchRef}
                        onProductSelect={handleProductSelect}
                        disabled={!isPinVerified}
                    />
                </div>

                <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground ml-4 shrink-0">
                    <span data-testid="bills-today" className="bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full border border-blue-100">
                        {billsToday} bills today
                    </span>
                    <div className="flex items-center gap-1.5"><kbd className="bg-slate-100 rounded px-1.5 py-0.5 border font-sans">/</kbd> Search</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-slate-100 rounded px-1.5 py-0.5 border font-sans">Ctrl+S</kbd> Save</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-slate-100 rounded px-1.5 py-0.5 border font-sans">Esc</kbd> Clear</div>

                    <CustomerSelector>
                        <button id="add-customer-btn" className="hidden">Trigger</button>
                    </CustomerSelector>
                </div>
            </div>

            {/* Return Warning Banner — shown when editing a sale that has returns */}
            {editingSaleId && editingReturnInfo && (
                <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-3">
                    <div className="flex items-start gap-3 max-w-4xl mx-auto">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-amber-800">
                                ⚠️ This sale has {editingReturnInfo.count} return{editingReturnInfo.count > 1 ? 's' : ''} against it
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5">
                                Total returned: <span className="font-medium">₹{editingReturnInfo.total.toFixed(2)}</span>
                                {editingReturnInfo.summary.length > 0 && (
                                    <span className="ml-2">
                                        ({editingReturnInfo.summary.map(r => r.returnNo).join(', ')})
                                    </span>
                                )}
                                {' '}— Editing may affect return calculations. Proceed carefully.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Search Bar */}
            <div className="sm:hidden p-3 bg-white border-b shrink-0">
                <ProductSearchBar
                    ref={mobileSearchRef}
                    onProductSelect={handleProductSelect}
                    disabled={!isPinVerified}
                />
            </div>

            {/* Main billing area */}
            <div className="flex flex-1 overflow-hidden bg-slate-50 relative">

                {/* Left: Search results + AddToCart panel */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
                    <div className="max-w-3xl mx-auto h-full">
                        {selectedProduct ? (
                            <AddToCartPanel
                                product={selectedProduct}
                                onAdd={handleAddToCart}
                                onClose={() => setSelectedProduct(null)}
                                maxDiscount={activeStaff?.maxDiscount ?? 0}
                            />
                        ) : (
                            <BillingEmptyState isPinVerified={isPinVerified} />
                        )}
                    </div>
                </div>

                {/* Right: Cart panel (desktop only) */}
                <div className="hidden lg:block w-96 shrink-0 bg-white shadow-xl z-10">
                    <BillingCart onProceedToPayment={initiateCheckout} onAddDoctorDetails={() => setShowScheduleH(true)} />
                </div>
            </div>

            {/* Mobile cart FAB */}
            <div className="lg:hidden">
                <MobileCartFAB onProceedToPayment={initiateCheckout} onAddDoctorDetails={() => setShowScheduleH(true)} />
            </div>

            {/* Keyboard Shortcuts Overlay */}
            {showShortcuts && isPinVerified && (
                <div className="fixed bottom-6 left-6 z-50 bg-slate-900/90 text-white text-xs rounded-xl p-5 shadow-2xl backdrop-blur-sm animate-in slide-in-from-bottom border border-slate-700">
                    <div className="flex items-center gap-2 mb-3 font-semibold text-sm border-b border-slate-700 pb-2">
                        <Keyboard className="w-4 h-4" /> Keyboard Shortcuts
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {[
                            ['Search Product', '/'],
                            ['Save Bill', 'Ctrl+S'],
                            ['Cancel/Clear', 'Esc'],
                            ['Select Customer', 'F2'],
                            ['Focus Qty', 'F4'],
                            ['Undo Add', 'Ctrl+Z'],
                            ['Calculator', 'Ctrl+Shift+C'],
                        ].map(([label, key]) => (
                            <div key={key} className="flex justify-between gap-4">
                                <span className="text-slate-400">{label}</span>
                                <kbd className="bg-slate-800 px-1.5 rounded">{key}</kbd>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 text-center text-[10px] text-slate-500">
                        Press <kbd className="bg-slate-800 px-1 rounded">?</kbd> to hide this menu
                    </div>
                </div>
            )}

            {/* Floating Calculator Button */}
            {isPinVerified && (
                <button
                    title="Calculator (Calc)"
                    onClick={() => setShowCalc(true)}
                    className="fixed bottom-6 right-6 lg:right-[calc(24rem+1.5rem)] z-30 w-11 h-11 rounded-full bg-white border border-slate-200 shadow-lg text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:shadow-blue-100 transition-all flex items-center justify-center active:scale-95"
                >
                    <Calculator className="w-5 h-5" />
                </button>
            )}

            <ScheduleHModal
                isOpen={showScheduleH}
                onClose={() => setShowScheduleH(false)}
                onSubmit={handleScheduleHSubmit}
                isMandatory={totals.requiresDoctorDetails}
            />

            <PaymentModal
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                onConfirm={handlePaymentConfirm}
                totals={totals}
                isLoading={isLoading}
                customerLedger={customerLedger}
            />

            <InvoicePreviewModal
                isOpen={showInvoicePreview}
                onClose={() => setShowInvoicePreview(false)}
                invoice={lastInvoice}
                onNewBill={handleStartNewBill}
            />
        </div>

        {/* Global Calculator Overlay */}
        {showCalc && (
            <CalculatorWidget onClose={() => setShowCalc(false)} />
        )}
        </>
    )
}
