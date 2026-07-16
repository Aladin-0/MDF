import os
import uuid
import json
from datetime import date, timedelta, datetime
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.core.models import Outlet
from apps.accounts.models import Staff, Ledger, LedgerGroup, Customer
from apps.inventory.models import MasterProduct, Batch
from apps.purchases.models import PurchaseInvoice, PurchaseItem, Distributor
from apps.billing.models import SaleInvoice, SaleItem, ScheduleHRegister
from apps.purchases.views import PurchaseCreateView
from apps.billing.views import SaleCreateView
from apps.reports.views import ScheduleReportView

class Command(BaseCommand):
    help = 'Generates strictly validated test data for purchases, sales and reports.'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Clear existing test data safely')
        parser.add_argument('--dry-run', action='store_true', help='Run without committing to the database (safe rollback)')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        clear = options['clear']

        if clear:
            self.clear_data()
            return

        self.stdout.write(self.style.NOTICE("Starting strict test data generation..."))
        
        try:
            with transaction.atomic():
                # Setup
                outlet, staff, distributor = self.setup_base_data()
                medicines = self.seed_medicines()
                self.stdout.write(self.style.SUCCESS(f"Seeded {len(medicines)} test medicines."))

                # Purchases
                purchase_invoices = self.generate_purchases(outlet, staff, distributor, medicines)
                self.stdout.write(self.style.SUCCESS(f"Created and verified {len(purchase_invoices)} purchase invoices."))

                # Sales
                sale_invoices = self.generate_sales(outlet, staff, medicines)
                self.stdout.write(self.style.SUCCESS(f"Created and verified {len(sale_invoices)} sale invoices."))

                # Reports
                report_files = self.generate_reports(outlet, staff, ['H', 'H1', 'X'])
                self.stdout.write(self.style.SUCCESS(f"Generated {len(report_files)} report files."))

                # Self Check
                self.post_run_check()

                # Dry run rollback
                if dry_run:
                    self.stdout.write(self.style.WARNING("\n[DRY-RUN] Setting rollback..."))
                    transaction.set_rollback(True)
                    self.stdout.write(self.style.SUCCESS("DRY RUN ROLLED BACK SUCCESSFULLY"))
                else:
                    self.stdout.write(self.style.SUCCESS("\nSuccessfully committed all test data."))
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"FATAL ERROR during data generation: {e}"))
            raise  # Re-raise to ensure transaction rollback bubbles up

    def clear_data(self):
        self.stdout.write(self.style.WARNING("Clearing TEST- prefixed data..."))
        with transaction.atomic():
            sales = SaleInvoice.objects.filter(invoice_no__startswith='TEST-INV-')
            sale_count = sales.count()
            sales.delete()
            
            # Delete any orphaned SaleItems linked to our test batches
            orphaned_sales = SaleItem.objects.filter(batch__batch_no__startswith='TEST-BATCH-')
            orphaned_sales.delete()
            
            purchases = PurchaseInvoice.objects.filter(invoice_no__startswith='TEST-INV-')
            purchase_count = purchases.count()
            purchases.delete()
            
            # Delete any orphaned PurchaseItems linked to our test batches
            orphaned_purchases = PurchaseItem.objects.filter(batch__batch_no__startswith='TEST-BATCH-')
            orphaned_purchases.delete()
            
            batches = Batch.objects.filter(batch_no__startswith='TEST-BATCH-')
            batch_count = batches.count()
            batches.delete()
            
            from apps.inventory.models import StockLedger
            stock_ledgers = StockLedger.objects.filter(product__name__startswith='TEST-MED-')
            stock_ledgers.delete()
            
            products = MasterProduct.objects.filter(name__startswith='TEST-MED-')
            prod_count = products.count()
            products.delete()

            from apps.accounts.models import Ledger
            from apps.billing.models import LedgerEntry
            ledger_entries = LedgerEntry.objects.filter(distributor__name__startswith='TEST-DIST-')
            ledger_entries.delete()
            
            from apps.accounts.models import JournalEntry
            journal_entries = JournalEntry.objects.filter(lines__ledger__name__startswith='TEST-DIST-')
            journal_entries.delete()

            distributors = Distributor.objects.filter(name__startswith='TEST-DIST-')
            dist_count = distributors.count()
            distributors.delete()
            
            ledgers = Ledger.objects.filter(name__startswith='TEST-DIST-')
            ledgers.delete()
            
            self.stdout.write(self.style.SUCCESS(
                f"Cleared: {sale_count} Sales, {purchase_count} Purchases, "
                f"{batch_count} Batches, {prod_count} Products, {dist_count} Distributors."
            ))

    def setup_base_data(self):
        staff = Staff.objects.filter(name__icontains='Hiralal').first()
        if not staff:
            staff = Staff.objects.filter(role__in=['admin', 'super_admin']).last()
        if not staff:
            staff = Staff.objects.first()
            
        if not staff:
            raise Exception("No staff found.")
            
        outlet = staff.outlet
        if not outlet:
            raise Exception("No outlet found for staff.")

        sc_group, _ = LedgerGroup.objects.get_or_create(
            outlet=outlet, name='Sundry Creditors', defaults={'nature': 'liability'}
        )
        party_ledger, _ = Ledger.objects.get_or_create(
            outlet=outlet,
            name=f"TEST-DIST-{uuid.uuid4().hex[:6]}",
            defaults={'group': sc_group, 'opening_balance': 0}
        )
        
        distributor = Distributor.objects.create(
            outlet=outlet,
            name=party_ledger.name,
            is_active=True
        )
        party_ledger.linked_distributor = distributor
        party_ledger.save()
        
        return outlet, staff, distributor

    def seed_medicines(self):
        medicines = []
        schedules = ['H', 'H1', 'X']
        for sched in schedules:
            for i in range(3):
                med, _ = MasterProduct.objects.get_or_create(
                    name=f"TEST-MED-{sched}-{i}-{uuid.uuid4().hex[:4]}",
                    defaults={
                        'manufacturer': 'Test Pharma',
                        'category': 'tablet',
                        'pack_size': 10,
                        'schedule_type': sched,
                        'hsn_code': '30049099'
                    }
                )
                medicines.append(med)
        return medicines

    def generate_purchases(self, outlet, staff, distributor, medicines):
        factory = APIRequestFactory()
        view = PurchaseCreateView.as_view()
        created_invoices = []

        items_payload = []
        for i, med in enumerate(medicines):
            qty = random.randint(40, 50)
            pack_size = 10
            actual_qty = qty * pack_size  # pkg is 10, so qty strips * 10 = actual loose qty
            
            purchase_rate = 50.00
            mrp = 100.00
            taxable = qty * purchase_rate
            gst = taxable * 0.12
            total = taxable + gst

            items_payload.append({
                "productName": med.name,
                "masterProductId": str(med.id),
                "batchNo": f"TEST-BATCH-{med.schedule_type}-{i}",
                "expiryDate": (date.today() + timedelta(days=700)).isoformat(),
                "qty": qty,
                "freeQty": 0,
                "actualQty": actual_qty,
                "pkg": pack_size,
                "mrp": mrp,
                "purchaseRate": purchase_rate,
                "baseLandingRate": purchase_rate,
                "saleRate": 80.00,
                "ptr": 55.00,
                "pts": 50.00,
                "discountPct": 0,
                "discountAmount": 0,
                "gstRate": 12,
                "cess": 0,
                "taxableAmount": float(taxable),
                "gstAmount": float(gst),
                "cessAmount": 0,
                "totalAmount": float(total),
            })
            
        subtotal = sum(i["taxableAmount"] for i in items_payload)
        gst_amount = sum(i["gstAmount"] for i in items_payload)
        grand_total = subtotal + gst_amount

        invoice_no = f"TEST-INV-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "outletId": str(outlet.id),
            "invoiceDate": date.today().isoformat(),
            "distributorId": str(distributor.id),
            "partyLedgerId": str(distributor.linked_ledger.id) if hasattr(distributor, 'linked_ledger') else None,
            "invoiceNo": invoice_no,
            "items": items_payload,
            "subtotal": subtotal,
            "taxableAmount": subtotal,
            "discountAmount": 0,
            "roundOff": 0,
            "cessAmount": 0,
            "gstAmount": gst_amount,
            "grandTotal": grand_total,
            "paymentStatus": "unpaid",
            "purchaseType": "credit"
        }

        if not payload['partyLedgerId']:
            ledger = Ledger.objects.get(linked_distributor=distributor)
            payload['partyLedgerId'] = str(ledger.id)

        request = factory.post('/api/v1/purchases/', data=payload, format='json')
        force_authenticate(request, user=staff)
        
        self.stdout.write(f"  -> Sending Purchase payload with {len(items_payload)} items, total: {grand_total}")
        response = view(request)
        
        if response.status_code not in [200, 201]:
            self.stdout.write(self.style.ERROR(f"Response data: {response.data}"))
            raise Exception(f"Purchase creation failed with status {response.status_code}")
            
        inv_data = response.data
        inv_id = inv_data.get('id')
        
        # Strict DB Verification
        invoice = PurchaseInvoice.objects.get(id=inv_id)
        item_count = invoice.items.count()
        if item_count == 0:
            raise Exception(f"DB Verification Failed: Invoice {invoice.invoice_no} has 0 items saved in DB!")
            
        db_subtotal = sum(item.taxable_amount for item in invoice.items.all())
        if Decimal(str(subtotal)) != db_subtotal:
            raise Exception(f"DB Verification Failed: Subtotal mismatch! Expected {subtotal}, got {db_subtotal}")
            
        batch_count = Batch.objects.filter(batch_no__startswith='TEST-BATCH-').count()
        if batch_count == 0:
            raise Exception("DB Verification Failed: Batches were not created!")
            
        self.stdout.write(self.style.SUCCESS(
            f"  -> DB Verified: Purchase {invoice.invoice_no} created with {item_count} items. DB Subtotal matches: {db_subtotal}"
        ))
        created_invoices.append(invoice)
        return created_invoices

    def generate_sales(self, outlet, staff, medicines):
        factory = APIRequestFactory()
        view = SaleCreateView.as_view()
        created_invoices = []

        customer, _ = Customer.objects.get_or_create(
            outlet=outlet,
            phone='9999999999',
            defaults={'name': 'Test Sale Customer'}
        )

        batches = Batch.objects.filter(batch_no__startswith='TEST-BATCH-')
        if not batches.exists():
            raise Exception("No test batches found for sales generation!")

        for batch in batches:
            sell_qty = int(batch.qty_strips * random.uniform(0.4, 0.6))
            if sell_qty <= 0:
                continue

            taxable_amount = float(sell_qty * float(batch.sale_rate))
            gst_amount = taxable_amount * 0.12
            
            payload = {
                "outletId": str(outlet.id),
                "customerId": str(customer.id),
                "items": [{
                    "batchId": str(batch.id),
                    "productId": str(batch.product.id) if batch.product else "",
                    "name": batch.product.name if batch.product else "Unknown",
                    "qtyStrips": sell_qty,
                    "qtyLoose": 0,
                    "rate": float(batch.sale_rate),
                    "discountPct": 0,
                    "discountAmount": 0,
                    "taxableAmount": taxable_amount,
                    "gstAmount": gst_amount,
                    "cgstAmount": gst_amount / 2,
                    "sgstAmount": gst_amount / 2,
                    "igstAmount": 0,
                    "gstRate": 12,
                    "totalAmount": taxable_amount + gst_amount,
                }],
                "subtotal": taxable_amount,
                "discountAmount": 0,
                "taxableAmount": taxable_amount,
                "gstAmount": gst_amount,
                "cgstAmount": gst_amount / 2,
                "sgstAmount": gst_amount / 2,
                "igstAmount": 0,
                "cessAmount": 0,
                "roundOff": 0,
                "grandTotal": taxable_amount + gst_amount,
                "paymentMode": "cash",
                "cashPaid": taxable_amount + gst_amount,
                "upiPaid": 0,
                "cardPaid": 0,
                "creditGiven": 0,
            }

            med_schedule = batch.product.schedule_type if batch.product else ''
            if med_schedule in ['H', 'H1', 'X']:
                payload["scheduleHData"] = {
                    "patientName": "Strict Patient",
                    "patientAge": 30,
                    "patientAddress": "Test Patient Address",
                    "doctorName": "Dr. Strict",
                    "doctorAddress": "Test Hospital",
                    "doctorRegNo": "REG-12345",
                    "prescriptionNo": f"RX-{uuid.uuid4().hex[:4].upper()}"
                }

            request = factory.post('/api/v1/sales/', data=payload, format='json')
            force_authenticate(request, user=staff)
            
            response = view(request)
            if response.status_code not in [200, 201]:
                self.stdout.write(self.style.ERROR(f"Sale failed for {batch.batch_no}. Data: {response.data}"))
                raise Exception(f"Sale creation failed: {response.status_code}")
                
            inv_id = response.data.get('id')
            sale = SaleInvoice.objects.get(id=inv_id)
            
            # Change invoice prefix for easy cleanup
            sale.invoice_no = f"TEST-INV-{sale.invoice_no}"
            sale.save(update_fields=['invoice_no'])
            
            # DB Verify
            if sale.items.count() == 0:
                raise Exception(f"DB Verification Failed: Sale {sale.invoice_no} has 0 items in DB!")
                
            self.stdout.write(self.style.SUCCESS(
                f"  -> DB Verified: Sale {sale.invoice_no} created with {sale.items.count()} items."
            ))
            created_invoices.append(sale)

        return created_invoices

    def generate_reports(self, outlet, staff, schedules):
        factory = APIRequestFactory()
        view = ScheduleReportView.as_view()
        files = []

        for sched in schedules:
            url = f'/api/v1/reports/schedule/?outletId={outlet.id}&schedule_type={sched}'
            request = factory.get(url)
            force_authenticate(request, user=staff)
            
            response = view(request)
            if response.status_code != 200:
                raise Exception(f"Report fetch failed for Schedule {sched}. Data: {response.data}")
                
            report_data = response.data['data']
            
            filepath = f"/tmp/schedule_{sched}_report_{int(datetime.now().timestamp())}.json"
            with open(filepath, "w") as f:
                json.dump(report_data, f, indent=4)
                
            size = os.path.getsize(filepath)
            if size < 10:
                raise Exception(f"Report file for {sched} is suspiciously small: {size} bytes")
                
            self.stdout.write(self.style.SUCCESS(f"  -> Verified Report: {filepath} ({size} bytes)"))
            files.append(filepath)
            
        return files

    def post_run_check(self):
        self.stdout.write(self.style.NOTICE("\n--- POST-RUN DB DIAGNOSTICS ---"))
        purchases = PurchaseInvoice.objects.filter(invoice_no__startswith='TEST-INV-')
        sales = SaleInvoice.objects.filter(invoice_no__startswith='TEST-INV-')
        batches = Batch.objects.filter(batch_no__startswith='TEST-BATCH-')
        
        p_count = purchases.count()
        p_item_count = PurchaseItem.objects.filter(invoice__in=purchases).count()
        s_count = sales.count()
        s_item_count = SaleItem.objects.filter(invoice__in=sales).count()
        b_count = batches.count()
        
        self.stdout.write(self.style.SUCCESS(f"Purchases: {p_count} | Purchase Items: {p_item_count}"))
        self.stdout.write(self.style.SUCCESS(f"Sales: {s_count} | Sale Items: {s_item_count}"))
        self.stdout.write(self.style.SUCCESS(f"Batches: {b_count}"))
        
        if p_count > 0 and p_item_count == 0:
            raise Exception("FATAL: Purchase headers exist but items are 0. Data corruption!")
        if p_count > 0 and b_count == 0:
            raise Exception("FATAL: Purchase headers exist but batches are 0. Data corruption!")
            
        self.stdout.write(self.style.SUCCESS("All diagnostics passed successfully!"))
        
        if p_count > 0:
            self.stdout.write(self.style.SUCCESS(f"Sample Purchase: {purchases.first().invoice_no}"))
        if b_count > 0:
            self.stdout.write(self.style.SUCCESS(f"Sample Batch: {batches.first().batch_no}"))
