import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated, IsManagerOrAbove, assert_outlet_access
from apps.core.permissions import CanManageProducts

from rest_framework import status
from django.db.models import Q, Sum
from datetime import datetime
from django.db import transaction, IntegrityError
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from apps.inventory.models import MasterProduct, Batch
from apps.inventory.cache_utils import bump_inventory_cache, inventory_cache_version
from apps.inventory.search_query import MIN_CHARS, ParsedQuery, parse_query, salt_set, strengths, dosage_form
from apps.inventory.suggestions import FIELDS as SUGGEST_FIELDS, suggest_values
from apps.inventory.pack_rules import (
    allows_loose, batch_allows_loose, normalize_pack_type, pack_errors, sync_batch_to_pack, fold_loose_into_packs,
)
from apps.core.models import Outlet, TaxSlab
from apps.accounts.models import Staff
from apps.audit.services import log_activity

logger = logging.getLogger(__name__)

# Inventory rules shared by the list filter, the row flags and the alerts
DEFAULT_MIN_QTY = 10          # packs: below this a product counts as low stock unless the outlet set its own minimum
EXPIRING_SOON_DAYS = 90

from apps.purchases.models import PurchaseItem
from apps.billing.utils.pricing import get_landing_cost_for_batch

class BatchLandingCostView(APIView):
    """GET /api/v1/inventory/batches/{batch_id}/landing-cost/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id, *args, **kwargs):
        try:
            batch = Batch.objects.get(id=batch_id)
        except Batch.DoesNotExist:
            return Response({'detail': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)
        assert_outlet_access(request.user, batch.outlet_id)

        outlet_id = getattr(request.user, 'outlet_id', None) or getattr(request.user, 'pharmacy_id', None)

        landing_cost = get_landing_cost_for_batch(batch, outlet_id)
        
        # Details like freight and gst_rate live on PurchaseItem
        purchase_item = PurchaseItem.objects.filter(batch=batch).order_by('-created_at').first()
        freight_per_unit = purchase_item.freight_per_unit if purchase_item else Decimal('0')
        gst_percent = purchase_item.gst_rate if purchase_item else Decimal('0')

        return Response({
            'landing_cost': str(Decimal(landing_cost).quantize(Decimal('0.0001'))),
            'mrp': str(batch.mrp),
            'purchase_rate': str(batch.purchase_rate),
            'gst_percent': str(gst_percent),
            'freight_per_unit': str(freight_per_unit)
        }, status=status.HTTP_200_OK)

# What can be edited on a batch, as (request field, model field, label). One table drives the
# validation messages, the change log and the "what changed" summary.
BATCH_EDIT_FIELDS = (
    ('batchNo', 'batch_no', 'Batch no'),
    ('expiryDate', 'expiry_date', 'Expiry'),
    ('mfgDate', 'mfg_date', 'Mfg date'),
    ('mrp', 'mrp', 'MRP'),
    ('purchaseRate', 'purchase_rate', 'Purchase rate'),
    ('landingRate', 'landing_rate', 'Landing rate'),
    ('packSize', 'pack_size', 'Pack size'),
    ('packUnit', 'pack_unit', 'Pack unit'),
    ('packType', 'pack_type', 'Pack type'),
    ('rackLocation', 'rack_location', 'Rack'),
)
_MONEY_MAX = Decimal('99999999.99')  # the column is DECIMAL(10, 2)


def _money(value, label, *, allow_zero=True):
    """A price as Decimal(2dp), or raise ValueError with a message for the user."""
    try:
        amount = Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f'{label} must be a number')
    if amount < 0 or (amount == 0 and not allow_zero):
        raise ValueError(f'{label} must be greater than 0' if not allow_zero else f'{label} cannot be negative')
    if amount > _MONEY_MAX:
        raise ValueError(f'{label} is too large')
    return amount


def _day(value, label, *, required):
    """'YYYY-MM-DD' -> date. Empty is an error for a required date and None for an optional one."""
    if value in (None, ''):
        if required:
            raise ValueError(f'{label} is required')
        return None
    try:
        return datetime.strptime(str(value), '%Y-%m-%d').date()
    except ValueError:
        raise ValueError(f'{label} must be a date (YYYY-MM-DD)')


def _plain(value):
    """JSON-safe value for the change log."""
    if value is None or isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


class BatchDetailUpdateView(APIView):
    """
    PUT /api/v1/inventory/batches/{batch_id}/ - edit a batch's details (batch no, dates, prices, rack, pack).

    Stock quantities are NOT edited here (that is the audited adjustment with a PIN); only a pack size
    change re-counts loose stock, which it must, to keep `qty_loose < pack_size`.
    """
    permission_classes = [IsManagerOrAbove]

    def put(self, request, batch_id, *args, **kwargs):
        # Lock the row and write ONLY the fields that changed. This used to read the batch, then
        # `save()` the whole row: a sale that committed in between had its stock deduction overwritten
        # by the stale quantity read here, so editing a rack or a price could quietly put sold stock
        # back on the shelf.
        with transaction.atomic():
            try:
                batch = Batch.objects.select_for_update(of=('self',)).select_related('product', 'outlet').get(id=batch_id)  # lock only the batch row: Postgres refuses FOR UPDATE on the nullable product join
            except Batch.DoesNotExist:
                return Response({'detail': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)
            assert_outlet_access(request.user, batch.outlet_id)

            data = request.data
            before = {model: getattr(batch, model) for _, model, _ in BATCH_EDIT_FIELDS}
            before['qty_strips'], before['qty_loose'] = batch.qty_strips, batch.qty_loose
            errors = {}

            def apply(field, convert):
                if field not in data:
                    return
                try:
                    setattr(batch, dict((r, m) for r, m, _ in BATCH_EDIT_FIELDS)[field], convert(data[field]))
                except ValueError as exc:
                    errors[field] = str(exc)

            def batch_no(v):
                v = (v or '').strip()
                if not v:
                    raise ValueError('Batch number is required')
                clash = Batch.objects.filter(
                    outlet_id=batch.outlet_id, product_id=batch.product_id, is_active=True, batch_no__iexact=v,
                ).exclude(pk=batch.pk).exists()
                if clash:
                    raise ValueError(f"Batch {v} already exists for this product. To move stock between batches, adjust the stock instead of renaming.")
                return v

            def whole(v):
                try:
                    n = int(v)
                except (TypeError, ValueError):
                    raise ValueError('Pack size must be a whole number')
                if n < 1:
                    raise ValueError('Pack size must be at least 1')
                return n

            def unit(v):
                v = (v or '').strip()
                if not v:
                    raise ValueError('Pack unit is required')
                return v

            apply('batchNo', batch_no)
            apply('expiryDate', lambda v: _day(v, 'Expiry date', required=True))
            apply('mfgDate', lambda v: _day(v, 'Mfg date', required=False))
            apply('mrp', lambda v: _money(v, 'MRP', allow_zero=False))
            apply('purchaseRate', lambda v: _money(v, 'Purchase rate'))
            if 'landingRate' in data or 'landing_rate' in data:
                raw = data.get('landingRate') if 'landingRate' in data else data.get('landing_rate')
                if raw in (None, ''):
                    batch.landing_rate = None
                else:
                    try:
                        batch.landing_rate = _money(raw, 'Landing rate')
                    except ValueError as exc:
                        errors['landingRate'] = str(exc)
            apply('packSize', whole)
            apply('packUnit', unit)
            if 'packType' in data and data['packType']:
                batch.pack_type = normalize_pack_type(data['packType'])
            if 'rackLocation' in data:
                batch.rack_location = (data['rackLocation'] or '').strip()

            if not errors and batch.mfg_date and batch.expiry_date and batch.mfg_date > batch.expiry_date:
                errors['mfgDate'] = 'Manufacturing date must be before the expiry date'

            pack_touched = any(k in data for k in ('packSize', 'packUnit', 'packType'))
            if pack_touched and not errors:
                # judge the pack as it WILL be, so fixing one field of a bad pack is accepted when the
                # result is sound, and an unrelated edit (rack, MRP) never trips over an old bad pack
                errors.update(pack_errors(batch.pack_size, batch.pack_unit, batch.pack_type))
            if pack_touched and 'packSize' in data and not errors:
                batch.qty_strips, batch.qty_loose = fold_loose_into_packs(batch.qty_strips, batch.qty_loose, batch.pack_size)

            if errors:
                return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

            after = {model: getattr(batch, model) for _, model, _ in BATCH_EDIT_FIELDS}
            after['qty_strips'], after['qty_loose'] = batch.qty_strips, batch.qty_loose
            # an unset text field (None) and an empty one ('') are the same: re-saving an empty box is not a change
            def same(a, b):
                return (a or '') == (b or '') if isinstance(a, (str, type(None))) and isinstance(b, (str, type(None))) else a == b
            changed = [name for name in after if not same(after[name], before[name])]

            if changed:
                batch.save(update_fields=changed)
                labels = {model: label for _, model, label in BATCH_EDIT_FIELDS}
                summary = ', '.join(f"{labels.get(n, n)} {before[n] if before[n] not in (None, '') else '—'} → {after[n] if after[n] not in (None, '') else '—'}" for n in changed)
                product_name = batch.product.name if batch.product else 'Custom product'
                log_activity(
                    action='UPDATE',
                    module='inventory',
                    entity_type='Batch',
                    entity_id=batch.id,
                    entity_label=f'{product_name} / {batch.batch_no}',
                    description=f'Edited batch {batch.batch_no} of {product_name}: {summary}',
                    changes={n: {'old': _plain(before[n]), 'new': _plain(after[n])} for n in changed},
                    user=request.user,
                    request=request,
                    outlet=batch.outlet,
                )

        if changed:
            # lists, counts and the billing screen's product search must show the new price / date / rack at once
            bump_inventory_cache(batch.outlet_id)

        payload = serialize_batch(batch)
        payload['changed'] = changed
        cost = batch.landing_rate or batch.purchase_rate
        payload['warnings'] = (
            [f"MRP ₹{batch.mrp} is below the cost ₹{cost}: this batch will sell at a loss."]
            if cost and batch.mrp < cost else []
        )
        return Response(payload, status=status.HTTP_200_OK)


def serialize_product(product, total_stock=0, nearest_expiry="2099-12-31", is_low_stock=False, batches=None):
    return {
        'id': str(product.id),
        'name': product.name,
        'composition': product.composition,
        'manufacturer': product.manufacturer,
        'category': product.category,
        'drugType': product.drug_type,
        'scheduleType': product.schedule_type,
        'hsnCode': product.hsn_code,
        'gstRate': float(product.gst_rate),
        'packSize': product.pack_size,
        'packUnit': product.pack_unit,
        'packType': product.pack_type,
        'allowsLoose': allows_loose(product.pack_size, product.pack_type),
        'barcode': product.barcode,
        'isFridge': product.is_fridge,
        'isDiscontinued': product.is_discontinued,
        'imageUrl': product.image_url,
        'mrp': float(product.mrp),
        'saleRate': float(product.mrp),
        'outletProductId': str(product.id),
        'totalStock': total_stock,
        'nearestExpiry': nearest_expiry,
        'isLowStock': is_low_stock,
        'batches': batches or [],
    }

def serialize_batch(batch):
    return {
        'id': str(batch.id),
        'outletId': str(batch.outlet.id),
        'outletProductId': str(batch.product.id),
        'batchNo': batch.batch_no,
        'mfgDate': batch.mfg_date.isoformat() if batch.mfg_date else None,
        'expiryDate': batch.expiry_date.isoformat() if batch.expiry_date else None,
        'mrp': float(batch.mrp),
        'ptr': float(batch.ptr) if batch.ptr else 0.0,
        'pts': float(batch.pts) if batch.pts else 0.0,
        'purchaseRate': float(batch.purchase_rate),
        'landingRate': float(batch.landing_rate) if batch.landing_rate else None,
        'saleRate': float(batch.mrp),
        'qtyStrips': batch.qty_strips,
        'qtyLoose': batch.qty_loose,
        'packSize': batch.pack_size,
        'packUnit': batch.pack_unit,
        'packType': batch.pack_type,
        'allowsLoose': batch_allows_loose(batch),
        'rackLocation': batch.rack_location,
        'isActive': batch.is_active,
        'createdAt': batch.created_at.isoformat(),
    }


class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanManageProducts()]
        return [IsAuthenticated()]

    def get(self, request, *args, **kwargs):
        products = MasterProduct.objects.all()
        return Response([serialize_product(p) for p in products], status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        data = request.data
        name = (data.get('name') or '').strip()
        hsn_code = (data.get('hsnCode') or '').strip()
        pack_unit = (data.get('packUnit') or '').strip()
        pack_type = normalize_pack_type(data.get('packType') or 'strip')
        schedule_type = (data.get('scheduleType') or 'OTC').strip()

        errors = {}
        if not name:
            errors['name'] = 'Product name is required'
        if not hsn_code:
            errors['hsnCode'] = 'HSN code is required'
        if not pack_unit:
            errors['packUnit'] = 'Pack unit is required'

        try:
            gst_rate = Decimal(str(data.get('gstRate', 0)))
            is_valid, err_msg = TaxSlab.is_rate_active(gst_rate)
            if not is_valid:
                errors['gstRate'] = err_msg
        except (InvalidOperation, TypeError):
            errors['gstRate'] = 'Invalid GST rate'
            gst_rate = Decimal('0')

        try:
            pack_size = int(data.get('packSize', 1))
            if pack_size < 1:
                errors['packSize'] = 'Pack size must be ≥ 1'
        except (ValueError, TypeError):
            errors['packSize'] = 'Invalid pack size'
            pack_size = 1

        try:
            mrp = Decimal(str(data.get('mrp', 0)))
            if mrp <= 0:
                errors['mrp'] = 'MRP must be > 0'
        except (InvalidOperation, TypeError):
            errors['mrp'] = 'Invalid MRP'
            mrp = Decimal('0')

        if not errors:
            errors.update(pack_errors(pack_size, pack_unit, pack_type))

        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        # Derive drug_type from schedule_type
        schedule_to_drug = {
            'OTC': 'allopathy', 'G': 'allopathy', 'H': 'allopathy', 'H1': 'allopathy',
            'X': 'allopathy', 'C': 'allopathy', 'Narcotic': 'allopathy',
            'Ayurvedic': 'ayurveda', 'Surgical': 'allopathy',
            'Cosmetic': 'fmcg', 'Veterinary': 'allopathy',
        }
        drug_type = schedule_to_drug.get(schedule_type, 'allopathy')

        composition = (data.get('composition') or '')
        manufacturer = (data.get('manufacturer') or '')

        try:
            with transaction.atomic():
                product = MasterProduct.objects.create(
                    name=name,
                    composition=composition,
                    manufacturer=manufacturer,
                    category='general',
                    drug_type=drug_type,
                    schedule_type=schedule_type,
                    hsn_code=hsn_code,
                    gst_rate=gst_rate,
                    pack_size=pack_size,
                    pack_unit=pack_unit,
                    pack_type=pack_type,
                    mrp=mrp,
                )
        except IntegrityError as e:
            return Response(
                {'errors': {'detail': 'A database integrity error occurred (e.g. duplicate barcode).'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(serialize_product(product), status=status.HTTP_201_CREATED)


def _sync_batches_to_product(product, size_changed):
    """
    A product's pack definition is copied onto each of its batches, and billing sells from the
    BATCH. Editing only the product used to leave every batch with the old (wrong) pack, so the
    bill kept showing the old units and the old loose rules: the edit looked saved but fixed nothing.

    Unit and type are descriptions of the product, so every batch always takes them from it (saving
    the product therefore also repairs batches that drifted earlier). Pack SIZE is a per-batch
    fact that a purchase may legitimately change, so it follows the product only when the size
    itself was just changed. Returns how many batches were touched.
    """
    touched = 0
    for batch in Batch.objects.select_for_update().filter(product=product):
        size = product.pack_size if size_changed else batch.pack_size
        changed = sync_batch_to_pack(batch, size, product.pack_unit, product.pack_type)
        if changed:
            batch.save(update_fields=changed)
            touched += 1
    return touched


PRODUCT_AUDITED_FIELDS = (
    'name', 'composition', 'manufacturer', 'hsn_code', 'gst_rate', 'pack_size', 'pack_unit', 'pack_type',
    'schedule_type', 'drug_type', 'mrp', 'barcode', 'is_fridge', 'is_discontinued',
)


class ProductDetailView(APIView):

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsManagerOrAbove()]
        return [IsAuthenticated()]

    def get(self, request, pk, *args, **kwargs):
        try:
            product = MasterProduct.objects.get(id=pk)
            return Response(serialize_product(product), status=status.HTTP_200_OK)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk, *args, **kwargs):
        try:
            product = MasterProduct.objects.get(id=pk)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        errors = {}
        old_pack_size = product.pack_size
        before = {f: getattr(product, f) for f in PRODUCT_AUDITED_FIELDS}

        # --- Validate & apply fields ---
        SCHEDULE_TO_DRUG = {
            'OTC': 'allopathy', 'G': 'allopathy', 'H': 'allopathy', 'H1': 'allopathy',
            'X': 'allopathy', 'C': 'allopathy', 'Narcotic': 'allopathy',
            'Ayurvedic': 'ayurveda', 'Surgical': 'allopathy',
            'Cosmetic': 'fmcg', 'Veterinary': 'allopathy',
        }

        if 'name' in data:
            name = (data['name'] or '').strip()
            if not name:
                errors['name'] = 'Product name is required'
            else:
                product.name = name

        if 'composition' in data:
            product.composition = (data['composition'] or '').strip()

        if 'manufacturer' in data:
            product.manufacturer = (data['manufacturer'] or '').strip()

        if 'hsnCode' in data:
            hsn = (data['hsnCode'] or '').strip()
            if not hsn:
                errors['hsnCode'] = 'HSN code is required'
            else:
                product.hsn_code = hsn

        if 'gstRate' in data:
            try:
                candidate_rate = Decimal(str(data['gstRate']))
                is_valid, err_msg = TaxSlab.is_rate_active(candidate_rate)
                if not is_valid:
                    errors['gstRate'] = err_msg
                else:
                    product.gst_rate = candidate_rate
            except (InvalidOperation, TypeError):
                errors['gstRate'] = 'Invalid GST rate'

        if 'packSize' in data:
            try:
                ps = int(data['packSize'])
                if ps < 1:
                    errors['packSize'] = 'Pack size must be ≥ 1'
                else:
                    product.pack_size = ps
            except (ValueError, TypeError):
                errors['packSize'] = 'Invalid pack size'

        if 'packUnit' in data:
            pu = (data['packUnit'] or '').strip()
            if not pu:
                errors['packUnit'] = 'Pack unit is required'
            else:
                product.pack_unit = pu

        if 'packType' in data and data['packType']:
            product.pack_type = normalize_pack_type(data['packType'])

        pack_touched = any(k in data for k in ('packSize', 'packUnit', 'packType'))
        if pack_touched and not errors:
            errors.update(pack_errors(product.pack_size, product.pack_unit, product.pack_type))

        if 'scheduleType' in data:
            st = (data['scheduleType'] or 'OTC').strip()
            product.schedule_type = st
            product.drug_type = SCHEDULE_TO_DRUG.get(st, 'allopathy')

        if 'mrp' in data:
            try:
                mrp = Decimal(str(data['mrp']))
                if mrp < 0:
                    errors['mrp'] = 'MRP cannot be negative'
                else:
                    product.mrp = mrp
            except (InvalidOperation, TypeError):
                errors['mrp'] = 'Invalid MRP'

        if 'saleRate' in data:
            try:
                sr = Decimal(str(data['saleRate']))
                if sr < 0:
                    errors['saleRate'] = 'Sale rate cannot be negative'
                else:
                    product.mrp = sr
            except (InvalidOperation, TypeError):
                errors['saleRate'] = 'Invalid sale rate'

        if 'minQty' in data:
            try:
                product.min_qty = int(data['minQty'])
            except (ValueError, TypeError):
                errors['minQty'] = 'Invalid min qty'

        if 'reorderQty' in data:
            try:
                product.reorder_qty = int(data['reorderQty'])
            except (ValueError, TypeError):
                errors['reorderQty'] = 'Invalid reorder qty'

        if 'isFridge' in data:
            product.is_fridge = bool(data['isFridge'])

        if 'isDiscontinued' in data:
            product.is_discontinued = bool(data['isDiscontinued'])

        if 'barcode' in data:
            product.barcode = (data['barcode'] or '').strip() or None

        if errors:
            print("Product PUT errors:", errors, flush=True)
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                product.save()
                batches_updated = (
                    _sync_batches_to_product(product, size_changed=old_pack_size != product.pack_size)
                    if pack_touched else 0
                )
            from django.core.cache import cache
            cache.clear()
        except IntegrityError:
            return Response(
                {'errors': {'barcode': 'This barcode is already used by another product.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        after = {f: getattr(product, f) for f in PRODUCT_AUDITED_FIELDS}
        changed = [f for f in PRODUCT_AUDITED_FIELDS if after[f] != before[f]]
        if changed:
            # product details are shared by every outlet, so who changed what must be on record
            log_activity(
                action='UPDATE',
                module='inventory',
                entity_type='Product',
                entity_id=product.id,
                entity_label=product.name,
                description=f"Edited product {product.name}: " + ', '.join(f"{f} {before[f]} → {after[f]}" for f in changed),
                changes={f: {'old': _plain(before[f]), 'new': _plain(after[f])} for f in changed},
                user=request.user,
                request=request,
                outlet=getattr(request.user, 'outlet', None),
            )
        logger.info(f"MasterProduct {product.id} updated by {request.user} ({batches_updated} batches re-synced)")
        payload = serialize_product(product)
        payload['batchesUpdated'] = batches_updated
        return Response(payload, status=status.HTTP_200_OK)


class ProductBatchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
            
        try:
            product = MasterProduct.objects.get(id=pk)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

        batches = Batch.objects.filter(
            product=product, 
            outlet=outlet, 
            is_active=True
        ).exclude(qty_strips=0, qty_loose=0).order_by('expiry_date')
        
        return Response([serialize_batch(b) for b in batches], status=status.HTTP_200_OK)


class InventoryExportExcelView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        import openpyxl
        from openpyxl.styles import Font
        from io import BytesIO
        from django.http import HttpResponse
            
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        batches = Batch.objects.filter(outlet=outlet).exclude(qty_strips=0, qty_loose=0).select_related('product')
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Batch Details"

        headers = [
            'Product Name', 'Batch Number', 'Expiry Date', 
            'Qty Strips', 'Qty Loose', 'Pack Size', 'Pack Unit', 
            'MRP', 'Purchase Rate', 'Landing Rate', 'Rack Location',
            'HSN Code', 'GST Rate'
        ]
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)

        for b in batches.iterator():
            ws.append([
                b.product.name if b.product else '',
                b.batch_no,
                b.expiry_date.isoformat() if b.expiry_date else '',
                b.qty_strips,
                b.qty_loose,
                b.pack_size,
                b.pack_unit,
                float(b.mrp),
                float(b.purchase_rate),
                float(b.landing_rate) if b.landing_rate else '',
                b.rack_location or '',
                b.product.hsn_code if b.product else '',
                float(b.product.gst_rate) if b.product else 0,
            ])

        virtual_workbook = BytesIO()
        wb.save(virtual_workbook)
        response = HttpResponse(
            virtual_workbook.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="Batch-Details.xlsx"'
        return response


def _price_q(prefix, low, high):
    """Q for `<prefix>mrp` inside [low, high]; high None means no upper limit."""
    q = Q(**{f'{prefix}mrp__gte': low})
    if high is not None:
        q &= Q(**{f'{prefix}mrp__lte': high})
    return q


def _stock_exists(outlet, today, is_purchase_context, price=None):
    """EXISTS(a batch of this outlet with stock): the same batches the result list shows, so 'in stock' means one thing."""
    from django.db.models import Exists, OuterRef
    batches = Batch.objects.filter(product_id=OuterRef('pk'), outlet=outlet, is_active=True).filter(Q(qty_strips__gt=0) | Q(qty_loose__gt=0))
    if not is_purchase_context:
        batches = batches.filter(expiry_date__gt=today)
    if price is not None:
        batches = batches.filter(_price_q('', *price))
    return Exists(batches)


SEARCH_CANDIDATES = 100     # products looked at per search (in-stock ones first)
SEARCH_IN_STOCK = 30        # shown: matches that are in stock ...
SEARCH_ZERO_STOCK = 10      # ... then matches that are not


def _find_search_candidates(parsed, outlet, today, is_purchase_context):
    """
    Products matching a parsed search box (see apps/inventory/search_query.py), best first: in stock, then by how well they match.
    Returns (products, price) where price is (low, high, target) for a price search, else None.
    """
    from django.db.models import Case, When, Value, IntegerField, FloatField
    from django.db.models.functions import Greatest
    from django.contrib.postgres.search import TrigramWordSimilarity

    active = MasterProduct.objects.filter(is_discontinued=False)
    in_stock = _stock_exists(outlet, today, is_purchase_context)
    tokens = parsed.tokens

    if parsed.kind == 'barcode':
        exact = list(active.filter(barcode=parsed.raw)[:1])
        if exact:
            return exact, None
        parsed = ParsedQuery('text', parsed.raw, [parsed.raw])   # not a known barcode: search it as text
        tokens = parsed.tokens

    if parsed.kind == 'salt':
        in_comp = Q()
        for tok in tokens:
            in_comp &= Q(composition__icontains=tok)
        qs = active.filter(in_comp).annotate(
            in_stock=in_stock,
            match_priority=Case(When(composition__istartswith=tokens[0], then=Value(2)), default=Value(1), output_field=IntegerField()),
        ).order_by('-in_stock', '-match_priority', 'name')
        return list(qs[:SEARCH_CANDIDATES]), None

    if parsed.kind == 'price':
        from django.db.models import Subquery, OuterRef, F
        from django.db.models.functions import Abs, Coalesce
        price = (parsed.price_low, parsed.price_high)
        in_name = Q(name__istartswith=tokens[0])
        for tok in tokens[1:]:
            in_name &= Q(name__icontains=tok)
        qs = active.filter(in_name).filter(
            _price_q('', *price) | _stock_exists(outlet, today, is_purchase_context, price=price)
        ).annotate(in_stock=in_stock)
        if parsed.price_target is not None:
            # "about N": closest price first. A batch in the window counts as the product's price when there is one
            target = parsed.price_target
            batch_gap = Batch.objects.filter(product_id=OuterRef('pk'), outlet=outlet, is_active=True).filter(Q(qty_strips__gt=0) | Q(qty_loose__gt=0)).filter(_price_q('', *price))
            if not is_purchase_context:
                batch_gap = batch_gap.filter(expiry_date__gt=today)
            batch_gap = batch_gap.annotate(g=Abs(F('mrp') - target)).order_by('g').values('g')[:1]
            # the price shown for a product is its closest in-window batch (what billing sells); only without one is the catalogue MRP used
            qs = qs.annotate(price_gap=Coalesce(Subquery(batch_gap), Abs(F('mrp') - target))).order_by('-in_stock', 'price_gap', 'name')
        else:
            qs = qs.order_by('-in_stock', 'name')
        return list(qs[:SEARCH_CANDIDATES]), (parsed.price_low, parsed.price_high, parsed.price_target)

    # plain text
    query = parsed.raw
    any_field = Q()
    name_all = Q()
    for tok in tokens:
        any_field &= (Q(name__icontains=tok) | Q(composition__icontains=tok) | Q(manufacturer__icontains=tok))
        name_all &= Q(name__icontains=tok)
    qs = active.filter(any_field).annotate(
        in_stock=in_stock,
        match_priority=Case(
            When(name__istartswith=query, then=Value(4)),
            When(name_all & Q(name__istartswith=tokens[0]), then=Value(3)),   # "dolo 650": the name starts with the first word you typed
            When(name_all, then=Value(2)),
            When(composition__icontains=query, then=Value(1)),
            default=Value(0),
            output_field=IntegerField(),
        ),
    ).order_by('-in_stock', '-match_priority', 'name')
    found = list(qs[:SEARCH_CANDIDATES])
    if found:
        return found, None

    # Nothing contains every word: tolerate typos ("amoxcilin") by trigram word-similarity.
    FUZZY_MIN_SIMILARITY = 0.4
    fuzzy = active.annotate(
        similarity=Greatest(
            TrigramWordSimilarity(query, 'name'),
            TrigramWordSimilarity(query, 'composition'),
            output_field=FloatField(),
        )
    ).filter(similarity__gte=FUZZY_MIN_SIMILARITY).order_by('-similarity', 'name')
    return list(fuzzy[:SEARCH_CANDIDATES]), None


def _assemble_search_results(products, outlet, today, is_purchase_context, price=None, extras=None):
    """
    The product + stock + batches payload of a search, for products already chosen and ordered.
    In-stock products come first (keeping their order), then out-of-stock ones; `price` = (low, high, target) of a price search narrows each
    product's batches to that window when it has any (closest to the target first) and reports `matchedMrp`;
    `extras` ({product id: dict}) is merged into the matching result.
    """
    from apps.inventory.models import OutletProductConfig
    if not products:
        return []
    candidate_ids = [p.id for p in products]

    batch_filter = Q(outlet=outlet, is_active=True, product_id__in=candidate_ids)
    if not is_purchase_context:
        batch_filter &= Q(expiry_date__gt=today)
    batches_by_product = {}
    for b in Batch.objects.filter(batch_filter).order_by('expiry_date'):
        batches_by_product.setdefault(b.product_id, []).append(b)

    configs_by_product = {
        cfg.product_id: cfg
        for cfg in OutletProductConfig.objects.filter(outlet=outlet, product_id__in=candidate_ids)
    }

    in_stock = []
    zero_stock = []
    for product in products:
        batches = batches_by_product.get(product.id, [])
        cfg = configs_by_product.get(product.id)
        outlet_min_qty = float(cfg.min_qty) if cfg else 0.0
        outlet_reorder_qty = float(cfg.reorder_qty) if cfg else 0.0

        non_expired = [b for b in batches if b.expiry_date > today]
        nearest_expiry = (
            non_expired[0].expiry_date.isoformat()
            if non_expired
            else (batches[0].expiry_date.isoformat() if batches else "2099-12-31")
        )

        available_batches = [b for b in batches if (b.qty_strips > 0 or b.qty_loose > 0)]
        matched_mrp = None
        if price is not None:
            low, high, target = price
            at_price = [b for b in available_batches if b.mrp >= low and (high is None or b.mrp <= high)]
            if target is not None:
                at_price.sort(key=lambda b: abs(b.mrp - target))      # stable: equal gaps keep the first-expiry-first order
            if at_price:
                available_batches = at_price      # "L+175": only the batch(es) in the typed price window
                matched_mrp = float(at_price[0].mrp)
            elif product.mrp >= low and (high is None or product.mrp <= high):
                matched_mrp = float(product.mrp)
        total_stock_strips = sum(b.qty_strips for b in available_batches)
        total_stock_loose = sum(b.qty_loose for b in available_batches)
        has_stock = total_stock_strips > 0 or total_stock_loose > 0

        pack_sz = product.pack_size or 1
        total_stock_fractional = total_stock_strips + (total_stock_loose / pack_sz)
        is_low_stock = total_stock_fractional < 10

        batch_list = [serialize_batch(b) for b in available_batches]

        result = {
            'id': str(product.id),
            'name': product.name,
            'composition': product.composition,
            'manufacturer': product.manufacturer,
            'category': product.category,
            'drugType': product.drug_type,
            'scheduleType': product.schedule_type,
            'hsnCode': product.hsn_code,
            'gstRate': float(product.gst_rate),
            'packSize': product.pack_size,
            'packUnit': product.pack_unit,
            'packType': product.pack_type,
            'allowsLoose': allows_loose(product.pack_size, product.pack_type),
            'barcode': product.barcode,
            'isFridge': product.is_fridge,
            'isDiscontinued': product.is_discontinued,
            'imageUrl': product.image_url,
            'mrp': float(product.mrp),
            'saleRate': float(product.mrp),
            'outletProductId': str(product.id),
            'minQty': outlet_min_qty,
            'reorderQty': outlet_reorder_qty,
            'has_stock': has_stock,
            'total_qty_strips': total_stock_strips,
            'total_qty_loose': total_stock_loose,
            'totalStock': total_stock_fractional,
            'nearestExpiry': nearest_expiry,
            'isLowStock': is_low_stock,
            'batches': batch_list,
            'available_batches': batch_list,
        }
        if price is not None:
            result['matchedMrp'] = matched_mrp      # the price the typed number matched (a batch's MRP can differ from the catalogue MRP)
        if extras and product.id in extras:
            result.update(extras[product.id])

        (in_stock if has_stock else zero_stock).append(result)

    return in_stock[:SEARCH_IN_STOCK] + zero_stock[:SEARCH_ZERO_STOCK]


class ProductSearchView(APIView):
    """
    GET /api/v1/products/search/?q=paracetamol&outletId=xxx[&context=purchase]

    The medicine search box. `q` can be (see apps/inventory/search_query.py):
      dolo 650        every word in the name / salt / maker, any order (typos tolerated when nothing matches)
      L+175           names starting with L priced about 175 (+/-10%), closest first; L+20-30 range, L+<50, L+>100, L+=23.50 exact
      C,losartan      every brand whose composition contains losartan
      8901234567890   a scanned barcode: exactly that product (when it is a known barcode)
    In-stock products come first. Returns {"data": [ProductSearchResult, ...]}.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        import hashlib
        from django.core.cache import cache

        query = request.query_params.get('q', '').strip()
        outlet_id = request.query_params.get('outletId')
        # context=purchase -> show all active batches regardless of expiry so
        # pharmacists can search medicines to buy even if current stock is expired.
        context = request.query_params.get('context', '').strip().lower()
        is_purchase_context = context == 'purchase'

        parsed = parse_query(query)
        if len(query) < MIN_CHARS or not parsed.usable:
            logger.debug(f"Search query too short: {len(query)} chars")
            return Response({'data': []}, status=status.HTTP_200_OK)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        logger.info(f"Searching products for: '{query}' [{parsed.kind}] (outlet: {outlet.name}, context: {context or 'default'})")
        today = datetime.now().date()

        # 60s cache; the query is hashed so spaces / '+' / ',' can never make an invalid cache key
        qhash = hashlib.md5(query.lower().encode('utf-8')).hexdigest()
        cache_key = f"prod_search:v3:{outlet_id}:i{inventory_cache_version(outlet_id)}:{context}:{qhash}"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return Response({'data': cached_result}, status=status.HTTP_200_OK)

        products, price = _find_search_candidates(parsed, outlet, today, is_purchase_context)
        results = _assemble_search_results(products, outlet, today, is_purchase_context, price=price)
        cache.set(cache_key, results, 60)

        logger.info(f"Returning {len(results)} products for '{query}'")
        return Response({'data': results}, status=status.HTTP_200_OK)


