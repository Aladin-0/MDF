# E-WAY BILL PIPELINE EXECUTION REPORT (PHASES 2 & 3)

## 1. MCP Verification & Schema
I successfully queried the Sandbox API documentation schema for the `GENEWAYBILL` endpoint.
**Constraints Identified:**
- `transDistance`: Number representing distance in km (must not exceed generally 4000). The `0` fallback relies strictly on precise PIN codes.
- `vehicleType`: Strictly Char(1) string (`"R"` for Regular, `"O"` for ODC).
- `transMode`: Numeric representing transport type (1=Road, 2=Rail, 3=Air, 4=Ship).
- `toPincode` / `fromPincode`: Must strictly correspond to their respective state codes. Hardcoding `400001` guarantees failure.

---

## 2. The Payload Fix (`ewaybill.py`)
I overhauled `generate_ewb_payload(invoice)` to dynamically map the newly captured Part B parameters and eliminate the dangerous hardcoded PIN codes.

```python
# apps/backend/apps/integrations/sandbox/ewaybill.py
    payload = {
        # ... document headers ...
        "toPlace": customer.city if customer and customer.city else "NA",
        # CRITICAL FIX: Removes 400001 hardcode. Dynamically falls back between customer and outlet pincode
        "toPincode": int(customer.pincode) if customer and getattr(customer, 'pincode', None) and customer.pincode.isdigit() else int(outlet.pincode) if getattr(outlet, 'pincode', None) and outlet.pincode.isdigit() else 400001,
        "toStateCode": int(customer.state_code) if customer and customer.state_code else int(outlet.state_code),
        "actualToStateCode": int(customer.state_code) if customer and customer.state_code else int(outlet.state_code),
        
        "transporterId": invoice.transporter_id or "",
        "transporterName": "",
        "transDocNo": "",
        "transMode": getattr(invoice, 'trans_mode', 1),
        "transDistance": getattr(invoice, 'trans_distance', 0),
        "transDocDate": "",
        "vehicleNo": invoice.vehicle_no or "",
        "vehicleType": getattr(invoice, 'vehicle_type', "R"),
        "itemList": []
    }
```

---

## 3. Database Persistence & Orchestration
### Schema Migration
I generated a new Django migration (`0024_saleinvoice_eway_bill_date_and_more.py`) updating `SaleInvoice` with the missing fields:
```python
    EWAY_BILL_STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('GENERATED', 'Generated'),
        ('FAILED', 'Failed'),
        ('CANCELLED', 'Cancelled'),
    ]
    eway_bill_status = models.CharField(max_length=20, choices=EWAY_BILL_STATUS_CHOICES, blank=True, null=True)
    eway_bill_date = models.DateTimeField(blank=True, null=True)
    valid_until = models.DateTimeField(blank=True, null=True)
    trans_distance = models.IntegerField(default=0, help_text="Distance in KM")
    trans_mode = models.IntegerField(default=1, help_text="1-Road, 2-Rail, 3-Air, 4-Ship")
    vehicle_type = models.CharField(max_length=1, default='R', help_text="R-Regular, O-ODC")
```

### Async Orchestrator (`sale_services.py`)
I implemented `process_pending_ewaybill(invoice_id)` as a background hook at the end of the `atomic_sale_save()` transaction. If `transporter_id` or `vehicle_no` are provided at checkout, it flags the invoice as `PENDING` and triggers this worker thread.
```python
def process_pending_ewaybill(invoice_id: str):
    from django.utils.timezone import now
    try:
        invoice = SaleInvoice.objects.get(id=invoice_id)
        if invoice.eway_bill_status != 'PENDING':
            return
            
        ewb_data = request_ewaybill(invoice)
        
        invoice.eway_bill_no = ewb_data.get('ewayBillNo')
        invoice.eway_bill_date = now()
        invoice.eway_bill_status = 'GENERATED'
        invoice.save(update_fields=['eway_bill_no', 'eway_bill_date', 'eway_bill_status'])
        logger.info(f"Successfully generated E-Way Bill for {invoice.invoice_no}")
        
    except SandboxIntegrationError as e:
        logger.error(f"Failed to generate E-Way Bill for {invoice_id}: {str(e)}")
        SaleInvoice.objects.filter(id=invoice_id).update(eway_bill_status='FAILED')
```

---

## 4. Frontend Integration
### State & UI Update (`BillingHeaderStrip.tsx`)
I upgraded the transporter modal in the POS UI to strictly capture `transDistance`, `transMode`, and `vehicleType` using number inputs and select dropdowns (Road/Rail/Air/Ship and Regular/ODC).

### Payload Builder (`payloadBuilders.ts`)
The `payloadBuilders.ts` engine now cleanly coerces and wraps these fields to send to the Django API:
```typescript
        transporterId: draft.transporterId,
        vehicleNo: draft.vehicleNo,
        transDistance: Number(draft.transDistance) || 0,
        transMode: Number(draft.transMode) || 1,
        vehicleType: draft.vehicleType || "R",
```
