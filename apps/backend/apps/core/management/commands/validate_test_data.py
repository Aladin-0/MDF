from django.core.management.base import BaseCommand
from decimal import Decimal
from apps.reports.models import GSTTransactionSnapshot
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem
from apps.purchases.models import PurchaseInvoice, PurchaseItem
from apps.core.models import Outlet
from apps.reports.gstr1_service import generate_gstr1_report
from apps.reports.gstr3b_service import generate_gstr3b_report

PREFIX = "SEED-"

class Command(BaseCommand):
    help = 'Validate the integrity of the seeded test data'

    def handle(self, *args, **options):
        self.stdout.write("Starting validation...")
        
        errors = []

        # Check total snapshot counts vs actual documents
        seeded_sales = SaleInvoice.objects.filter(invoice_no__startswith=PREFIX).count()
        seeded_sales_items = SaleItem.objects.filter(invoice__invoice_no__startswith=PREFIX).count()
        seeded_sales_snapshots = GSTTransactionSnapshot.objects.filter(
            document_number__startswith=PREFIX, transaction_type='sale'
        ).count()
        
        if seeded_sales_items != seeded_sales_snapshots:
            errors.append(f"Mismatch: {seeded_sales_items} sale items vs {seeded_sales_snapshots} sale snapshots.")
        
        seeded_ret = SalesReturn.objects.filter(return_no__startswith=PREFIX).count()
        seeded_ret_items = SalesReturnItem.objects.filter(sales_return__return_no__startswith=PREFIX).count()
        seeded_ret_snapshots = GSTTransactionSnapshot.objects.filter(
            document_number__startswith=PREFIX, transaction_type='sales_return'
        ).count()

        if seeded_ret_items != seeded_ret_snapshots:
            errors.append(f"Mismatch: {seeded_ret_items} return items vs {seeded_ret_snapshots} return snapshots.")

        # Payment split validation
        bad_splits = 0
        for si in SaleInvoice.objects.filter(invoice_no__startswith=PREFIX):
            if si.cash_paid + si.upi_paid + si.card_paid + si.credit_given != si.amount_paid:
                bad_splits += 1
        
        if bad_splits > 0:
            errors.append(f"{bad_splits} seeded SaleInvoices have broken payment splits.")

        self.stdout.write(f"Validation: Sales ({seeded_sales}), Returns ({seeded_ret})")

        # Deterministic Anchor Checks
        outlet_mh = Outlet.objects.filter(state="MH", name__startswith=PREFIX).first()
        if not outlet_mh:
            errors.append("Anchor outlet (MH) not found. Did you run the seeder?")
        else:
            # Anchor 1: Intrastate B2B Sale
            anchor_inv_1 = SaleInvoice.objects.filter(invoice_no=f"{PREFIX}ANCHOR-INV-1").first()
            if not anchor_inv_1:
                errors.append("ANCHOR-INV-1 missing.")
            else:
                if anchor_inv_1.cgst != Decimal('6.00') or anchor_inv_1.sgst != Decimal('6.00'):
                    errors.append(f"ANCHOR-INV-1 GST incorrect: {anchor_inv_1.cgst}, {anchor_inv_1.sgst}")

            # Anchor 2: Interstate B2C Sale
            anchor_inv_2 = SaleInvoice.objects.filter(invoice_no=f"{PREFIX}ANCHOR-INV-2").first()
            if not anchor_inv_2:
                errors.append("ANCHOR-INV-2 missing.")
            else:
                if anchor_inv_2.igst != Decimal('24.00'):
                    errors.append(f"ANCHOR-INV-2 GST incorrect: {anchor_inv_2.igst}")

            # Anchor 3: Sales Return
            anchor_ret_1 = SalesReturn.objects.filter(return_no=f"{PREFIX}ANCHOR-RET-1").first()
            if not anchor_ret_1:
                errors.append("ANCHOR-RET-1 missing.")
            
            # Anchor 4: Purchase ITC
            anchor_pur_1 = PurchaseInvoice.objects.filter(invoice_no=f"{PREFIX}ANCHOR-PUR-1").first()
            if not anchor_pur_1:
                errors.append("ANCHOR-PUR-1 missing.")
            else:
                if anchor_pur_1.gst_amount != Decimal('60.00'):
                    errors.append(f"ANCHOR-PUR-1 GST incorrect: {anchor_pur_1.gst_amount}")

            # Test Report Generators
            # Let's run GSTR1 for the anchor month
            if anchor_inv_1:
                try:
                    from datetime import date
                    gstr1 = generate_gstr1_report(outlet_mh.id, date(2025, 1, 1), date(2025, 1, 31))
                    if not gstr1:
                        errors.append("GSTR-1 report generation returned empty/None.")
                except Exception as e:
                    errors.append(f"GSTR-1 generation failed: {e}")
                
                try:
                    gstr3b = generate_gstr3b_report(outlet_mh.id, date(2025, 1, 1), date(2025, 1, 31))
                    if not gstr3b:
                        errors.append("GSTR-3B report generation returned empty/None.")
                except Exception as e:
                    errors.append(f"GSTR-3B generation failed: {e}")

        if errors:
            self.stdout.write(self.style.ERROR("Validation failed with the following errors:"))
            for e in errors:
                self.stdout.write(f"- {e}")
            
            # Log output to report
            with open("docs/LOCAL_TEST_DATA_VALIDATION_REPORT.md", "w") as f:
                f.write("# Local Test Data Validation Report\n\n## Status: FAILED\n\n### Errors\n")
                for e in errors:
                    f.write(f"- {e}\n")
        else:
            self.stdout.write(self.style.SUCCESS("All validations PASSED successfully!"))
            with open("docs/LOCAL_TEST_DATA_VALIDATION_REPORT.md", "w") as f:
                f.write("# Local Test Data Validation Report\n\n## Status: PASSED\n\n")
                f.write(f"- Seeded Sales Items: {seeded_sales_items}\n")
                f.write(f"- Seeded Sales Snapshots: {seeded_sales_snapshots}\n")
                f.write(f"- Anchor scenarios successfully matched expected output.\n")
                f.write("- GSTR-1 and GSTR-3B successfully ran for the generated anchor month.\n")
