import os
import re
from decimal import Decimal
from datetime import datetime, date
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from apps.core.models import Outlet
from apps.accounts.models import Customer
from apps.inventory.models import MasterProduct, Batch
from apps.billing.models import SaleInvoice, SaleItem

class Command(BaseCommand):
    help = 'Import Marg ERP sales report (Excel) into MediFlow as historical data.'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Absolute path to the Excel report (e.g., /path/to/SALE 1-9 TO 30-9.XLS)')
        parser.add_argument('--wipe-since', type=str, help='Wipe all SaleInvoices on or after this date (YYYY-MM-DD) before importing. Use carefully!', required=False)
        parser.add_argument('--outlet-id', type=str, help='Outlet UUID to link the sales to', required=True)
        parser.add_argument('--noinput', action='store_true', help='Skip the warning prompt when wiping data.')

    def handle(self, *args, **options):
        file_path = options['file_path']
        wipe_since_str = options.get('wipe_since')
        outlet_id = options['outlet_id']
        noinput = options.get('noinput', False)

        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Outlet not found with ID {outlet_id}"))
            return

        # Handle Wiping Data
        if wipe_since_str:
            try:
                wipe_date = datetime.strptime(wipe_since_str, '%Y-%m-%d').date()
            except ValueError:
                self.stderr.write(self.style.ERROR("Invalid --wipe-since format. Use YYYY-MM-DD."))
                return

            if not noinput:
                confirm = input(f"\nWARNING: You are about to permanently delete all SaleInvoices for Outlet {outlet.name} on or after {wipe_date}. Are you absolutely sure? (yes/no): ")
                if confirm.lower() != 'yes':
                    self.stdout.write(self.style.NOTICE("Wipe cancelled. Stopping import just in case."))
                    return

            self.stdout.write(self.style.WARNING(f"Deleting sales from {wipe_date} onwards..."))
            with transaction.atomic():
                deleted_count, _ = SaleInvoice.objects.filter(
                    outlet=outlet, 
                    invoice_date__date__gte=wipe_date
                ).delete()
            self.stdout.write(self.style.SUCCESS(f"Deleted {deleted_count} invoices."))

        # Start Import
        self.stdout.write(f"Reading Excel file: {file_path}...")
        df = pd.read_excel(file_path)
        df.columns = ["Col1", "Col2", "Col3"]

        current_date = None
        bills = []
        current_bill = None

        self.stdout.write("Parsing rows...")
        for index, row in df.iloc[4:].iterrows():
            c1 = str(row['Col1']).strip() if pd.notna(row['Col1']) else ""
            c2 = str(row['Col2']).strip() if pd.notna(row['Col2']) else ""
            c3 = row['Col3']
            
            if not c1 and not c2 and pd.isna(c3): continue
                
            # Date Header (e.g., 01-09-2026)
            if re.match(r'^\d{2}-\d{2}-\d{4}$', c1) and not c2 and pd.isna(c3):
                current_date = datetime.strptime(c1, "%d-%m-%Y").date()
                continue
                
            # Bill Header
            if c1 and c1.startswith('A') and pd.notna(c3):
                if current_bill:
                    bills.append(current_bill)
                
                parts = re.split(r'\s{2,}', c2)
                payment_type = parts[-1] if len(parts) > 1 else "UNKNOWN"
                customer_info = parts[0] if len(parts) > 1 else c2
                
                bill_val = str(c3).strip()
                bill_total = float(bill_val) if bill_val.replace('.','',1).isdigit() else 0.0

                current_bill = {
                    'date': current_date,
                    'bill_no': c1,
                    'customer_info': customer_info,
                    'payment_type': payment_type,
                    'bill_total': Decimal(str(bill_total)),
                    'items': []
                }
                continue
                
            # Item Row
            if not c1 and c2:
                if current_bill:
                    current_bill['items'].append(c2)

        if current_bill:
            bills.append(current_bill)

        if not bills:
            self.stdout.write(self.style.ERROR("No bills successfully parsed!"))
            return

        self.stdout.write(self.style.SUCCESS(f"Parsed {len(bills)} bills from Excel. Starting database import..."))

        # Database Insertion
        created_invoices = 0
        created_items = 0
        missing_batches_log = {}

        with transaction.atomic():
            for bill in bills:
                # 1. Resolve Customer (Option A: Auto-create)
                # Ensure we don't duplicate identically named customers 
                # (Simple deduplication by string matching for walk-ins)
                cust_info = str(bill['customer_info']).strip()
                # Split phone from name if it looks like: "9326378959 HUZMA PARVEEN"
                phone_match = re.match(r'^(\d{10})\s+(.+)$', cust_info)
                if phone_match:
                    phone = phone_match.group(1)
                    name = phone_match.group(2)
                else:
                    phone = ""
                    name = cust_info

                customer, _ = Customer.objects.get_or_create(
                    outlet=outlet,
                    name=name,
                    defaults={'phone': phone}
                )

                # 2. Map Payment Mode
                pmode_raw = bill['payment_type'].upper()
                payment_mode = 'cash'
                cash_paid = upi_paid = card_paid = credit_given = Decimal('0')
                
                if 'CASH' in pmode_raw:
                    payment_mode = 'cash'
                    cash_paid = bill['bill_total']
                elif 'PAYTM' in pmode_raw or 'UPI' in pmode_raw or 'PHONE' in pmode_raw:
                    payment_mode = 'upi'
                    upi_paid = bill['bill_total']
                elif 'CARD' in pmode_raw or 'SWIPE' in pmode_raw:
                    payment_mode = 'card'
                    card_paid = bill['bill_total']
                else:
                    # Treat everything else as Credit (DR BORADKAR, CREDIT SALE, etc.)
                    payment_mode = 'credit'
                    credit_given = bill['bill_total']

                # Create Invoice
                # Convert date to aware datetime for invoice_date
                inv_datetime = timezone.make_aware(datetime.combine(bill['date'], datetime.min.time()))
                
                invoice = SaleInvoice.objects.create(
                    outlet=outlet,
                    invoice_no=bill['bill_no'],
                    invoice_date=inv_datetime,
                    customer=customer,
                    payment_mode=payment_mode,
                    subtotal=bill['bill_total'],      # Assuming total as subtotal
                    taxable_amount=bill['bill_total'],# Assuming total as taxable
                    grand_total=bill['bill_total'],
                    amount_paid=bill['bill_total'] if payment_mode != 'credit' else Decimal('0'),
                    amount_due=bill['bill_total'] if payment_mode == 'credit' else Decimal('0'),
                    cash_paid=cash_paid,
                    upi_paid=upi_paid,
                    card_paid=card_paid,
                    credit_given=credit_given,
                    cgst_amount=Decimal('0'),
                    sgst_amount=Decimal('0'),
                    igst_amount=Decimal('0'),
                    sale_type='RETAIL'
                )
                created_invoices += 1

                # 3. Create Items
                for item_str in bill['items']:
                    # Regex for item extraction
                    # Format: index <spaces> free_qty <spaces> NAME <spaces> PackSize <spaces> QtyFormat <spaces> Rate <spaces> Expiry Batch
                    m = re.match(r'^\d+\s+(\d+)\s+(.*?)\s{2,}(.*?)\s{2,}(.*?)\s{2,}([\d\.]+)\s{2,}(.*?)\s+(.*)$', item_str)
                    if m:
                        free_qty_str = m.group(1).strip()
                        product_name = m.group(2).strip()
                        pack_size_str = m.group(3).strip()
                        qty_str = m.group(4).strip() # e.g., "1:0"
                        rate_str = m.group(5).strip()
                        expiry_str = m.group(6).strip() # e.g., "9/27"
                        batch_no = m.group(7).strip()
                    else:
                        # Fallback simple split if regex fails
                        parts = re.split(r'\s{2,}', item_str)
                        product_name = parts[0]
                        pack_size_str = "1"
                        qty_str = "1:0"
                        rate_str = "0"
                        batch_no = "UNKNOWN"
                        expiry_str = "12/99"

                    rate = Decimal(rate_str) if rate_str.replace('.','',1).isdigit() else Decimal('0')
                    
                    # Parse Qty Format "Strips:Loose"
                    qty_strips = 1
                    qty_loose = 0
                    if ':' in qty_str:
                        qs = qty_str.split(':')
                        try:
                            qty_strips = int(qs[0])
                            qty_loose = int(qs[1])
                        except: pass
                    
                    # Parse Expiry (e.g. 4/28 -> 2028-04-30)
                    try:
                        exp_month, exp_year = map(int, expiry_str.split('/'))
                        exp_year += 2000 # 28 -> 2028
                        if exp_month == 12:
                            exp_date = date(exp_year, 12, 31)
                        else:
                            exp_date = date(exp_year, exp_month + 1, 1) - pd.Timedelta(days=1)
                    except:
                        exp_date = date(2099, 12, 31)

                    # 4. Find Existing Batch or Product
                    real_batch = Batch.objects.filter(outlet=outlet, batch_no=batch_no).first()
                    
                    if not real_batch:
                        # Step 2: Product Match Fallback
                        master_product = MasterProduct.objects.filter(name__iexact=product_name).first()
                        if master_product:
                            # Create a dummy batch linked to the REAL product to get its GST
                            batch, _ = Batch.objects.get_or_create(
                                outlet=outlet,
                                product=master_product,
                                batch_no=batch_no,
                                defaults={
                                    'expiry_date': exp_date,
                                    'mrp': rate,
                                    'ptr': rate,
                                    'purchase_rate': rate,
                                    'qty_strips': 0,
                                    'qty_loose': 0
                                }
                            )
                            real_batch = batch

                    if real_batch and real_batch.product:
                        master_product = real_batch.product
                        batch = real_batch
                        
                        # Pharmacy rates in Excel are typically GST inclusive
                        gst_rate = Decimal(str(master_product.gst_rate))
                        total_amount = rate * qty_strips
                        
                        if gst_rate > 0:
                            # Reverse calculate GST (e.g., if 12%, taxable = total / 1.12)
                            taxable_amount = total_amount / (Decimal('1') + (gst_rate / Decimal('100')))
                            gst_amount = total_amount - taxable_amount
                            cgst_amount = gst_amount / Decimal('2')
                            sgst_amount = gst_amount / Decimal('2')
                        else:
                            taxable_amount = total_amount
                            gst_amount = cgst_amount = sgst_amount = Decimal('0')
                            
                    else:
                        # Step 3: Complete Mismatch (Log for Detailed Report)
                        missing_key = f"{product_name} (Batch: {batch_no})"
                        if missing_key not in missing_batches_log:
                            missing_batches_log[missing_key] = {
                                'count': 0,
                                'total_value': Decimal('0'),
                                'rate': rate
                            }
                        missing_batches_log[missing_key]['count'] += 1
                        missing_batches_log[missing_key]['total_value'] += (rate * qty_strips)

                        # Fallback: Create Dummy MasterProduct & Batch
                        master_product, _ = MasterProduct.objects.get_or_create(
                            name=product_name,
                            defaults={
                                'manufacturer': 'Unknown Migration',
                                'drug_type': 'general',
                                'pack_size': 1,
                                'pack_unit': pack_size_str,
                                'pack_type': 'strip',
                                'mrp': rate,
                                'gst_rate': Decimal('0')
                            }
                        )

                        batch, _ = Batch.objects.get_or_create(
                            outlet=outlet,
                            product=master_product,
                            batch_no=batch_no,
                            defaults={
                                'expiry_date': exp_date,
                                'mrp': rate,
                                'ptr': rate,
                                'purchase_rate': rate,
                                'qty_strips': 0,
                                'qty_loose': 0
                            }
                        )
                        taxable_amount = rate * qty_strips
                        gst_amount = cgst_amount = sgst_amount = Decimal('0')
                        gst_rate = Decimal('0')

                    # Create Sale Item
                    SaleItem.objects.create(
                        invoice=invoice,
                        batch=batch,
                        product_name=master_product.name,
                        pack_size=master_product.pack_size,
                        pack_unit=master_product.pack_unit,
                        schedule_type=master_product.schedule_type,
                        batch_no=batch_no,
                        expiry_date=batch.expiry_date if batch.expiry_date else exp_date,
                        mrp=batch.mrp,
                        sale_rate=rate,
                        rate=rate,
                        qty_strips=qty_strips,
                        qty_loose=qty_loose,
                        taxable_amount=taxable_amount,
                        gst_amount=gst_amount,
                        gst_rate=gst_rate,
                        cgst_rate=gst_rate/2,
                        sgst_rate=gst_rate/2,
                        cgst_amount=cgst_amount,
                        sgst_amount=sgst_amount,
                        total_amount=rate * qty_strips
                    )
                    created_items += 1

        self.stdout.write(self.style.SUCCESS(f"Done! Imported {created_invoices} invoices and {created_items} items."))

        # Print Analysis of Missing Data
        if missing_batches_log:
            self.stdout.write(self.style.WARNING(f"\n--- DETAILED MISSING ITEM REPORT ---"))
            self.stdout.write(self.style.WARNING(f"Total Unique Missing Products: {len(missing_batches_log)}"))
            self.stdout.write("These items were entirely missing from the database (Product Name not found). Taxes could not be applied.\n")
            
            # Sort by total value lost
            sorted_missing = sorted(missing_batches_log.items(), key=lambda x: x[1]['total_value'], reverse=True)
            
            # Print top 50
            for item, data in sorted_missing[:50]:
                self.stdout.write(f"- {item} | Missing {data['count']} times | Total Value: ₹{data['total_value']:.2f}")
            
            if len(sorted_missing) > 50:
                self.stdout.write(f"... and {len(sorted_missing) - 50} more.")
            
            self.stdout.write(self.style.WARNING(f"--- END MISSING REPORT ---\n"))
