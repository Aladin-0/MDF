/**
 * Utility functions for mapping frontend state into backend-ready JSON payloads.
 */

export function buildScheduleHPayload(customer: any, doctor: any, draft: any): any {
    if (draft?.scheduleHData) {
        return draft.scheduleHData;
    }
    
    if (!customer || !doctor || customer.id === 'mock' || doctor.id === 'mock') {
        return undefined;
    }

    // Default mapping when converting from full objects
    return {
        patientName: customer.name || '',
        patientAge: customer.dob ? (new Date().getFullYear() - new Date(customer.dob).getFullYear()) : 0,
        patientAddress: customer.address || '',
        doctorName: doctor.name || '',
        doctorRegNo: doctor.regNo || '',
        prescriptionNo: draft?.prescriptionNo || ''
    };
}

export function buildSalePayload(draft: any, scheduleHData: any, totals: any, activeStaff: any, outletId: string): any {
    const isSplit = draft.payment?.method === 'split';
    
    const payload = {
        outletId,
        invoiceDate: draft.invoiceDate ? new Date(draft.invoiceDate).toISOString() : new Date().toISOString(),
        partyLedgerId: draft.customerLedger?.id || null,
        customerId: draft.customer?.id || null,
        doctorId: draft.doctor?.id !== 'mock' ? draft.doctor?.id : null,
        doctorName: draft.doctor?.id !== 'mock' ? draft.doctor?.name : null,
        hospitalName: draft.hospitalName || '',
        prescriptionNo: draft.prescriptionNo || '',
        
        paymentMode: draft.payment?.method || 'cash',
        cashPaid: isSplit ? (draft.payment.splitBreakdown?.cash || 0) : (draft.payment?.cashTendered || totals.grandTotal),
        upiPaid: isSplit ? (draft.payment.splitBreakdown?.upi || 0) : 0,
        cardPaid: isSplit ? (draft.payment.splitBreakdown?.card || 0) : 0,
        creditGiven: isSplit ? (draft.payment.splitBreakdown?.credit || 0) : 0,
        
        subtotal: totals.subtotal || 0,
        discountAmount: totals.discountAmount || 0,
        extraDiscountPct: draft.extraDiscountPct || 0,
        taxableAmount: totals.taxableAmount || 0,
        cgstAmount: totals.cgstAmount || 0,
        sgstAmount: totals.sgstAmount || 0,
        roundOff: totals.roundOff || 0,
        grandTotal: totals.grandTotal || 0,
        
        scheduleHData: scheduleHData || undefined,
        
        items: (draft.cart || []).map((item: any) => {
            const rawAmount = item.qtyStrips * item.rate;
            const extraDisc = draft.extraDiscountPct ? rawAmount * (draft.extraDiscountPct / 100) : 0;
            const discountedAmount = rawAmount - extraDisc;
            const gstRate = item.gstRate || 0;
            const itemTaxable = discountedAmount / (1 + (gstRate / 100));
            const itemGst = discountedAmount - itemTaxable;

            return {
                productId: item.productId,
                batchId: item.batchId,
                qtyStrips: item.qtyStrips || 0,
                qtyLoose: item.qtyLoose || 0,
                saleMode: item.saleMode || 'strip',
                rate: item.rate,
                discountPct: item.discountPct || 0,
                scheduleType: item.scheduleType,
                gstRate: gstRate,
                taxableAmount: itemTaxable,
                gstAmount: itemGst,
                totalAmount: discountedAmount
            };
        })
    };

    return payload;
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
    netPayable: number
): any {
    return {
        outletId,
        partyLedgerId: formState.partyLedgerId,
        purchaseType: formState.purchaseType,
        invoiceNo: formState.invoiceNo,
        invoiceDate: formState.invoiceDate,
        freight: formState.freight || 0,
        notes: formState.notes || '',
        ledgerNote,
        discountAmount: (totalTradeDisc || 0) + (totalCashDisc || 0),
        taxableAmount: taxableValue || 0,
        totalGst: totalGST || 0,
        totalCess: totalCess || 0,
        roundOff: roundOff || 0,
        effectiveAdjustment: effectiveAdjustment || 0,
        grandTotal: netPayable || 0,
        items: items.map(item => {
            const baseQty = item.qty || 0;
            const freeQty = item.freeQty || 0;
            const pkg = item.pkg || 1;
            const rate = item.purchaseRate || 0;
            const tradeDiscMultiplier = 1 - ((item.discountPct || 0) / 100);
            const cashDiscMultiplier = 1 - ((item.cashDiscountPct || 0) / 100);
            
            const itemTaxable = (baseQty * rate) * tradeDiscMultiplier * cashDiscMultiplier;
            
            return {
                productId: item.productId,
                batchNo: item.batchNo,
                expiryDate: item.expiryDate,
                qty: baseQty,
                freeQty,
                actualQty: (baseQty + freeQty) * pkg,
                pkg,
                purchaseRate: rate,
                discountPct: item.discountPct || 0,
                cashDiscountPct: item.cashDiscountPct || 0,
                gstRate: item.gstRate || 0,
                cess: item.cess || 0,
                mrp: item.mrp || 0,
                ptr: item.ptr || 0,
                pts: item.pts || 0,
                isCustom: item.isCustom || false,
                taxableAmount: itemTaxable,
            };
        })
    };
}

