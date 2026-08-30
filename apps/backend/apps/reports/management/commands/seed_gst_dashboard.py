from django.core.management.base import BaseCommand
from apps.core.models import Outlet
from apps.purchases.models import PurchaseInvoice, Rule37Adjustment, Distributor
from apps.reports.models import GSTTransactionSnapshot, ITCReconciliationRun, ITCReconciliationResult, DeferredITCEntry
from datetime import date
import uuid
import json

class Command(BaseCommand):
    help = 'Seed database with mock data for GST Dashboard MVP'

    def handle(self, *args, **kwargs):
        from apps.core.models import Organization, Outlet
        from django.core.management.base import CommandError

        # Try to find the seeder's outlet or the first available
        outlet = Outlet.objects.filter(name__startswith='SEED-').first()
        if not outlet:
            outlet = Outlet.objects.first()

        if not outlet:
            raise CommandError(
                "No Outlets found! Please run 'python manage.py seeder' first "
                "to generate the base organization, outlets, and Staff login accounts."
            )

        self.stdout.write(f"Using Outlet: {outlet.name} ({outlet.gstin})")

        # Clear only the GST / mock data for this outlet
        GSTTransactionSnapshot.objects.filter(outlet=outlet).delete()
        DeferredITCEntry.objects.filter(purchase_invoice__outlet=outlet).delete()
        ITCReconciliationResult.objects.filter(run__outlet=outlet).delete()
        ITCReconciliationRun.objects.filter(outlet=outlet).delete()
        PurchaseInvoice.objects.filter(outlet=outlet, invoice_no__startswith='PINV-').delete()
        PurchaseInvoice.objects.filter(outlet=outlet, invoice_no__startswith='R37-').delete()
        
        # We also need some distributors. Try to get existing, else create mock ones for this outlet.
        distributor, _ = Distributor.objects.get_or_create(outlet=outlet, gstin='27BBBBB1234B1Z5', defaults={'name': 'Pharma Corp'})
        dist2, _ = Distributor.objects.get_or_create(outlet=outlet, gstin='29CCCCC1234C1Z5', defaults={'name': 'MedInc'})

        periods = ['052026', '062026', '072026', '082026']

        # Clean Period: 052026
        self.stdout.write("Seeding 052026 (Clean Period)")
        fp = '052026'
        pi = PurchaseInvoice.objects.create(outlet=outlet, distributor=distributor, invoice_no='PINV-05-1', invoice_date=date(2026, 5, 10), subtotal=10000, taxable_amount=10000, gst_amount=1800, grand_total=11800)
        pr = GSTTransactionSnapshot.objects.create(outlet=outlet, gstin=outlet.gstin, period=fp, transaction_type='purchase', document_id=pi.id, document_number='PINV-05-1', document_date=date(2026, 5, 10), snapshot_json={'is_b2b': True, 'distributor_gstin': distributor.gstin, 'items_by_rate': {'18.0': {'taxable_amount': 10000.0, 'igst': 0, 'cgst': 900.0, 'sgst': 900.0, 'cess': 0}}})
        # Outward
        GSTTransactionSnapshot.objects.create(outlet=outlet, gstin=outlet.gstin, period=fp, transaction_type='sale', document_id=uuid.uuid4(), document_number='SINV-05-1', document_date=date(2026, 5, 15), snapshot_json={'is_b2b': True, 'is_interstate': False, 'customer_name': 'Test Cust', 'customer_gstin': '27CCCCC1234C1Z5', 'items_by_rate': {'18.0': {'taxable_amount': 20000.0, 'igst': 0, 'cgst': 1800.0, 'sgst': 1800.0, 'cess': 0}}})
        
        run = ITCReconciliationRun.objects.create(outlet=outlet, period=fp, status='COMPLETED')
        ITCReconciliationResult.objects.create(run=run, purchase_snapshot=pr, match_status='MATCHED', mismatch_reasons=[])
        
        # Warnings Period: 062026 (Liability Shortfall and Missing in 2B)
        self.stdout.write("Seeding 062026 (Warnings Period)")
        fp = '062026'
        # Purchase (Missing)
        pi = PurchaseInvoice.objects.create(outlet=outlet, distributor=distributor, invoice_no='PINV-06-1', invoice_date=date(2026, 6, 12), subtotal=5000, taxable_amount=5000, gst_amount=900, grand_total=5900)
        pr = GSTTransactionSnapshot.objects.create(outlet=outlet, gstin=outlet.gstin, period=fp, transaction_type='purchase', document_id=pi.id, document_number='PINV-06-1', document_date=date(2026, 6, 12), snapshot_json={'is_b2b': True, 'distributor_gstin': distributor.gstin, 'items_by_rate': {'18.0': {'taxable_amount': 5000.0, 'igst': 0, 'cgst': 450.0, 'sgst': 450.0, 'cess': 0}}})
        # Outward (Shortfall scenario if we mock GSTR-1 externally, but we just generate it, so maybe just normal)
        GSTTransactionSnapshot.objects.create(outlet=outlet, gstin=outlet.gstin, period=fp, transaction_type='sale', document_id=uuid.uuid4(), document_number='SINV-06-1', document_date=date(2026, 6, 15), snapshot_json={'is_b2b': True, 'is_interstate': False, 'items_by_rate': {'18.0': {'taxable_amount': 1000.0, 'igst': 0, 'cgst': 90.0, 'sgst': 90.0, 'cess': 0}}})
        
        run = ITCReconciliationRun.objects.create(outlet=outlet, period=fp, status='COMPLETED')
        ITCReconciliationResult.objects.create(run=run, purchase_snapshot=pr, match_status='MISSING_IN_2B', mismatch_reasons=[])
        DeferredITCEntry.objects.create(purchase_invoice=pi, original_period=fp, status='DEFERRED', iamt=0, camt=450, samt=450, csamt=0)
        
        # Blocked Period: 072026 (Tax rate mismatch, excess ITC blocked)
        self.stdout.write("Seeding 072026 (Blocked Period)")
        fp = '072026'
        pi = PurchaseInvoice.objects.create(outlet=outlet, distributor=distributor, invoice_no='PINV-07-1', invoice_date=date(2026, 7, 10), subtotal=10000, taxable_amount=10000, gst_amount=1800, grand_total=11800)
        pr = GSTTransactionSnapshot.objects.create(outlet=outlet, gstin=outlet.gstin, period=fp, transaction_type='purchase', document_id=pi.id, document_number='PINV-07-1', document_date=date(2026, 7, 10), snapshot_json={'is_b2b': True, 'distributor_gstin': distributor.gstin, 'items_by_rate': {'18.0': {'taxable_amount': 10000.0, 'igst': 0, 'cgst': 900.0, 'sgst': 900.0, 'cess': 0}}})
        
        # Force excess ITC by directly overriding the GSTR2B mock later or just mock the reconciliation result
        # To trigger VAL-3B-008, 4A must exceed 2B. We'll set match_status='MATCHED' but we can add a manual entry in 3B via another invoice that we don't put in 2B (actually 4A is now bound to 2B, so VAL-3B-008 can only trigger if the user edits the payload). But for the dashboard UI testing, maybe we just mock a mismatch.
        run = ITCReconciliationRun.objects.create(outlet=outlet, period=fp, status='COMPLETED')
        ITCReconciliationResult.objects.create(run=run, purchase_snapshot=pr, match_status='MISMATCHED', mismatch_reasons=['TAX_RATE_MISMATCH'])
        
        # 082026 (Deferred Claimed + Rule 37)
        self.stdout.write("Seeding 082026 (Deferred Claimed + Rule 37)")
        fp = '082026'
        pi3 = PurchaseInvoice.objects.create(outlet=outlet, distributor=distributor, invoice_no='R37-01', invoice_date=date(2026, 2, 1), subtotal=2000, taxable_amount=2000, gst_amount=360, grand_total=2360)
        Rule37Adjustment.objects.create(invoice=pi3, action_type='REAVAILMENT_ELIGIBLE', status='APPROVED', rule37_due_date=date(2026, 8, 1), days_outstanding_at_evaluation=200, invoice_total_at_evaluation=2360, amount_paid_at_evaluation=2360, unpaid_amount_at_evaluation=0, unpaid_ratio=0.0, reversed_igst=0, reversed_cgst=180, reversed_sgst=180, reversed_cess=0, reclaim_period='082026', reclaimed_cgst=180, reclaimed_sgst=180)
        
        run = ITCReconciliationRun.objects.create(outlet=outlet, period=fp, status='COMPLETED')
        
        self.stdout.write("Successfully seeded mock data!")
