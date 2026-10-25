# EXTRACTED BILL EDIT MAPPING & DISCOUNT AUDIT

## 1. Audit Overview & Root Cause Analysis

### The Problem
When loading an existing bill for modification via `/billing?edit=<invoiceId>`, the grand total changes instantly. A flat discount amount is mistakenly loaded or derived into the "Discount Percentage" (`extraDiscountPct`) field in the UI, causing an unintended discount recalculation on the active draft.

---

### Key Architectural Findings

1. **Backend Response Omission (`SaleDetailView`)**:
   In `apps/backend/apps/billing/views.py` (`SaleDetailView`, lines 3097-3107), the backend returns:
   ```python
   'subtotal': float(invoice.subtotal),
   'discountAmount': float(invoice.discount_amount),
   'taxableAmount': float(invoice.taxable_amount),
   'grandTotal': float(invoice.grand_total),
   ```
   **Critically, `SaleDetailView` completely omits `extraDiscountPct: float(invoice.extra_discount_pct)`!**
   Even though the `SaleInvoice` table contains `extra_discount_pct`, the detail endpoint does not serialize it.

2. **Frontend Heuristic in `EditSaleHydrator.tsx`**:
   Because `extraDiscountPct` is missing from `fullInvoice`, `EditSaleHydrator.tsx` executes lines 67-86:
   ```typescript
   const totalDiscountAmount = typeof fullInvoice.discountAmount === 'number' ? fullInvoice.discountAmount : 0;
   const totalRateAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
       const packSize = item.packSize || 1;
       const qtyStrips = item.qtyStrips || 0;
       const qtyLoose = item.qtyLoose || 0;
       const qty = qtyStrips + (qtyLoose / packSize);
       return sum + ((item.rate || item.saleRate || 0) * qty);
   }, 0) || 1;
   const itemDiscountAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
       const packSize = item.packSize || 1;
       const qtyStrips = item.qtyStrips || 0;
       const qtyLoose = item.qtyLoose || 0;
       const qty = qtyStrips + (qtyLoose / packSize);
       return sum + (((item.mrp || 0) - (item.rate || item.saleRate || 0)) * qty);
   }, 0) || 0;

   const extraDiscountAmount = Math.max(0, totalDiscountAmount - itemDiscountAmount);
   const extraDiscountPct = totalRateAmount > 0 ? (extraDiscountAmount / totalRateAmount) * 100 : 0;
   store.setExtraDiscountPct(extraDiscountPct);
   ```

3. **Instant Desync on Cart Recomputation**:
   - `fullInvoice.discountAmount` stores the **total discount in Rupees (₹)**.
   - When `store.setExtraDiscountPct(extraDiscountPct)` is invoked, `billingStore` updates `draft.extraDiscountPct`.
   - `RightBillingRail.tsx` displays this in the Discount `%` input (`value={...extraDiscountPct...}`).
   - `getDraftTotals(draftId)` immediately recomputes:
     ```typescript
     const extraDiscPct = draft.extraDiscountPct || 0;
     const discountFactor = extraDiscPct > 0 ? 1 - extraDiscPct / 100 : 1;
     const smartAllocations = distributeSmartDiscounts(draft.cart, extraDiscPct, ...);
     ```
   - This causes `netPayable`, `taxableAmount`, and `grandTotal` to be recalculated from scratch using the percentage discount factor and smart allocation capping instead of preserving the exact financial invoice figures.

---

## 2. Docker Logs: `GET /api/v1/sales/` Requests

