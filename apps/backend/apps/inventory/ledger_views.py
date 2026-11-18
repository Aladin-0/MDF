"""
Stock Ledger helpers for the screen (rules in `ledger_view.py` and `ledger_health.py`):

  GET  /inventory/stockledger/products/?outletId&q=   product picker: products (or batch numbers) with their batches
  GET  /inventory/stockledger/health/?outletId        how many batches have an incomplete ledger (manager and above)
  POST /inventory/stockledger/health/                 repair the SAFE cases for this outlet (admin, confirmed with their password)
"""
from uuid import UUID

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Outlet
from apps.core.permissions import IsAdminStaff, IsAuthenticated, IsManagerOrAbove, MethodPermissionMixin, effective_permissions
from apps.core.ratelimit import FailureLimiter
from apps.inventory import ledger_health as lh
from apps.inventory import ledger_view as lv
from apps.inventory.cache_utils import bump_inventory_cache

REPAIR_PASSWORD_LIMITER = FailureLimiter('ledger:repair-password', limit=5, window=15 * 60)


def _outlet(request):
    return Outlet.objects.filter(id=request.query_params.get('outletId') or request.query_params.get('outlet_id')).first()


def _err(message, code, http=status.HTTP_400_BAD_REQUEST):
    return Response({'error': {'code': code, 'message': message}}, status=http)


class StockLedgerProductsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet = _outlet(request)
        if not outlet:
            return _err('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        show_rates = 'view_purchase_rates' in effective_permissions(request.user)
        product_id = request.query_params.get('productId')
        if product_id:                                   # one product by id: opening a shared link or refreshing the page
            try:
                UUID(product_id)
            except ValueError:
                return _err('productId must be an id', 'BAD_PRODUCT')
            return Response({'data': lv.products_with_batches(outlet, '', show_rates, product_id=product_id)})
        q = (request.query_params.get('q') or '').strip()[:60]
        if len(q) < 2:
            return Response({'data': []})
        return Response({'data': lv.products_with_batches(outlet, q, show_rates)})


class StockLedgerHealthView(MethodPermissionMixin, APIView):
    permission_classes = [IsManagerOrAbove]
    method_permissions = {'GET': [IsManagerOrAbove], 'POST': [IsAdminStaff]}      # reading is for managers, changing the ledger for admins

    def get(self, request):
        outlet = _outlet(request)
        if not outlet:
            return _err('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        rep = lh.scan(outlet, sample=5)
        return Response({
            'counts': rep['counts'], 'labels': rep['labels'], 'safeToRepair': rep['safeToRepair'], 'needsDecision': rep['needsDecision'],
            'openingStockIfBookedAsOpening': rep['openingStockIfBookedAsOpening'], 'samples': rep['samples'],
            'canRepair': 'manage_settings' in effective_permissions(request.user),
        })

    def post(self, request):
        """Add the missing opening balances (no stock or profit figure changes). Admin only, and the admin confirms with their own password."""
        outlet = _outlet(request)
        if not outlet:
            return _err('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        password = str(request.data.get('password') or '')
        if not password:
            return _err('Enter your password to confirm', 'PASSWORD_REQUIRED')
        wait = REPAIR_PASSWORD_LIMITER.blocked_for(request.user.id)
        if wait:
            return _err(f'Too many wrong passwords. Try again in {max(wait // 60, 1)} minute(s).', 'TOO_MANY_ATTEMPTS', status.HTTP_429_TOO_MANY_REQUESTS)
        from apps.inventory.expiry import confirms_identity
        if not confirms_identity(request.user, password):         # a 400, never a 401: the app signs people out on 401
            REPAIR_PASSWORD_LIMITER.record_failure(request.user.id)
            return _err('Wrong password', 'WRONG_PASSWORD')
        REPAIR_PASSWORD_LIMITER.reset(request.user.id)
        out = lh.repair(outlet, apply=True, actor=request.user)
        from apps.audit import recorder
        recorder.safe_record('ledger.repaired', actor=request.user, outlet=outlet, module='inventory', action='UPDATE', entity_type='Batch', entity_label='stock ledger',
                             ctx={'count': out['total']}, metadata={'count': out['total'], 'repaired': out['repaired']})
        bump_inventory_cache(outlet.id)
        return Response({'repaired': out['repaired'], 'total': out['total'], 'leftForDecision': out['leftForDecision']})


class BatchTraceView(APIView):
    """Where a batch came from and who got it (a recall, an inspector, a complaint). `?export=xlsx` for the file."""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        from datetime import date
        from django.http import HttpResponse
        from apps.inventory import batch_trace
        from apps.inventory.models import Batch
        outlet = _outlet(request)
        if not outlet:
            return _err('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        batch = Batch.objects.filter(id=batch_id, outlet=outlet).select_related('product', 'supplier').first()
        if not batch:
            return _err('Batch not found', 'BATCH_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        t = batch_trace.trace(batch, 'view_purchase_rates' in effective_permissions(request.user))
        if request.query_params.get('export') == 'xlsx':
            resp = HttpResponse(batch_trace.build_workbook(t, outlet.name), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            resp['Content-Disposition'] = f'attachment; filename="batch-trace_{date.today().isoformat()}.xlsx"'
            return resp
        return Response(t)


class AssignSupplierView(APIView):
    """
    Say who supplied stock that has no purchase invoice (opening stock), so the Expiry Manager's distributor filter and the batch
    card know. A batch with a posted purchase keeps ITS supplier (the invoice is the evidence): it is skipped, not overwritten.
    Manager and above (the same right as editing a batch). Send `distributorId: null` to clear.
    """
    permission_classes = [IsManagerOrAbove]
    MAX = 500

    def post(self, request):
        from apps.audit import recorder
        from apps.inventory.models import Batch
        from apps.purchases.models import Distributor, PurchaseItem
        outlet = _outlet(request)
        if not outlet:
            return _err('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        ids = request.data.get('batchIds')
        if not isinstance(ids, list) or not ids or len(ids) > self.MAX:
            return _err(f'batchIds must be a list of 1 to {self.MAX} batch ids', 'BAD_BATCHES')
        try:
            ids = [str(UUID(str(i))) for i in ids]
        except ValueError:
            return _err('batchIds must be batch ids', 'BAD_BATCHES')
        dist = None
        raw = request.data.get('distributorId')
        if raw:
            try:
                dist = Distributor.objects.filter(id=UUID(str(raw)), outlet=outlet).first()
            except ValueError:
                dist = None
            if not dist:
                return _err('That distributor is not in this outlet', 'BAD_DISTRIBUTOR')

        batches = list(Batch.objects.filter(id__in=ids, outlet=outlet).select_related('supplier'))
        with_purchase = set(map(str, PurchaseItem.objects.filter(batch__in=batches, invoice__status='POSTED', invoice__distributor__isnull=False).values_list('batch_id', flat=True)))
        found = {str(b.id) for b in batches}
        skipped = [{'batchId': i, 'reason': 'NOT_FOUND'} for i in ids if i not in found]
        todo = []
        for b in batches:
            if str(b.id) in with_purchase:
                skipped.append({'batchId': str(b.id), 'reason': 'HAS_PURCHASE'})
            else:
                todo.append(b)
        with transaction.atomic():
            changes = []
            for b in todo:
                changes.append({'field': 'supplier', 'label': f'Supplier of {b.batch_no}', 'before': b.supplier.name if b.supplier_id else None, 'after': dist.name if dist else None})
                Batch.objects.filter(pk=b.pk).update(supplier=dist)          # only this column: a sale in the same moment is not overwritten
            if todo:
                recorder.safe_record('supplier.assigned', actor=request.user, outlet=outlet, module='inventory', action='UPDATE', entity_type='Batch',
                                     entity_label=dist.name if dist else 'no supplier', changes=changes[:200], ctx={'count': len(todo)},
                                     metadata={'count': len(todo), 'distributor_id': str(dist.id) if dist else None})
        bump_inventory_cache(outlet.id)
        return Response({'updated': len(todo), 'skipped': skipped, 'distributor': dist.name if dist else None})
