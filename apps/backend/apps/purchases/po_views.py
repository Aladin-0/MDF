"""
Purchase-order API (list / detail / lifecycle actions / shortbook / settings / public page). Rules live in po_services.py; these views only
check permissions, call the services and shape the JSON. Money is returned as strings ("1250.00"), never floats.
"""
import functools
import logging
from datetime import timedelta
from decimal import Decimal
from urllib.parse import quote

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.core.permissions import (
    CanAccessPurchases, CanCancelPurchaseOrders, CanCreatePurchases, CanSendPurchaseOrders, IsAdminStaff, IsAuthenticated,
    assert_outlet_access, effective_permissions,
)
from apps.purchases import po_services as svc
from apps.purchases.models import POEvent, PurchaseOrder, PurchaseOrderItem, ShortbookItem
from apps.purchases.po_services import POError
from apps.purchases.services import PurchaseServiceError

logger = logging.getLogger(__name__)
TWO = Decimal('0.01')
ACTION_PERMISSION = {
    'edit': 'create_purchases', 'delete': 'create_purchases', 'duplicate': 'create_purchases', 'receive': 'create_purchases',
    'send': 'send_purchase_orders', 'mark_ordered': 'send_purchase_orders', 'resend': 'send_purchase_orders',
    'cancel': 'cancel_purchase_orders', 'close_short': 'cancel_purchase_orders',
}


def _m(value) -> str:
    return str(Decimal(value or 0).quantize(TWO))


def _outlet_id(request):
    return request.query_params.get('outletId') or request.data.get('outletId')


def _fail(e):
    return Response({'detail': e.message, 'code': e.code}, status=e.status_code)


def po_errors(fn):
    """Answer a broken purchase-order rule with its message and status instead of a 500."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except POError as e:
            return _fail(e)
        except PurchaseServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return wrapper


# how long one outlet's low-stock sync result is reused (the sync scans stock; the Shortbook page is refreshed all day)
SHORTBOOK_SYNC_SECONDS = 60


def _get_outlet(request):
    from apps.core.models import Outlet
    outlet_id = _outlet_id(request)
    if not outlet_id:
        raise POError('outletId is required.', 400, 'NO_OUTLET')
    assert_outlet_access(request.user, outlet_id)
    try:
        return Outlet.objects.get(id=outlet_id)
    except (Outlet.DoesNotExist, ValueError, Exception):
        raise POError('Outlet not found.', 404, 'NO_OUTLET')


def _get_po(request, pk) -> PurchaseOrder:
    outlet = _get_outlet(request)
    try:
        return PurchaseOrder.objects.select_related('distributor', 'outlet').get(id=pk, outlet=outlet)
    except PurchaseOrder.DoesNotExist:
        raise POError('Purchase order not found.', 404, 'NOT_FOUND')


def allowed_actions(po: PurchaseOrder, user) -> list:
    """What this user may do to this PO right now: the status table AND the user's rights. The screens show only these."""
    perms = set(effective_permissions(user))
    return [a for a in svc.STATE_ACTIONS.get(po.status, []) if ACTION_PERMISSION[a] in perms]


# ───────────────────────────── serializers ─────────────────────────────

def serialize_summary(po: PurchaseOrder) -> dict:
    ordered = getattr(po, 'ordered_total', None)
    received = getattr(po, 'received_total', None)
    if ordered is None:
        agg = po.items.aggregate(o=Sum('qty_strips'), r=Sum('received_qty'), n=Count('id'))
        ordered, received, count = agg['o'] or 0, agg['r'] or 0, agg['n'] or 0
    else:
        count = getattr(po, 'item_count', 0) or 0
    overdue = bool(po.expected_date and po.expected_date < svc.today() and po.status in ('SENT', 'PARTIAL'))
    return {
        'id': str(po.id), 'poNumber': po.po_number, 'status': po.status, 'statusLabel': po.status_label,
        'distributorId': str(po.distributor_id), 'distributorName': po.distributor.name if po.distributor_id else '',
        'orderDate': po.order_date.isoformat(), 'expectedDate': po.expected_date.isoformat() if po.expected_date else None,
        'sentAt': po.sent_at.isoformat() if po.sent_at else None, 'sentVia': po.sent_via, 'overdue': overdue,
        'itemCount': count, 'orderedQty': int(ordered or 0), 'receivedQty': int(received or 0),
        'totalAmount': _m(po.total_amount), 'closedShort': po.closed_short,
    }