Recent log extractions from `mediflow_backend`:
```text
172.19.0.4 - - [25/Oct/2026:15:54:57 +0530] "GET /api/v1/sales/626d62c8-e8ca-4ddb-9e4b-468ffe2151cb/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 2344 "https://manavatapharma.in/billing?edit=626d62c8-e8ca-4ddb-9e4b-468ffe2151cb"
172.19.0.4 - - [25/Oct/2026:16:05:36 +0530] "GET /api/v1/sales/99a79cff-bc16-4d69-b543-285a28b702ef/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 1346 "https://manavatapharma.in/billing?edit=99a79cff-bc16-4d69-b543-285a28b702ef"
172.19.0.4 - - [25/Oct/2026:16:05:48 +0530] "GET /api/v1/sales/99a79cff-bc16-4d69-b543-285a28b702ef/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 1317 "https://manavatapharma.in/billing?edit=99a79cff-bc16-4d69-b543-285a28b702ef"
172.19.0.4 - - [25/Oct/2026:16:06:07 +0530] "GET /api/v1/sales/626d62c8-e8ca-4ddb-9e4b-468ffe2151cb/?outletId=c8e92121-087b-4c23-9edc-f48bd0ae1b67 HTTP/1.1" 200 2359 "https://manavatapharma.in/billing?edit=626d62c8-e8ca-4ddb-9e4b-468ffe2151cb"
```

Live database inspection for invoice `626d62c8-e8ca-4ddb-9e4b-468ffe2151cb` (`INV-2026-001164`):
```json
{
  "invoiceNo": "INV-2026-001164",
  "subtotal": 743.16,
  "discountAmount": 488.99,
  "taxableAmount": 743.16,
  "cgstAmount": 18.56,
  "sgstAmount": 18.59,
  "roundOff": -0.31,
  "grandTotal": 780.0
}
```
*(Notice: `extraDiscountPct` is missing from `SaleDetailView` response payload)*

---

