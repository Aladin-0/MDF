"""
Numbers for the home dashboard (GET /dashboard/daily/).

One place for the rules, so the page, its trends and its alerts always agree with the rest of the app:

* Cancelled invoices never count (a cancel-and-reissue used to be counted twice: the voided bill and the new one).
* "Credit given" is credit given IN THE PERIOD (sum of each invoice's `credit_given`). What customers still owe in
  total is a different number (`outstandingCredit`); the dashboard used to show the second under the first's name.
* How the period's sales were paid comes from the invoices themselves, so cash + UPI + card + credit adds up to the
  billed total.
* Trends compare with the previous period of the same length, computed here (the page used to show invented "+12%").
* Stock alerts use the inventory rules (`apps/inventory/views.py`): a product is low when its TOTAL packs (loose
  included) are under the outlet's minimum or `DEFAULT_MIN_QTY`; a product is expiring when any batch that still has
  stock expires within `EXPIRING_SOON_DAYS`, expired ones included.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Exists, ExpressionWrapper, F, FloatField, IntegerField, OuterRef, Q, Subquery, Sum, Value, Case, When
from django.db.models.functions import Cast, Coalesce, ExtractHour, NullIf

from apps.billing.models import CreditAccount, SaleInvoice, SaleItem, SalesReturn
from apps.inventory.models import Batch, MasterProduct, OutletProductConfig

ALERT_LIST_LIMIT = 8        # rows sent per alert; the card shows the true total next to them


def _f(value) -> float:
    return float(value or 0)


def previous_range(start, end):
    """The period right before [start, end], of the same length (for "vs previous period")."""
    days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return prev_end - timedelta(days=days - 1), prev_end


def sales_queryset(outlet, start, end):
    """Real sales of the period: not a return, not cancelled."""
    return SaleInvoice.objects.filter(
        outlet=outlet,
        is_return=False,
        is_cancelled=False,
        invoice_date__date__gte=start,
        invoice_date__date__lte=end,
    )


def returns_total(outlet, start, end):
    """(amount, count) of sales returns in the period: legacy return invoices plus SalesReturn documents."""
    legacy = SaleInvoice.objects.filter(
        outlet=outlet, is_return=True, is_cancelled=False,
        invoice_date__date__gte=start, invoice_date__date__lte=end,
    ).aggregate(total=Sum('grand_total'), n=Count('id'))
    modern = SalesReturn.objects.filter(
        outlet=outlet, return_date__gte=start, return_date__lte=end,
    ).aggregate(total=Sum('total_amount'), n=Count('id'))
    amount = abs(_f(legacy['total'])) + abs(_f(modern['total']))
    return amount, (legacy['n'] or 0) + (modern['n'] or 0)


def period_totals(outlet, start, end):
    """Everything the KPI tiles show for one period."""
    sales = sales_queryset(outlet, start, end)
    agg = sales.aggregate(
        total=Sum('grand_total'), bills=Count('id'),
        cash=Sum('cash_paid'), upi=Sum('upi_paid'), card=Sum('card_paid'), credit=Sum('credit_given'),
        discount=Sum('discount_amount'), cgst=Sum('cgst_amount'), sgst=Sum('sgst_amount'), igst=Sum('igst_amount'),
    )
    returns_amount, returns_count = returns_total(outlet, start, end)
    total_sales = _f(agg['total'])
    return {
        'totalSales': total_sales,
        'totalBills': agg['bills'] or 0,
        'salesReturnAmount': returns_amount,
        'salesReturnCount': returns_count,
        'netSales': total_sales - returns_amount,
        'cashCollected': _f(agg['cash']),
        'upiCollected': _f(agg['upi']),
        'cardCollected': _f(agg['card']),
        'creditGiven': _f(agg['credit']),
        'totalDiscount': _f(agg['discount']),
        'totalGst': _f(agg['cgst']) + _f(agg['sgst']) + _f(agg['igst']),
    }


def trend_totals(totals):
    """The few numbers the page compares with the previous period."""
    return {key: totals[key] for key in (
        'totalSales', 'totalBills', 'netSales', 'salesReturnAmount',
        'cashCollected', 'upiCollected', 'cardCollected', 'creditGiven',
    )}


def outstanding_credit(outlet) -> float:
    """What customers owe this outlet right now (all time, not just the period)."""
    total = CreditAccount.objects.filter(outlet=outlet, total_outstanding__gt=0).aggregate(t=Sum('total_outstanding'))['t']
    return _f(total)


def gross_margin(outlet, start, end):
    """
    (profit, margin %) of the period's sales at landing cost, or (None, None) when there is nothing to measure.
    Revenue is the items' taxable amount (GST excluded); cost is the packs sold (loose included) times the batch's
    landing rate, else its purchase rate. Items without a batch (custom lines) are left out of both sides.
    """
    packs = Cast(F('qty_strips'), FloatField()) + Cast(F('qty_loose'), FloatField()) / Cast(Coalesce(NullIf(F('pack_size'), 0), 1), FloatField())
    unit_cost = Coalesce(Cast(F('batch__landing_rate'), FloatField()), Cast(F('batch__purchase_rate'), FloatField()), 0.0)
    agg = SaleItem.objects.filter(
        invoice__in=sales_queryset(outlet, start, end), batch__isnull=False,
    ).aggregate(revenue=Sum(Cast(F('taxable_amount'), FloatField())), cost=Sum(packs * unit_cost))
    revenue, cost = _f(agg['revenue']), _f(agg['cost'])
    if revenue <= 0:
        return None, None
    profit = revenue - cost
    return round(profit, 2), round(profit / revenue * 100, 1)


def top_sellers(outlet, start, end, limit=5):
    """Best sellers by revenue. (Quantities of different pack types cannot be ranked against each other.)"""
    rows = SaleItem.objects.filter(
        invoice__in=sales_queryset(outlet, start, end),
    ).values('batch__product_id', 'product_name').annotate(
        packs=Sum('qty_strips'), loose=Sum('qty_loose'), revenue=Sum('total_amount'),
    ).order_by('-revenue')[:limit]
    return [
        {
            'productId': str(r['batch__product_id']) if r['batch__product_id'] else 'custom',
            'name': r['product_name'],
            'totalQty': int(r['packs'] or 0),
            'totalLoose': int(r['loose'] or 0),
            'totalRevenue': _f(r['revenue']),
        }
        for r in rows
    ]


def hourly_sales(sales):
    rows = sales.annotate(hour=ExtractHour('invoice_date')).values('hour').annotate(
        bills=Count('id'), sales=Sum('grand_total'),
    ).order_by('hour')
    return [{'hour': f"{r['hour']:02d}:00", 'bills': r['bills'], 'sales': _f(r['sales'])} for r in rows]


def staff_leaderboard(sales, limit=5):
    rows = sales.values('billed_by__id', 'billed_by__name', 'billed_by__role', 'billed_by__avatar_url').annotate(
        billsCount=Count('id'), totalSales=Sum('grand_total'),
    ).order_by('-totalSales')[:limit]
    return [
        {
            'staffId': str(r['billed_by__id']),
            'name': r['billed_by__name'] or 'Unknown',
            'role': r['billed_by__role'] or 'billing_staff',
            'avatarUrl': r['billed_by__avatar_url'],
            'billsCount': r['billsCount'],
            'totalSales': _f(r['totalSales']),
        }
        for r in rows if r['billed_by__id']
    ]


def stock_alerts(outlet, today):
    """
    {lowStock, expiringSoon, overdueAccounts}: each a short list plus the true total, per the inventory rules.
    Imported lazily: the inventory view module is large and imports billing.
    """
    from apps.inventory.views import DEFAULT_MIN_QTY, EXPIRING_SOON_DAYS

    active = Batch.objects.filter(outlet=outlet, is_active=True)
    stocked = active.filter(Q(qty_strips__gt=0) | Q(qty_loose__gt=0))

    # ── low stock: per PRODUCT, loose units counted, outlet minimum else the default ──
    per_product = active.filter(product_id=OuterRef('pk')).values('product_id')
    config = OutletProductConfig.objects.filter(outlet=outlet, product_id=OuterRef('pk'))
    low = MasterProduct.objects.filter(id__in=active.values('product_id')).annotate(
        strips=Coalesce(Subquery(per_product.annotate(s=Sum('qty_strips')).values('s')[:1], output_field=IntegerField()), 0),
        loose=Coalesce(Subquery(per_product.annotate(s=Sum('qty_loose')).values('s')[:1], output_field=IntegerField()), 0),
        outlet_min=Coalesce(Subquery(config.values('min_qty')[:1], output_field=FloatField()), 0.0),
    ).annotate(
        packs=ExpressionWrapper(
            F('strips') + Cast(F('loose'), FloatField()) / Cast(Coalesce(NullIf(F('pack_size'), 0), 1), FloatField()),
            output_field=FloatField(),
        ),
        minimum=Case(When(outlet_min__gt=0, then=F('outlet_min')), default=Value(float(DEFAULT_MIN_QTY)), output_field=FloatField()),
    ).filter(packs__lt=F('minimum'))
    low_total = low.count()
    low_rows = [
        {
            'productId': str(p.id),
            'productName': p.name,
            'currentStock': round(p.packs, 1),
            'reorderLevel': p.minimum,
        }
        for p in low.order_by('packs', 'name')[:ALERT_LIST_LIMIT]
    ]

    # ── expiring: batches that still hold stock, due within 90 days or already expired ──
    cutoff = today + timedelta(days=EXPIRING_SOON_DAYS)
    expiring = stocked.filter(expiry_date__lte=cutoff).select_related('product')
    expiring_total = expiring.count()
    expiring_rows = [
        {
            'productId': str(b.product_id),
            'batch': {'productName': b.product.name if b.product else 'Unknown', 'batchNumber': b.batch_no, 'expiryDate': b.expiry_date.isoformat()},
            'daysUntilExpiry': (b.expiry_date - today).days,     # negative: already expired
        }
        for b in expiring.order_by('expiry_date')[:ALERT_LIST_LIMIT]
    ]

    # ── overdue credit ──
    overdue = CreditAccount.objects.filter(outlet=outlet, status='overdue', total_outstanding__gt=0).select_related('customer')
    overdue_agg = overdue.aggregate(n=Count('id'), amount=Sum('total_outstanding'))
    overdue_rows = []
    for account in overdue.order_by('-total_outstanding')[:ALERT_LIST_LIMIT]:
        last = account.last_transaction_date
        days = max(0, (today - (last.date() if hasattr(last, 'date') else last)).days) if last else 0
        overdue_rows.append({
            'customerId': str(account.customer_id),
            'customerName': account.customer.name,
            'outstandingAmount': _f(account.total_outstanding),
            'daysOverdue': days,
        })

    return {
        'lowStock': low_rows,
        'expiringSoon': expiring_rows,
        'overdueAccounts': overdue_rows,
        'counts': {
            'lowStock': low_total,
            'expiringSoon': expiring_total,
            'overdueAccounts': overdue_agg['n'] or 0,
            'overdueAmount': _f(overdue_agg['amount']),
        },
    }