def serialize_detail(po: PurchaseOrder, user) -> dict:
    lines = list(po.items.select_related('product').order_by('id'))
    insights = svc.line_insights(po.outlet_id, [ln.product_id for ln in lines])
    st = svc.outlet_settings(po.outlet)
    out = serialize_summary(po)
    # the distributor's Sundry Creditors ledger, so the purchase-invoice form can pick the party when receiving against this PO
    from apps.accounts.models import Ledger
    from apps.accounts.voucher_serializers import LedgerSerializer
    ledger = Ledger.objects.filter(outlet=po.outlet, linked_distributor=po.distributor).select_related('group').first()
    out.update({
        'version': po.version, 'notes': po.notes, 'cancelReason': po.cancel_reason,
        'expiresAt': po.expires_at.isoformat() if po.expires_at else None,
        'distributorPhone': po.distributor.phone or '', 'distributorEmail': po.distributor.email or '',
        'distributorLedger': LedgerSerializer(ledger).data if ledger else None,
        'shareToken': po.share_token or None,
        'allowedActions': allowed_actions(po, user),
        'sendDefaults': {'channel': st.po_default_channel, 'template': st.po_whatsapp_template, 'expiryDays': st.po_expiry_days,
                         'storeName': po.outlet.name},
        'items': [{
            'id': str(ln.id), 'productId': str(ln.product_id), 'productName': ln.product.name,
            'packLabel': ln.pack_size_snapshot or svc.pack_label(ln.product),
            'packSize': ln.product.pack_size, 'packType': ln.product.pack_type,
            'qty': ln.qty_strips, 'receivedQty': ln.received_qty, 'remainingQty': max(0, ln.qty_strips - ln.received_qty),
            'estRate': _m(ln.last_rate), 'lineTotal': _m(ln.taxable_amount),
            'currentStock': insights[str(ln.product_id)]['currentStock'], 'minQty': insights[str(ln.product_id)]['minQty'],
            'onOrder': insights[str(ln.product_id)]['onOrder'], 'lastPurchaseRate': insights[str(ln.product_id)]['lastRate'],
            'shortbookItemId': str(ln.shortbook_item_id) if ln.shortbook_item_id else None,
        } for ln in lines],
        'events': [{
            'id': str(e.id), 'action': e.action, 'userName': e.user.name if e.user_id else None,
            'at': e.created_at.isoformat(), 'payload': e.payload,
        } for e in po.events.select_related('user').order_by('created_at')],
    })
    return out


# ───────────────────────────── list / create ─────────────────────────────

def _filtered(request, outlet):
    qs = PurchaseOrder.objects.filter(outlet=outlet).select_related('distributor')
    p = request.query_params
    if p.get('search'):
        s = p['search'].strip()
        qs = qs.filter(Q(po_number__icontains=s) | Q(distributor__name__icontains=s))
    if p.get('distributorId') and p['distributorId'] != 'ALL':
        qs = qs.filter(distributor_id=p['distributorId'])
    if p.get('startDate'):
        qs = qs.filter(order_date__gte=p['startDate'])
    if p.get('endDate'):
        qs = qs.filter(order_date__lte=p['endDate'])
    return qs


def _page_args(request, default_size=25, max_size=200):
    try:
        return min(max_size, max(1, int(request.query_params.get('pageSize', default_size)))), max(1, int(request.query_params.get('page', 1)))
    except ValueError:
        return default_size, 1