class ProductSubstitutesView(APIView):
    """
    GET /api/v1/products/<product_id>/substitutes/?outletId=xxx

    Other brands with the same salt(s) as this product: the "press A on a medicine" lookup.
    Same salts means the same set, in any order ('A & B' == 'B + A'); a product with no composition recorded has no substitutes.
    The catalogue keeps strengths in the NAME, not the composition, so each result says whether its strength and dosage form match
    (`substitute.sameStrength` / `sameForm`: true / false / null when a name does not say) and those come first.
    In-stock brands come before out-of-stock ones.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, product_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=status.HTTP_404_NOT_FOUND)
        base = MasterProduct.objects.filter(id=product_id).first()
        if base is None:
            return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

        context = request.query_params.get('context', '').strip().lower()
        is_purchase_context = context == 'purchase'
        today = datetime.now().date()
        header = {'id': str(base.id), 'name': base.name, 'composition': base.composition}

        salts = salt_set(base.composition)
        if not salts:
            return Response({'data': [], 'product': header, 'reason': 'no_composition'}, status=status.HTTP_200_OK)

        # DB narrows by the first word of the longest salt; Python then compares the exact salt sets
        longest = max(salts, key=len)
        word = max(longest.split(), key=len)
        pool = MasterProduct.objects.filter(is_discontinued=False, composition__icontains=word).exclude(id=base.id).order_by('name')[:1500]
        base_strengths, base_form = strengths(base.name), dosage_form(base.name)

        ranked, extras = [], {}
        for p in pool:
            if salt_set(p.composition) != salts:
                continue
            p_strengths, p_form = strengths(p.name), dosage_form(p.name)
            same_strength = (p_strengths == base_strengths) if (p_strengths and base_strengths) else None
            same_form = (p_form == base_form) if (p_form and base_form) else None
            extras[p.id] = {'substitute': {'sameStrength': same_strength, 'sameForm': same_form}}
            rank = (0 if same_strength is True else 1 if same_strength is None else 2,
                    0 if same_form is True else 1 if same_form is None else 2,
                    p.name)
            ranked.append((rank, p))
        ranked.sort(key=lambda item: item[0])

        # _assemble_search_results puts in-stock brands first and keeps this strength / form order inside each group
        products = [p for _, p in ranked[:300]]
        results = _assemble_search_results(products, outlet, today, is_purchase_context, extras=extras)
        return Response({'data': results, 'product': header}, status=status.HTTP_200_OK)


class ProductSuggestionsView(APIView):
    """
    GET /api/v1/products/suggestions/?field=manufacturer|composition&q=cip&limit=8

    Options for the Manufacturer and Composition boxes of the product forms, from the catalogue itself (see apps/inventory/suggestions.py:
    filler dropped, spellings merged, ranked). q may be empty: the most used values. A composition also carries the commonest hsnCode,
    gstRate and scheduleType of its products so the form can fill the empty ones.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        field = request.query_params.get('field', '')
        if field not in SUGGEST_FIELDS:
            return Response({'detail': f"field must be one of: {', '.join(sorted(SUGGEST_FIELDS))}"}, status=status.HTTP_400_BAD_REQUEST)
        query = request.query_params.get('q', '').strip()[:80]
        try:
            limit = int(request.query_params.get('limit', 8))
        except (TypeError, ValueError):
            limit = 8

        import hashlib
        from django.core.cache import cache
        cache_key = f"prod_suggest:v1:{field}:{limit}:{hashlib.md5(query.lower().encode('utf-8')).hexdigest()}"
        data = cache.get(cache_key)
        if data is None:
            data = suggest_values(field, query, limit)
            cache.set(cache_key, data, 120)
        return Response({'data': data}, status=status.HTTP_200_OK)


