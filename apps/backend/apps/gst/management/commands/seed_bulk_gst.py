import uuid
import datetime
import random
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

# Core Models
from apps.core.models import Organization, Outlet, OutletSettings
from apps.reports.models import GSTTransactionSnapshot
from apps.purchases.models import PurchaseInvoice, Distributor
from apps.billing.models import SaleInvoice

class Command(BaseCommand):
    help = 'Seeds Bulk GST test data for 6 months (Mar 2026 to Aug 2026)'

    def add_arguments(self, parser):
        parser.add_argument('--months', type=int, default=6, help='Number of months to seed')

    def handle(self, *args, **options):
        months_to_seed = options.get('months', 6)
        
        with transaction.atomic():
            self.stdout.write(f"Starting Bulk GST data seeding for {months_to_seed} months (Mar 2026 - Aug 2026)...")
            
            # Setup organization and outlet
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
            
            # Clean up old seed data
            GSTTransactionSnapshot.objects.filter(outlet=outlet).delete()
            PurchaseInvoice.objects.filter(outlet=outlet).delete()
            SaleInvoice.objects.filter(outlet=outlet).delete()
            
            # Generate periods from Mar 2026 to Aug 2026
            periods = ["032026", "042026", "052026", "062026", "072026", "082026"][:months_to_seed]
            
            # 500 sales / 6 = ~83 sales per month
            # 300 purchases / 6 = 50 purchases per month
            
            rates = [5.0, 12.0, 18.0]
            customer_states = ["27", "29", "24", "07"]
            
            distributor, _ = Distributor.objects.get_or_create(
                outlet=outlet,
                name="Bulk Supplier Inc",
                defaults={"gstin": "27YYYYY1111B1Z2"}
            )
            
            for p in periods:
                self.stdout.write(f"Seeding period {p}...")
                month = int(p[:2])
                year = int(p[2:])
                
                # Sales
                for i in range(85):
                    is_b2b = random.choice([True, False])
                    state = random.choice(customer_states)
                    is_inter_state = state != "27"
                    rate = random.choice(rates)
                    taxable = round(random.uniform(500, 15000), 2)
                    tax_amount = round(taxable * (rate / 100), 2)
                    
                    igst = tax_amount if is_inter_state else 0.0
                    cgst = 0.0 if is_inter_state else round(tax_amount / 2, 2)
                    sgst = 0.0 if is_inter_state else round(tax_amount / 2, 2)
                    
                    snapshot_json = {
                        "is_b2b": is_b2b,
                        "customer_gstin": f"{state}CUST{random.randint(1000, 9999)}A1Z" if is_b2b else None,
                        "pos": state,
                        "supplier_state_code": "27",
                        "items_by_rate": {
                            str(rate): {
                                "taxable_amount": taxable,
                                "igst": igst,
                                "cgst": cgst,
                                "sgst": sgst,
                                "cess": 0.0
                            }
                        }
                    }
                    if not is_b2b:
                        snapshot_json["original_supply_classification"] = "B2CL" if (is_inter_state and taxable > 250000) else "B2CS"
                        
                    day = random.randint(1, 28)
                    
                    GSTTransactionSnapshot.objects.create(
                        outlet=outlet,
                        gstin=outlet.gstin,
                        period=p,
                        transaction_type="sale",
                        document_id=uuid.uuid4(),
                        document_number=f"INV-{p}-{i}",
                        document_date=datetime.date(year, month, day),
                        snapshot_json=snapshot_json
                    )
                    
                    SaleInvoice.objects.create(
                        outlet=outlet,
                        invoice_no=f"INV-{p}-{i}",
                        invoice_date=datetime.datetime(year, month, day, 12, 0),
                        subtotal=Decimal(str(taxable)),
                        discount_amount=Decimal('0.00'),
                        taxable_amount=Decimal(str(taxable)),
                        cgst_amount=Decimal(str(cgst)),
                        sgst_amount=Decimal(str(sgst)),
                        igst_amount=Decimal(str(igst)),
                        cgst=Decimal(str(rate / 2 if not is_inter_state else 0)),
                        sgst=Decimal(str(rate / 2 if not is_inter_state else 0)),
                        igst=Decimal(str(rate if is_inter_state else 0)),
                        grand_total=Decimal(str(taxable + tax_amount)),
                        payment_mode="cash",
                        cash_paid=Decimal(str(taxable + tax_amount)),
                        amount_paid=Decimal(str(taxable + tax_amount)),
                        amount_due=Decimal('0.00')
                    )
                    
                # Purchases
                for i in range(50):
                    state = "27"
                    rate = random.choice(rates)
                    taxable = round(random.uniform(1000, 20000), 2)
                    tax_amount = round(taxable * (rate / 100), 2)
                    cgst = round(tax_amount / 2, 2)
                    sgst = round(tax_amount / 2, 2)
                    
                    inv_no = f"PUR-{p}-{i}"
                    day = random.randint(1, 28)
                    inv_date = datetime.date(year, month, day)
                    
                    pur_inv = PurchaseInvoice.objects.create(
                        outlet=outlet,
                        distributor=distributor,
                        invoice_no=inv_no,
                        invoice_date=inv_date,
                        subtotal=Decimal(str(taxable)),
                        taxable_amount=Decimal(str(taxable)),
                        gst_amount=Decimal(str(tax_amount)),
                        grand_total=Decimal(str(taxable + tax_amount)),
                    )
                    
                    pur_snapshot = {
                        "distributor_gstin": distributor.gstin,
                        "pos": state,
                        "supplier_state_code": "27",
                        "is_eligible_for_itc": True,
                        "items_by_rate": {
                            str(rate): {
                                "taxable_amount": taxable,
                                "igst": 0.0,
                                "cgst": cgst,
                                "sgst": sgst,
                                "cess": 0.0
                            }
                        }
                    }
                    
                    GSTTransactionSnapshot.objects.create(
                        outlet=outlet,
                        gstin=outlet.gstin,
                        period=p,
                        transaction_type="purchase",
                        document_id=pur_inv.id,
                        document_number=inv_no,
                        document_date=inv_date,
                        snapshot_json=pur_snapshot
                    )

            self.stdout.write(self.style.SUCCESS('Successfully seeded bulk GST data.'))
