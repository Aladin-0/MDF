import { bankersRound } from './mathUtils';
import { distributeSmartDiscounts } from '../lib/billingMarginUtils';
import { useBillingStore } from '../store/billingStore';

export function buildScheduleHPayload(customer: any, doctor: any, draft: any): any {
    if (draft?.scheduleHData) {
        return draft.scheduleHData;
    }

    if (customer && doctor && customer.id !== 'mock' && doctor.id !== 'mock') {
        let defaultPatientAge = 1;
        if (customer.dob) {
            const dobDate = new Date(customer.dob);
            if (!isNaN(dobDate.getTime())) {
                const ageDiffMs = Date.now() - dobDate.getTime();
                const ageDate = new Date(ageDiffMs);
                defaultPatientAge = Math.max(1, Math.abs(ageDate.getUTCFullYear() - 1970));
            }
        }
        
        return {
            patientName: customer.name || '',
            patientAge: defaultPatientAge,
            patientAddress: customer.address || '',
            doctorName: doctor.name || '',
            doctorRegNo: doctor.regNo || '',
            prescriptionNo: draft?.prescriptionNo || '',
        };
    }

    return undefined;
}

export function buildSalePayload(draft: any, scheduleHData: any, totals: any, activeStaff: any, resolvedOutletId: string): any {
    const customer = draft.customer;
    const customerLedger = draft.customerLedger;
    const doctor = draft.doctor;
    const cart = draft.cart;
    const extraDiscountPct = draft.extraDiscountPct || 0;

    const partyLedgerId = (customerLedger && customerLedger.id !== 'mock' && !customerLedger.isMock) ? customerLedger.id : undefined;
    const customerId = (customer && customer.id !== 'mock') ? customer.id : undefined;

    let invoiceDateIso;
    if (draft.invoiceDate) {
        const parsed = new Date(draft.invoiceDate);
        if (!isNaN(parsed.getTime())) {
            invoiceDateIso = parsed.toISOString();
        }
    }

    const getPaid = (method: string) => {
        if (draft.payment.method === method) return draft.payment.amount || totals.grandTotal;
        if (draft.payment.method === 'split') {
            return draft.payment.splitBreakdown?.[method] || 0;
        }
        return 0;
    };

    const outletState = activeStaff?.outlet?.state || activeStaff?.outlet?.stateCode || '';
    const customerState = customerLedger?.state || customerLedger?.stateCode || customer?.state || customer?.stateCode || '';
    const isInterstate = customerState ? customerState.toLowerCase() !== outletState.toLowerCase() : false;

    let finalCgst = totals.cgstAmount;
    let finalSgst = totals.sgstAmount;
    let finalIgst = 0;

    if (isInterstate) {
        finalIgst = totals.cgstAmount + totals.sgstAmount;
        finalCgst = 0;
        finalSgst = 0;
    }

    const landingCostIncludeGst = useBillingStore.getState().landingCostIncludeGst;
    const smartAllocations = distributeSmartDiscounts(cart, extraDiscountPct, draft.saleType || 'RETAIL', landingCostIncludeGst);

    return {
        outletId: resolvedOutletId,
        invoiceDate: invoiceDateIso,
        partyLedgerId,
        customerId,
        doctorId: (doctor && doctor.id !== 'mock') ? doctor.id : undefined,
        doctorName: doctor?.name,
        hospitalName: draft.hospitalName,
        prescriptionNo: draft.prescriptionNo,
        billedBy: activeStaff?.id,
        saleType: draft.saleType || 'RETAIL',
        billingBasis: draft.billingBasis || 'MRP',
        transporterId: draft.transporterId,
        vehicleNo: draft.vehicleNo,
        transDistance: Number(draft.transDistance) || 0,
        transMode: Number(draft.transMode) || 1,
        vehicleType: draft.vehicleType || "R",
        items: cart.map((item: any, idx: number) => {
            const rawTotal = item.rate * item.totalQty;
            const gstRate = item.gstPct ?? item.gstRate ?? 0;
            const discountFactor = extraDiscountPct > 0 ? 1 - extraDiscountPct / 100 : 1;
            const key = item.batchId || `item-${idx}`;
            const alloc = smartAllocations.get(key);
            const discountedTotal = alloc ? alloc.finalRowAmount : (rawTotal * discountFactor);
            const taxable = alloc ? alloc.finalTaxable : (gstRate > 0
                ? bankersRound(discountedTotal / (1 + gstRate / 100))
                : bankersRound(discountedTotal));
            const gst = bankersRound(discountedTotal - taxable);
            return {
                batchId: item.batchId,
                name: item.name,
                batchNo: item.batchNo,
                expiryDate: item.expiryDate,
                productId: item.productId,
                qtyStrips: item.qtyStrips,
                qtyLoose: item.qtyLoose,
                freeQtyStrips: item.freeQtyStrips || 0,
                freeQtyLoose: item.freeQtyLoose || 0,
                saleMode: item.saleMode,
                mrp: item.mrp || 0,
                applied_ptr: item.ptr,
                applied_pts: item.pts,
                packSize: item.packSize || 1,
                rate: item.rate,
                discountPct: item.discountPct,
                gstRate: gstRate,
                scheduleType: item.scheduleType || 'OTC',
                taxableAmount: taxable,
                gstAmount: gst,
                totalAmount: bankersRound(discountedTotal),
            };
        }),
        subtotal: bankersRound(totals.subtotal),
        discountAmount: bankersRound(totals.discountAmount + totals.extraDiscountAmount),
        taxableAmount: bankersRound(totals.taxableAmount),
        cgstAmount: bankersRound(finalCgst),
        sgstAmount: bankersRound(finalSgst),
        igstAmount: bankersRound(finalIgst),
        cgst: bankersRound(finalCgst),
        sgst: bankersRound(finalSgst),
        igst: bankersRound(finalIgst),
        roundOff: bankersRound(totals.roundOff),
        grandTotal: bankersRound(totals.grandTotal),
        extraDiscountPct,
        paymentMode: draft.payment.method,
        cashPaid: draft.payment.method === 'cash' ? (draft.payment.cashTendered || totals.grandTotal) : getPaid('cash'),
        upiPaid: getPaid('upi'),
        cardPaid: getPaid('card'),
        creditGiven: getPaid('credit'),
        payments: draft.payment.method === 'split' ? [
            ...(getPaid('cash') > 0 ? [{ method: 'cash', amount: getPaid('cash') }] : []),
            ...(getPaid('upi') > 0 ? [{ method: 'upi', amount: getPaid('upi') }] : []),
            ...(getPaid('card') > 0 ? [{ method: 'card', amount: getPaid('card') }] : []),
            ...(getPaid('credit') > 0 ? [{ method: 'credit', amount: getPaid('credit') }] : []),
        ] : [
            { method: draft.payment.method, amount: totals.grandTotal }
        ],
        scheduleHData,
        revisionAction: draft.revisionAction,
        revisionReasonCode: draft.revisionReasonCode,
        revisionReasonText: draft.revisionReasonText,
        quotationId: draft.quotationId,
    };
}