class MasterCatalogSearchView(APIView):
    """
    GET /api/v1/products/catalog/search/?q=paracetamol&outletId=xxx
    
    Strictly for Procurement/PO Workspace.
    Searches global MasterProduct catalog so zero-stock items can be ordered.
    Returns pack_size, pack_type, dynamically annotated current_stock, and min_qty.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        query = request.query_params.get('q', '').strip()
        outlet_id = request.query_params.get('outletId')

        parsed = parse_query(query)
        if len(query) < MIN_CHARS or not parsed.usable:
            return Response({'data': []}, status=status.HTTP_200_OK)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        query_lower = query.lower()

        # Fast cache check (60s TTL); the query is hashed so it can never make an invalid cache key
        import hashlib
        from django.core.cache import cache
        cache_key = f"prod_catalog_search:v3:{outlet_id}:{hashlib.md5(query_lower.encode('utf-8')).hexdigest()}"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return Response({'data': cached_result}, status=status.HTTP_200_OK)

        from django.db.models import Case, When, Value, IntegerField, Q

        # same search syntax as billing (L+23.50 / C,losartan / a barcode), over the whole catalogue
        tokens = parsed.tokens
        if parsed.kind == 'salt':
            match = Q()
            for tok in tokens:
                match &= Q(composition__icontains=tok)
            priority = Case(When(composition__istartswith=tokens[0], then=Value(2)), default=Value(1), output_field=IntegerField())
        elif parsed.kind == 'price':
            match = Q(name__istartswith=tokens[0]) & _price_q('', parsed.price_low, parsed.price_high)
            for tok in tokens[1:]:
                match &= Q(name__icontains=tok)
            priority = Value(1, output_field=IntegerField())
        else:
            match = Q()
            name_all = Q()
            for tok in tokens:
                match &= (Q(name__icontains=tok) | Q(composition__icontains=tok) | Q(manufacturer__icontains=tok))
                name_all &= Q(name__icontains=tok)
            if parsed.kind == 'barcode':
                match = Q(barcode=parsed.raw) | match
            priority = Case(
                When(name__istartswith=query, then=Value(3)),
                When(name_all, then=Value(2)),
                When(composition__icontains=query, then=Value(1)),
                default=Value(0),
                output_field=IntegerField()
            )
        matched_qs = MasterProduct.objects.filter(is_discontinued=False).filter(match).annotate(
            match_priority=priority
        ).order_by('-match_priority', 'name')

        products = list(matched_qs[:30])
        if not products:
            cache.set(cache_key, [], 60)
            return Response({'data': []}, status=status.HTTP_200_OK)

        candidate_ids = [p.id for p in products]

        # Single Batch Query for stock
        batches_qs = Batch.objects.filter(
            outlet_id=outlet_id,
            is_active=True,
            product_id__in=candidate_ids
        )
        stock_by_product = {}
        for b in batches_qs:
            stock = stock_by_product.setdefault(b.product_id, {'strips': 0, 'loose': 0})
            stock['strips'] += b.qty_strips
            stock['loose'] += b.qty_loose

        # Single Config Query
        from apps.inventory.models import OutletProductConfig
        configs = {
            c.product_id: c.min_qty
            for c in OutletProductConfig.objects.filter(outlet_id=outlet_id, product_id__in=candidate_ids)
        }

        results = []
        for p in products:
            stk = stock_by_product.get(p.id, {'strips': 0, 'loose': 0})
            effective_stock = stk['strips'] + (stk['loose'] / (p.pack_size or 1))
            
            results.append({
                'id': str(p.id),
                'name': p.name,
                'composition': p.composition,
                'manufacturer': p.manufacturer,
                'packSize': p.pack_size,
                'packUnit': p.pack_unit,
                'packType': p.pack_type,
                'allowsLoose': allows_loose(p.pack_size, p.pack_type),
                'minQty': float(configs.get(p.id, 0.0)),
                'currentStock': effective_stock,
                'mrp': float(p.mrp),
                'purchaseRate': float(p.mrp) * 0.8,
            })

        cache.set(cache_key, results, 60)
        return Response({'data': results}, status=status.HTTP_200_OK)


class InventoryListView(APIView):
    """
    GET /api/v1/inventory/?outletId=xxx&search=para&lowStock=true&expiringSoon=true&export_format=csv

    4-layer optimized inventory list:
    1. DB-level LIMIT/OFFSET pagination  — never loads all products into RAM
    2. pg_trgm GIN indexes              — icontains search on 50k products <5ms
    3. SQL annotations (SUM/MIN)        — totals computed by PostgreSQL, not Python
    4. Redis cache (2-min TTL)          — repeat page loads cost ~0ms
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from django.core.cache import cache
        import hashlib
        import json as _json
        from collections import defaultdict
        from django.db.models import Sum, OuterRef, Subquery, IntegerField, F, FloatField, ExpressionWrapper, Case, When, Value, Exists
        from django.db.models.functions import Coalesce, Cast, NullIf
        from datetime import timedelta

        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        # ── LAYER 4: Redis cache ───────────────────────────────────────────────
        product_id_filter = request.query_params.get('productId', '').strip()
        use_cache = not product_id_filter

        cache_params = {k: v for k, v in request.query_params.items() if k != 'outletId'}
        param_h = hashlib.md5(_json.dumps(cache_params, sort_keys=True).encode()).hexdigest()[:12]
        cache_key = f"inventory:list:{outlet_id}:v{inventory_cache_version(outlet_id)}:{param_h}"

        if use_cache:
            cached = cache.get(cache_key)
            if cached is not None:
                logger.debug(f"[CACHE HIT] inventory for outlet {outlet.name}")
                return Response(cached, status=status.HTTP_200_OK)

        # ── Parse request params ───────────────────────────────────────────────
        today         = datetime.now().date()
        page          = max(1, int(request.query_params.get('page', 1)))
        page_size     = min(max(1, int(request.query_params.get('pageSize', 50))), 100)
        search_query  = request.query_params.get('search', '').strip()
        schedule_type = request.query_params.get('scheduleType', '')
        low_stock     = request.query_params.get('lowStock', '').lower() == 'true'
        expiring_soon = request.query_params.get('expiringSoon', '').lower() == 'true'
        sort_by       = request.query_params.get('sortBy', 'name')
        sort_order    = request.query_params.get('sortOrder', 'asc')

        # ── LAYER 1: Build product queryset — entirely at DB level ────────────
        # Include ALL products with active batches at this outlet, regardless of expiry.
        # Expired-but-in-stock items (e.g. from Marg import) should be visible in
        # inventory so staff can manage / return / adjust them.
        products = MasterProduct.objects.filter(
            id__in=Batch.objects.filter(
                outlet_id=outlet_id,
                is_active=True,
            ).values('product_id').distinct()
        )

        if product_id_filter:
            products = products.filter(id=product_id_filter)

        # ── LAYER 2: pg_trgm search (uses GIN index, <5ms on 50k products) ────
        if search_query:
            products = products.filter(
                Q(name__icontains=search_query) |
                Q(composition__icontains=search_query) |
                Q(manufacturer__icontains=search_query)
            )

        if schedule_type and schedule_type != 'all':
            products = products.filter(schedule_type=schedule_type)

        # ── LAYER 3: SQL annotations — PostgreSQL computes totals ─────────────
        # Use ALL active batches for qty totals (including expired) so imported
        # Marg stock with old expiry dates is not invisible in the inventory view.
        all_active_sq = Batch.objects.filter(
            outlet_id=outlet_id,
            is_active=True,
            product_id=OuterRef('pk'),
        )
        # Batches that still hold stock. "Nearest expiry" is the earliest of THESE, expired or not:
        # it used to skip expired batches, so a product whose stock had all expired showed no expiry
        # at all (and never appeared under "Expiring Soon") although that is the stock to write off.
        stocked_sq = all_active_sq.filter(Q(qty_strips__gt=0) | Q(qty_loose__gt=0))

        from apps.inventory.models import OutletProductConfig
        config_sq = OutletProductConfig.objects.filter(
            outlet_id=outlet_id,
            product_id=OuterRef('pk')
        )

        products = products.annotate(
            total_strips=Coalesce(
                Subquery(
                    all_active_sq.values('product_id')
                        .annotate(s=Sum('qty_strips')).values('s')[:1],
                    output_field=IntegerField()
                ),
                0
            ),
            total_loose=Coalesce(
                Subquery(
                    all_active_sq.values('product_id')
                        .annotate(s=Sum('qty_loose')).values('s')[:1],
                    output_field=IntegerField()
                ),
                0
            ),
            nearest_expiry=Subquery(
                stocked_sq.order_by('expiry_date').values('expiry_date')[:1]
            ),
            outlet_min_qty=Coalesce(Subquery(config_sq.values('min_qty')[:1], output_field=FloatField()), 0.0),
            outlet_reorder_qty=Coalesce(Subquery(config_sq.values('reorder_qty')[:1], output_field=FloatField()), 0.0)
        )

        # Push low-stock and expiring-soon filters to DB.
        # A product with no minimum configured for this outlet uses DEFAULT_MIN_QTY, the same rule the
        # row flag (`isLowStock`) and the dashboard alerts use. The filter used to compare against the
        # unconfigured 0 and so matched nothing for most products, while the row flag said "low".
        if low_stock:
            products = products.annotate(
                effective_strips=ExpressionWrapper(
                    F('total_strips') + (Cast(F('total_loose'), FloatField()) / Cast(Coalesce(NullIf(F('pack_size'), 0), 1), FloatField())),
                    output_field=FloatField()
                ),
                min_qty_effective=Case(
                    When(outlet_min_qty__gt=0, then=F('outlet_min_qty')),
                    default=Value(float(DEFAULT_MIN_QTY)),
                    output_field=FloatField(),
                ),
            ).filter(effective_strips__lt=F('min_qty_effective'))

        if expiring_soon:
            # any batch that still has stock and expires within 90 days, INCLUDING ones already expired
            cutoff = today + timedelta(days=EXPIRING_SOON_DAYS)
            products = products.filter(Exists(stocked_sq.filter(expiry_date__lte=cutoff)))

        # Sorting at DB level — no Python sort
        sort_map = {'name': 'name', 'stock': 'total_strips', 'expiry': 'nearest_expiry'}
        db_sort = sort_map.get(sort_by, 'name')
        if sort_order == 'desc':
            db_sort = f'-{db_sort}'
        products = products.order_by(db_sort)

        export_format = request.query_params.get('export_format')
        if export_format in ['excel', 'xlsx', 'csv']:
            import openpyxl
            from openpyxl.styles import Font
            from io import BytesIO
            from django.http import HttpResponse

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Product Summary"

            headers = [
                'Product Name', 'Composition', 'Manufacturer', 'Schedule', 
                'Total Strips', 'Total Loose', 'Nearest Expiry', 'Min Qty',
                'HSN Code', 'GST Rate', 'Pack Size', 'Pack Type'
            ]
            ws.append(headers)
            for cell in ws[1]:
                cell.font = Font(bold=True)

            for p in products.iterator():
                ws.append([
                    p.name,
                    p.composition or '',
                    p.manufacturer or '',
                    p.schedule_type or '',
                    p.total_strips,
                    p.total_loose,
                    p.nearest_expiry.isoformat() if p.nearest_expiry else '',
                    p.min_qty or 0,
                    p.hsn_code or '',
                    float(p.gst_rate),
                    p.pack_size,
                    p.pack_type or ''
                ])

            virtual_workbook = BytesIO()
            wb.save(virtual_workbook)
            response = HttpResponse(
                virtual_workbook.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename="Product-Summary.xlsx"'
            return response

        # ── DB-level pagination: LIMIT/OFFSET — the critical fix ──────────────
        total_records = products.count()
        total_pages   = max(1, (total_records + page_size - 1) // page_size)
        start         = (page - 1) * page_size
        products_page = list(products[start: start + page_size])

        logger.info(
            f"[inventory] outlet={outlet.name} q='{search_query}' "
            f"total={total_records} page={page}/{total_pages} n={len(products_page)}"
        )

        if not products_page:
            payload = {
                'data': [],
                'pagination': {
                    'page': page, 'pageSize': page_size,
                    'totalPages': total_pages, 'totalRecords': total_records,
                }
            }
            if use_cache:
                cache.set(cache_key, payload, 120)
            return Response(payload, status=status.HTTP_200_OK)

        # Fetch batches ONLY for this page's products — O(page_size × avg_batches)
        # Include ALL active batches (including expired) so Marg-imported stock is visible.
        page_ids = [p.id for p in products_page]
        page_batches = list(
            Batch.objects.filter(
                product_id__in=page_ids,
                outlet=outlet,
                is_active=True,
            ).order_by('expiry_date', '-created_at')
        )

        batches_map = defaultdict(list)
        for b in page_batches:
            batches_map[b.product_id].append(b)

        results = []
        for product in products_page:
            pbs       = batches_map.get(product.id, [])
            tot_stock = product.total_strips
            tot_loose = product.total_loose
            total_stock_fractional = tot_stock + (tot_loose / (product.pack_size or 1))
            near_exp  = product.nearest_expiry.isoformat() if product.nearest_expiry else "2099-12-31"
            is_low    = total_stock_fractional < (product.outlet_min_qty or DEFAULT_MIN_QTY)

            results.append({
                'id':              str(product.id),
                'name':            product.name,
                'composition':     product.composition,
                'manufacturer':    product.manufacturer,
                'category':        product.category,
                'drugType':        product.drug_type,
                'scheduleType':    product.schedule_type,
                'hsnCode':         product.hsn_code,
                'gstRate':         float(product.gst_rate),
                'packSize':        product.pack_size,
                'packUnit':        product.pack_unit,
                'packType':        product.pack_type,
                'allowsLoose':     allows_loose(product.pack_size, product.pack_type),
                'minQty':          product.outlet_min_qty,
                'reorderQty':      product.outlet_reorder_qty,
                'barcode':         product.barcode,
                'isFridge':        product.is_fridge,
                'isDiscontinued':  product.is_discontinued,
                'imageUrl':        product.image_url,
                'mrp':             float(pbs[0].mrp) if pbs else float(product.mrp),
                'saleRate':        float(pbs[0].mrp) if pbs else float(product.mrp),
                'outletProductId': str(product.id),
                'totalStock':      total_stock_fractional,
                'total_qty_strips': tot_stock,
                'totalLoose':      tot_loose,
                'nearestExpiry':   near_exp,
                'isLowStock':      is_low,
                'batches':         [serialize_batch(b) for b in pbs],
            })

        payload = {
            'data': results,
            'pagination': {
                'page':         page,
                'pageSize':     page_size,
                'totalPages':   total_pages,
                'totalRecords': total_records,
            }
        }

        if use_cache:
            cache.set(cache_key, payload, 120)   # 2-minute TTL

        return Response(payload, status=status.HTTP_200_OK)


class InventoryAlertsView(APIView):
    """
    GET /api/v1/inventory/alerts/?outletId=xxx

    Get inventory alerts: low stock, expiring soon, and out of stock products.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Get inventory alerts.

        Query parameters:
        - outletId: Outlet UUID to filter batches (required)

        Returns:
        {
            "lowStock": [{ "productId", "productName", "totalStock", "reorderQty", "nearestExpiry" }],
            "expiringIn30Days": [{ "productId", "productName", "batchNo", "expiryDate", "daysRemaining", "qty" }],
            "outOfStock": [{ "productId", "productName" }]
        }
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching inventory alerts for outlet: {outlet.name}")

        today = datetime.now().date()
        cutoff_30 = today + timedelta(days=30)
        low_stock = []
        expiring_in_30_days = []
        out_of_stock = []

        # OPTIMIZED: Fetch ALL batches for this outlet in ONE query (with product joined).
        # Before: MasterProduct.objects.all() then N queries per product.
        # After:  1 query total, O(N) Python grouping.
        outlet_batches = Batch.objects.filter(
            outlet=outlet,
            is_active=True,
        ).select_related('product').order_by('expiry_date')

        # Group batches by product; track the product object via first seen batch
        from collections import defaultdict
        batches_map = defaultdict(list)
        product_map = {}
        for batch in outlet_batches:
            batches_map[batch.product_id].append(batch)
            if batch.product_id not in product_map:
                product_map[batch.product_id] = batch.product

        for product_id, product_batches in batches_map.items():
            product = product_map[product_id]

            # Count both strips AND fractional loose stock
            total_stock = sum(
                b.qty_strips + (b.qty_loose / (b.pack_size or 1))
                for b in product_batches
            )

            # Nearest expiry = first batch (already sorted asc by expiry_date)
            nearest_expiry = (
                product_batches[0].expiry_date.isoformat()
                if product_batches
                else None
            )

            if total_stock == 0:
                out_of_stock.append({
                    'productId': str(product.id),
                    'productName': product.name,
                })
            elif total_stock < 10:
                low_stock.append({
                    'productId': str(product.id),
                    'productName': product.name,
                    'totalStock': total_stock,
                    'reorderQty': 50,
                    'nearestExpiry': nearest_expiry,
                })

            # Batches expiring within 30 days with stock remaining
            for batch in product_batches:
                has_loose_stock = batch.qty_loose > 0
                has_strip_stock = batch.qty_strips > 0
                if (batch.expiry_date and
                        today <= batch.expiry_date <= cutoff_30 and
                        (has_strip_stock or has_loose_stock)):
                    expiring_in_30_days.append({
                        'productId': str(product.id),
                        'productName': product.name,
                        'batchNo': batch.batch_no,
                        'expiryDate': batch.expiry_date.isoformat(),
                        'daysRemaining': (batch.expiry_date - today).days,
                        'qty': batch.qty_strips,
                        'qtyLoose': batch.qty_loose,
                    })

        result = {
            'lowStock': low_stock,
            'expiringIn30Days': expiring_in_30_days,
            'outOfStock': out_of_stock,
        }

        logger.info(f"Returning alerts: {len(low_stock)} low stock, {len(expiring_in_30_days)} expiring, {len(out_of_stock)} out of stock")
        return Response(result, status=status.HTTP_200_OK)


class InventoryAdjustView(APIView):
    """
    POST /api/v1/inventory/adjust/

    Adjust batch stock for damage, return, or correction.
    """

    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        """
        Adjust batch stock.

        Request body:
        {
            "batchId": "...",
            "type": "damage" | "return" | "correction",
            "qty": 5,  # Can be negative
            "reason": "Batch damaged in transport",
            "pin": "1234"
        }

        Response:
        {
            "success": true,
            "message": "Stock adjusted successfully"
        }
        """

        outlet_id = request.query_params.get('outletId')
        batch_id = request.data.get('batchId')
        adjust_type = request.data.get('type')
        qty = request.data.get('qty')
        reason = request.data.get('reason')
        pin = request.data.get('pin')

        # Validate required fields
        if not all([batch_id, adjust_type, qty is not None, pin]):
            return Response(
                {'detail': 'batchId, type, qty, and pin are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate PIN - staff exists in this outlet
        staff = None
        if pin:
            from django.contrib.auth.hashers import check_password
            for s in Staff.objects.filter(outlet=outlet, is_active=True):
                if check_password(pin, s.staff_pin):
                    staff = s
                    break
                    
            if not staff:
                return Response(
                    {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        # Fetch batch
        try:
            batch = Batch.objects.get(id=batch_id, outlet=outlet)
            old_qty_strips = batch.qty_strips
            old_qty_loose = batch.qty_loose
        except Batch.DoesNotExist:
            return Response(
                {'detail': f'Batch {batch_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update stock in transaction
        try:
            # qty is treated as STRIPS by default.
            # Positive = add strips in, Negative = remove strips out.
            adjust_unit = request.data.get('adjustUnit', 'strips')  # 'strips' or 'loose'
            qty = int(qty)  # ensure integer

            with transaction.atomic():
                if adjust_unit == 'loose':
                    # Adjust loose tray, then consolidate into strips
                    batch.qty_loose += qty
                    if batch.qty_loose < 0:
                        # Try to break open a strip to cover the loose deficit
                        while batch.qty_loose < 0 and batch.qty_strips > 0:
                            batch.qty_strips -= 1
                            batch.qty_loose += (batch.pack_size or 1)
                    if batch.qty_loose < 0:
                        return Response(
                            {'detail': f'Insufficient loose stock. Cannot go below 0.'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    # Consolidate loose into strips
                    while batch.qty_loose >= (batch.pack_size or 1):
                        batch.qty_strips += 1
                        batch.qty_loose -= (batch.pack_size or 1)
                else:
                    # Default: adjust strips
                    batch.qty_strips += qty

                # Final guard: strips must not go below 0
                if batch.qty_strips < 0:
                    return Response(
                        {'detail': f'Stock cannot go below 0. Current: {batch.qty_strips - qty}, Adjustment: {qty}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                batch.save(update_fields=['qty_strips', 'qty_loose'])
                logger.info(f"Adjusted batch {batch_id} stock by {qty} ({adjust_type} {adjust_unit}): {reason}")

                # Post to Stock Ledger
                from apps.inventory.services import post_stock_ledger_entry
                from datetime import date as _date
                # Compute the strip-equivalent qty for the ledger
                if adjust_unit == 'loose':
                    ledger_qty = Decimal(str(abs(qty))) / Decimal(str(batch.pack_size or 1))
                else:
                    ledger_qty = Decimal(str(abs(qty)))

                if qty > 0:
                    post_stock_ledger_entry(
                        outlet=outlet,
                        product=batch.product,
                        batch=batch,
                        txn_type='ADJUSTMENT_IN',
                        txn_date=_date.today(),
                        voucher_type='Stock Adjustment',
                        voucher_number='ADJ',
                        party_name=f'{adjust_type.title()} – {reason or "Manual adjustment"}',
                        qty_in=ledger_qty,
                        qty_out=0,
                        rate=batch.purchase_rate,
                        source_object=batch,
                        actor=staff if staff else request.user,
                    )
                else:
                    post_stock_ledger_entry(
                        outlet=outlet,
                        product=batch.product,
                        batch=batch,
                        txn_type='ADJUSTMENT_OUT',
                        txn_date=_date.today(),
                        voucher_type='Stock Adjustment',
                        voucher_number='ADJ',
                        party_name=f'{adjust_type.title()} – {reason or "Manual adjustment"}',
                        qty_in=0,
                        qty_out=ledger_qty,
                        rate=batch.purchase_rate,
                        source_object=batch,
                        actor=staff if staff else request.user,
                    )

                log_activity(
                    action="ADJUST",
                    module="inventory",
                    entity_type="Batch",
                    entity_id=batch.id,
                    entity_label=batch.batch_no,
                    description=f"Adjusted stock for batch {batch.batch_no} by {qty} ({adjust_unit}). Reason: {reason}",
                    user=staff or request.user,
                    outlet=outlet,
                    changes={
                        'qty_strips': {'old': old_qty_strips, 'new': batch.qty_strips},
                        'qty_loose': {'old': old_qty_loose, 'new': batch.qty_loose}
                    }
                )

        except Exception as e:
            logger.error(f"Error adjusting batch stock: {str(e)}")
            return Response(
                {'detail': f'Error adjusting stock: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        result = {
            'success': True,
            'message': f'Stock adjusted successfully. New stock: {batch.qty_strips}',
        }

        # The list is cached for 2 minutes: make the cached pages of this outlet stale right now
        # (see inventory/cache_utils.py: `delete_pattern` does not exist on this cache backend).
        bump_inventory_cache(outlet_id)

        return Response(result, status=status.HTTP_200_OK)




from apps.inventory.models import StockLedger
from datetime import datetime

class StockLedgerBatchesView(APIView):
    """
    GET /api/v1/inventory/stockledger/batches/?outletId=xxx
    Returns a lightweight, fast, and optimized list of active batches at the outlet.
    Used to populate the left-sidebar panel of the stock ledger view.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.inventory.models import Batch
        outlet_id = request.query_params.get('outletId') or request.query_params.get('outlet_id')
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Retrieve active batches at this outlet with prefetching
        batches = Batch.objects.filter(
            outlet_id=outlet_id,
            is_active=True
        ).select_related('product').order_by('product__name')

        data = []
        for b in batches:
            pack_size = (b.product.pack_size if b.product and b.product.pack_size else None) or b.pack_size or 1
            qty_remaining = float(b.qty_strips + (b.qty_loose / pack_size))
            data.append({
                'batch_id': str(b.id),
                'batch_number': b.batch_no,          # b.batch_no is the model field; batch_number is the JSON key frontend expects
                'product_name': b.product.name if b.product else 'Custom Product',
                'qty_remaining': qty_remaining,
                'pack_size': pack_size,
                'expiry_date': b.expiry_date.isoformat() if b.expiry_date else None,
            })
        return Response(data, status=status.HTTP_200_OK)


class StockLedgerView(APIView):
    """
    GET /api/v1/inventory/stockledger/?outletId=xxx&batchId=yyy&productId=zzz
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Accept both camelCase and snake_case query parameters
        outlet_id  = request.query_params.get('outletId')  or request.query_params.get('outlet_id')
        batch_id   = request.query_params.get('batchId')   or request.query_params.get('batch_id')
        product_id = request.query_params.get('productId') or request.query_params.get('product_id')
        start_date = request.query_params.get('startDate') or request.query_params.get('start_date') or request.query_params.get('date_from')
        end_date   = request.query_params.get('endDate')   or request.query_params.get('end_date')   or request.query_params.get('date_to')
        
        # Accept search and txn_type parameters for database-level filtering
        search_query = request.query_params.get('search', '').strip()
        txn_type = request.query_params.get('txnType') or request.query_params.get('txn_type')

        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = StockLedger.objects.filter(outlet=outlet).select_related('product', 'batch').order_by('-txn_date', '-created_at')

        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        
        if start_date:
            try:
                dt = datetime.fromisoformat(start_date).date()
                qs = qs.filter(txn_date__gte=dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                dt = datetime.fromisoformat(end_date).date()
                qs = qs.filter(txn_date__lte=dt)
            except ValueError:
                pass

        if txn_type:
            qs = qs.filter(txn_type=txn_type)

        if search_query:
            qs = qs.filter(
                Q(product__name__icontains=search_query) |
                Q(batch_number__icontains=search_query) |
                Q(voucher_number__icontains=search_query) |
                Q(party_name__icontains=search_query)
            )

        # Calculate all aggregates in a single consolidated database roundtrip on the un-sliced query set
        totals = qs.aggregate(
            total_in=Sum('qty_in'),
            total_out=Sum('qty_out'),
            total_value_in=Sum('value_in'),
            total_value_out=Sum('value_out')
        )
        total_in = totals['total_in'] or Decimal('0')
        total_out = totals['total_out'] or Decimal('0')
        total_value_in = totals['total_value_in'] or Decimal('0')
        total_value_out = totals['total_value_out'] or Decimal('0')

        export_format = request.query_params.get('export_format')
        if export_format == 'xlsx':
            return self.export_xlsx(qs)

        # Pagination
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize') or request.query_params.get('page_size', 50))
        total_records = qs.count()
        total_pages = (total_records + page_size - 1) // page_size
        
        qs = qs[(page - 1) * page_size : page * page_size]

        TXN_LABELS = {
            'OPENING':         'Opening Stock',
            'PURCHASE_IN':     'Purchase In',
            'SALE_OUT':        'Sale Out',
            'PURCHASE_RETURN': 'Purchase Return',
            'SALE_RETURN':     'Sale Return',
            'ADJUSTMENT_IN':   'Adjustment In',
            'ADJUSTMENT_OUT':  'Adjustment Out',
        }

        data = []
        for entry in qs:
            data.append({
                'id': str(entry.id),
                'batch_id': str(entry.batch.id) if entry.batch else None,
                'product_id': str(entry.product.id) if entry.product else None,
                'txn_date': entry.txn_date.isoformat(),
                'txn_type': entry.txn_type,
                'txn_type_label': TXN_LABELS.get(entry.txn_type, entry.txn_type),
                'voucher_type': entry.voucher_type,
                'voucher_number': entry.voucher_number,
                'party_name': entry.party_name,
                'product_name': entry.product.name if entry.product else '',
                'batch_number': entry.batch_number,
                'expiry_date': entry.expiry_date.isoformat() if entry.expiry_date else None,
                'pack_size': entry.product.pack_size if entry.product else 1,
                'qty_in': float(entry.qty_in),
                'qty_out': float(entry.qty_out),
                'rate': float(entry.rate),
                'value_in': float(entry.value_in),
                'value_out': float(entry.value_out),
                'running_qty': float(entry.running_qty),
                'running_value': float(entry.running_value),
                'created_at': entry.created_at.isoformat(),
            })

        return Response({
            'data': data,
            'summary': {
                'total_in': float(total_in),
                'total_out': float(total_out),
                'total_value_in': float(total_value_in),
                'total_value_out': float(total_value_out),
            },
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records
            }
        })

    def export_xlsx(self, qs):
        import openpyxl
        from django.http import HttpResponse

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Stock Ledger"

        headers = [
            "Date", "Type", "Voucher No", "Party", "Product", "Batch",
            "Expiry", "Qty In", "Qty Out", "Rate", "Value In", "Value Out", "Stock Balance"
        ]
        ws.append(headers)

        TXN_LABELS = {
            'OPENING': 'Opening Stock',
            'PURCHASE_IN': 'Purchase In',
            'SALE_OUT': 'Sale Out',
            'PURCHASE_RETURN': 'Purchase Return',
            'SALE_RETURN': 'Sale Return',
            'ADJUSTMENT_IN': 'Adjustment In',
            'ADJUSTMENT_OUT': 'Adjustment Out',
        }

        for entry in qs:
            ws.append([
                entry.txn_date.strftime('%Y-%m-%d') if entry.txn_date else '',
                TXN_LABELS.get(entry.txn_type, entry.txn_type),
                entry.voucher_number or '',
                entry.party_name or '',
                entry.product.name if entry.product else '',
                entry.batch_number or '',
                entry.expiry_date.strftime('%Y-%m-%d') if entry.expiry_date else '',
                float(entry.qty_in or 0),
                float(entry.qty_out or 0),
                float(entry.rate or 0),
                float(entry.value_in or 0),
                float(entry.value_out or 0),
                float(entry.running_qty or 0)
            ])

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename="stock_ledger_export.xlsx"'
        wb.save(response)
        return response

class BatchAvailabilityCheckView(APIView):
    """
    POST /api/v1/inventory/batches/availability-check/
    Payload: [{ "batchId": "uuid", "qtyStrips": 1, "qtyLoose": 0 }]
    Returns: [
      {
        "batchId": "uuid",
        "availableQtyStrips": 1,
        "availableQtyLoose": 0,
        "status": "AVAILABLE" | "LOW_STOCK" | "BATCH_EXPIRED" | "BATCH_UNAVAILABLE"
      }
    ]
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        items = request.data
        if not isinstance(items, list):
            return Response({"detail": "Expected a list of items."}, status=status.HTTP_400_BAD_REQUEST)

        outlet_id = getattr(request.user, 'outlet_id', None) or getattr(request.user, 'pharmacy_id', None)
        today = datetime.now().date()

        results = []
        for item in items:
            batch_id = item.get("batchId")
            req_strips = int(item.get("qtyStrips", 0))
            req_loose = int(item.get("qtyLoose", 0))

            try:
                batch = Batch.objects.get(id=batch_id, outlet_id=outlet_id)
                pack_size = batch.pack_size or 1

                req_total = (req_strips * pack_size) + req_loose
                avail_total = (batch.qty_strips * pack_size) + batch.qty_loose

                if batch.expiry_date and batch.expiry_date < today:
                    status_val = "BATCH_EXPIRED"
                elif avail_total <= 0:
                    status_val = "BATCH_UNAVAILABLE"
                elif avail_total < req_total:
                    status_val = "LOW_STOCK"
                else:
                    status_val = "AVAILABLE"

                results.append({
                    "batchId": str(batch.id),
                    "availableQtyStrips": batch.qty_strips,
                    "availableQtyLoose": batch.qty_loose,
                    "status": status_val
                })
            except (Batch.DoesNotExist, ValueError, TypeError):
                results.append({
                    "batchId": batch_id,
                    "availableQtyStrips": 0,
                    "availableQtyLoose": 0,
                    "status": "BATCH_UNAVAILABLE"
                })

        return Response(results, status=status.HTTP_200_OK)


class OutletProductConfigView(APIView):
    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        print("OutletProductConfigView POST received data:", request.data, flush=True)
        data = request.data
        outlet_id = data.get('outletId')
        product_id = data.get('productId')
        
        if not outlet_id or not product_id:
            return Response({'error': 'outletId and productId are required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            from apps.inventory.models import OutletProductConfig, MasterProduct
            from apps.core.models import Outlet
            
            outlet = Outlet.objects.get(id=outlet_id)
            product = MasterProduct.objects.get(id=product_id)
            
            config, created = OutletProductConfig.objects.get_or_create(
                outlet=outlet,
                product=product
            )
            
            from decimal import Decimal
            if 'minQty' in data:
                config.min_qty = Decimal(str(data['minQty']))
            if 'reorderQty' in data:
                config.reorder_qty = Decimal(str(data['reorderQty']))
                
            config.save()
            return Response({'status': 'success'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
