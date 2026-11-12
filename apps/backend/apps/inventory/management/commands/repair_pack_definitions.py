"""
Find and repair batches whose pack definition no longer matches their product.

    manage.py repair_pack_definitions                 # report only (default, changes nothing)
    manage.py repair_pack_definitions --apply         # fix what is safe to fix
    manage.py repair_pack_definitions --outlet <id>   # limit to one outlet

Why: a pack (size / unit / type) is copied onto every batch and billing sells from the batch.
Until now editing a product left its batches untouched, so products edited in the past can have
batches that still carry the old, wrong pack ("shows pieces, offers loose, then refuses to sell
loose"). Saving a product now keeps its batches in step; this fixes the ones already out of step.

What --apply changes (each is a pure correction):
  * batch unit / type  -> the product's (they describe the product, batches never legitimately differ)
  * loose stock >= pack size -> whole packs moved into the pack count (stock total unchanged)
What it only REPORTS (a human has to decide which side is right):
  * batch pack SIZE different from the product's (a supplier may genuinely have changed the pack)
  * contradictory type/unit pairs and unknown pack types on the product itself
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.models import Batch, MasterProduct
from apps.inventory.pack_rules import pack_errors, sync_batch_to_pack


class Command(BaseCommand):
    help = 'Report (default) or repair batches whose pack unit/type/loose stock disagree with their product.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the safe fixes (default is a dry run).')
        parser.add_argument('--outlet', help='Only this outlet id.')

    def handle(self, *args, apply=False, outlet=None, **opts):
        out = self.stdout.write
        out(f"{'APPLYING' if apply else 'DRY RUN (nothing is written)'}\n")

        bad_products = []
        for product in MasterProduct.objects.all().iterator():
            errs = pack_errors(product.pack_size, product.pack_unit, product.pack_type)
            if errs:
                bad_products.append((product, errs))
        out(f"Products with an invalid pack definition: {len(bad_products)}")
        for product, errs in bad_products[:50]:
            out(f"   {product.name}  [{product.pack_size} {product.pack_unit} / {product.pack_type}]  -> {errs}")
        if bad_products:
            out("   (fix these in Inventory > Edit Product; saving then repairs their batches too)\n")

        qs = Batch.objects.select_related('product').filter(product__isnull=False)
        if outlet:
            qs = qs.filter(outlet_id=outlet)

        fixed = size_drift = 0
        with transaction.atomic():
            for batch in qs.iterator():
                product = batch.product
                if batch.pack_size != product.pack_size:
                    size_drift += 1
                    out(f"   SIZE differs (not changed): {product.name} batch {batch.batch_no} "
                        f"batch={batch.pack_size} product={product.pack_size}")
                if pack_errors(product.pack_size, product.pack_unit, product.pack_type):
                    continue  # the product itself is wrong: do not spread that to batches
                before = (batch.pack_unit, batch.pack_type, batch.qty_strips, batch.qty_loose)
                changed = sync_batch_to_pack(batch, batch.pack_size, product.pack_unit, product.pack_type)
                if not changed:
                    continue
                fixed += 1
                out(f"   FIX {product.name} batch {batch.batch_no}: {changed}  was {before}")
                if apply:
                    batch.save(update_fields=changed)
            if not apply:
                transaction.set_rollback(True)

        out(f"\nBatches {'fixed' if apply else 'that would be fixed'}: {fixed}")
        out(f"Batches whose pack size differs from the product (review by hand): {size_drift}")
