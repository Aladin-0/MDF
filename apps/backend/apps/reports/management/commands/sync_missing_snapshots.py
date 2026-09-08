from django.core.management.base import BaseCommand
from datetime import date
from apps.billing.models import SaleInvoice
from apps.reports.gst_snapshot_service import create_sale_snapshots
from apps.reports.models import GSTTransactionSnapshot

class Command(BaseCommand):
    help = 'Syncs missing GSTTransactionSnapshots for SaleInvoices'

    def handle(self, *args, **options):
        # We check all active sales that don't have a snapshot.
        # Alternatively, we just check today's date for efficiency.
        today = date.today()
        invoices = SaleInvoice.objects.filter(is_return=False)
        
        import logging
        logger = logging.getLogger(__name__)
        count = 0
        for inv in invoices:
            try:
                exists = GSTTransactionSnapshot.objects.filter(document_id=inv.id, transaction_type='sale').exists()
                if not exists:
                    create_sale_snapshots(inv)
                    count += 1
                    self.stdout.write(f"Created snapshot for Invoice {inv.invoice_no}")
            except Exception as e:
                logger.exception(f"Failed to create GST snapshot for SaleInvoice ID {inv.id}: {str(e)}")
                self.stderr.write(f"Error processing Invoice ID {inv.id}: {str(e)}")

        self.stdout.write(self.style.SUCCESS(f"Total missing snapshots created: {count}"))
