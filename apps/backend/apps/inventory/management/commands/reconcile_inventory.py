from django.core.management.base import BaseCommand

from apps.inventory import ledger_health as lh


class Command(BaseCommand):
    help = 'Reports active batches whose stock ledger disagrees with their stock (read only). Use repair_stock_ledger to fix.'

    def handle(self, *args, **options):
        # Compares in whole UNITS. This used to compare the batch's `total_stock` (units) with the ledger's net (packs),
        # so every batch with a pack size above 1 was reported as a discrepancy.
        rep = lh.scan(sample=25)
        bad = rep['safeToRepair'] + rep['needsDecision']
        for bucket, items in rep['samples'].items():
            for s in items:
                self.stdout.write(self.style.WARNING(f"[{bucket}] {s['product']} {s['batchNo']}: batch holds {s['stockUnits']} unit(s), ledger says {s['ledgerUnits']} unit(s)"))
        if bad:
            self.stdout.write(self.style.ERROR(f"{bad} batch(es) with a ledger problem. Run: manage.py repair_stock_ledger"))
        else:
            self.stdout.write(self.style.SUCCESS('Zero discrepancies found.'))