## 3. RAW CODE: `EditSaleHydrator.tsx`
**File:** `apps/frontend/components/billing/EditSaleHydrator.tsx`

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useBillingStore } from '@/store/billingStore';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export function EditSaleHydrator() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const editId = searchParams.get('edit');
    const hasHydrated = useRef(false);

    useEffect(() => {
        if (!editId || hasHydrated.current) return;
        
        const outlet = useAuthStore.getState().user?.outlet;
        if (!outlet) return;

        hasHydrated.current = true;
        const hydrate = async () => {
            try {
                const res = await api.get(`/sales/${editId}/`, { params: { outletId: outlet.id } });
                const fullInvoice = res.data;

                const store = useBillingStore.getState();
                
                let targetDraftId = store.activeDraftId;
                const currentDraft = targetDraftId ? store.drafts[targetDraftId] : null;

                const hasItems = currentDraft?.cart && currentDraft.cart.length > 0;
                const hasCustomer = !!currentDraft?.customer;
                const hasEditingSale = !!currentDraft?.editingSaleId;
                const isNonEmptyDraft = hasItems || hasCustomer || hasEditingSale;

                if (!targetDraftId || isNonEmptyDraft) {
                    targetDraftId = store.createDraft();
                } else {
                    store.clearCart(targetDraftId);
                }
                store.setLastInvoice(null);
                
                store.setEditingSaleId(editId);
                store.setRevisionContext('paid_bill_correction', '', '');

                if (fullInvoice.invoiceDate) {
                    const d = new Date(fullInvoice.invoiceDate);
                    store.updateDraftHeader(targetDraftId, {
                        invoiceDate: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                    });
                }

                store.setCustomer(fullInvoice.customer || null);
                if (fullInvoice.customer) {
                    store.setCustomerLedger({
                        id: 'mock',
                        name: fullInvoice.customer.name,
                        phone: fullInvoice.customer.phone || '',
                        address: fullInvoice.customer.address || '',
                        groupName: 'Sundry Debtors',
                        currentBalance: 0,
                        isMock: true,
                    } as any);
                }

                const totalDiscountAmount = typeof fullInvoice.discountAmount === 'number' ? fullInvoice.discountAmount : 0;
                const totalRateAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
                    const packSize = item.packSize || 1;
                    const qtyStrips = item.qtyStrips || 0;
                    const qtyLoose = item.qtyLoose || 0;
                    const qty = qtyStrips + (qtyLoose / packSize);
                    return sum + ((item.rate || item.saleRate || 0) * qty);
                }, 0) || 1;
                const itemDiscountAmount = fullInvoice.items?.reduce((sum: number, item: any) => {
                    const packSize = item.packSize || 1;
                    const qtyStrips = item.qtyStrips || 0;
                    const qtyLoose = item.qtyLoose || 0;
                    const qty = qtyStrips + (qtyLoose / packSize);
                    return sum + (((item.mrp || 0) - (item.rate || item.saleRate || 0)) * qty);
                }, 0) || 0;
                
                const extraDiscountAmount = Math.max(0, totalDiscountAmount - itemDiscountAmount);
                const extraDiscountPct = totalRateAmount > 0 ? (extraDiscountAmount / totalRateAmount) * 100 : 0;
                store.setExtraDiscountPct(extraDiscountPct);

                store.setPayment({
                    method: (fullInvoice.paymentMode || 'cash') as any,
                    amount: fullInvoice.amountPaid ?? fullInvoice.grandTotal ?? 0,
                });

                if (fullInvoice.doctorId || fullInvoice.doctorName) {
                    store.setDoctor({
                        id: fullInvoice.doctorId || 'mock',
                        name: fullInvoice.doctorName || 'Unknown Doctor',
                        regNo: fullInvoice.doctorRegNo || '',
                    } as any);
                }
                if (fullInvoice.hospitalName) {
                    store.setHospitalName(fullInvoice.hospitalName);
                }

                if (fullInvoice.scheduleHData) {
                     store.setScheduleHData({
                         patientName: fullInvoice.scheduleHData.patientName || '',
                         patientAge: fullInvoice.scheduleHData.patientAge || 0,
                         patientAddress: fullInvoice.scheduleHData.patientAddress || '',
                         doctorName: fullInvoice.scheduleHData.doctorName || '',
                         doctorRegNo: fullInvoice.scheduleHData.doctorRegNo || '',
                         prescriptionNo: fullInvoice.scheduleHData.prescriptionNo || '',
                     });
                     if (fullInvoice.scheduleHData.prescriptionNo || fullInvoice.prescriptionNo) {
                         store.updateDraftHeader(targetDraftId, { 
                             prescriptionNo: fullInvoice.scheduleHData.prescriptionNo || fullInvoice.prescriptionNo 
                         });
                     }
                } else if (fullInvoice.doctorName || fullInvoice.prescriptionNo) {
                     store.setScheduleHData({
                         patientName: '',
                         patientAge: 0,
                         patientAddress: '',
                         doctorName: fullInvoice.doctorName || '',
                         doctorRegNo: fullInvoice.doctorRegNo || '',
                         prescriptionNo: fullInvoice.prescriptionNo || '',
                     });
                     if (fullInvoice.prescriptionNo) {
                         store.updateDraftHeader(targetDraftId, { prescriptionNo: fullInvoice.prescriptionNo });
                     }
                }

                if (fullInvoice.items) {
                     fullInvoice.items.forEach((item: any) => {
                         const packSize = item.packSize || 1;
                         const qtyStrips = item.qtyStrips || 0;
                         const qtyLoose = item.qtyLoose || 0;
                         const totalQtyFractional = qtyStrips + (qtyLoose / packSize);
                         
                         store.addToCart(targetDraftId, {
                             ...item,
                             qtyStrips: qtyStrips,
                             qtyLoose: qtyLoose,
                             packSize: packSize,
                             productId: item.productId,
                             batchId: item.batchId,
                             batchNo: item.batchNo,
                             expiryDate: item.expiryDate,
                             discountPct: item.discountPct || 0,
                             gstRate: item.gstRate || 0,
                             cgstRate: item.cgstRate || 0,
                             sgstRate: item.sgstRate || 0,
                             saleRate: item.saleRate || item.rate,
                             totalQty: totalQtyFractional,
                             saleMode: item.saleMode || 'mixed',
                             mrp: item.mrp || item.rate,
                             purchaseRate: Number(item.purchaseRate ?? item.purchase_rate ?? 0),
                             landingRate: Number(item.landingRate ?? item.landing_rate ?? item.purchaseRate ?? item.purchase_rate ?? 0),
                             ptr: Number(item.ptr || 0),
                             pts: Number(item.pts || 0),
                         });
                     });
                }
                
                // Clear the URL param without reload
                router.replace('/billing');

            } catch (err) {
                console.error("Hydration failed:", err);
                alert("Failed to load invoice details for editing.");
            }
        };

        hydrate();
    }, [editId, router]);

    return null;
}
```

---

## 4. RAW CODE: Relevant `billingStore.ts` Actions
**File:** `apps/frontend/store/billingStore.ts`

### `setExtraDiscountPct`
```typescript
    setExtraDiscountPct: (pct) => {
        const activeId = get().activeDraftId;
        if (activeId) get().updateDraftHeader(activeId, { extraDiscountPct: Math.max(0, Math.min(100, pct)) });
    },
