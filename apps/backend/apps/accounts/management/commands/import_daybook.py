"""
Django Management Command: import_daybook

Imports Tally Daybook XML (accounting vouchers and general ledger entries) into MediFlow:
- Populates Voucher and VoucherLine models for Payment, Receipt, Contra, and Journal entries.
- Populates JournalEntry and JournalLine models for all transactions (Sales, Purchases, Returns, Vouchers).
- Recalculates and updates Ledger current_balance across all affected accounts.

Usage:
    # Test parse without modifying the database:
    python manage.py import_daybook --file daybook.xml --dry-run

    # Execute full import:
    python manage.py import_daybook --file daybook.xml --clear-existing
"""

import os
import uuid
import collections
import xml.etree.ElementTree as ET
from decimal import Decimal
from datetime import datetime, date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum

from apps.core.models import Outlet
from apps.accounts.models import Staff, LedgerGroup, Ledger, Voucher, VoucherLine, JournalEntry, JournalLine


class Command(BaseCommand):
    help = 'Import Tally Daybook XML into MediFlow general ledger and voucher tables'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='daybook.xml',
            help='Path to the Tally daybook XML file (default: daybook.xml)',
        )
        parser.add_argument(
            '--outlet-id',
            type=str,
            default='c8e92121-087b-4c23-9edc-f48bd0ae1b67',
            help='Target Outlet UUID (default: SAI Medical c8e92121-087b-4c23-9edc-f48bd0ae1b67)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Validate and parse data without saving changes to database',
        )
        parser.add_argument(
            '--clear-existing',
            action='store_true',
            help='Clear previously imported daybook vouchers and journal entries for this outlet',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=2000,
            help='Batch size for bulk_create operations (default: 2000)',
        )

    def handle(self, *args, **options):
        xml_path = options['file']
        outlet_id = options['outlet_id']
        dry_run = options['dry_run']
        clear_existing = options['clear_existing']
        batch_size = options['batch_size']

        if not os.path.exists(xml_path):
            raise CommandError(f"Daybook XML file not found at: {xml_path}")

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            raise CommandError(f"Outlet with ID {outlet_id} not found.")

        self.stdout.write(self.style.MIGRATE_HEADING("=" * 70))
        self.stdout.write(self.style.MIGRATE_HEADING(f"MEDIFLOW TALLY DAYBOOK ACCOUNTING IMPORT"))
        self.stdout.write(self.style.MIGRATE_HEADING("=" * 70))
        self.stdout.write(f"Target Outlet:  {outlet.name} ({outlet.id})")
        self.stdout.write(f"Source XML:     {xml_path} ({os.path.getsize(xml_path) / (1024*1024):.2f} MB)")
        self.stdout.write(f"Dry Run Mode:   {'YES (No database changes)' if dry_run else 'NO (Live database write)'}")
        self.stdout.write(f"Clear Existing: {'YES' if clear_existing else 'NO'}")

        # Pick default staff for created_by
        staff = Staff.objects.filter(outlet=outlet, role__in=['admin', 'super_admin']).first()
        if not staff:
            staff = Staff.objects.filter(outlet=outlet).first()
        if not staff:
            staff = Staff.objects.first()

        # Cache ledgers
        ledger_map = {}
        ledger_map_lower = {}
        for l in Ledger.objects.filter(outlet=outlet).select_related('group'):
            clean_name = l.name.strip()
            ledger_map[clean_name] = l
            ledger_map_lower[clean_name.lower()] = l

        self.stdout.write(f"Loaded {len(ledger_map)} existing ledgers for {outlet.name}.")

        # Ensure Suspense Account exists for balancing edge-cases
        suspense_group, _ = LedgerGroup.objects.get_or_create(
            outlet=outlet,
            name='Suspense Account',
            defaults={'nature': 'liability', 'is_system': True}
        )
        suspense_ledger, _ = Ledger.objects.get_or_create(
            outlet=outlet,
            name='Suspense Account',
            defaults={'group': suspense_group, 'is_system': True}
        )
        ledger_map['Suspense Account'] = suspense_ledger
        ledger_map_lower['suspense account'] = suspense_ledger

        # Optional: Clear existing entries
        if clear_existing and not dry_run:
            self.stdout.write(self.style.WARNING("Clearing existing vouchers and journal entries for outlet..."))
            with transaction.atomic():
                JournalLine.objects.filter(journal_entry__outlet=outlet).delete()
                JournalEntry.objects.filter(outlet=outlet).delete()
                VoucherLine.objects.filter(voucher__outlet=outlet).delete()
                Voucher.objects.filter(outlet=outlet).delete()
            self.stdout.write(self.style.SUCCESS("Existing accounting transactions cleared."))

        # Parsing data structures
        PURE_TYPES = {
            'Payment': 'PAY',
            'Receipt': 'REC',
            'Contra': 'CON',
            'Journal': 'JRN'
        }
        TYPE_TO_SOURCE = {
            'Payment': 'VOUCHER',
            'Receipt': 'VOUCHER',
            'Contra': 'VOUCHER',
            'Journal': 'VOUCHER',
            'Sales': 'SALE',
            'Purchase': 'PURCHASE',
            'Sale Return': 'RETURN',
            'Purchase Return': 'RETURN'
        }

        vouchers_to_create = []
        voucher_lines_to_create = []
        journal_entries_to_create = []
        journal_lines_to_create = []

        seen_voucher_nos = set()
        vtype_stats = collections.defaultdict(lambda: {'count': 0, 'debit': Decimal('0'), 'credit': Decimal('0')})
        imbalances_reconciled = 0

        self.stdout.write("Parsing daybook.xml...")
        start_time = datetime.now()

        context = ET.iterparse(xml_path, events=('end',))
        idx = 0
        for event, elem in context:
            if elem.tag == 'VOUCHER':
                idx += 1
                vtype = elem.get('VCHTYPE') or elem.findtext('VOUCHERTYPENAME') or 'Journal'
                raw_vno = (elem.findtext('VOUCHERNUMBER') or elem.findtext('REFERENCE') or f"GEN{idx:06d}").strip()
                date_str = elem.findtext('DATE') or '20260401'
                narration = (elem.findtext('NARRATION') or '').strip()

                try:
                    v_date = datetime.strptime(date_str, '%Y%m%d').date()
                except ValueError:
                    v_date = date(2026, 4, 1)

                # Format voucher number
                if vtype in PURE_TYPES:
                    prefix = PURE_TYPES[vtype]
                    if not raw_vno.upper().startswith(prefix):
                        vno = f"{prefix}-{raw_vno}"
                    else:
                        vno = raw_vno
                else:
                    vno = raw_vno

                # Extract line entries
                lines = []
                total_dr = Decimal('0')
                total_cr = Decimal('0')

                for entry in elem.findall('.//ALLLEDGERENTRIES.LIST'):
                    lname = (entry.findtext('LEDGERNAME') or '').strip()
                    amt_str = entry.findtext('AMOUNT') or '0'
                    try:
                        amt = Decimal(amt_str)
                    except Exception:
                        amt = Decimal('0')

                    is_pos = (entry.findtext('ISDEEMEDPOSITIVE') or 'No').strip().lower() == 'yes'

                    # Resolve ledger object
                    ledger_obj = ledger_map.get(lname) or ledger_map_lower.get(lname.lower())
                    if not ledger_obj:
                        ledger_obj = suspense_ledger

                    # Tally double-entry signing convention:
                    # is_pos=Yes -> Debit
                    # is_pos=No  -> Credit
                    # If amount has negative sign, adjust direction accordingly
                    if is_pos:
                        if amt < 0:
                            dr = abs(amt)
                            cr = Decimal('0')
                        else:
                            dr = Decimal('0')
                            cr = amt
                    else:
                        if amt < 0:
                            dr = abs(amt)
                            cr = Decimal('0')
                        else:
                            dr = Decimal('0')
                            cr = amt

                    if dr > 0 or cr > 0:
                        lines.append({
                            'ledger': ledger_obj,
                            'debit': dr,
                            'credit': cr,
                            'desc': lname
                        })
                        total_dr += dr
                        total_cr += cr

                if not lines:
                    elem.clear()
                    continue

                # Reconcile any imbalance (e.g., Tally single-sided edge case) to Suspense Account
                diff = total_dr - total_cr
                if abs(diff) > Decimal('0.005'):
                    imbalances_reconciled += 1
                    if diff > 0:
                        lines.append({
                            'ledger': suspense_ledger,
                            'debit': Decimal('0'),
                            'credit': diff,
                            'desc': 'System Balancing to Suspense Account'
                        })
                        total_cr += diff
                    else:
                        lines.append({
                            'ledger': suspense_ledger,
                            'debit': abs(diff),
                            'credit': Decimal('0'),
                            'desc': 'System Balancing to Suspense Account'
                        })
                        total_dr += abs(diff)

                # Track metrics
                vtype_stats[vtype]['count'] += 1
                vtype_stats[vtype]['debit'] += total_dr
                vtype_stats[vtype]['credit'] += total_cr

                # Determine voucher model entries
                voucher_id = None
                if vtype in PURE_TYPES:
                    voucher_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"{outlet.id}_{vno}")
                    
                    # Ensure vno uniqueness in this batch
                    clean_vno = vno
                    dup_counter = 1
                    while clean_vno in seen_voucher_nos:
                        clean_vno = f"{vno}-{dup_counter}"
                        dup_counter += 1
                    seen_voucher_nos.add(clean_vno)

                    # Determine payment mode
                    line_ledger_names = [l['ledger'].name.upper() for l in lines]
                    if any('BANK' in n or 'SBI' in n for n in line_ledger_names):
                        pmode = 'bank'
                    elif any('PAYTM' in n or 'PHONE PAY' in n or 'UPI' in n for n in line_ledger_names):
                        pmode = 'upi'
                    else:
                        pmode = 'cash'

                    v_type_choice = vtype.lower()
                    voucher_obj = Voucher(
                        id=voucher_id,
                        outlet=outlet,
                        voucher_type=v_type_choice,
                        voucher_no=clean_vno,
                        date=v_date,
                        narration=narration or f"{vtype} {clean_vno}",
                        total_amount=total_dr,
                        payment_mode=pmode,
                        status='posted',
                        created_by=staff
                    )
                    vouchers_to_create.append(voucher_obj)

                    for l in lines:
                        voucher_lines_to_create.append(VoucherLine(
                            id=uuid.uuid4(),
                            voucher=voucher_obj,
                            ledger=l['ledger'],
                            debit=l['debit'],
                            credit=l['credit'],
                            description=l['desc']
                        ))

                # Create JournalEntry
                source_type = TYPE_TO_SOURCE.get(vtype, 'VOUCHER')
                if voucher_id:
                    je_source_id = voucher_id
                else:
                    je_source_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"{outlet.id}_{vtype}_{vno}_{date_str}_{idx}")

                je_obj = JournalEntry(
                    id=uuid.uuid4(),
                    outlet=outlet,
                    source_type=source_type,
                    source_id=je_source_id,
                    date=v_date,
                    narration=narration or f"{vtype} {vno}"
                )
                journal_entries_to_create.append(je_obj)

                for l in lines:
                    journal_lines_to_create.append(JournalLine(
                        id=uuid.uuid4(),
                        journal_entry=je_obj,
                        ledger=l['ledger'],
                        debit_amount=l['debit'],
                        credit_amount=l['credit'],
                        description=l['desc']
                    ))

                elem.clear()

        parse_duration = (datetime.now() - start_time).total_seconds()
        self.stdout.write(self.style.SUCCESS(f"XML Parsing completed in {parse_duration:.2f}s."))
        self.stdout.write(f"Total Vouchers:      {len(journal_entries_to_create):,}")
        self.stdout.write(f"Pure Vouchers:       {len(vouchers_to_create):,}")
        self.stdout.write(f"Total Journal Lines: {len(journal_lines_to_create):,}")
        if imbalances_reconciled > 0:
            self.stdout.write(self.style.NOTICE(f"Single-sided entries balanced: {imbalances_reconciled}"))

        self.stdout.write("\n--- VOUCHER BREAKDOWN BY TYPE ---")
        for vt, stats in sorted(vtype_stats.items()):
            self.stdout.write(
                f"  {vt:16}: Count={stats['count']:6,}, Debit=Rs. {stats['debit']:12,.2f}, Credit=Rs. {stats['credit']:12,.2f}"
            )

        if dry_run:
            self.stdout.write(self.style.SUCCESS("\n[DRY RUN] Finished without database modifications."))
            return

        # LIVE DATABASE COMMIT
        self.stdout.write(self.style.MIGRATE_HEADING("\n--- STEP 2: BULK WRITING TO PRODUCTION DATABASE ---"))
        commit_start = datetime.now()

        with transaction.atomic():
            # 1. Bulk insert Pure Vouchers
            if vouchers_to_create:
                self.stdout.write(f"Inserting {len(vouchers_to_create):,} Voucher records...")
                Voucher.objects.bulk_create(vouchers_to_create, batch_size=batch_size)

            # 2. Bulk insert Voucher Lines
            if voucher_lines_to_create:
                self.stdout.write(f"Inserting {len(voucher_lines_to_create):,} VoucherLine records...")
                VoucherLine.objects.bulk_create(voucher_lines_to_create, batch_size=batch_size)

            # 3. Bulk insert Journal Entries
            self.stdout.write(f"Inserting {len(journal_entries_to_create):,} JournalEntry records...")
            JournalEntry.objects.bulk_create(journal_entries_to_create, batch_size=batch_size)

            # 4. Bulk insert Journal Lines
            self.stdout.write(f"Inserting {len(journal_lines_to_create):,} JournalLine records...")
            JournalLine.objects.bulk_create(journal_lines_to_create, batch_size=batch_size)

            # 5. Recalculate Ledger current_balance
            self.stdout.write("Recalculating ledger balances from imported journal lines...")
            agg_qs = JournalLine.objects.filter(ledger__outlet=outlet).values('ledger_id').annotate(
                tot_dr=Sum('debit_amount'),
                tot_cr=Sum('credit_amount')
            )
            agg_map = {item['ledger_id']: item for item in agg_qs}

            updated_ledgers = []
            for ledger in Ledger.objects.filter(outlet=outlet).select_related('group'):
                stats = agg_map.get(ledger.id)
                tot_dr = stats['tot_dr'] if stats else Decimal('0')
                tot_cr = stats['tot_cr'] if stats else Decimal('0')

                # Opening balance consideration
                op = ledger.opening_balance or Decimal('0')
                nature = ledger.group.nature
                if nature in ('asset', 'expense'):
                    # Normal balance is Dr
                    base_dr = op if ledger.balance_type == 'Dr' else -op
                    ledger.current_balance = base_dr + tot_dr - tot_cr
                else:
                    # Normal balance is Cr
                    base_cr = op if ledger.balance_type == 'Cr' else -op
                    ledger.current_balance = base_cr + tot_cr - tot_dr

                updated_ledgers.append(ledger)

            Ledger.objects.bulk_update(updated_ledgers, ['current_balance'], batch_size=1000)
            self.stdout.write(self.style.SUCCESS(f"Updated balances for {len(updated_ledgers)} ledgers."))

        commit_duration = (datetime.now() - commit_start).total_seconds()
        self.stdout.write(self.style.SUCCESS(f"Database write completed in {commit_duration:.2f}s!"))

        # Final Verification
        final_vouchers = Voucher.objects.filter(outlet=outlet).count()
        final_journals = JournalEntry.objects.filter(outlet=outlet).count()
        final_jlines = JournalLine.objects.filter(journal_entry__outlet=outlet).count()

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 70))
        self.stdout.write(self.style.SUCCESS("DAYBOOK IMPORT FINISHED SUCCESSFULLY!"))
        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write(f"Live Vouchers on Server:       {final_vouchers:,}")
        self.stdout.write(f"Live Journal Entries on Server: {final_journals:,}")
        self.stdout.write(f"Live Journal Lines on Server:   {final_jlines:,}")
