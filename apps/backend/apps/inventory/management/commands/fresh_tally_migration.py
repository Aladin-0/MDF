"""
Django Management Command: fresh_tally_migration

Performs a surgical reset of outlet operational data (billing, purchases, batches, stock ledgers,
customers, distributors, accounting ledgers) while PRESERVING:
- Organizations (core.Organization)
- Outlets (core.Outlet)
- Staff / Admin / Superadmin user accounts & passwords (accounts.Staff)
- Core System Settings & Permissions

Followed by a complete, fully-linked import of Tally XML master files:
- master (1).xml -> S.P.S. Manavta Pharma (654f7337-d7ca-4003-bb5f-a6e585531fbd)
- master.xml     -> SAI Medical (c8e92121-087b-4c23-9edc-f48bd0ae1b67)

Usage:
  # Validate everything safely without touching the database:
  python manage.py fresh_tally_migration --dry-run

  # Execute live migration:
  python manage.py fresh_tally_migration --execute
"""

import os
import re
import html
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from datetime import date
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, connection

from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Customer, LedgerGroup, Ledger, Voucher, Doctor
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem, PurchaseOrder
from apps.billing.models import SaleInvoice, SaleItem, DraftInvoice, SalesReturn, CreditAccount, Quotation
from apps.inventory.models import MasterProduct, Batch, StockLedger, OutletProductConfig, StockAdjustment


# Standard Marg/Tally unit to MediFlow pack mapping
_UNIT_MAP = {
    'TAB': ('tablet', 'strip'),
    'STAB': ('tablet', 'strip'),
    'TABS': ('tablet', 'strip'),
    'TABL': ('tablet', 'strip'),
    'FTAB': ('tablet', 'strip'),
    'RTAB': ('tablet', 'strip'),
    'CATA': ('tablet', 'strip'),
    'CACP': ('tablet', 'strip'),
    'TA': ('tablet', 'strip'),
    'T': ('tablet', 'strip'),
    'CAP': ('capsule', 'strip'),
    'CAPS': ('capsule', 'strip'),
    'CAPT': ('capsule', 'strip'),
    'CAPC': ('capsule', 'strip'),
    'CASP': ('capsule', 'strip'),
    'STRI': ('strip', 'strip'),
    'STRIP': ('strip', 'strip'),
    'SYP': ('syrup', 'bottle'),
    'SYRP': ('syrup', 'bottle'),
    'SYPT': ('syrup', 'bottle'),
    'SURP': ('syrup', 'bottle'),
    'DROP': ('drops', 'bottle'),
    'DRPS': ('drops', 'bottle'),
    'INJ': ('injection', 'vial'),
    'INJC': ('injection', 'vial'),
    'INJT': ('injection', 'vial'),
    'IVSI': ('injection', 'vial'),
    'IVFI': ('injection', 'vial'),
    'CREM': ('cream', 'tube'),
    'CREA': ('cream', 'tube'),
    'CRM': ('cream', 'tube'),
    'GEL': ('gel', 'tube'),
    'OINT': ('ointment', 'tube'),
    'LOTO': ('lotion', 'bottle'),
    'LOTI': ('lotion', 'bottle'),
    'POWD': ('powder', 'bottle'),
    'PWD': ('powder', 'bottle'),
    'SURG': ('piece', 'other'),
    'PCS': ('piece', 'other'),
    'PC': ('piece', 'other'),
    'NOS': ('piece', 'other'),
    'BELT': ('piece', 'other'),
    'COLO': ('piece', 'other'),
    'SPRA': ('spray', 'bottle'),
    'RESP': ('respule', 'other'),
    'SACH': ('sachet', 'packet'),
    'KIT': ('kit', 'box'),
}

VALID_PACK_TYPES = {'strip', 'bottle', 'vial', 'box', 'blister', 'tube', 'packet', 'other'}


