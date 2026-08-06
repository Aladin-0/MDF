from django.core.management.base import BaseCommand
from apps.inventory.models import Batch, StockLedger
from django.db.models import Sum
from decimal import Decimal

class Command(BaseCommand):
    help = 'Reconciles active Batch total_stock with StockLedger entries'

    def handle(self, *args, **options):
        discrepancies = []
        active_batches = Batch.objects.filter(is_active=True)
        
        for batch in active_batches:
            ledger_agg = StockLedger.objects.filter(batch=batch).aggregate(
                total_in=Sum('qty_in'),
                total_out=Sum('qty_out')
            )
            total_in = ledger_agg['total_in'] or Decimal('0.0')
            total_out = ledger_agg['total_out'] or Decimal('0.0')
            expected_stock = total_in - total_out
            
            actual_stock = Decimal(str(batch.total_stock))
            
            if expected_stock != actual_stock:
                discrepancies.append(
                    f"Batch {batch.id} (No: {batch.batch_no}): expected {expected_stock}, got {actual_stock}"
                )
                
        if discrepancies:
            for discrepancy in discrepancies:
                self.stdout.write(self.style.WARNING(discrepancy))
            self.stdout.write(self.style.ERROR(f"Found {len(discrepancies)} discrepancies."))
        else:
            self.stdout.write(self.style.SUCCESS("Zero discrepancies found."))