def _paginate(request, rows, default_size=25):
    size, page = _page_args(request, default_size)
    total = len(rows)
    return rows[(page - 1) * size: page * size], {'page': page, 'pageSize': size, 'totalRecords': total, 'totalPages': max(1, -(-total // size))}


class PurchaseOrderListView(APIView):
    """GET list (filters, status chips, totals, pagination) / POST create a Draft."""
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [CanCreatePurchases()] if self.request.method == 'POST' else [CanAccessPurchases()]

    @po_errors
    def get(self, request):
        outlet = _get_outlet(request)
        svc.expire_overdue(outlet)
        base = _filtered(request, outlet)
        counts = {r['status']: r['n'] for r in base.values('status').annotate(n=Count('id'))}
        status_counts = {s: counts.get(s, 0) for s in ('SAVED', 'SENT', 'PARTIAL', 'COMPLETED', 'CANCELLED', 'EXPIRED')}
        status_counts['OPEN'] = status_counts['SAVED'] + status_counts['SENT'] + status_counts['PARTIAL']
        status_counts['ALL'] = sum(counts.values())

        wanted = (request.query_params.get('status') or 'ALL').upper()
        qs = base
        if wanted == 'OPEN':
            qs = qs.filter(status__in=svc.OPEN_STATUSES)
        elif wanted != 'ALL':
            qs = qs.filter(status__in=[w for w in wanted.split(',') if w])
        qs = qs.annotate(item_count=Count('items'), ordered_total=Sum('items__qty_strips'), received_total=Sum('items__received_qty')).order_by('-created_at')
        rows = list(qs)
        page_rows, pagination = _paginate(request, rows)
        return Response({
            'results': [serialize_summary(po) for po in page_rows], 'pagination': pagination, 'statusCounts': status_counts,
            'totals': {'count': len(rows), 'amount': _m(sum((po.total_amount or 0) for po in rows))},
        })

    @po_errors
    def post(self, request):
        outlet = _get_outlet(request)
        po = svc.create_po(outlet, request.data.get('distributorId'), request.data.get('items') or [], request.user,
                           notes=request.data.get('notes', ''), expected_date=request.data.get('expectedDate'))
        return Response(serialize_detail(po, request.user), status=status.HTTP_201_CREATED)


class PurchaseOrderDetailView(APIView):
    """GET one PO (with columns, timeline, allowed actions) / PUT edit a Draft / DELETE a Draft."""
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [CanCreatePurchases()] if self.request.method in ('PUT', 'PATCH', 'DELETE') else [CanAccessPurchases()]

    @po_errors
    def get(self, request, pk):
        po = _get_po(request, pk)
        svc.expire_overdue(po.outlet)
        po.refresh_from_db()
        return Response(serialize_detail(po, request.user))

    @po_errors
    def put(self, request, pk):
        po = _get_po(request, pk)
        if request.data.get('version') in (None, ''):
            raise POError('Reload the order and try again (it must be saved with the version you loaded).', 400, 'NO_VERSION')
        po = svc.replace_items(po, request.data.get('items') or [], request.user, expected_version=request.data.get('version'),
                               notes=request.data.get('notes'), expected_date=request.data.get('expectedDate'),
                               distributor_id=request.data.get('distributorId'))
        return Response(serialize_detail(po, request.user))

    @po_errors
    def delete(self, request, pk):
        svc.delete_draft(_get_po(request, pk), request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ───────────────────────────── lifecycle actions ─────────────────────────────

def _wa_text(po, template, link, store):
    default = ('Hello {distributor}, please find our purchase order {po_no} from {store}. Open it here: {link}')
    text = (template or default)
    for k, v in {'{store}': store, '{po_no}': po.po_number, '{link}': link, '{distributor}': po.distributor.name}.items():
        text = text.replace(k, v)
    return text


class PurchaseOrderSendView(APIView):
    permission_classes = [CanSendPurchaseOrders]

    @po_errors
    def post(self, request, pk):
        po = _get_po(request, pk)
        channel = request.data.get('channel') or 'whatsapp_link'
        action = 'mark_ordered' if channel == 'manual' else ('resend' if po.status == 'SENT' else 'send')
        expected = request.data.get('expectedDate') or None
        po = svc.transition(po, action, request.user, channel=channel, expected_date=expected, note=request.data.get('note', ''))
        base = (request.data.get('baseUrl') or '').rstrip('/')
        share_url = f'{base}/po/{po.share_token}' if (base.startswith(('http://', 'https://')) and po.share_token) else ''
        st = svc.outlet_settings(po.outlet)
        message = request.data.get('message') or st.po_whatsapp_template
        text = _wa_text(po, message, share_url, po.outlet.name)
        phone = ''.join(ch for ch in (po.distributor.phone or '') if ch.isdigit())
        if phone and not phone.startswith('91') and len(phone) == 10:
            phone = '91' + phone
        wa = f'https://wa.me/{phone}?text={quote(text)}' if phone else f'https://wa.me/?text={quote(text)}'
        return Response({'po': serialize_detail(po, request.user), 'shareUrl': share_url, 'waUrl': wa if channel != 'manual' else '',
                         'message': text})


class PurchaseOrderCancelView(APIView):
    permission_classes = [CanCancelPurchaseOrders]

    @po_errors
    def post(self, request, pk):
        po = svc.transition(_get_po(request, pk), 'cancel', request.user, reason=request.data.get('reason', ''))
        return Response(serialize_detail(po, request.user))


class PurchaseOrderCloseShortView(APIView):
    permission_classes = [CanCancelPurchaseOrders]

    @po_errors
    def post(self, request, pk):
        po = svc.transition(_get_po(request, pk), 'close_short', request.user)
        return Response(serialize_detail(po, request.user))


class PurchaseOrderDuplicateView(APIView):
    permission_classes = [CanCreatePurchases]

    @po_errors
    def post(self, request, pk):
        copy = svc.duplicate_po(_get_po(request, pk), request.user)
        return Response(serialize_detail(copy, request.user), status=status.HTTP_201_CREATED)


class PurchaseOrderOpenView(APIView):
    """GET orders/open/?distributorId= : POs that can still receive goods (for the purchase-invoice banner)."""
    permission_classes = [CanAccessPurchases]

    @po_errors
    def get(self, request):
        outlet = _get_outlet(request)
        dist = request.query_params.get('distributorId') or request.query_params.get('distributor')
        if not dist:
            raise POError('distributorId is required.', 400, 'NO_DISTRIBUTOR')
        rows = []
        for po in svc.open_pos_for(outlet.id, dist):
            s = serialize_summary(po)
            rows.append({k: s[k] for k in ('id', 'poNumber', 'status', 'statusLabel', 'orderDate', 'expectedDate', 'itemCount', 'orderedQty', 'receivedQty', 'totalAmount')})
        return Response({'results': rows})


class PurchaseOrderItemsView(APIView):
    """GET orders/items/ : one row per PO line, so "did I order Paracetamol?" has an answer."""
    permission_classes = [CanAccessPurchases]

    @po_errors
    def get(self, request):
        outlet = _get_outlet(request)
        svc.expire_overdue(outlet)
        wanted = (request.query_params.get('status') or 'OPEN').upper()
        qs = PurchaseOrderItem.objects.filter(purchase_order__outlet=outlet).select_related('purchase_order__distributor', 'product')
        qs = qs.filter(purchase_order__status__in=svc.OPEN_STATUSES) if wanted == 'OPEN' else (
            qs if wanted == 'ALL' else qs.filter(purchase_order__status__in=wanted.split(',')))
        if request.query_params.get('search'):
            s = request.query_params['search'].strip()
            qs = qs.filter(Q(product__name__icontains=s) | Q(purchase_order__po_number__icontains=s))
        rows = []
        for it in qs.order_by('-purchase_order__created_at'):
            po = it.purchase_order
            rows.append({
                'id': str(it.id), 'productId': str(it.product_id), 'productName': it.product.name, 'poId': str(po.id), 'poNumber': po.po_number,
                'status': po.status, 'statusLabel': po.status_label, 'distributorName': po.distributor.name, 'ordered': it.qty_strips,
                'received': it.received_qty, 'remaining': max(0, it.qty_strips - it.received_qty),
                'ageDays': (svc.today() - po.order_date).days,
            })
        page_rows, pagination = _paginate(request, rows)
        return Response({'results': page_rows, 'pagination': pagination})


class PurchaseOrderByDistributorView(APIView):
    """GET orders/by-distributor/ : open orders, open value and overdue count per distributor."""
    permission_classes = [CanAccessPurchases]

    @po_errors
    def get(self, request):
        outlet = _get_outlet(request)
        svc.expire_overdue(outlet)
        groups = {}
        for po in PurchaseOrder.objects.filter(outlet=outlet, status__in=svc.OPEN_STATUSES).select_related('distributor'):
            g = groups.setdefault(str(po.distributor_id), {'distributorId': str(po.distributor_id), 'distributorName': po.distributor.name,
                                                           'openOrders': 0, 'openValue': Decimal('0'), 'overdue': 0, 'lastSent': None})
            g['openOrders'] += 1
            g['openValue'] += po.total_amount or 0
            if po.expected_date and po.expected_date < svc.today() and po.status in ('SENT', 'PARTIAL'):
                g['overdue'] += 1
            if po.sent_at and (g['lastSent'] is None or po.sent_at.isoformat() > g['lastSent']):
                g['lastSent'] = po.sent_at.isoformat()
        rows = sorted(groups.values(), key=lambda g: g['distributorName'].lower())
        for g in rows:
            g['openValue'] = _m(g['openValue'])
        return Response({'results': rows})


# ───────────────────────────── suggestions / bulk create ─────────────────────────────

class PurchaseOrderSuggestionsView(APIView):
    """GET orders/suggestions/ : low-stock candidates (on-order counted), optionally for one distributor."""
    permission_classes = [CanAccessPurchases]

    @po_errors
    def get(self, request):
        outlet = _get_outlet(request)
        return Response({'data': svc.low_stock_candidates(outlet.id, request.query_params.get('distributorId') or None)})


class PurchaseOrderBulkCreateView(APIView):
    """POST orders/bulk-create/ : one Draft per distributor from a list of items (kept for API clients; the Shortbook uses create-pos)."""
    permission_classes = [CanCreatePurchases]

    @po_errors
    def post(self, request):
        outlet = _get_outlet(request)
        groups = {}
        for item in request.data.get('items', []):
            dist = item.get('distributorId') or item.get('lastDistributorId')
            if not dist:
                raise POError('Missing distributor for product ' + str(item.get('productId')), 400, 'NO_DISTRIBUTOR')
            groups.setdefault(dist, []).append(item)
        made = [svc.create_po(outlet, d, items, request.user) for d, items in groups.items()]
        return Response({'detail': 'Orders generated', 'pos': [p.po_number for p in made]}, status=status.HTTP_201_CREATED)


# ───────────────────────────── shortbook ─────────────────────────────

def _serialize_shortbook(items):
    insights = svc.line_insights(items[0].outlet_id, [i.product_id for i in items]) if items else {}
    out = []
    for i in items:
        ins = insights.get(str(i.product_id), {})
        out.append({
            'id': str(i.id), 'productId': str(i.product_id), 'productName': i.product.name, 'packLabel': svc.pack_label(i.product),
            'qtyNeeded': i.qty_needed, 'source': i.source, 'sourceLabel': i.get_source_display(), 'status': i.status,
            'statusLabel': i.get_status_display(), 'note': i.note, 'customerName': i.customer_name, 'customerPhone': i.customer_phone,
            'distributorId': str(i.suggested_distributor_id) if i.suggested_distributor_id else None,
            'distributorName': i.suggested_distributor.name if i.suggested_distributor_id else None,
            'currentStock': ins.get('currentStock', 0), 'minQty': ins.get('minQty', 0), 'onOrder': ins.get('onOrder', 0),
            'lastRate': ins.get('lastRate'), 'addedOn': i.created_at.isoformat(),
        })
    return out


def _shortbook_filtered(request, outlet):
    """The Shortbook rows the screen's status / source / search filters describe."""
    qs = ShortbookItem.objects.filter(outlet=outlet).select_related('product', 'suggested_distributor')
    wanted = (request.query_params.get('status') or 'OPEN').upper()
    qs = qs.filter(status__in=ShortbookItem.OPEN_STATUSES) if wanted == 'OPEN' else qs.filter(status__in=wanted.split(','))
    if request.query_params.get('source'):
        qs = qs.filter(source=request.query_params['source'])
    if request.query_params.get('search'):
        qs = qs.filter(product__name__icontains=request.query_params['search'].strip())
    return qs


class CanAddToShortbook(IsAuthenticated):
    """Whoever bills or buys may note down something that is missing (a cashier at the counter sees it first). Reading the whole Shortbook still needs a purchase right."""
    message = 'You do not have permission to add to the Shortbook.'

    def has_permission(self, request, view):
        from apps.core.permissions import IsBillingStaffOrAbove
        return bool(IsBillingStaffOrAbove().has_permission(request, view) or CanCreatePurchases().has_permission(request, view))


class ShortbookListView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [CanAddToShortbook()] if self.request.method == 'POST' else [CanAccessPurchases()]

    @po_errors
    def get(self, request):
        outlet = _get_outlet(request)
        counts = {r['status']: r['n'] for r in ShortbookItem.objects.filter(outlet=outlet).values('status').annotate(n=Count('id'))}
        summary = {'pending': counts.get('PENDING', 0), 'inDraft': counts.get('IN_DRAFT', 0), 'ordered': counts.get('ORDERED', 0)}
        if request.query_params.get('countsOnly'):
            return Response({'results': [], 'counts': summary})                      # the tab badge: no sync, no rows, no extra work
        svc.expire_overdue(outlet)
        # The low-stock sync is the expensive part, and this page is opened and refreshed all day: once a minute per outlet is plenty.
        if svc.outlet_settings(outlet).po_auto_rules_enabled and cache.add(f'po:sbsync:{outlet.id}', 1, SHORTBOOK_SYNC_SECONDS):
            svc.sync_low_stock_into_shortbook(outlet, request.user)
            counts = {r['status']: r['n'] for r in ShortbookItem.objects.filter(outlet=outlet).values('status').annotate(n=Count('id'))}
            summary = {'pending': counts.get('PENDING', 0), 'inDraft': counts.get('IN_DRAFT', 0), 'ordered': counts.get('ORDERED', 0)}
        qs = _shortbook_filtered(request, outlet)

        # view=groups: the distributor groups only (name + counts, a page of them). No item rows: the screen opens one group at a time.
        if request.query_params.get('view') == 'groups':
            rows = qs.values('suggested_distributor_id', 'suggested_distributor__name').annotate(
                items=Count('id'), pending=Count('id', filter=Q(status='PENDING')), qty=Sum('qty_needed'))
            groups = [{'key': str(r['suggested_distributor_id']) if r['suggested_distributor_id'] else 'none',
                       'distributorId': str(r['suggested_distributor_id']) if r['suggested_distributor_id'] else None,
                       'name': r['suggested_distributor__name'] or 'No distributor chosen', 'items': r['items'], 'pending': r['pending'], 'qty': r['qty'] or 0}
                      for r in rows]
            groups.sort(key=lambda g: (g['distributorId'] is not None, g['name'].lower()))      # the ones that need a distributor come first
            page_rows, pagination = _paginate(request, groups, default_size=10)
            return Response({'groups': page_rows, 'pagination': pagination, 'counts': summary})

        # distributorId=<id|none>: one group's items, a page at a time
        key = request.query_params.get('distributorId')
        if key:
            qs = qs.filter(suggested_distributor_id__isnull=True) if key == 'none' else qs.filter(suggested_distributor_id=key)
            size, page = _page_args(request, default_size=25, max_size=100)
            total = qs.count()
            items = list(qs.order_by('product__name', 'id')[(page - 1) * size: page * size])
            return Response({'results': _serialize_shortbook(items), 'counts': summary,
                             'pagination': {'page': page, 'pageSize': size, 'totalRecords': total, 'totalPages': max(1, -(-total // size))}})

        items = list(qs.order_by('suggested_distributor__name', 'product__name'))
        return Response({'results': _serialize_shortbook(items), 'counts': summary})

    @po_errors
    def post(self, request):
        outlet = _get_outlet(request)
        d = request.data
        item = svc.shortbook_add(outlet, d.get('productId'), d.get('qty', 1), d.get('source') or 'manual', request.user, d.get('note', ''),
                                 d.get('customerName', ''), d.get('customerPhone', ''), d.get('distributorId'))
        item = ShortbookItem.objects.select_related('product', 'suggested_distributor').get(pk=item.pk)
        return Response(_serialize_shortbook([item])[0], status=status.HTTP_201_CREATED)


class ShortbookProductInfoView(APIView):
    """
    GET shortbook/product-info/?productId= : what a person needs to see while adding one product to the Shortbook - stock, minimum, what is
    already on order, the last supplier and rate, and whether it is already in the Shortbook (adding again raises that row).
    """
    permission_classes = [CanAddToShortbook]

    @po_errors
    def get(self, request):
        from apps.inventory.models import MasterProduct
        outlet = _get_outlet(request)
        try:
            product = MasterProduct.objects.get(id=request.query_params.get('productId'))
        except (MasterProduct.DoesNotExist, ValueError, TypeError, Exception):
            raise POError('That product was not found.', 404, 'NO_PRODUCT')
        ins = svc.line_insights(outlet.id, [product.id]).get(str(product.id), {})
        last = svc.suggest_distributor(outlet.id, product.id)
        open_row = ShortbookItem.objects.filter(outlet=outlet, product=product, status__in=ShortbookItem.OPEN_STATUSES).first()
        return Response({
            'productId': str(product.id), 'name': product.name, 'manufacturer': product.manufacturer or '', 'packLabel': svc.pack_label(product),
            'currentStock': ins.get('currentStock', 0), 'minQty': ins.get('minQty', 0), 'onOrder': ins.get('onOrder', 0), 'lastRate': ins.get('lastRate'),
            'lastDistributor': {'id': str(last.id), 'name': last.name} if last else None,
            'inShortbook': {'id': str(open_row.id), 'qty': open_row.qty_needed, 'status': open_row.status, 'statusLabel': open_row.get_status_display()} if open_row else None,
        })


class ShortbookDetailView(APIView):
    permission_classes = [CanCreatePurchases]

    def _get(self, request, pk):
        outlet = _get_outlet(request)
        try:
            return ShortbookItem.objects.select_related('product', 'suggested_distributor').get(id=pk, outlet=outlet)
        except ShortbookItem.DoesNotExist:
            raise POError('Shortbook item not found.', 404, 'NOT_FOUND')

    @po_errors
    def patch(self, request, pk):
        item = self._get(request, pk)
        if item.status != 'PENDING':
            raise POError('Only a pending item can be changed. Edit it in its draft PO.', 409, 'LOCKED')
        if 'qtyNeeded' in request.data:
            try:
                qty = int(request.data['qtyNeeded'])
            except (TypeError, ValueError):
                raise POError('Quantity must be a whole number.', 400, 'BAD_QTY')
            if qty < 1:
                raise POError('Quantity must be at least 1.', 400, 'BAD_QTY')
            item.qty_needed = qty
        if 'distributorId' in request.data:
            item.suggested_distributor = svc.get_distributor(item.outlet, request.data['distributorId'])
        if 'note' in request.data:
            item.note = (request.data['note'] or '')[:255]
        item.save()
        return Response(_serialize_shortbook([item])[0])

    @po_errors
    def delete(self, request, pk):
        item = self._get(request, pk)
        if item.status == 'IN_DRAFT':
            raise POError('This item is in a draft PO. Remove the line from the draft first.', 409, 'LOCKED')
        if item.status == 'ORDERED':
            raise POError('This item is on a sent PO. Cancel or close that PO to release it.', 409, 'LOCKED')
        item.status = 'REMOVED'
        item.save(update_fields=['status', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShortbookBulkView(APIView):
    """POST shortbook/bulk/ {ids, action: remove | set_distributor, distributorId}"""
    permission_classes = [CanCreatePurchases]

    @po_errors
    def post(self, request):
        outlet = _get_outlet(request)
        ids, action = request.data.get('ids') or [], request.data.get('action')
        # "select all in this group" arrives as distributorIds: every pending item of those distributors, however many pages that is
        qs = ShortbookItem.objects.filter(outlet=outlet, status='PENDING').filter(svc.group_filter(ids, request.data.get('distributorIds')))
        if action == 'remove':
            n = qs.update(status='REMOVED')
        elif action == 'set_distributor':
            n = qs.update(suggested_distributor=svc.get_distributor(outlet, request.data.get('distributorId')))
        else:
            raise POError('Unknown action.', 400, 'BAD_ACTION')
        return Response({'updated': n})


class ShortbookCreatePOsView(APIView):
    permission_classes = [CanCreatePurchases]

    @po_errors
    def post(self, request):
        outlet = _get_outlet(request)
        made = svc.create_pos_from_shortbook(outlet, request.data.get('itemIds') or [], request.user, distributor_ids=request.data.get('distributorIds'))
        return Response({'created': [{'id': str(p.id), 'poNumber': p.po_number, 'distributorName': p.distributor.name,
                                      'itemCount': p.items.count(), 'totalAmount': _m(p.total_amount)} for p in made]},
                        status=status.HTTP_201_CREATED)


# ───────────────────────────── settings ─────────────────────────────

SETTINGS_FIELDS = {
    'autoRulesEnabled': 'po_auto_rules_enabled', 'expiryDays': 'po_expiry_days', 'defaultChannel': 'po_default_channel',
    'whatsappTemplate': 'po_whatsapp_template', 'numberPrefix': 'po_number_prefix',
    'showRateToDistributor': 'po_show_rate_to_distributor', 'countFreeQty': 'po_count_free_qty',
}


def _settings_json(st):
    return {k: getattr(st, f) for k, f in SETTINGS_FIELDS.items()}


class PurchaseOrderSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [IsAdminStaff()]          # reading is as sensitive as changing (the PO screens get what they need from each order's sendDefaults)

    @po_errors
    def get(self, request):
        return Response(_settings_json(svc.outlet_settings(_get_outlet(request))))

    @po_errors
    def put(self, request):
        outlet = _get_outlet(request)
        if not request.user.check_password(str(request.data.get('password') or '')):
            raise POError('Your password is not correct.', 403, 'BAD_PASSWORD')
        st = svc.outlet_settings(outlet)
        d = request.data
        if 'expiryDays' in d:
            try:
                days = int(d['expiryDays'])
            except (TypeError, ValueError):
                raise POError('Expiry days must be a whole number.', 400, 'BAD_VALUE')
            if not 1 <= days <= 60:
                raise POError('Expiry days must be between 1 and 60.', 400, 'BAD_VALUE')
            st.po_expiry_days = days
        if 'defaultChannel' in d:
            if d['defaultChannel'] not in dict(PurchaseOrder.SEND_CHANNEL_CHOICES):
                raise POError('Unknown default channel.', 400, 'BAD_VALUE')
            st.po_default_channel = d['defaultChannel']
        if 'numberPrefix' in d:
            prefix = str(d['numberPrefix'] or '').strip().upper()
            if not prefix.isalnum() or len(prefix) > 10:
                raise POError('The PO prefix must be 1-10 letters or digits.', 400, 'BAD_VALUE')
            st.po_number_prefix = prefix
        if 'whatsappTemplate' in d:
            tpl = str(d['whatsappTemplate'] or '')
            if len(tpl) > 1000:
                raise POError('The message is too long (1000 characters at most).', 400, 'BAD_VALUE')
            st.po_whatsapp_template = tpl
        for key in ('autoRulesEnabled', 'showRateToDistributor', 'countFreeQty'):
            if key in d:
                setattr(st, SETTINGS_FIELDS[key], bool(d[key]))
        st.save()
        return Response(_settings_json(st))


# ───────────────────────────── public page ─────────────────────────────

class PublicPORateThrottle(AnonRateThrottle):
    rate = '60/min'
    scope = 'po_public'


class PublicPurchaseOrderView(APIView):
    """
    GET public/po/<token>/ : the read-only page a distributor opens from the WhatsApp link. No login. The token is a 43-character random
    secret; a closed PO stops answering a week after it closed. Rates (and the total) are only shown when the outlet allows it.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicPORateThrottle]

    def get(self, request, token):
        po = PurchaseOrder.objects.select_related('outlet', 'distributor').filter(share_token=token).first()
        if po is None or po.status == 'SAVED':
            return Response({'detail': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        if po.closed_at and timezone.now() - po.closed_at > timedelta(days=7):
            return Response({'detail': 'This link has expired.'}, status=status.HTTP_404_NOT_FOUND)
        show_rate = svc.outlet_settings(po.outlet).po_show_rate_to_distributor
        lines = []
        for ln in po.items.select_related('product').order_by('id'):
            row = {'productName': ln.product.name, 'packLabel': ln.pack_size_snapshot or svc.pack_label(ln.product), 'qty': ln.qty_strips,
                   'mrp': _m(ln.product.mrp) if ln.product.mrp else None}
            if show_rate:
                row['rate'] = _m(ln.last_rate)
                row['lineTotal'] = _m(ln.taxable_amount)
            lines.append(row)
        out = po.outlet
        return Response({
            'storeName': out.name, 'storePhone': getattr(out, 'phone', '') or '', 'storeAddress': getattr(out, 'address', '') or '',
            'poNumber': po.po_number, 'status': po.status, 'statusLabel': po.status_label, 'orderDate': po.order_date.isoformat(),
            'expectedDate': po.expected_date.isoformat() if po.expected_date else None, 'distributorName': po.distributor.name,
            'notes': po.notes, 'cancelReason': po.cancel_reason if po.status == 'CANCELLED' else '',
            'items': lines, 'showRates': show_rate, 'totalAmount': _m(po.total_amount) if show_rate else None,
        })