def parse_pack_info(base_unit_raw, denom_raw, product_name=''):
    """Derive (pack_size, pack_unit, pack_type) from Tally units, denominator, and product name heuristics."""
    u_clean = (base_unit_raw or '').strip().upper()
    unit_tuple = _UNIT_MAP.get(u_clean, None)

    if unit_tuple:
        pack_unit, pack_type = unit_tuple[0], unit_tuple[1]
    else:
        pack_unit, pack_type = 'piece', 'other'

    # Smart fallback from product name if pack_type is other or generic
    if pack_type in ['other', 'piece'] and product_name:
        n = product_name.upper()
        if re.search(r'\b(TAB|TABS|TABLET|TABLETS|LOZENGES|PIL)\b', n) or ' TAB' in n:
            pack_type, pack_unit = 'strip', 'tablet'
        elif re.search(r'\b(CAP|CAPS|CAPSULE|CAPSULES)\b', n) or ' CAP' in n:
            pack_type, pack_unit = 'strip', 'capsule'
        elif re.search(r'\b(SYP|SYRP|SYRUP|SUSP|SUSPENSION|SOLN|SOLUTION|LIQUID|DROPS|DROP|EYE DROP|EAR DROP|NASAL DROP)\b', n):
            pack_type, pack_unit = 'bottle', 'syrup' if 'SYP' in n or 'SYRUP' in n else 'bottle'
        elif re.search(r'\b(CREAM|CRM|CREM|OINT|OINTMENT|OIMT|GEL|PASTE|JELLY)\b', n):
            pack_type, pack_unit = 'tube', 'tube'
        elif re.search(r'\b(INJ|INJECTION|VIAL|IV|INFUSION)\b', n):
            pack_type, pack_unit = 'vial', 'vial'
        elif re.search(r'\b(AMP|AMPOULE)\b', n):
            pack_type, pack_unit = 'ampoule', 'ampoule'
        elif re.search(r'\b(SPRAY|INHALER|AEROSOL)\b', n):
            pack_type, pack_unit = 'bottle', 'spray'
        elif re.search(r'\b(LOTION|LOTO|OIL|BALM|WASH|MOUTHWASH|SANITIZER|HANDWASH|RUB)\b', n):
            pack_type, pack_unit = 'bottle', 'bottle'
        elif re.search(r'\b(CERELAC|LACTOGEN|NAN|POWDER|PWD|GRANULES|SACHET|SACH)\b', n):
            pack_type, pack_unit = 'box', 'box'
        elif re.search(r'\b(WHISPER|WHISHPER|STAYFREE|SOFY|PAD|PADS|DIAPER|PANTS)\b', n):
            pack_type, pack_unit = 'pack', 'pack'
        elif re.search(r'\b(SPLINT|KNEE|BELT|COLLAR|BANDAGE|GAUZE|COTTON|SOAP|KIT|DEVICE|THERMOMETER|MASK|GLOVES)\b', n):
            pack_type, pack_unit = 'piece', 'piece'
        elif re.search(r'\d+\s*(GM|G)\b', n):
            pack_type, pack_unit = 'box', 'box'
        elif re.search(r'\d+\s*(ML|LTR)\b', n):
            pack_type, pack_unit = 'bottle', 'bottle'
        else:
            pack_type, pack_unit = 'piece', 'piece'

    if pack_type not in VALID_PACK_TYPES or pack_type == 'other':
        pack_type = 'piece'

    # Parse numeric pack size from denominator
    pack_size = 1
    if denom_raw:
        m = re.search(r'\d+', str(denom_raw))
        if m:
            val = int(m.group(0))
            if 1 <= val <= 1000:
                pack_size = val

    return pack_size, pack_unit, pack_type


