'use client';

import { useState, useCallback, useMemo } from 'react';

export interface ReturnItemRow {
    id: string;
    saleItemId?: string;
    originalSaleItemId?: string;
    batchId: string;
    alreadyReturned?: number;
    productName: string;
    batchNo?: string;
    qtyStrips: string;
    qtyLoose: string;
    packSize: number;
    rate: string;
    gstRate: string;
    total: number;
    maxTotalUnits?: number;
    invoiceTotal?: number;
}

export function calcItemTotal(
    qtyStrips: string | number,
    qtyLoose: string | number,
    rate: string | number,
    packSize: number
): number {
    const qs = parseFloat(String(qtyStrips)) || 0;
    const ql = parseFloat(String(qtyLoose)) || 0;
    const r = parseFloat(String(rate)) || 0;
    const ps = packSize || 1;
    // Rate is inclusive of GST in Sales
    const totalFractionalStrips = qs + (ql / ps);
    return Math.round(totalFractionalStrips * r * 100) / 100;
}

export function calcItemUnits(
    qtyStrips: string | number,
    qtyLoose: string | number,
    packSize: number
): number {
    const qs = parseFloat(String(qtyStrips)) || 0;
    const ql = parseFloat(String(qtyLoose)) || 0;
    const ps = packSize || 1;
    return Math.round(qs * ps + ql);
}

export function newItem(): ReturnItemRow {
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
    };
}

export function useSaleReturnCart(initialItems?: ReturnItemRow[]) {
    const [items, setItems] = useState<ReturnItemRow[]>(
        initialItems && initialItems.length > 0 ? initialItems : [newItem()]
    );

    const updateItem = useCallback((
        id: string,
        field: keyof ReturnItemRow,
        value: string | number,
        onExceedMax?: (maxUnits: number, enteredUnits: number) => void
    ) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const updated = { ...item, [field]: value };

                // Enforce max total units limit
                if (item.maxTotalUnits !== undefined && (field === 'qtyStrips' || field === 'qtyLoose')) {
                    const enteredStrips = parseFloat(field === 'qtyStrips' ? String(value) : updated.qtyStrips) || 0;
                    const enteredLoose = parseFloat(field === 'qtyLoose' ? String(value) : updated.qtyLoose) || 0;
                    const totalUnitsEntered = enteredStrips * (updated.packSize || 1) + enteredLoose;

                    if (totalUnitsEntered > item.maxTotalUnits) {
                        if (onExceedMax) {
                            onExceedMax(item.maxTotalUnits, totalUnitsEntered);
                        }
                        return item; // Revert strictly
                    }
                }

                updated.total = calcItemTotal(
                    updated.qtyStrips,
                    updated.qtyLoose,
                    field === 'rate' ? value : updated.rate,
                    updated.packSize
                );
                return updated;
            })
        );
    }, []);

    const updateItemMultiple = useCallback((id: string, updates: Partial<ReturnItemRow>) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const updated = { ...item, ...updates };
                updated.total = calcItemTotal(
                    updated.qtyStrips,
                    updated.qtyLoose,
                    updated.rate,
                    updated.packSize
                );
                return updated;
            })
        );
    }, []);

    const addItem = useCallback((item?: Partial<ReturnItemRow>) => {
        setItems((prev) => [...prev, { ...newItem(), ...item }]);
    }, []);

    const removeItem = useCallback((id: string) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
    }, []);

    const { subtotal, gstAmount, totalAmount } = useMemo(() => {
        let total = 0;
        let gst = 0;

        for (const item of items) {
            const qs = parseFloat(item.qtyStrips) || 0;
            const ql = parseFloat(item.qtyLoose) || 0;
            const r = parseFloat(item.rate) || 0;
            const ps = item.packSize || 1;
            const g = parseFloat(item.gstRate) || 0;
            const totalFractionalStrips = qs + (ql / ps);
            const totalIncGst = totalFractionalStrips * r;

            total += totalIncGst;
            const base = g > 0 ? (totalIncGst * 100) / (100 + g) : totalIncGst;
            gst += (totalIncGst - base);
        }

        const roundedTotal = Math.round(total * 100) / 100;
        const roundedGst = Math.round(gst * 100) / 100;
        const roundedSubtotal = Math.round((roundedTotal - roundedGst) * 100) / 100;

        return {
            totalAmount: roundedTotal,
            gstAmount: roundedGst,
            subtotal: roundedSubtotal,
        };
    }, [items]);

    return {
        items,
        setItems,
        updateItem,
        updateItemMultiple,
        addItem,
        removeItem,
        subtotal,
        gstAmount,
        totalAmount,
    };
}
