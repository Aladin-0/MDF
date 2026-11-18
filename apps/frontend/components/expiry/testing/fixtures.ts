import type { ExpiryRow } from '@/lib/expiryManager';

export const row = (id: string, over: Partial<ExpiryRow> = {}): ExpiryRow => ({
    id, productId: `p-${id}`, productName: `Medicine ${id.toUpperCase()}`, manufacturer: 'Cipla', batchNo: `B-${id.toUpperCase()}`,
    expiryDate: '2027-03-10', daysToExpiry: 40, qtyStrips: 5, qtyLoose: 3, packSize: 10, packType: 'strip', packUnit: 'tablet', packs: 5.3,
    mrp: 100, mrpValue: 530, rackLocation: 'A1', distributorId: 'd1', distributorName: 'Alpha Agencies', moreSuppliers: false,
    supplierAssigned: false, purchaseInvoiceId: 'inv1', purchaseInvoiceNo: 'A-1', purchaseRate: 60, landingRate: null, costValue: 318, ...over,
});