export function buildReturnPayload(
    returnData: any, 
    items: any[], 
    reason: string, 
    returnType: string, 
    originalInvoiceNo: string, 
    notes: string, 
    outletId: string
): any {
    return {
        outletId,
        reason,
        returnType,
        originalInvoiceNo,
        notes,
        updatedAt: returnData?.updatedAt,
        items: items.map((item: any) => ({
            originalSaleItemId: item.originalSaleItemId,
            batchId: item.batchId,
            productName: item.productName,
            qtyReturned: item.qtyReturned || 0,
            qtyStripsReturned: Math.floor((item.qtyReturned || 0) / (item.packSize || 1)),
            qtyLooseReturned: (item.qtyReturned || 0) % (item.packSize || 1),
            totalAmount: (item.qtyReturned || 0) * (item.returnRate || 0),
        }))
    };
}

export function buildVoucherPayload(
    voucherType: string, 
    date: string, 
    description: string, 
    outletId: string, 
    partyLedger: any, 
    cashBankLedger: any, 
    amount: number, 
    pendingBills: any[], 
    billAmounts: Record<string, number>, 
    accountFrom: any, 
    accountTo: any, 
    totalAmount: number, 
    lines: any[]
): any {
    const payload: any = {
        voucher_type: voucherType,
        date: date || new Date().toISOString().split('T')[0],
        description: description || '',
        outlet_id: outletId,
        total_amount: voucherType === 'journal' ? totalAmount : amount,
        lines: []
    };

    if (voucherType === 'receipt') {
        payload.payment_mode = cashBankLedger?.groupName?.toLowerCase().includes('bank') ? 'bank' : 'cash';
        payload.lines = [
            { ledger_id: cashBankLedger?.id, debit: amount, credit: 0, description: '' },
            { ledger_id: partyLedger?.id, debit: 0, credit: amount, description: '' }
        ];
        if (pendingBills?.length > 0) {
            payload.bill_adjustments = pendingBills
                .filter(b => billAmounts[b.id] > 0)
                .map(b => ({
                    invoice_id: b.id,
                    invoice_type: b.invoiceType || 'sale',
                    adjusted_amount: billAmounts[b.id]
                }));
        }
    } else if (voucherType === 'journal') {
        payload.lines = lines.map(line => ({
            ledger_id: line.ledger?.id || line.ledger_id,
            debit: line.debit || 0,
            credit: line.credit || 0,
            description: line.description || ''
        }));
    } else if (voucherType === 'contra') {
        payload.lines = [
            { ledger_id: accountFrom?.id, debit: amount, credit: 0, description: '' },
            { ledger_id: accountTo?.id, debit: 0, credit: amount, description: '' }
        ];
    } else if (voucherType === 'payment') {
        payload.payment_mode = cashBankLedger?.groupName?.toLowerCase().includes('bank') ? 'bank' : 'cash';
        payload.lines = [
            { ledger_id: partyLedger?.id, debit: amount, credit: 0, description: '' },
            { ledger_id: cashBankLedger?.id, debit: 0, credit: amount, description: '' }
        ];
    }

    return payload;
}

export function buildCustomerPayload(outletId: string, form: any, buildAddress: () => string | null): any {
    return {
        outletId,
        name: form.name,
        phone: form.phone,
        address: buildAddress(),
        city: form.city || '',
        state: form.state || 'Maharashtra',
        pincode: form.pincode || '',
        dob: form.dob || null,
        gstin: form.gstin || null,
        isChronic: form.isChronic || false,
        creditLimit: parseFloat(form.creditLimit) || 0,
        fixedDiscount: parseFloat(form.fixedDiscount) || 0,
    };
}

export function buildPurchaseReturnPayload(
    outletId: string, 
    reason: string, 
    status: string, 
    revisionReasonCode: string, 
    revisionReasonText: string, 
    updatedAt: string, 
    items: any[]
): any {
    return {
        outletId,
        reason,
        status,
        revisionReasonCode,
        revisionReasonText,
        updatedAt,
        items: items.map(item => ({
            batchId: item.batchId,
            qty: item.qty,
        }))
    };
}