export function normalizeExpiryDate(exp?: string): string {
    if (!exp) return '';
    const raw = exp.trim();
    // MM/YY e.g. 12/26 or 12-26
    const mShort = raw.match(/^(\d{1,2})[/\-](\d{2})$/);
    if (mShort) {
        const m = parseInt(mShort[1], 10);
        const y = parseInt(mShort[2], 10) + 2000;
        if (m >= 1 && m <= 12) {
            return `${y}-${String(m).padStart(2, '0')}-01`;
        }
    }
    // MM/YYYY e.g. 12/2026 or 12-2026
    const mLong = raw.match(/^(\d{1,2})[/\-](\d{4})$/);
    if (mLong) {
        const m = parseInt(mLong[1], 10);
        const y = parseInt(mLong[2], 10);
        if (m >= 1 && m <= 12) {
            return `${y}-${String(m).padStart(2, '0')}-01`;
        }
    }
    // YYYY-MM
    const mIso = raw.match(/^(\d{4})-(\d{1,2})$/);
    if (mIso) {
        return `${mIso[1]}-${mIso[2].padStart(2, '0')}-01`;
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }
    return raw;
}

export function buildPurchasePayload(
    formState: any,
    items: any[],
    outletId: string,
    goodsValue: number,
    totalTradeDisc: number,
    totalCashDisc: number,
    taxableValue: number,
    totalGST: number,
    totalCess: number,
    roundOff: number,
    effectiveAdjustment: number,
    ledgerNote: string,
    netPayable: number,
    revisionReasonCode?: string,
    revisionReasonText?: string
): any {
    let invoiceDate = formState.invoiceDate;
    if (invoiceDate) {
        const parts = invoiceDate.split('-');
        if (parts.length === 3) {
            let yr = parseInt(parts[0], 10);
            const currentYr = new Date().getFullYear();
            if (yr >= 20 && yr < 100) {
                yr = 2000 + yr;
                invoiceDate = `${yr}-${parts[1]}-${parts[2]}`;
            } else if (yr < 2000 || yr > currentYr + 1) {
                invoiceDate = `${currentYr}-${parts[1]}-${parts[2]}`;
            }
        }
    }

    const payload: any = {
        outletId,
        partyLedgerId:    formState.partyLedgerId,
        purchaseType:     formState.purchaseType,
        invoiceNo:        formState.invoiceNo,
        invoiceDate:      invoiceDate,
        dueDate:          formState.purchaseType === 'credit' ? formState.dueDate : undefined,
        purchaseOrderRef: formState.purchaseOrderRef,
        godown:           formState.godown,
        freight:          formState.freight || 0,
        notes:            formState.notes,
        subtotal:         parseFloat(goodsValue.toFixed(2)),
        discountAmount:   parseFloat((totalTradeDisc + totalCashDisc).toFixed(2)),
        invoiceDiscount:  parseFloat((Number(formState.invoiceDiscount) || 0).toFixed(2)),
        taxableAmount:    parseFloat(taxableValue.toFixed(2)),
        gstAmount:        parseFloat(totalGST.toFixed(2)),
        cessAmount:       parseFloat(totalCess.toFixed(2)),
        roundOff:         parseFloat(roundOff.toFixed(2)),
        ledgerAdjustment: parseFloat(effectiveAdjustment.toFixed(2)),
        ledgerNote:       ledgerNote || undefined,
        grandTotal:       parseFloat(netPayable.toFixed(2)),
        items: items.map((it) => {
            const effPkg     = typeof it.pkg === 'number' && it.pkg > 0 ? it.pkg : 1;
            const effQty     = it.qty * effPkg;
            const base       = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
            
            const preInvoiceDiscountBaseTotal = goodsValue - totalTradeDisc - totalCashDisc;
            const invoiceDiscount = formState.invoiceDiscount || 0;
            const invoiceDiscountPct = preInvoiceDiscountBaseTotal > 0 ? (invoiceDiscount / preInvoiceDiscountBaseTotal) : 0;
            
            const baseAfterInvoiceDisc = base * (1 - invoiceDiscountPct);
            
            const gstAmount  = baseAfterInvoiceDisc * (it.gstRate / 100);
            const cessAmount = baseAfterInvoiceDisc * (it.cess / 100);
            const baseLandingRate = (it.qty + it.freeQty) > 0 ? parseFloat((base / (it.qty + it.freeQty)).toFixed(2)) : 0;
            
            return {
                masterProductId:   it.isCustom ? null : it.productId,
                customProductName: it.isCustom ? it.productName : null,
                isCustomProduct:   it.isCustom ?? false,
                hsnCode:         it.hsnCode,
                batchNo:         it.batchNo,
                expiryDate:      normalizeExpiryDate(it.expiryDate) || it.expiryDate,
                pkg:             effPkg,
                qty:             it.qty,
                actualQty:       (it.qty + it.freeQty) * effPkg,
                freeQty:         it.freeQty,
                purchaseRate:    it.purchaseRate,
                baseLandingRate: baseLandingRate,
                freightPerUnit:  it.freightPerUnit,
                otherCostPerUnit: it.otherCostPerUnit,
                discountPct:     it.discountPct,
                cashDiscountPct: it.cashDiscountPct,
                gstRate:         it.gstRate,
                cess:            it.cess,
                mrp:             it.mrp,
                ptr:             it.ptr,
                pts:             it.pts,
                saleRate:        it.saleRate || it.mrp,
                taxableAmount:   parseFloat(base.toFixed(2)),
                gstAmount:       parseFloat(gstAmount.toFixed(2)),
                cessAmount:      parseFloat(cessAmount.toFixed(2)),
                totalAmount:     parseFloat((base + gstAmount + cessAmount).toFixed(2)),
            };
        }),
    };
    
    if (revisionReasonCode && revisionReasonText) {
        payload.revisionReasonCode = revisionReasonCode;
        payload.revisionReasonText = revisionReasonText;
    }
    
    return payload;
}

