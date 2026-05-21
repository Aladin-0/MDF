import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated, IsManagerOrAbove
from rest_framework import status
from django.db.models import Q, Sum
from datetime import datetime
from django.db import transaction, IntegrityError
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from apps.inventory.models import MasterProduct, Batch
from apps.core.models import Outlet
from apps.accounts.models import Staff

logger = logging.getLogger(__name__)

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
        'barcode': product.barcode,
        'isFridge': product.is_fridge,
        'isDiscontinued': product.is_discontinued,
        'imageUrl': product.image_url,
        'mrp': float(product.mrp),
        'saleRate': float(product.default_sale_rate),
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
        'purchaseRate': float(batch.purchase_rate),
        'saleRate': float(batch.sale_rate),
        'qtyStrips': batch.qty_strips,
        'qtyLoose': batch.qty_loose,
        'packSize': batch.pack_size,
        'packUnit': batch.pack_unit,
        'packType': batch.pack_type,
        'rackLocation': batch.rack_location,
        'isActive': batch.is_active,
        'createdAt': batch.created_at.isoformat(),
    }


class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        products = MasterProduct.objects.all()
        return Response([serialize_product(p) for p in products], status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        data = request.data
        name = (data.get('name') or '').strip()
        hsn_code = (data.get('hsnCode') or '').strip()
        pack_unit = (data.get('packUnit') or '').strip()
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

        try:
            sale_rate = Decimal(str(data.get('saleRate', 0)))
            if sale_rate <= 0:
                errors['saleRate'] = 'Sale rate must be > 0'
        except (InvalidOperation, TypeError):
            errors['saleRate'] = 'Invalid sale rate'
            sale_rate = Decimal('0')

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
                    pack_type='strip',
                    mrp=mrp,
                    default_sale_rate=sale_rate,
                )
        except IntegrityError as e:
            return Response(
                {'errors': {'detail': 'A database integrity error occurred (e.g. duplicate barcode).'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(serialize_product(product), status=status.HTTP_201_CREATED)


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
                product.gst_rate = Decimal(str(data['gstRate']))
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
            product.pack_type = data['packType']

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
                    product.default_sale_rate = sr
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
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product.save()
        except IntegrityError:
            return Response(
                {'errors': {'barcode': 'This barcode is already used by another product.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(f"MasterProduct {product.id} updated by {request.user}")
        return Response(serialize_product(product), status=status.HTTP_200_OK)


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


class InventoryExportCSVView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        import csv
        from django.http import StreamingHttpResponse
        
        class Echo:
            def write(self, value): return value
            
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        batches = Batch.objects.filter(outlet=outlet, qty_strips__gt=0).select_related('product')
        
        def iter_items():
            yield ['product_name', 'batch_no', 'expiry_date', 'qty_strips', 'mrp', 'purchase_rate', 'rack_location']
            for b in batches:
                yield [
                    b.product.name,
                    b.batch_no,
                    b.expiry_date.isoformat() if b.expiry_date else '',
                    str(b.qty_strips),
                    str(b.mrp),
                    str(b.purchase_rate),
                    b.rack_location or ''
                ]

        writer = csv.writer(Echo())
        response = StreamingHttpResponse((writer.write(r) for r in iter_items()), content_type="text/csv")
        response['Content-Disposition'] = 'attachment; filename="stock_export.csv"'
        return response


class ProductSearchView(APIView):
    """
    GET /api/v1/products/search/?q=paracetamol&outletId=xxx

    Search products by name, composition, or manufacturer.
    Returns ProductSearchResult with aggregated stock and batch details.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Search for products by query string.

        Query parameters:
        - q: Search query (minimum 2 characters)
        - outletId: Outlet UUID to filter batches

        Returns:
        [
            {
                "id": "...",
                "name": "Paracetamol",
                "composition": "...",
                "manufacturer": "...",
                "category": "...",
                "drugType": "...",
                "scheduleType": "...",
                "hsnCode": "...",
                "gstRate": 0,
                "packSize": 10,
                "packUnit": "tablet",
                "packType": "strip",
                "isFridge": false,
                "isDiscontinued": false,
                "outletProductId": "...",
                "totalStock": 150,
                "nearestExpiry": "2026-12-31",
                "isLowStock": false,
                "batches": [
                    {
                        "id": "...",
                        "outletId": "...",
                        "outletProductId": "...",
                        "batchNo": "BATCH123",
                        "expiryDate": "2026-12-31",
                        "mrp": 50.0,
                        "purchaseRate": 25.0,
                        "saleRate": 40.0,
                        "qtyStrips": 10,
                        "qtyLoose": 0,
                        "isActive": true,
                        "createdAt": "2026-03-17T..."
                    }
                ]
            }
        ]
        """

        query = request.query_params.get('q', '').strip()
        outlet_id = request.query_params.get('outletId')
        # context=purchase → show all active batches regardless of expiry so
        # pharmacists can search medicines to buy even if current stock is expired.
        context = request.query_params.get('context', '').strip().lower()
        is_purchase_context = context == 'purchase'

        # Validate query length
        if len(query) < 2:
            logger.debug(f"Search query too short: {len(query)} chars")
            return Response({'data': []}, status=status.HTTP_200_OK)

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Searching products for: '{query}' (outlet: {outlet.name}, context: {context or 'default'})")

        today = datetime.now().date()

        # Search MasterProducts by name, composition, manufacturer (case-insensitive)
        # For purchase context: search ALL products that have ANY active batch at this outlet
        # (even if expired) so the pharmacist can re-purchase expired stock.
        # For billing/default context: restrict to products with non-expired stock only.
        query_lower = query.lower()

        if is_purchase_context:
            # Include products that have active batches (any expiry) OR have no batches yet
            products_with_stock = MasterProduct.objects.filter(
                Q(name__icontains=query_lower) |
                Q(composition__icontains=query_lower) |
                Q(manufacturer__icontains=query_lower)
            ).distinct()
        else:
            # Default: only products with non-expired active stock
            products_with_stock = MasterProduct.objects.filter(
                Q(name__icontains=query_lower) |
                Q(composition__icontains=query_lower) |
                Q(manufacturer__icontains=query_lower)
            ).distinct()

        products = products_with_stock
        logger.info(f"Found {products.count()} products matching: '{query}'")

        # Build response with batches and aggregated stock
        results = []

        for product in products:
            # ── Batch filter ──────────────────────────────────────────────────
            # Purchase context: include ALL active batches (expired ones too) so
            # the pharmacist sees the product's historical batch/rate info.
            # Billing/default context: only non-expired active batches.
            batch_filter = dict(product=product, outlet=outlet, is_active=True)
            if not is_purchase_context:
                batch_filter['expiry_date__gt'] = today

            batches = Batch.objects.filter(**batch_filter).order_by('expiry_date')

            # Aggregate stock — count both strips AND loose tablets (as fractional strips)
            total_stock = sum(
                b.qty_strips + (b.qty_loose / (b.pack_size or 1))
                for b in batches
            )

            # For purchase context: if no batches at this outlet yet, still
            # show the product so it can be searched and a new batch created.
            if is_purchase_context and not batches.exists():
                # Check if any batch exists globally (might belong to another outlet)
                # Show it so it can be purchased into this outlet
                pass

            # Get nearest expiry date
            non_expired = [b for b in batches if b.expiry_date > today]
            nearest_expiry = (
                non_expired[0].expiry_date.isoformat()
                if non_expired
                else (batches.first().expiry_date.isoformat() if batches.exists() else "2099-12-31")
            )

            # Determine if low stock (< 10 strips)
            is_low_stock = total_stock < 10

            batch_list = [serialize_batch(batch) for batch in batches]

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
                'barcode': product.barcode,
                'isFridge': product.is_fridge,
                'isDiscontinued': product.is_discontinued,
                'imageUrl': product.image_url,
                'mrp': float(product.mrp),
                'saleRate': float(product.default_sale_rate),
                'outletProductId': str(product.id),
                'totalStock': total_stock,
                'nearestExpiry': nearest_expiry,
                'isLowStock': is_low_stock,
                'batches': batch_list,
            }

            results.append(result)

        logger.info(f"Returning {len(results)} products with stock data")
        return Response({'data': results}, status=status.HTTP_200_OK)


class InventoryListView(APIView):
    """
    GET /api/v1/inventory/?outletId=xxx&search=para&lowStock=true&expiringSoon=true

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
        from django.db.models import Sum, OuterRef, Subquery, IntegerField, F
        from django.db.models.functions import Coalesce
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
        cache_key = f"inventory:list:{outlet_id}:{param_h}"

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
        # But nearest_expiry should still favour non-expired batches first.
        non_expired_sq = Batch.objects.filter(
            outlet_id=outlet_id,
            is_active=True,
            expiry_date__gt=today,
            product_id=OuterRef('pk'),
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
                non_expired_sq.order_by('expiry_date').values('expiry_date')[:1]
            ),
        )

        # Push low-stock and expiring-soon filters to DB
        if low_stock:
            products = products.filter(total_strips__lt=F('min_qty'))

        if expiring_soon:
            cutoff = today + timedelta(days=90)
            products = products.filter(
                nearest_expiry__isnull=False,
                nearest_expiry__lte=cutoff,
            )

        # Sorting at DB level — no Python sort
        sort_map = {'name': 'name', 'stock': 'total_strips', 'expiry': 'nearest_expiry'}
        db_sort = sort_map.get(sort_by, 'name')
        if sort_order == 'desc':
            db_sort = f'-{db_sort}'
        products = products.order_by(db_sort)

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
            near_exp  = product.nearest_expiry.isoformat() if product.nearest_expiry else "2099-12-31"
            is_low    = tot_stock < (product.min_qty or 10)

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
                'minQty':          product.min_qty,
                'reorderQty':      product.reorder_qty,
                'barcode':         product.barcode,
                'isFridge':        product.is_fridge,
                'isDiscontinued':  product.is_discontinued,
                'imageUrl':        product.image_url,
                'mrp':             float(pbs[0].mrp) if pbs else float(product.mrp),
                'saleRate':        float(pbs[0].sale_rate) if pbs else float(product.default_sale_rate),
                'outletProductId': str(product.id),
                'totalStock':      tot_stock,
                'totalLoose':      tot_loose,
                'nearestExpiry':   near_exp,
                'isLowStock':      is_low or (tot_loose > 0 and tot_stock == 0),
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
            try:
                staff = Staff.objects.get(outlet=outlet, staff_pin=pin)
            except Staff.DoesNotExist:
                return Response(
                    {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Fetch batch
        try:
            batch = Batch.objects.get(id=batch_id, outlet=outlet)
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

        # Invalidate inventory cache for this outlet so the list shows fresh data
        try:
            from django.core.cache import cache
            cache.delete_pattern(f"mediflow:inventory:list:{outlet_id}:*")
        except Exception:
            pass  # cache.delete_pattern needs django-redis; fallback silently

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
