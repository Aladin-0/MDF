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
        items: cart.map((item: any) => {
            const rawTotal = item.rate * item.totalQty;
            const gstRate = item.gstRate || 0;
            const discountFactor = extraDiscountPct > 0 ? 1 - extraDiscountPct / 100 : 1;
            const discountedTotal = rawTotal * discountFactor;
            const taxable = gstRate > 0
                ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
                : Number(discountedTotal.toFixed(2));
            const gst = Number((discountedTotal - taxable).toFixed(2));
            return {
                batchId: item.batchId,
                name: item.name,
                batchNo: item.batchNo,
                expiryDate: item.expiryDate,
                productId: item.productId,
                qtyStrips: item.qtyStrips,
                qtyLoose: item.qtyLoose,
                saleMode: item.saleMode,
                mrp: item.mrp || 0,
                packSize: item.packSize || 1,
                rate: item.rate,
                discountPct: item.discountPct,
                gstRate: item.gstRate,
                scheduleType: item.scheduleType || 'OTC',
                taxableAmount: taxable,
                gstAmount: gst,
                totalAmount: Number(discountedTotal.toFixed(2)),
            };
        }),
        subtotal: Number(totals.subtotal.toFixed(2)),
        discountAmount: Number((totals.discountAmount + totals.extraDiscountAmount).toFixed(2)),
        taxableAmount: Number(totals.taxableAmount.toFixed(2)),
        cgstAmount: Number(totals.cgstAmount.toFixed(2)),
        sgstAmount: Number(totals.sgstAmount.toFixed(2)),
        igstAmount: 0,
        cgst: Number(totals.cgstAmount.toFixed(2)),
        sgst: Number(totals.sgstAmount.toFixed(2)),
        igst: 0,
        roundOff: Number(totals.roundOff.toFixed(2)),
        grandTotal: Number(totals.grandTotal.toFixed(2)),
        extraDiscountPct,
        paymentMode: draft.payment.method,
        cashPaid: draft.payment.method === 'cash' ? (draft.payment.cashTendered || totals.grandTotal) : getPaid('cash'),
        upiPaid: getPaid('upi'),
        cardPaid: getPaid('card'),
        creditGiven: getPaid('credit'),
        scheduleHData,
        revisionAction: draft.revisionAction,
        revisionReasonCode: draft.revisionReasonCode,
        revisionReasonText: draft.revisionReasonText,
        quotationId: draft.quotationId,
    };
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
    const payload: any = {
        outletId,
        partyLedgerId:    formState.partyLedgerId,
        purchaseType:     formState.purchaseType,
        invoiceNo:        formState.invoiceNo,
        invoiceDate:      formState.invoiceDate,
        dueDate:          formState.purchaseType === 'credit' ? formState.dueDate : undefined,
        purchaseOrderRef: formState.purchaseOrderRef,
        godown:           formState.godown,
        freight:          formState.freight || 0,
        notes:            formState.notes,
        subtotal:         parseFloat(goodsValue.toFixed(2)),
        discountAmount:   parseFloat((totalTradeDisc + totalCashDisc).toFixed(2)),
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
            const gstAmount  = base * (it.gstRate / 100);
            const cessAmount = base * (it.cess / 100);
            const baseLandingRate = (it.qty + it.freeQty) > 0 ? parseFloat((base / (it.qty + it.freeQty)).toFixed(2)) : 0;
            
            return {
                masterProductId:   it.isCustom ? null : it.productId,
                customProductName: it.isCustom ? it.productName : null,
                isCustomProduct:   it.isCustom ?? false,
                hsnCode:         it.hsnCode,
                batchNo:         it.batchNo,
                expiryDate:      it.expiryDate,
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

    if (voucherType === 'receipt' || voucherType === 'payment') {
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
    };
}
