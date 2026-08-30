import uuid
import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

# Core Models
from apps.core.models import Organization, Outlet, OutletSettings
from apps.reports.models import GSTTransactionSnapshot
from apps.purchases.models import PurchaseInvoice, PurchaseItem, Distributor
from apps.billing.models import SaleInvoice, SaleItem
from apps.accounts.models import Customer
from apps.inventory.models import MasterProduct, Batch

class Command(BaseCommand):
    help = 'Seeds E2E GST Engine test data with deep payloads (target period 082026)'

    def handle(self, *args, **options):
        with transaction.atomic():
            self.stdout.write("Starting GST E2E data seeding for period 082026...")
            
            # Setup Organization and Outlet
            org, _ = Organization.objects.get_or_create(
                name="E2E GST Org",
                defaults={"slug": "e2e-gst-org"}
            )
            
            outlet, _ = Outlet.objects.get_or_create(
                name="Manvta Pharma",
                defaults={
                    "organization": org,
                    "gstin": "27AAPCM1753L2ZX",
                    "drug_license_no": "E2E-DL",
                    "city": "Mumbai",
                    "state": "Maharashtra",
                    "state_code": "27"
                }
            )
            if outlet.gstin != "27AAPCM1753L2ZX":
                outlet.gstin = "27AAPCM1753L2ZX"
                outlet.state_code = "27"
                outlet.save()
            
            settings, _ = OutletSettings.objects.get_or_create(outlet=outlet)
            settings.gstr2b_tolerance = Decimal('1.0')
            settings.save()

            self.stdout.write("Wiping existing data for Manvta Pharma...")
            GSTTransactionSnapshot.objects.filter(outlet=outlet).delete()
            PurchaseItem.objects.filter(invoice__outlet=outlet).delete()
            PurchaseInvoice.objects.filter(outlet=outlet).delete()
            SaleItem.objects.filter(invoice__outlet=outlet).delete()
            SaleInvoice.objects.filter(outlet=outlet).delete()
            Batch.objects.filter(outlet=outlet).delete()
            # MasterProduct.objects.all().delete()  # DO NOT wipe out all global master products
            Customer.objects.filter(outlet=outlet).delete()
            Distributor.objects.filter(outlet=outlet).delete()

            self.stdout.write("Seeding Master Data...")
            # 1. Customers
            c_b2b_1 = Customer.objects.create(outlet=outlet, name="City Care Hospital", gstin="27CITYC1234H1Z5", state="Maharashtra", phone="9999999991")
            c_b2b_2 = Customer.objects.create(outlet=outlet, name="Apex Pharma", gstin="29APEXP5678A1Z2", state="Karnataka", phone="9999999992")
            c_b2c_1 = Customer.objects.create(outlet=outlet, name="Walk-in John", state="Maharashtra", phone="9999999993")
            c_b2c_2 = Customer.objects.create(outlet=outlet, name="Walk-in Jane", state="Maharashtra", phone="9999999994")

            # 2. Distributors
            d_local = Distributor.objects.create(outlet=outlet, name="Local Pharma Dist", gstin="27LOCAL9999D1Z9", state="Maharashtra")
            d_inter = Distributor.objects.create(outlet=outlet, name="National Meds", gstin="24NATNL8888M1Z8", state="Gujarat")

            # 3. Products
            products_data = [
                {"name": "Paracetamol 500mg", "hsn": "3004", "tax": Decimal("12.0")},
                {"name": "Cough Syrup", "hsn": "3004", "tax": Decimal("12.0")},
                {"name": "Hand Sanitizer", "hsn": "3808", "tax": Decimal("18.0")},
                {"name": "Adult Diapers", "hsn": "9619", "tax": Decimal("18.0")},
                {"name": "Multivitamin Supplements", "hsn": "2106", "tax": Decimal("18.0")},
            ]
            products = []
            batches = []
            for pd in products_data:
                p = MasterProduct.objects.create(name=pd["name"], hsn_code=pd["hsn"], gst_rate=pd["tax"], pack_size=10, pack_unit="Tab")
                products.append(p)
                b = Batch.objects.create(
                    outlet=outlet, product=p, batch_no=f"B-{pd['name'][:3].upper()}-01",
                    expiry_date=datetime.date(2028, 1, 1), mrp=Decimal("100.00"), 
                    purchase_rate=Decimal("50.00"), qty_strips=100
                )
                from apps.inventory.services import post_stock_ledger_entry
                post_stock_ledger_entry(
                    outlet=outlet,
                    product=p,
                    batch=b,
                    txn_type='PURCHASE_IN',
                    txn_date=datetime.date.today(),
                    voucher_type='OPENING',
                    voucher_number='SEED',
                    party_name='System',
                    qty_in=100,
                    qty_out=0,
                    rate=Decimal('50.00'),
                )
                batches.append(b)

            self.stdout.write("Seeding Deep Transaction Payloads (August 2026)...")
            
            # --- PURCHASE 1 (Local) ---
            pi1 = PurchaseInvoice.objects.create(
                outlet=outlet, distributor=d_local, invoice_no="PUR-0826-001",
                invoice_date=datetime.date(2026, 8, 5), subtotal=Decimal("1000.00"),
                taxable_amount=Decimal("1000.00"), gst_amount=Decimal("120.00"), grand_total=Decimal("1120.00")
            )
            PurchaseItem.objects.create(
                invoice=pi1, batch=batches[0], master_product=products[0], batch_no=batches[0].batch_no,
                expiry_date=batches[0].expiry_date, pkg=10,
                qty=20, actual_qty=20, free_qty=0, purchase_rate=Decimal("50.00"), gst_rate=Decimal("12.0"),
                mrp=Decimal("100.00"), ptr=Decimal("50.00"), pts=Decimal("50.00"),
                taxable_amount=Decimal("1000.00"), gst_amount=Decimal("120.00"), total_amount=Decimal("1120.00")
            )
            
            # Purchase Snapshot 1
            snap_pi1 = {
                "is_b2b": True,
                "distributor_gstin": d_local.gstin,
                "supplier_state_code": "27",
                "pos": "27",
                "is_eligible_for_itc": True,
                "grand_total": 1120.0,
                "original_supply_classification": "B2B",
                "items": [
                    {
                        "hsn_sc": "3004", "rt": 12.0, "txval": 1000.0,
                        "iamt": 0.0, "camt": 60.0, "samt": 60.0
                    }
                ],
                "items_by_rate": {
                    "12.0": {
                        "taxable_amount": 1000.0, "igst": 0.0, "cgst": 60.0, "sgst": 60.0, "cess": 0.0
                    }
                }
            }
            GSTTransactionSnapshot.objects.create(
                outlet=outlet, gstin=outlet.gstin, period="082026", transaction_type="purchase",
                document_id=pi1.id, document_number=pi1.invoice_no, document_date=pi1.invoice_date,
                snapshot_json=snap_pi1
            )

            # --- PURCHASE 2 (Inter-state) ---
            pi2 = PurchaseInvoice.objects.create(
                outlet=outlet, distributor=d_inter, invoice_no="PUR-0826-002",
                invoice_date=datetime.date(2026, 8, 10), subtotal=Decimal("2000.00"),
                taxable_amount=Decimal("2000.00"), gst_amount=Decimal("360.00"), grand_total=Decimal("2360.00")
            )
            PurchaseItem.objects.create(
                invoice=pi2, batch=batches[2], master_product=products[2], batch_no=batches[2].batch_no,
                expiry_date=batches[2].expiry_date, pkg=10,
                qty=40, actual_qty=40, free_qty=0, purchase_rate=Decimal("50.00"), gst_rate=Decimal("18.0"),
                mrp=Decimal("100.00"), ptr=Decimal("50.00"), pts=Decimal("50.00"),
                taxable_amount=Decimal("2000.00"), gst_amount=Decimal("360.00"), total_amount=Decimal("2360.00")
            )
            
            snap_pi2 = {
                "is_b2b": True,
                "distributor_gstin": d_inter.gstin,
                "supplier_state_code": "24",
                "pos": "27",
                "is_eligible_for_itc": True,
                "grand_total": 2360.0,
                "original_supply_classification": "B2B",
                "items": [
                    {
                        "hsn_sc": "3808", "rt": 18.0, "txval": 2000.0,
                        "iamt": 360.0, "camt": 0.0, "samt": 0.0
                    }
                ],
                "items_by_rate": {
                    "18.0": {
                        "taxable_amount": 2000.0, "igst": 360.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0
                    }
                }
            }
            GSTTransactionSnapshot.objects.create(
                outlet=outlet, gstin=outlet.gstin, period="082026", transaction_type="purchase",
                document_id=pi2.id, document_number=pi2.invoice_no, document_date=pi2.invoice_date,
                snapshot_json=snap_pi2
            )

            # --- SALE 1 (B2B Local) ---
            si1 = SaleInvoice.objects.create(
                outlet=outlet, invoice_no="SAL-0826-001", customer=c_b2b_1,
                invoice_date=datetime.date(2026, 8, 15), subtotal=Decimal("5000.00"),
                taxable_amount=Decimal("5000.00"), cgst_amount=Decimal("300.00"), sgst_amount=Decimal("300.00"), igst_amount=Decimal("0.00"),
                cgst=Decimal("300.00"), sgst=Decimal("300.00"), igst=Decimal("0.00"), grand_total=Decimal("5600.00"),
                amount_paid=Decimal("5600.00"), cash_paid=Decimal("5600.00"), amount_due=Decimal("0.00")
            )
            SaleItem.objects.create(
                invoice=si1, batch=batches[0], product_name=products[0].name, batch_no=batches[0].batch_no,
                expiry_date=batches[0].expiry_date,
                qty_strips=10, sale_rate=Decimal("500.00"), gst_rate=Decimal("12.0"),
                rate=Decimal("500.00"), mrp=Decimal("600.00"), pack_size=10, pack_unit="Tab", sale_mode="cash",
                taxable_amount=Decimal("5000.00"), gst_amount=Decimal("600.00"), total_amount=Decimal("5600.00")
            )
            
            snap_si1 = {
                "is_b2b": True,
                "customer_gstin": c_b2b_1.gstin,
                "supplier_state_code": "27",
                "pos": "27",
                "grand_total": 5600.0,
                "original_supply_classification": "B2B",
                "items": [
                    {
                        "hsn_sc": "3004", "rt": 12.0, "txval": 5000.0,
                        "iamt": 0.0, "camt": 300.0, "samt": 300.0
                    }
                ],
                "items_by_rate": {
                    "12.0": {
                        "taxable_amount": 5000.0, "igst": 0.0, "cgst": 300.0, "sgst": 300.0, "cess": 0.0
                    }
                }
            }
            GSTTransactionSnapshot.objects.create(
                outlet=outlet, gstin=outlet.gstin, period="082026", transaction_type="sale",
                document_id=si1.id, document_number=si1.invoice_no, document_date=si1.invoice_date,
                snapshot_json=snap_si1
            )

            # --- SALE 2 (B2B Inter-state) ---
            si2 = SaleInvoice.objects.create(
                outlet=outlet, invoice_no="SAL-0826-002", customer=c_b2b_2,
                invoice_date=datetime.date(2026, 8, 20), subtotal=Decimal("3000.00"),
                taxable_amount=Decimal("3000.00"), cgst_amount=Decimal("0.00"), sgst_amount=Decimal("0.00"), igst_amount=Decimal("540.00"),
                cgst=Decimal("0.00"), sgst=Decimal("0.00"), igst=Decimal("540.00"), grand_total=Decimal("3540.00"),
                amount_paid=Decimal("3540.00"), cash_paid=Decimal("3540.00"), amount_due=Decimal("0.00")
            )
            SaleItem.objects.create(
                invoice=si2, batch=batches[3], product_name=products[3].name, batch_no=batches[3].batch_no,
                expiry_date=batches[3].expiry_date,
                qty_strips=6, sale_rate=Decimal("500.00"), gst_rate=Decimal("18.0"),
                rate=Decimal("500.00"), mrp=Decimal("600.00"), pack_size=10, pack_unit="Tab", sale_mode="cash",
                taxable_amount=Decimal("3000.00"), gst_amount=Decimal("540.00"), total_amount=Decimal("3540.00")
            )
            
            snap_si2 = {
                "is_b2b": True,
                "customer_gstin": c_b2b_2.gstin,
                "supplier_state_code": "27",
                "pos": "29",
                "grand_total": 3540.0,
                "original_supply_classification": "B2B",
                "items": [
                    {
                        "hsn_sc": "9619", "rt": 18.0, "txval": 3000.0,
                        "iamt": 540.0, "camt": 0.0, "samt": 0.0
                    }
                ],
                "items_by_rate": {
                    "18.0": {
                        "taxable_amount": 3000.0, "igst": 540.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0
                    }
                }
            }
            GSTTransactionSnapshot.objects.create(
                outlet=outlet, gstin=outlet.gstin, period="082026", transaction_type="sale",
                document_id=si2.id, document_number=si2.invoice_no, document_date=si2.invoice_date,
                snapshot_json=snap_si2
            )

            # --- SALE 3 (B2C Local) ---
            si3 = SaleInvoice.objects.create(
                outlet=outlet, invoice_no="SAL-0826-003", customer=c_b2c_1,
                invoice_date=datetime.date(2026, 8, 25), subtotal=Decimal("1500.00"),
                taxable_amount=Decimal("1500.00"), cgst_amount=Decimal("135.00"), sgst_amount=Decimal("135.00"), igst_amount=Decimal("0.00"),
                cgst=Decimal("135.00"), sgst=Decimal("135.00"), igst=Decimal("0.00"), grand_total=Decimal("1770.00"),
                amount_paid=Decimal("1770.00"), cash_paid=Decimal("1770.00"), amount_due=Decimal("0.00")
            )
            SaleItem.objects.create(
                invoice=si3, batch=batches[4], product_name=products[4].name, batch_no=batches[4].batch_no,
                expiry_date=batches[4].expiry_date,
                qty_strips=3, sale_rate=Decimal("500.00"), gst_rate=Decimal("18.0"),
                rate=Decimal("500.00"), mrp=Decimal("600.00"), pack_size=10, pack_unit="Tab", sale_mode="cash",
                taxable_amount=Decimal("1500.00"), gst_amount=Decimal("270.00"), total_amount=Decimal("1770.00")
            )
            
            snap_si3 = {
                "is_b2b": False,
                "customer_gstin": "",
                "supplier_state_code": "27",
                "pos": "27",
                "grand_total": 1770.0,
                "original_supply_classification": "B2CS",
                "items": [
                    {
                        "hsn_sc": "2106", "rt": 18.0, "txval": 1500.0,
                        "iamt": 0.0, "camt": 135.0, "samt": 135.0
                    }
                ],
                "items_by_rate": {
                    "18.0": {
                        "taxable_amount": 1500.0, "igst": 0.0, "cgst": 135.0, "sgst": 135.0, "cess": 0.0
                    }
                }
            }
            GSTTransactionSnapshot.objects.create(
                outlet=outlet, gstin=outlet.gstin, period="082026", transaction_type="sale",
                document_id=si3.id, document_number=si3.invoice_no, document_date=si3.invoice_date,
                snapshot_json=snap_si3
            )

            self.stdout.write(self.style.SUCCESS("SUCCESS: Successfully seeded deep GST E2E data for period 082026!"))
