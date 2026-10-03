# QUOTATION HYDRATION FIX REPORT

## 1. Backend Serializer Remediation
The original issue causing customer metadata to vanish during conversion was a restrictive serializer representation in the backend API.

In `apps/backend/apps/billing/serializers.py`, the `QuotationSerializer` forcibly stripped down the `customer` object to just `id`, `name`, `phone`, and `gstin`.

**The Fix:**
We upgraded the `to_representation` method to include the full suite of B2B ledger properties required by the POS `Customer` and `CustomerLedger` interfaces.
```python
# In apps/backend/apps/billing/serializers.py
        if instance.customer:
            repr['customer'] = {
                'id': str(instance.customer.id),
                'name': instance.customer.name,
                'phone': getattr(instance.customer, 'phone', ''),
                'gstin': getattr(instance.customer, 'gstin', ''),
                'address': getattr(instance.customer, 'address', ''),
                'state': getattr(instance.customer, 'state', ''),
                'stateCode': getattr(instance.customer, 'state_code', ''),
                'dlNo20b': getattr(instance.customer, 'dl_no_20b', ''),
                'dlNo21b': getattr(instance.customer, 'dl_no_21b', ''),
                'creditLimit': getattr(instance.customer, 'credit_limit', 0),
                'outstanding': getattr(instance.customer, 'outstanding', 0),
            }
```

## 2. Frontend State Hydration Upgrade
Because the POS `BillingHeaderStrip.tsx` actively reads `customerLedger.address`, `customerLedger.phone`, and wholesale metadata (like DL and Credit Limits), providing the shallow data to `store.setCustomer()` wasn't enough. The `QuotationsList.tsx` was explicitly generating a "mock" ledger with zero metadata.

**The Fix:**
We updated the Quotation initialization logic (`handleConvertToInvoice` and `handleOpenPreview`) to explicitly map the newly injected API payload attributes into the active POS `CustomerLedger` state.

```tsx
// In apps/frontend/components/sales/QuotationsList.tsx
            if (fullQ.customer) {
                store.setCustomer(fullQ.customer);
                store.setCustomerLedger({
                    id: fullQ.customer.id || 'mock',
                    name: fullQ.customer.name || 'Unknown',
                    phone: fullQ.customer.phone || '',
                    address: fullQ.customer.address || '',
                    gstin: fullQ.customer.gstin || '',
                    creditLimit: fullQ.customer.creditLimit || 0,
                    dlNo20b: fullQ.customer.dlNo20b || '',
                    dlNo21b: fullQ.customer.dlNo21b || '',
                    customerType: fullQ.saleType || 'RETAIL',
                    groupName: 'Sundry Debtors',
                    currentBalance: fullQ.customer.outstanding || 0,
                    isMock: false,
                } as any);
            }
```

## 3. UI Component Protection (Mode Toggles)
The `Retail [F2] / Wholesale [F3]` buttons and the Document Mode buttons were entirely unmounting from the DOM during quotation conversion because of a strict short-circuit logic rule: `{canToggleMode && ( ... )}` where `canToggleMode = !quotationId`.

**The Fix:**
We removed the `{canToggleMode && (` structural wrapper. Instead of deleting the buttons, we bound `disabled={!canToggleMode}` to each individual button. 
Additionally, we applied `opacity-50 cursor-not-allowed` styles conditionally, so the user clearly sees they are locked into Wholesale mode (due to the `[F3]` button remaining actively styled but disabled), preventing confusion regarding the document's true mode.
