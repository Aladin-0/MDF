"""
Expiry Manager API (rules and queries live in `expiry.py`):

  GET  /inventory/expiry/            the list: filters (dates / months / distributors / search), totals and per-distributor groups
  GET  /inventory/expiry/export/     the same filters as an Excel file
  POST /inventory/expiry/export/     Excel of exactly the batches in `batchIds` (the ticked rows)
  POST /inventory/expiry/remove/     write many batches off in one go (all or nothing), confirmed with the signed-in user's own password
"""
from datetime import date
from uuid import UUID

from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Outlet
from apps.core.permissions import IsAuthenticated, IsManagerOrAbove, effective_permissions
from apps.core.ratelimit import FailureLimiter
from apps.inventory import expiry as ex
from apps.inventory.cache_utils import bump_inventory_cache

# wrong passwords at the write-off confirmation: 5 in 15 minutes per signed-in user, then wait
PASSWORD_LIMITER = FailureLimiter('expiry:remove-password', limit=5, window=15 * 60)

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
MAX_PAGE = 100


def _outlet(request):
    return Outlet.objects.filter(id=request.query_params.get('outletId')).first()


def _show_rates(request) -> bool:
    return 'view_purchase_rates' in effective_permissions(request.user)


def _bad(message, code='BAD_REQUEST', http=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({'error': {'code': code, 'message': message, **extra}}, status=http)


def _int(raw, default, lo, hi):
    try:
        return max(lo, min(hi, int(raw)))
    except (TypeError, ValueError):
        return default


def _describe(f: ex.ExpiryFilters) -> str:
    parts = []
    for a, b in f.ranges:
        parts.append(f"{a.strftime('%d %b %Y') if a else 'start'} to {b.strftime('%d %b %Y') if b else 'any date'}")
    if f.include_expired:
        parts.append('including already expired')
    if f.distributor_ids or f.unknown_distributor:
        parts.append('selected distributors')
    if f.q:
        parts.append(f'search "{f.q}"')
    return 'Expiry: ' + '; '.join(parts) + f" · generated {date.today().strftime('%d %b %Y')}"


class ExpiryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet = _outlet(request)
        if not outlet:
            return _bad('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        try:
            f = ex.parse_filters(request.query_params)
        except ex.ExpiryParamError as e:
            return _bad(str(e), 'BAD_FILTER')

        show_rates = _show_rates(request)
        rows = ex.build_rows(outlet, f, show_rates)
        totals, groups = ex.summarize(rows, show_rates)

        page_size = _int(request.query_params.get('pageSize'), 50, 1, MAX_PAGE)
        pages = max(1, -(-len(rows) // page_size))
        page = _int(request.query_params.get('page'), 1, 1, pages)
        body = {
            'data': rows[(page - 1) * page_size: page * page_size],
            'totals': totals,
            'groups': groups,
            'pagination': {'page': page, 'pageSize': page_size, 'total': len(rows), 'pages': pages},
        }
        if str(request.query_params.get('withIds', '')).lower() in ('1', 'true'):
            # "select all N matching": the server names the rows, so the screen never has to hold them all
            body['matchingIds'] = [r['id'] for r in rows[:ex.MAX_IDS]]
            body['idsTruncated'] = len(rows) > ex.MAX_IDS
        return Response(body)


class ExpiryExportView(APIView):
    permission_classes = [IsAuthenticated]

    def _file(self, request, outlet, rows, subtitle):
        show_rates = _show_rates(request)
        totals, groups = ex.summarize(rows, show_rates)
        data = ex.build_workbook(rows, totals, groups, show_rates, outlet.name, subtitle)
        resp = HttpResponse(data, content_type=XLSX)
        resp['Content-Disposition'] = f'attachment; filename="near-expiry_{date.today().isoformat()}.xlsx"'
        return resp

    def get(self, request):
        outlet = _outlet(request)
        if not outlet:
            return _bad('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        try:
            f = ex.parse_filters(request.query_params)
        except ex.ExpiryParamError as e:
            return _bad(str(e), 'BAD_FILTER')
        return self._file(request, outlet, ex.build_rows(outlet, f, _show_rates(request)), _describe(f))

    def post(self, request):
        outlet = _outlet(request)
        if not outlet:
            return _bad('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        raw = request.data.get('batchIds')
        if not isinstance(raw, list) or not raw:
            return _bad('batchIds must be a list of batch ids')
        if len(raw) > ex.MAX_IDS:
            return _bad(f'At most {ex.MAX_IDS} batches at a time')
        try:
            ids = [str(UUID(str(i))) for i in raw]
        except ValueError:
            return _bad('batchIds must be batch ids')
        show_rates, today = _show_rates(request), date.today()
        rows = [ex.row_of(b, today, show_rates) for b in ex.annotated_batches(outlet).filter(id__in=ids)]   # other outlets' ids simply match nothing
        ex.sort_rows(rows, 'distributor')
        return self._file(request, outlet, rows, f'{len(rows)} selected batches · generated {today.strftime("%d %b %Y")}')


class ExpiryRemoveView(APIView):
    """Write off many batches at once. Manager and above (the same right as a single stock adjustment)."""
    permission_classes = [IsManagerOrAbove]

    def post(self, request):
        outlet = _outlet(request)
        if not outlet:
            return _bad('Outlet not found', 'OUTLET_NOT_FOUND', status.HTTP_404_NOT_FOUND)
        password = str(request.data.get('password') or '')
        if not password:
            return _bad('Enter your password to confirm', 'PASSWORD_REQUIRED')
        wait = PASSWORD_LIMITER.blocked_for(request.user.id)
        if wait:
            return _bad(f'Too many wrong passwords. Try again in {max(wait // 60, 1)} minute(s).', 'TOO_MANY_ATTEMPTS', status.HTTP_429_TOO_MANY_REQUESTS)
        # NOT a 401: the app treats every 401 as "your login expired" and signs the person out
        if not ex.confirms_identity(request.user, password):
            PASSWORD_LIMITER.record_failure(request.user.id)
            return _bad('Wrong password', 'WRONG_PASSWORD')
        PASSWORD_LIMITER.reset(request.user.id)

        items = request.data.get('items')
        if not isinstance(items, list):
            return _bad('items must be a list')
        try:
            done = ex.remove_stock_bulk(
                outlet=outlet, items=items, adjustment_type=str(request.data.get('type') or 'EXPIRED').upper(),
                reason=request.data.get('reason'), staff=request.user, actor=request.user,
            )
        except ex.RemovalError as e:
            return _bad(e.message, e.code, batchId=e.batch_id)

        bump_inventory_cache(outlet.id)            # the list and the billing search show the new stock at once
        body = {'success': True, 'removed': done, 'batches': len(done)}
        if _show_rates(request):
            body['costValue'] = round(sum(d['costValue'] for d in done), 2)
        else:
            for d in done:
                d.pop('costValue', None)
        return Response(body)
