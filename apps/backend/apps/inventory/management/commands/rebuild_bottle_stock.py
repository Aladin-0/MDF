import logging
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.inventory.models import Batch, MasterProduct
from apps.purchases.models import PurchaseItem
from apps.billing.models import SaleItem

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Safely rebuild stock quantities for bottle/measured products that had bad state."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run without saving changes to the database.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        # We target all batches for products that are "bottle" pack unit.
        bottle_batches = Batch.objects.filter(product__pack_unit__iexact='bottle')
        
        self.stdout.write(f"Found {bottle_batches.count()} batches for bottle products.")
        
        updated_count = 0
        
        with transaction.atomic():
            for batch in bottle_batches:
                # Calculate total purchased qty (in strips/bottles)
                purchase_items = PurchaseItem.objects.filter(batch=batch)
                total_purchased = sum((pi.qty + pi.free_qty) for pi in purchase_items)
                
                # Calculate total sold qty (in strips/bottles)
                sale_items = SaleItem.objects.filter(batch=batch)
                total_sold = sum(si.qty_strips for si in sale_items)
                
                # Calculate total loose sold (if any, though bottles usually don't have loose)
                total_loose_sold = sum(si.qty_loose for si in sale_items)
                
                # Opening stock might need to be considered if it was an opening balance
                # But for now, we assume stock = purchased - sold
                opening_stock = batch.qty_strips if getattr(batch, 'is_opening_stock', False) else 0
                
                expected_qty = (total_purchased + opening_stock) - total_sold
                # Handle loose quantities if applicable
                expected_loose = 0 - total_loose_sold
                while expected_loose < 0:
                    expected_qty -= 1
                    expected_loose += (batch.pack_size or 1)
                
                # If current stock is zero but it shouldn't be, or if there's a mismatch
                if batch.qty_strips != expected_qty or batch.qty_loose != expected_loose:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Batch {batch.batch_no} (Product: {batch.product.name}): "
                            f"Current Stock [{batch.qty_strips} / {batch.qty_loose}] -> "
                            f"Expected Stock [{expected_qty} / {expected_loose}]"
                        )
                    )
                    
                    if not dry_run:
                        batch.qty_strips = expected_qty
                        batch.qty_loose = expected_loose
                        batch.save(update_fields=['qty_strips', 'qty_loose'])
                        updated_count += 1
            
            if dry_run:
                self.stdout.write(self.style.SUCCESS("Dry run completed. No data was mutated."))
                # Rollback just in case
                transaction.set_rollback(True)
            else:
                self.stdout.write(self.style.SUCCESS(f"Successfully rebuilt stock for {updated_count} batches."))
