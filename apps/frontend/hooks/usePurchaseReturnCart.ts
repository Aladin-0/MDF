'use client';

import { useState, useCallback, useMemo } from 'react';

export interface PurchaseReturnItemRow {
    id: string;
    batchId: string;
    productName: string;
    batchNo?: string;
    expiryDate?: string;
    qtyStrips: string;
    qtyLoose: string;
    packSize: number;
    rate: string;
    gstRate: string;
    total: number;
    maxTotalUnits?: number;
    availableStrips?: number;
    availableLoose?: number;
    reason?: string;
}

export function calcPurchaseItemTotal(
    qtyStrips: string | number,
    qtyLoose: string | number,
    rate: string | number,
    packSize: number,
    gstRate: string | number
): number {
    const qs = parseFloat(String(qtyStrips)) || 0;
    const ql = parseFloat(String(qtyLoose)) || 0;
    const r = parseFloat(String(rate)) || 0;
    const ps = packSize || 1;
    const g = parseFloat(String(gstRate)) || 0;

    const totalFractionalStrips = qs + (ql / ps);
    const base = totalFractionalStrips * r;
    const gst = (base * g) / 100;
    return Math.round((base + gst) * 100) / 100;
}

export function newPurchaseReturnItem(): PurchaseReturnItemRow {
    return {
        id: Math.random().toString(36).slice(2),
        batchId: '',
        productName: '',
        batchNo: '',
        qtyStrips: '0',
        qtyLoose: '0',
        packSize: 1,
        rate: '',
        gstRate: '12',
        total: 0,
        reason: 'correction',
    };
}

export function usePurchaseReturnCart(initialItems?: PurchaseReturnItemRow[]) {
    const [items, setItems] = useState<PurchaseReturnItemRow[]>(
        initialItems && initialItems.length > 0 ? initialItems : [newPurchaseReturnItem()]
    );

    const updateItem = useCallback((
        id: string,
        field: keyof PurchaseReturnItemRow,
        value: string | number,
        onExceedMax?: (maxUnits: number, enteredUnits: number) => void
    ) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const updated = { ...item, [field]: value };

                // Validate max limits if present
                if (item.maxTotalUnits !== undefined && (field === 'qtyStrips' || field === 'qtyLoose')) {
                    const enteredStrips = parseFloat(field === 'qtyStrips' ? String(value) : updated.qtyStrips) || 0;
                    const enteredLoose = parseFloat(field === 'qtyLoose' ? String(value) : updated.qtyLoose) || 0;
                    const totalUnitsEntered = enteredStrips * (updated.packSize || 1) + enteredLoose;

                    if (totalUnitsEntered > item.maxTotalUnits) {
                        if (onExceedMax) {
                            onExceedMax(item.maxTotalUnits, totalUnitsEntered);
                        }
                        return item;
                    }
                }

                updated.total = calcPurchaseItemTotal(
                    updated.qtyStrips,
                    updated.qtyLoose,
                    field === 'rate' ? value : updated.rate,
                    updated.packSize,
                    field === 'gstRate' ? value : updated.gstRate
                );
                return updated;
            })
        );
    }, []);

    const addItem = useCallback((item?: Partial<PurchaseReturnItemRow>) => {
        setItems((prev) => [...prev, { ...newPurchaseReturnItem(), ...item }]);
    }, []);

    const removeItem = useCallback((id: string) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
    }, []);

    const { subtotal, gstAmount, totalAmount } = useMemo(() => {
        let sub = 0;
        let gst = 0;

        for (const item of items) {
            const qs = parseFloat(item.qtyStrips) || 0;
            const ql = parseFloat(item.qtyLoose) || 0;
            const r = parseFloat(item.rate) || 0;
            const ps = item.packSize || 1;
            const g = parseFloat(item.gstRate) || 0;

            const totalFractionalStrips = qs + (ql / ps);
            const base = totalFractionalStrips * r;
            const lineGst = (base * g) / 100;

            sub += base;
            gst += lineGst;
        }

        const roundedSubtotal = Math.round(sub * 100) / 100;
        const roundedGst = Math.round(gst * 100) / 100;
        const roundedTotal = Math.round((roundedSubtotal + roundedGst) * 100) / 100;

        return {
            subtotal: roundedSubtotal,
            gstAmount: roundedGst,
            totalAmount: roundedTotal,
        };
    }, [items]);

    return {
        items,
        setItems,
        updateItem,
        addItem,
        removeItem,
        subtotal,
        gstAmount,
        totalAmount,
    };
}
