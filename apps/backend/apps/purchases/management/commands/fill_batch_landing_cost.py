"""
Give every batch that has no landing cost the one the system would have worked out (purchases/landing.py).

    python manage.py fill_batch_landing_cost                 # dry run: shows what would change, changes nothing
    python manage.py fill_batch_landing_cost --apply         # writes Batch.landing_rate
    python manage.py fill_batch_landing_cost --outlet <id>   # one outlet only
    python manage.py fill_batch_landing_cost --all           # also batches that are sold out

Only batches that still hold stock are filled unless --all is given: the point is the minimum price at the billing
counter, and the profit reports read the batch's landing cost too, so filling a sold-out batch would only re-state the
cost of sales that are long finished.

Why: purchases used to store the landing cost on the purchase line only, so a batch received through a purchase had
none and billing held its sales to the supplier's PTR instead. New purchases now write it; this fills in the old ones.

A batch that already has a landing cost is never touched. For the others:
  * its latest purchase line decides (cost after discounts and free goods, + GST if the outlet counts GST as a cost
    TODAY, + freight);
  * with no purchase line (opening stock), its purchase rate does, + the product's GST on the same condition;
  * with no cost at all it is left alone.
"""
from collections import Counter
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from apps.inventory.cache_utils import bump_inventory_cache
from apps.inventory.models import Batch
from apps.purchases.landing import for_batch, landing_from_purchase_item, landing_includes_gst, landing_rate_per_pack
from apps.purchases.models import PurchaseItem


class Command(BaseCommand):
    help = "Fill in Batch.landing_rate where it is missing (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the changes (default: only report).')
        parser.add_argument('--outlet', help='Only this outlet id.')
        parser.add_argument('--all', action='store_true', help='Also batches with no stock left (default: only stock on hand).')
        parser.add_argument('--show', type=int, default=8, help='How many example rows to print.')

    def handle(self, *args, **opts):
        batches = Batch.objects.filter(Q(landing_rate__isnull=True) | Q(landing_rate__lte=0)).select_related(
            'product', 'outlet', 'outlet__settings')
        if opts['outlet']:
            batches = batches.filter(outlet_id=opts['outlet'])
        if not opts['all']:
            batches = batches.filter(Q(qty_strips__gt=0) | Q(qty_loose__gt=0))
        batches = list(batches)

        latest_line = {}
        for item in PurchaseItem.objects.filter(batch__in=batches).order_by('created_at'):
            latest_line[item.batch_id] = item        # ordered oldest first: the last one kept is the latest

        changes, counts = [], Counter()
        for batch in batches:
            include_gst = landing_includes_gst(batch.outlet)
            line = latest_line.get(batch.id)
            if line is not None:
                landing, source = landing_from_purchase_item(line, include_gst), 'purchase line'
            elif batch.purchase_rate and batch.purchase_rate > 0:
                gst = batch.product.gst_rate if batch.product else 0
                landing, source = landing_rate_per_pack(batch.purchase_rate, 1, gst_rate=gst, include_gst=include_gst), 'purchase rate'
            else:
                counts['left alone: no cost on record'] += 1
                continue
            landing = for_batch(landing)
            if landing <= 0:
                counts['left alone: no cost on record'] += 1
                continue
            counts[f'from its {source}' + (' (+ GST)' if include_gst else ' (GST not counted at this outlet)')] += 1
            changes.append((batch, landing, source))

        self.stdout.write(f"Batches with no landing cost ({'all' if opts['all'] else 'with stock on hand'}): {len(batches)}")
        for what, n in sorted(counts.items()):
            self.stdout.write(f"  {n:>5}  {what}")
        for batch, landing, source in changes[:opts['show']]:
            name = batch.product.name if batch.product else '?'
            self.stdout.write(f"  e.g. {name[:28]:<28} batch {batch.batch_no:<12} purchase {batch.purchase_rate}  ptr {batch.ptr}"
                              f"  ->  landing {landing}  ({source}; {batch.outlet.name[:20]})")

        if not opts['apply']:
            self.stdout.write(self.style.WARNING(f"Dry run: nothing was changed. {len(changes)} batches would get a landing cost. Add --apply to write."))
            return

        with transaction.atomic():
            for batch, landing, _source in changes:
                # only where it is still empty: a landing cost someone typed in the meantime is kept
                Batch.objects.filter(pk=batch.pk).filter(Q(landing_rate__isnull=True) | Q(landing_rate__lte=0)).update(landing_rate=landing)
        for outlet_id in {batch.outlet_id for batch, _l, _s in changes}:
            bump_inventory_cache(outlet_id)          # billing search and the stock list show the new floors at once
        self.stdout.write(self.style.SUCCESS(f"Done: {len(changes)} batches now have a landing cost."))