class Command(BaseCommand):
    help = "Safely reset outlet operational data and perform clean, linked Tally XML migration."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Simulate full reset and import without saving.')
        parser.add_argument('--execute', action='store_true', help='Execute live migration permanently.')
        parser.add_argument('--xml-dir', type=str, default='/app/data_xml', help='Directory containing XML files.')

    def handle(self, *args, **options):
        is_dry_run = options['dry_run']
        is_execute = options['execute']
        xml_dir = options['xml_dir']

        if not is_dry_run and not is_execute:
            raise CommandError("You must specify either --dry-run or --execute.")

        self.stdout.write(self.style.NOTICE("=" * 80))
        self.stdout.write(self.style.NOTICE("MEDIFLOW FRESH TALLY XML MIGRATION PIPELINE"))
        self.stdout.write(self.style.NOTICE(f"Mode: {'DRY RUN (No changes will be saved)' if is_dry_run else 'LIVE EXECUTION'}"))
        self.stdout.write(self.style.NOTICE("=" * 80))

        # Check files
        manavta_file = os.path.join(xml_dir, 'master (1).xml')
        sai_file = os.path.join(xml_dir, 'master.xml')

        if not os.path.exists(manavta_file) or not os.path.exists(sai_file):
            raise CommandError(f"XML files not found in {xml_dir}. Looking for 'master (1).xml' and 'master.xml'.")

        # Resolve Outlets
        try:
            outlet_manavta = Outlet.objects.get(id='654f7337-d7ca-4003-bb5f-a6e585531fbd')
            outlet_sai = Outlet.objects.get(id='c8e92121-087b-4c23-9edc-f48bd0ae1b67')
        except Outlet.DoesNotExist as e:
            raise CommandError(f"Target outlet not found in database: {e}")

        self.stdout.write(f"Target Outlet 1: {outlet_manavta.name} ({outlet_manavta.id})")
        self.stdout.write(f"Target Outlet 2: {outlet_sai.name} ({outlet_sai.id})")

        # Check Staff preserved count
        staff_count = Staff.objects.count()
        self.stdout.write(self.style.SUCCESS(f"Staff accounts protected: {staff_count} users will remain 100% untouched."))

        # Run inside atomic transaction
        try:
            with transaction.atomic():
                self.reset_outlet_data()
                
                # Ingest Outlet 1: Manavta Pharma
                self.stdout.write(self.style.MIGRATE_HEADING("\n>>> PROCESSING OUTLET 1: MANAVTA PHARMA"))
                self.process_outlet_xml(outlet_manavta, manavta_file)

                # Ingest Outlet 2: SAI Medical
                self.stdout.write(self.style.MIGRATE_HEADING("\n>>> PROCESSING OUTLET 2: SAI MEDICAL"))
                self.process_outlet_xml(outlet_sai, sai_file)

                if is_dry_run:
                    self.stdout.write(self.style.WARNING("\n[DRY RUN COMPLETE] Rolling back all database changes safely."))
                    transaction.set_rollback(True)
                else:
                    self.stdout.write(self.style.SUCCESS("\n[SUCCESS] Live migration committed successfully to database!"))

        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Migration aborted due to error: {e}"))
            raise

    def reset_outlet_data(self):
        """Wipe operational data and legacy catalog via cascade truncate, keeping staff and core settings."""
        self.stdout.write(self.style.NOTICE("\n--- STEP 1: RESETTING OUTLET TRANSACTIONAL & OPERATIONAL DATA ---"))
        
        truncate_tables = [
            # Billing
            'billing_saleitem',
            'billing_saleinvoice',
            'billing_salesreturnitem',
            'billing_salesreturn',
            'billing_draftinvoiceitem',
            'billing_draftinvoice',
            'billing_invoicepayment',
            'billing_paymentallocation',
            'billing_receiptallocation',
            'billing_receiptentry',
            'billing_paymententry',
            'billing_expenseentry',
            'billing_ledgerentry',
            'billing_creditaccount',
            'billing_credittransaction',
            'billing_quotationitem',
            'billing_quotation',
            'billing_schedulehregister',
            'billing_notificationlog',
            'billing_billrevision',

            # Purchases
            'purchases_purchaseitem',
            'purchases_purchaseinvoice',
            'purchases_purchaseorderitem',
            'purchases_purchaseorder',
            'purchases_rule37adjustment',
            'purchases_distributor',

            # Inventory
            'inventory_stockledger',
            'inventory_stockadjustmentallocation',
            'inventory_stockadjustment',
            'inventory_batch',
            'inventory_outletproductconfig',
            'inventory_masterproductalias',
            'inventory_masterproduct',

            # Accounts
            'accounts_voucherbilladjustment',
            'accounts_voucherline',
            'accounts_voucher',
            'accounts_creditnoteitem',
            'accounts_creditnote',
            'accounts_debitnoteitem',
            'accounts_debitnote',
            'accounts_journalline',
            'accounts_journalentry',
            'accounts_ledger',
            'accounts_ledgergroup',
            'accounts_customer',
            'accounts_regular_medicine',
            'accounts_doctor',
            'accounts_partner',
            'accounts_partnersharehistory',
            'accounts_postdatedcheque',

            # Audit & Reports
            'audit_activity_event',
            'audit_activitylog',
            'audit_system_event',
            'audit_document_revision_v2',
            'audit_documentrevision',
            'reports_dailycashreport',
            'reports_deferreditcentry',
            'reports_fixedmonthlyexpense',
            'reports_gstexportaudit',
            'reports_gstr2bdata',
            'reports_gstr2bimportjob',
            'reports_gsttransactionsnapshot',
            'reports_itcreconciliationresult',
            'reports_itcreconciliationrun',
            'attendance_attendancerecord',
        ]
        
        with connection.cursor() as cursor:
            stmt = f"TRUNCATE TABLE {', '.join(truncate_tables)} CASCADE;"
            cursor.execute(stmt)
            
        self.stdout.write(self.style.SUCCESS(f"  [RESET SUCCESS] Cleared {len(truncate_tables)} operational tables cleanly via CASCADE."))

    def setup_ledger_groups(self, outlet):
        """Create standard double-entry accounting groups for an outlet."""
        groups_def = [
            # Nature: Asset
            ('Current Assets', 'asset', None),
            ('Bank Accounts', 'asset', 'Current Assets'),
            ('Cash-in-hand', 'asset', 'Current Assets'),
            ('Sundry Debtors', 'asset', 'Current Assets'),
            ('Stock-in-hand', 'asset', 'Current Assets'),
            ('Loans & Advances (Asset)', 'asset', 'Current Assets'),
            ('Fixed Assets', 'asset', None),
            # Nature: Liability
            ('Capital Account', 'liability', None),
            ('Current Liabilities', 'liability', None),
            ('Sundry Creditors', 'liability', 'Current Liabilities'),
            ('Duties & Taxes', 'liability', 'Current Liabilities'),
            ('Loans (Liability)', 'liability', None),
            ('Other Current Liabilities', 'liability', 'Current Liabilities'),
            # Nature: Expense
            ('Direct Expenses', 'expense', None),
            ('Indirect Expenses', 'expense', None),
            ('Purchase Accounts', 'expense', None),
            # Nature: Income
            ('Sales Accounts', 'income', None),
            ('Direct Incomes', 'income', None),
            ('Indirect Incomes', 'income', None),
        ]

        group_map = {}
        for name, nature, parent_name in groups_def:
            parent_obj = group_map.get(parent_name) if parent_name else None
            grp, _ = LedgerGroup.objects.get_or_create(
                outlet=outlet,
                name=name,
                defaults={'nature': nature, 'parent': parent_obj, 'is_system': True}
            )
            group_map[name] = grp

        return group_map

    def process_outlet_xml(self, outlet, xml_filepath):
        """Stream parse Tally XML file and perform clean, linked import for an outlet."""
        self.stdout.write(f"Parsing: {xml_filepath}")
        group_map = self.setup_ledger_groups(outlet)

        distributor_count = 0
        customer_count = 0
        general_ledger_count = 0
        product_count = 0
        batch_count = 0
        total_opening_val = Decimal('0.00')

        dummy_phone_seq = 1000

        # Memory efficient stream parsing
        context = ET.iterparse(xml_filepath, events=('start', 'end'))
        _, root = next(context)

        for event, elem in context:
            if event == 'end':
                tag = elem.tag

                # ─────────────────────────────────────────────────────────
                # 1. LEDGER IMPORT (Suppliers, Customers & Accounts)
                # ─────────────────────────────────────────────────────────
                if tag == 'LEDGER':
                    name = html.unescape(elem.get('NAME') or elem.findtext('NAME') or '').strip()
                    parent = html.unescape(elem.findtext('PARENT') or '').strip()
                    phone = (elem.findtext('LEDGERPHONE') or elem.findtext('LEDGERMOBILE') or '').strip()
                    addr = html.unescape(elem.findtext('.//ADDRESS') or '').strip()
                    gstin = (elem.findtext('PARTYGSTIN') or '').strip()
                    pan = (elem.findtext('INCOMETAXNUMBER') or elem.findtext('PANNUMBER') or '').strip()
                    dl_no = (elem.findtext('.//SALESTAXNUMBER') or elem.findtext('.//DRUGLICENSENUMBER') or '').strip()
                    op_bal_raw = elem.findtext('OPENINGBALANCE')

                    bal = Decimal('0.00')
                    if op_bal_raw:
                        try:
                            bal = Decimal(op_bal_raw.strip())
                        except:
                            bal = Decimal('0.00')

                    if name and parent:
                        # (A) SUNDRY CREDITORS -> Distributor + Linked Ledger
                        if parent.upper() == 'SUNDRY CREDITORS':
                            dist = Distributor.objects.filter(outlet=outlet, name=name).first()
                            if not dist:
                                dist = Distributor.objects.create(
                                    outlet=outlet,
                                    name=name,
                                    phone=phone[:20],
                                    mobile=phone[:15] if len(phone) <= 15 else '',
                                    address=addr,
                                    gstin=gstin if len(gstin) == 15 else None,
                                    drug_license_no=dl_no[:100],
                                    opening_balance=abs(bal),
                                    balance_type='DR' if bal < 0 else 'CR',
                                    state='Maharashtra',
                                    state_code='27',
                                    is_active=True
                                )
                            # Create or update linked ledger
                            Ledger.objects.update_or_create(
                                outlet=outlet,
                                name=name,
                                defaults={
                                    'group': group_map.get('Sundry Creditors'),
                                    'opening_balance': abs(bal),
                                    'balance_type': 'Cr' if bal >= 0 else 'Dr',
                                    'current_balance': abs(bal),
                                    'phone': phone[:15],
                                    'gstin': gstin if len(gstin) == 15 else '',
                                    'address': addr,
                                    'linked_distributor': dist
                                }
                            )
                            distributor_count += 1

                        # (B) SUNDRY DEBTORS -> Customer + Linked Ledger
                        elif parent.upper() == 'SUNDRY DEBTORS':
                            cust_phone = phone
                            if not cust_phone:
                                cust_phone = f"000000{dummy_phone_seq:04d}"
                                dummy_phone_seq += 1

                            cust = Customer.objects.filter(outlet=outlet, name=name).first()
                            if not cust:
                                cust = Customer.objects.create(
                                    outlet=outlet,
                                    name=name,
                                    phone=cust_phone[:20],
                                    address=addr,
                                    gstin=gstin if len(gstin) == 15 else None,
                                    customer_type='RETAIL',
                                    pan=pan[:10] if pan else None,
                                    outstanding=abs(bal),
                                    state='Maharashtra',
                                    state_code='27',
                                    is_active=True
                                )
                            # Create or update linked ledger
                            Ledger.objects.update_or_create(
                                outlet=outlet,
                                name=name,
                                defaults={
                                    'group': group_map.get('Sundry Debtors'),
                                    'opening_balance': abs(bal),
                                    'balance_type': 'Dr' if bal <= 0 else 'Cr',
                                    'current_balance': abs(bal),
                                    'phone': cust_phone[:15],
                                    'gstin': gstin if len(gstin) == 15 else '',
                                    'address': addr,
                                    'linked_customer': cust
                                }
                            )
                            customer_count += 1

                        # (C) GENERAL ACCOUNTS (Banks, Cash, Duties & Taxes, Expenses)
                        else:
                            target_group = None
                            p_up = parent.upper()
                            if 'BANK' in p_up:
                                target_group = group_map.get('Bank Accounts')
                            elif 'CASH' in p_up:
                                target_group = group_map.get('Cash-in-hand')
                            elif 'DUTIES' in p_up or 'TAX' in p_up:
                                target_group = group_map.get('Duties & Taxes')
                            elif 'PURCHASE' in p_up:
                                target_group = group_map.get('Purchase Accounts')
                            elif 'SALE' in p_up:
                                target_group = group_map.get('Sales Accounts')
                            elif 'CAPITAL' in p_up:
                                target_group = group_map.get('Capital Account')
                            elif 'INDIRECT EXPENSE' in p_up:
                                target_group = group_map.get('Indirect Expenses')
                            elif 'DIRECT EXPENSE' in p_up:
                                target_group = group_map.get('Direct Expenses')
                            else:
                                target_group = group_map.get('Current Liabilities')

                            if target_group:
                                Ledger.objects.update_or_create(
                                    outlet=outlet,
                                    name=name,
                                    defaults={
                                        'group': target_group,
                                        'opening_balance': abs(bal),
                                        'balance_type': 'Dr' if bal < 0 else 'Cr',
                                        'current_balance': abs(bal),
                                        'phone': phone[:15],
                                        'gstin': gstin if len(gstin) == 15 else '',
                                        'address': addr
                                    }
                                )
                                general_ledger_count += 1

                    elem.clear()

                # ─────────────────────────────────────────────────────────
                # 2. STOCK ITEM & BATCHES IMPORT
                # ─────────────────────────────────────────────────────────
                elif tag == 'STOCKITEM':
                    name = html.unescape(elem.get('NAME') or elem.findtext('NAME') or '').strip()
                    parent = html.unescape(elem.findtext('PARENT') or 'General').strip()
                    base_unit = elem.findtext('BASEUNITS')
                    denom = elem.findtext('DENOMINATOR')

                    # GST & HSN
                    hsn = elem.findtext('.//HSNCODE') or '3004'
                    gst_rate_val = Decimal('5.00')
                    for r in elem.findall('.//RATEDETAILS.LIST'):
                        head = r.findtext('GSTRATEDUTYHEAD')
                        rate = r.findtext('GSTRATE')
                        if head and 'INTEGRATED' in head.upper() and rate:
                            try:
                                gst_rate_val = Decimal(rate.strip())
                            except:
                                pass

                    pack_size, pack_unit, pack_type = parse_pack_info(base_unit, denom, name)

                    # Rates & Stock
                    op_bal_raw = elem.findtext('OPENINGBALANCE')
                    op_rate_raw = elem.findtext('OPENINGRATE')

                    item_qty = 0
                    if op_bal_raw:
                        try:
                            item_qty = int(float(op_bal_raw.strip().split()[0]))
                        except:
                            item_qty = 0

                    purch_rate = Decimal('0.00')
                    if op_rate_raw:
                        try:
                            val = Decimal(op_rate_raw.strip())
                            if val < Decimal('50000.00'):  # Filter corrupted Tally math artifacts
                                purch_rate = val
                        except:
                            pass

                    drug_type = 'surgical' if hsn in ['9018', '9019', '9021', '3005'] else 'allopathy'

                    # Upsert MasterProduct using filter().first()
                    master_prod = MasterProduct.objects.filter(name=name).first()
                    if not master_prod:
                        master_prod = MasterProduct.objects.create(
                            name=name,
                            composition='.',
                            manufacturer=parent[:255] if parent else 'General',
                            category=parent[:100] if parent else 'General',
                            drug_type=drug_type,
                            schedule_type='OTC',
                            hsn_code=hsn[:20],
                            gst_rate=gst_rate_val,
                            pack_size=pack_size,
                            pack_unit=pack_unit[:50],
                            pack_type=pack_type[:20],
                            mrp=purch_rate if purch_rate > 0 else Decimal('100.00'),
                        )
                    product_count += 1

                    # Extract Batch Allocations
                    batches = elem.findall('.//BATCHALLOCATIONS.LIST')
                    if batches:
                        for b in batches:
                            bname = (b.findtext('BATCHNAME') or 'OPENING').strip()
                            bbal_raw = b.findtext('OPENINGBALANCE')
                            brate_raw = b.findtext('OPENINGRATE')
                            bval_raw = b.findtext('OPENINGVALUE')

                            b_qty = 0
                            if bbal_raw:
                                try:
                                    b_qty = int(float(bbal_raw.strip().split()[0]))
                                except:
                                    b_qty = 0

                            b_rate = purch_rate
                            if brate_raw:
                                try:
                                    b_rate = Decimal(brate_raw.strip())
                                except:
                                    pass

                            b_val = Decimal('0.00')
                            if bval_raw:
                                try:
                                    b_val = abs(Decimal(bval_raw.strip()))
                                except:
                                    pass

                            if b_qty > 0:
                                batch_obj = Batch.objects.create(
                                    outlet=outlet,
                                    product=master_prod,
                                    batch_no=bname[:100] if bname else 'OPENING',
                                    qty_strips=b_qty,
                                    qty_loose=0,
                                    purchase_rate=b_rate,
                                    mrp=b_rate if b_rate > 0 else Decimal('100.00'),
                                    pack_size=pack_size,
                                    pack_unit=pack_unit[:50],
                                    pack_type=pack_type[:20],
                                    expiry_date=date(2099, 12, 31),
                                    is_opening_stock=True,
                                    is_active=True
                                )
                                StockLedger.objects.create(
                                    outlet=outlet,
                                    product=master_prod,
                                    batch=batch_obj,
                                    txn_type='OPENING',
                                    txn_date=date(2026, 4, 1),
                                    voucher_type='Opening Stock',
                                    voucher_number='OPENING-TALLY',
                                    party_name='Opening Stock Migration',
                                    batch_number=batch_obj.batch_no,
                                    expiry_date=batch_obj.expiry_date,
                                    qty_in=b_qty,
                                    rate=b_rate,
                                    value_in=b_val if b_val > 0 else (b_qty * b_rate),
                                    running_qty=b_qty,
                                    running_value=b_val if b_val > 0 else (b_qty * b_rate)
                                )
                                batch_count += 1
                                total_opening_val += (b_val if b_val > 0 else (b_qty * b_rate))
                    elif item_qty > 0:
                        # Unbatched item with stock directly on product header
                        batch_obj = Batch.objects.create(
                            outlet=outlet,
                            product=master_prod,
                            batch_no='OPENING',
                            qty_strips=item_qty,
                            qty_loose=0,
                            purchase_rate=purch_rate,
                            mrp=purch_rate if purch_rate > 0 else Decimal('100.00'),
                            pack_size=pack_size,
                            pack_unit=pack_unit[:50],
                            pack_type=pack_type[:20],
                            expiry_date=date(2099, 12, 31),
                            is_opening_stock=True,
                            is_active=True
                        )
                        StockLedger.objects.create(
                            outlet=outlet,
                            product=master_prod,
                            batch=batch_obj,
                            txn_type='OPENING',
                            txn_date=date(2026, 4, 1),
                            voucher_type='Opening Stock',
                            voucher_number='OPENING-TALLY',
                            party_name='Opening Stock Migration',
                            batch_number=batch_obj.batch_no,
                            expiry_date=batch_obj.expiry_date,
                            qty_in=item_qty,
                            rate=purch_rate,
                            value_in=(item_qty * purch_rate),
                            running_qty=item_qty,
                            running_value=(item_qty * purch_rate)
                        )
                        batch_count += 1
                        total_opening_val += (item_qty * purch_rate)

                    elem.clear()

        root.clear()

        self.stdout.write(self.style.SUCCESS(
            f"  [COMPLETED {outlet.name}]\n"
            f"  - Distributors imported & linked: {distributor_count}\n"
            f"  - Customers imported & linked: {customer_count}\n"
            f"  - General Ledgers (Banks/Taxes/Cash): {general_ledger_count}\n"
            f"  - Master Products processed: {product_count}\n"
            f"  - Active Stock Batches created: {batch_count}\n"
            f"  - Total Opening Stock Valuation: INR {total_opening_val:,.2f}"
        ))