export function buildReturnPayload(
    returnData: any,
    items: any[],
    reason: string,
    refundMode: string,
    revisionReasonCode: string,
    revisionReasonText: string,
    outletId: string
): any {
    return {
        outletId,
        reason,
        refundMode,
        revisionReasonCode,
        revisionReasonText,
        expectedUpdatedAt: returnData.updatedAt,
        items: items.map((item) => ({
            originalSaleItemId: item.originalSaleItemId,
            batchId: item.batchId,
            productName: item.productName,
            qtyReturned: item.qtyReturned,
            qtyStripsReturned: Math.floor(item.qtyReturned / (item.packSize || 1)),
            qtyLooseReturned: item.qtyReturned % (item.packSize || 1),
            returnRate: item.returnRate,
            totalAmount: item.qtyReturned * item.returnRate,
        })),
    };
}

export function buildVoucherPayload(
    voucherType: string,
    date: string,
    narration: string,
    outletId: string,
    partyLedger: any,
    cashBankLedger: any,
    totalAmount: number,
    pendingBills: any[],
    billAmounts: any,
    contraDebitLedger: any,
    contraCreditLedger: any,
    contraAmount: number,
    lines: any[],
    voucherId?: string,
    originalStatus?: string,
    reasonCode?: string,
    reasonText?: string
): any {
    const payload: any = { outletId, voucher_type: voucherType, date, narration };

    const hasDynamicLines = Array.isArray(lines) && lines.length > 0 && lines.some(l => l.ledger || l.ledger_id);

    if (hasDynamicLines) {
        const validLines = lines.filter(l => l.ledger || l.ledger_id);
        const td = validLines.reduce((s, l) => {
            const side = l.side || (parseFloat(String(l.debit)) > 0 ? 'debit' : 'credit');
            const amt = parseFloat(String(l.amount ?? (side === 'debit' ? l.debit : 0))) || (parseFloat(String(l.debit)) || 0);
            return side === 'debit' ? s + amt : s;
        }, 0);

        payload.total_amount = td || totalAmount;
        payload.payment_mode = cashBankLedger?.groupName === 'Bank Accounts' ? 'bank' : 'cash';
        payload.lines = validLines.map(l => {
            const hasSide = l.side !== undefined;
            const side = l.side || (parseFloat(String(l.debit)) > 0 ? 'debit' : 'credit');
            const amt = parseFloat(String(l.amount ?? (side === 'debit' ? l.debit : l.credit))) || 0;
            const res: any = {
                ledger_id: l.ledger?.id || l.ledger_id,
                debit: side === 'debit' ? amt : (parseFloat(String(l.debit)) || 0),
                credit: side === 'credit' ? amt : (parseFloat(String(l.credit)) || 0),
                description: l.description || '',
            };
            if (hasSide) {
                res.side = side;
                res.amount = amt;
            }
            return res;
        });

        if (pendingBills && pendingBills.length > 0 && billAmounts) {
            payload.bill_adjustments = pendingBills
                .filter(b => (parseFloat(billAmounts[b.id]) || 0) > 0)
                .map(b => ({
                    invoice_id: b.id,
                    invoice_type: b.invoiceType,
                    adjusted_amount: parseFloat(billAmounts[b.id]) || 0,
                }));
        }
    } else if (voucherType === 'receipt' || voucherType === 'payment') {
        payload.total_amount = totalAmount;
        payload.payment_mode = cashBankLedger?.groupName === 'Bank Accounts' ? 'bank' : 'cash';

        if (voucherType === 'payment') {
            payload.lines = [
                { ledger_id: partyLedger?.id, debit: totalAmount, credit: 0, description: '' },
                { ledger_id: cashBankLedger?.id, debit: 0, credit: totalAmount, description: '' },
            ];
        } else {
            payload.lines = [
                { ledger_id: cashBankLedger?.id, debit: totalAmount, credit: 0, description: '' },
                { ledger_id: partyLedger?.id, debit: 0, credit: totalAmount, description: '' },
            ];
        }

        payload.bill_adjustments = pendingBills
            .filter(b => (parseFloat(billAmounts[b.id]) || 0) > 0)
            .map(b => ({
                invoice_id: b.id,
                invoice_type: b.invoiceType,
                adjusted_amount: parseFloat(billAmounts[b.id]) || 0,
            }));

    } else if (voucherType === 'contra') {
        const amt = parseFloat(contraAmount.toString()) || 0;
        payload.total_amount = amt;
        payload.payment_mode = 'cash';
        payload.lines = [
            { ledger_id: contraDebitLedger?.id, debit: amt, credit: 0, description: '' },
            { ledger_id: contraCreditLedger?.id, debit: 0, credit: amt, description: '' },
        ];
    } else {
        const validLines = lines.filter(l => l.ledger);
        const td = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
        payload.total_amount = td;
        payload.payment_mode = 'cash';
        payload.lines = validLines.map(l => ({
            ledger_id: l.ledger!.id,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            description: l.description,
        }));
    }

    if (voucherId && originalStatus === 'posted') {
        payload.revisionReasonCode = reasonCode;
        payload.revisionReasonText = reasonText;
    }

    return payload;
}

export function buildPurchaseReturnPayload(
    outletId: string,
    reason: string,
    status: string,
    revisionReasonCode: string,
    revisionReasonText: string,
    expectedUpdatedAt: string,
    items: any[]
): any {
    return {
        outletId,
        reason,
        status,
        revisionReasonCode,
        revisionReasonText,
        expectedUpdatedAt,
        items: items.map((item) => ({
            batch_id: item.batchId,
            product_name: item.productName,
            qty: item.qty,
            gst_rate: item.gstRate,
        })),
    };
}

export function buildCustomerPayload(
    outletId: string,
    form: any,
    buildAddress: () => string | null
): any {
    return {
        outletId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: buildAddress() ?? undefined,
        state: form.state || undefined,
        dob: form.dob || undefined,
        gstin: form.gstin.trim().toUpperCase() || undefined,
        isChronic: form.isChronic,
        creditLimit: parseFloat(form.creditLimit) || 0,
        fixedDiscount: parseFloat(form.fixedDiscount) || 0,
        dlNo20b: form.dlNo20b?.trim() || undefined,
        dlNo21b: form.dlNo21b?.trim() || undefined,
        dlExpiry: form.dlExpiry || undefined,
    };
}
