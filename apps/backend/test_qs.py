import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.inventory.models import MasterProduct, Batch
from django.db.models import Sum, F, Case, When, Value, BooleanField, IntegerField, Subquery, OuterRef
from django.db.models.functions import Coalesce

outlet_id = 'd5349da2-dc06-405e-a5ee-6370c5e75c91'
query_lower = "full ss fiber commod chair"
today = django.utils.timezone.now().date()

products_query = MasterProduct.objects.filter(
    is_discontinued=False
).filter(
    name__icontains=query_lower
)

active_batches_sq = Batch.objects.filter(
    outlet_id=outlet_id,
    is_active=True,
    product_id=OuterRef('pk'),
    expiry_date__gt=today
)

products_query = products_query.annotate(
    total_strips=Coalesce(
        Subquery(
            active_batches_sq.values('product_id')
            .annotate(s=Sum('qty_strips')).values('s')[:1],
            output_field=IntegerField()
        ),
        0
    ),
    total_loose=Coalesce(
        Subquery(
            active_batches_sq.values('product_id')
            .annotate(s=Sum('qty_loose')).values('s')[:1],
            output_field=IntegerField()
        ),
        0
    )
).annotate(
    total_qty=F('total_strips') + F('total_loose'),
    has_stock=Case(
        When(total_qty__gt=0, then=Value(True)),
        default=Value(False),
        output_field=BooleanField()
    )
).order_by('-has_stock', 'name')

all_matched_products = list(products_query[:50])
for p in all_matched_products:
    print(p.name, p.has_stock)

in_stock_products = [p for p in all_matched_products if p.has_stock][:5]
no_stock_products = [p for p in all_matched_products if not p.has_stock][:3]

print("In stock:", [p.name for p in in_stock_products])
print("No stock:", [p.name for p in no_stock_products])

