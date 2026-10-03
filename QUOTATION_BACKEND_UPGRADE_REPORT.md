# QUOTATION BACKEND UPGRADE REPORT

## 1. Database Schema Updates (`models.py`)

The `Quotation` and `QuotationItem` models were successfully updated in `apps/backend/apps/billing/models.py`.

### `Quotation` Updates:
```python
    sale_type = models.CharField(max_length=20, default='RETAIL')
    billing_basis = models.CharField(max_length=20, null=True, blank=True)
    place_of_supply = models.CharField(max_length=100, null=True, blank=True)
    is_interstate = models.BooleanField(default=False)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    vehicle_no = models.CharField(max_length=50, null=True, blank=True)
```

### `QuotationItem` Updates:
```python
    free_qty_strips = models.IntegerField(default=0)
    free_qty_loose = models.IntegerField(default=0)
    ptr = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pts = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hsn_code = models.CharField(max_length=50, null=True, blank=True)
```

## 2. API Logic Updates (`quotation_views.py`)

The `QuotationListCreateView` class in `apps/backend/apps/billing/quotation_views.py` was updated. We successfully exposed the new wholesale fields and bypassed the forceful MRP override for wholesale transactions.

### Field Mapping Additions (both `create` and `update`):
```python
        field_mapping = {
            # ... existing fields
            'saleType': 'sale_type',
            'billingBasis': 'billing_basis',
            'placeOfSupply': 'place_of_supply',
            'isInterstate': 'is_interstate',
            'transporterId': 'transporter_id',
            'vehicleNo': 'vehicle_no',
        }
```

```python
            item_mapping = {
                # ... existing fields
                'freeQtyStrips': 'free_qty_strips',
                'freeQtyLoose': 'free_qty_loose',
                'hsnCode': 'hsn_code',
            }
```

### Pricing Logic Overhaul:
Instead of unconditionally overriding `item['rate']` with `batch.mrp`, the system now respects the sale mode. If `sale_type == 'WHOLESALE'`, it correctly uses the rate and PTR provided by the frontend payload:
```python
                    sale_type = data.get('sale_type', getattr(instance, 'sale_type', 'RETAIL'))
                    if sale_type == 'WHOLESALE':
                        item['rate'] = float(item.get('rate', 0) or item.get('ptr', 0) or batch.mrp or 0)
                        item['ptr'] = float(item.get('ptr', 0) or getattr(batch, 'ptr', batch.mrp or 0))
                        item['pts'] = float(item.get('pts', 0) or getattr(batch, 'pts', batch.mrp or 0))
                        item['sale_rate'] = float(item.get('rate', 0) or batch.mrp or 0)
                    else:
                        item['rate'] = float(batch.mrp) if batch.mrp else 0
                        item['sale_rate'] = float(batch.mrp) if batch.mrp else 0
```
*(Similar fallbacks are implemented for invalid or non-existent batches).*

## 3. Database Migration Commands

The developer commands used to generate and apply these changes locally via the Docker container are:

```bash
docker compose exec backend python manage.py makemigrations billing
docker compose exec backend python manage.py migrate billing
```

*The migrations completed successfully and are now active in the database.*