```

### `setEditingSaleId`
```typescript
    setEditingSaleId: (id) => set((state) => {
        if (!state.activeDraftId) return state;
        const draft = state.drafts[state.activeDraftId];
        return {
            drafts: {
                ...state.drafts,
                [state.activeDraftId]: { ...draft, editingSaleId: id || undefined }
            }
        };
    }),
```

### `updateDraftHeader`
```typescript
    updateDraftHeader: (draftId, updates) => set((state) => {
        const draft = state.drafts[draftId];
        if (!draft) return state;
        return {
            drafts: {
                ...state.drafts,
                [draftId]: { ...draft, ...updates }
            }
        };
    }),
```

### `getDraftTotals` (Discount & Calculation Section)
```typescript
    getDraftTotals: (id) => {
        const state = get();
        const draft = state.drafts[id];
        if (!draft) return {
            subtotal: 0, discountAmount: 0, extraDiscountAmount: 0, preExtraNet: 0, taxableAmount: 0,
            cgstAmount: 0, sgstAmount: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0,
            grandTotal: 0, amountPaid: 0, amountDue: 0, itemCount: 0, totalQty: 0,
            hasScheduleH: false, requiresDoctorDetails: false
        };

        const extraDiscPct = draft.extraDiscountPct || 0;
        const discountFactor = extraDiscPct > 0 ? 1 - extraDiscPct / 100 : 1;
        const smartAllocations = extraDiscPct > 0
            ? distributeSmartDiscounts(draft.cart, extraDiscPct, draft.saleType || 'RETAIL', get().landingCostIncludeGst)
            : null;

        let totalTaxableValue = 0;
        let totalCgst = 0;
        let totalSgst = 0;
        let totalMrp = 0;
        let preExtraNet = 0;   // net after item-level rate discounts, BEFORE bill-level extra discount
        let netPayable = 0;   // net after BOTH item discounts AND extra discount
        let totalQtyCount = 0;
        let hasScheduleH = false;
        let requiresDoctorDetails = false;

        draft.cart.forEach((item, idx) => {
            const effectiveRate = item.rate || (draft.saleType === 'WHOLESALE' ? (item.pts || item.ptr || item.mrp) : item.mrp) || 0;
            const totalQty = item.totalQty || 0;
            totalQtyCount += totalQty;

            const gstDecimal = (item.gstPct ?? item.gstRate ?? 0) / 100;

            let rowPreExtraNet = 0;
            if (draft.saleType === 'WHOLESALE') {
                const rowTaxablePre = totalQty * effectiveRate;
                rowPreExtraNet = rowTaxablePre + rowTaxablePre * gstDecimal;
            } else {
                rowPreExtraNet = totalQty * effectiveRate;
            }
            preExtraNet += rowPreExtraNet;

            let rowNetPayable = 0;
            let rowTaxable = 0;
            let rowTotalGst = 0;

            const key = item.batchId || `item-${idx}`;
            const alloc = smartAllocations?.get(key);

            if (alloc) {
                rowNetPayable = alloc.finalRowAmount;
                rowTaxable = alloc.finalTaxable;
                rowTotalGst = Math.max(0, alloc.finalRowAmount - alloc.finalTaxable);
            } else if (draft.saleType === 'WHOLESALE') {
                rowTaxable = totalQty * effectiveRate * discountFactor;
                rowTotalGst = rowTaxable * gstDecimal;
                rowNetPayable = rowTaxable + rowTotalGst;
            } else {
                rowNetPayable = totalQty * effectiveRate * discountFactor;
                rowTaxable = rowNetPayable / (1 + gstDecimal);
                rowTotalGst = rowNetPayable - rowTaxable;
            }

            netPayable += rowNetPayable;
            totalTaxableValue += rowTaxable;
            totalCgst += (rowTotalGst / 2);
            totalSgst += (rowTotalGst / 2);

            totalMrp += (totalQty * (item.mrp || 0));

            if (['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType)) {
                hasScheduleH = true;
                requiresDoctorDetails = true;
            }
        });

        const itemDiscountAmount = Math.max(0, totalMrp - preExtraNet);
        const extraDiscountAmount = Math.max(0, preExtraNet - netPayable);
        const discountAmount = itemDiscountAmount;

        const exactTotal = totalTaxableValue + totalCgst + totalSgst;
        const grandTotal = draft.saleType === 'WHOLESALE' ? exactTotal : Math.round(exactTotal);
        const roundOff = grandTotal - exactTotal;

        const amountPaid = draft.payment.amount || 0;
        const amountDue = grandTotal - amountPaid;

        return {
            subtotal: totalTaxableValue,
            discountAmount,
            extraDiscountAmount,
            preExtraNet,
            taxableAmount: totalTaxableValue,
            cgstAmount: totalCgst,
            sgstAmount: totalSgst,
            cgst: totalCgst,
            sgst: totalSgst,
            igst: 0,
            roundOff,
            grandTotal,
            amountPaid,
            amountDue,
            itemCount: draft.cart.length,
            totalQty: totalQtyCount,
            hasScheduleH,
            requiresDoctorDetails
        };
    },
```

---

## 5. UI Input Binding in `RightBillingRail.tsx`
**File:** `apps/frontend/components/billing/RightBillingRail.tsx` (lines 173-225)

```tsx
<div className="flex justify-between text-blue-600 items-center">
    <div className="flex items-center gap-2">
        <span>Bill Discount</span>
        <div className="flex items-center gap-1 opacity-90 transition-opacity focus-within:opacity-100 hover:opacity-100">
            {/* Percentage Input */}
            <div className="relative flex items-center">
                <input
                    inputMode="decimal"
                    placeholder="0"
                    value={pctFocused ? pctDraft : (extraDiscountPct === 0 ? '' : String(parseFloat(extraDiscountPct.toFixed(2))))}
                    className="w-14 h-7 text-center text-xs border border-blue-200 rounded px-1 text-blue-700 bg-blue-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 pr-3"
                    onFocus={(e) => {
                        setPctFocused(true);
                        setPctDraft(extraDiscountPct === 0 ? '' : String(extraDiscountPct));
                        e.target.select();
                    }}
                    onChange={(e) => {
                        setPctDraft(e.target.value);
                        commitPct(e.target.value);
                    }}
                    onBlur={() => {
                        setPctFocused(false);
                        commitPct(pctDraft);
                    }}
                />
                <span className="absolute right-1 text-[9px] text-blue-400 pointer-events-none select-none">%</span>
            </div>
            <span className="text-[10px] text-blue-300">|</span>
            {/* Rupee (Flat Amount) Input */}
            <div className="relative flex items-center">
                <span className="absolute left-1 text-[9px] text-blue-400 pointer-events-none select-none">₹</span>
                <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amtFocused ? amtDraft : (totals.extraDiscountAmount === 0 ? '' : totals.extraDiscountAmount.toFixed(2))}
                    className="w-20 h-7 text-center text-xs border border-blue-200 rounded px-1 text-blue-700 bg-blue-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 pl-3"
                    onFocus={(e) => {
                        setAmtFocused(true);
                        setAmtDraft(totals.extraDiscountAmount === 0 ? '' : totals.extraDiscountAmount.toFixed(2));
                        e.target.select();
                    }}
                    onChange={(e) => {
                        setAmtDraft(e.target.value);
                        commitAmt(e.target.value);
                    }}
                    onBlur={() => {
                        setAmtFocused(false);
                        commitAmt(amtDraft);
                    }}
                />
            </div>
        </div>
    </div>
    <span className="font-semibold">- ₹{totals.extraDiscountAmount.toFixed(2)}</span>
</div>
```
