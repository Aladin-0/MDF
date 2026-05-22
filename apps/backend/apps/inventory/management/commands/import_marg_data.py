"""
Import Marg ERP exported xlsx data into MediFlow for a specific outlet.

Usage (run inside Docker container):
  # Manavata Pharma
  python manage.py import_marg_data \
      --outlet 654f7337-d7ca-4003-bb5f-a6e585531fbd \
      --item-master "/data/manavata pharma data/item master MANVTA.xlsx" \
      --stock      "/data/manavata pharma data/BATCH CLOSE STK MANVTA.xlsx" \
      --party      "/data/manavata pharma data/party PUR MANAVTA.xlsx" \
      --stock-skip 2

  # SAI Medical
  python manage.py import_marg_data \
      --outlet c8e92121-087b-4c23-9edc-f48bd0ae1b67 \
      --item-master "/data/sai medical data/hsncodemaster_SAI.xlsx" \
      --stock      "/data/sai medical data/stock_51_SAI.xlsx" \
      --party      "/data/sai medical data/partymst_81_SAI.xlsx" \
      --stock-skip 4

Add --dry-run to validate without writing anything to the database.
"""

import os
from datetime import datetime
from decimal import Decimal, InvalidOperation

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


# ─────────────────────────── helpers ────────────────────────────

def _str(val, default=""):
    if val is None:
        return default
    return str(val).strip() or default


def _dec(val, default=Decimal("0")):
    if val is None:
        return default
    try:
        return Decimal(str(val)).quantize(Decimal("0.01"))
    except InvalidOperation:
        return default


def _int(val, default=0):
    try:
        return max(0, int(float(str(val))))
    except (ValueError, TypeError):
        return default


def _date(val):
    """Parse Marg date strings like '01-Aug-27'. Returns None if blank."""
    s = _str(val)
    if not s or s.replace("-", "").replace(" ", "") == "":
        return None
    for fmt in ("%d-%b-%y", "%d-%m-%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _hsn(val):
    """Strip trailing dots from SAI HSN codes like '3004..' → '3004'."""
    return _str(val).replace(".", "").strip()


# Unit codes from Marg that are tablet/capsule type (strip-based)
_TAB_UNITS = {'TAB.', 'TAB', 'TABS', 'TABL', 'CAP.', 'CAP', 'CAPS', 'CAPC', 'CAPD',
              'FTAB', 'RTAB', 'TABC', 'CATA', 'CACP', 'TA', 'T'}


def _pack_size(product_name: str, unit_raw: str) -> int:
    """
    Extract pack size from Marg product name.

    Strategy:
      1. Look for trailing 'xS' pattern  : '10S', '15S', '30S'
      2. Look for 'xTAB' / 'xCAPS' etc  : '10TAB', '15TAB', '10CAPS'
      3. If unit is TAB/CAP and no match : default 10 (most common in India)
      4. All other units (SYP, INJ, etc) : always 1 (sold as single unit)
    """
    import re
    unit = unit_raw.strip().upper()
    name = product_name.strip()

    # Pattern 1: xS  e.g. "CETIRIZINE 10MG 10S" — take LAST match (trailing = actual pack size)
    matches = re.findall(r'(\d+)\s*S\b', name, re.IGNORECASE)
    for size_str in reversed(matches):
        size = int(size_str)
        if 2 <= size <= 200:
            return size

    # Pattern 2: xTAB / xTABS / xCAP / xCAPS  e.g. "ABIXIM 10TAB", "ACCUFINE 10CAPS"
    # Take LAST match so "2B12 TAB 15 TAB" → 15 not 12
    matches = re.findall(r'(\d+)\s*(?:TABS?|CAPS?)\b', name, re.IGNORECASE)
    for size_str in reversed(matches):
        size = int(size_str)
        if 2 <= size <= 200:
            return size

    # If it's a tablet/capsule unit but no size found → default 10
    if unit in _TAB_UNITS:
        return 10

    # Syrups, injections, creams, drops, devices → 1
    return 1


def _gstin(val):
    """Return a valid 15-char GSTIN or None."""
    s = _str(val)
    return s[:15] if len(s) >= 15 else None


def _phone(row):
    """Pick best phone from mobile / phone1 / phone2 columns."""
    for idx in (15, 13, 14):
        p = _str(row[idx])[:20]
        if p:
            return p
    return "0000000000"


# ─────────────────────────── command ────────────────────────────

class Command(BaseCommand):
    help = "Import Marg ERP xlsx data (item master / stock / party) for one outlet"

    def add_arguments(self, parser):
        parser.add_argument("--outlet",      required=True, help="Outlet UUID")
        parser.add_argument("--item-master", required=True, help="Path to item master xlsx")
        parser.add_argument("--stock",       required=True, help="Path to stock/batch xlsx")
        parser.add_argument("--party",       required=True, help="Path to party master xlsx")
        parser.add_argument(
            "--stock-skip", type=int, default=2,
            help="Header rows to skip in stock file: 2 for Manavata, 4 for SAI",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Validate and preview without writing to database",
        )

    # ── entry point ──────────────────────────────────────────────

    def handle(self, *args, **options):
        from apps.core.models import Outlet

        outlet_id  = options["outlet"]
        dry_run    = options["dry_run"]
        skip       = options["stock_skip"]

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            raise CommandError(f"Outlet not found: {outlet_id}")

        for label, path in [
            ("Item Master", options["item_master"]),
            ("Stock",       options["stock"]),
            ("Party",       options["party"]),
        ]:
            if not os.path.exists(path):
                raise CommandError(f"{label} file not found: {path}")

        self.stdout.write(self.style.SUCCESS(
            f"\n{'='*60}\n"
            f"Outlet  : {outlet.name}  ({outlet.id})\n"
            f"Mode    : {'DRY RUN — nothing will be saved' if dry_run else 'LIVE IMPORT'}\n"
            f"{'='*60}\n"
        ))

        stats = dict(
            products_created=0, products_existing=0,
            distributors_created=0, distributors_existing=0,
            batches_created=0, batches_existing=0,
            ledger_created=0,
            ledger_accounts_created=0,
            errors=[],
        )

        with transaction.atomic():
            self._import_products(options["item_master"], stats)
            self._import_distributors(options["party"], outlet, stats)
            self._import_stock(options["stock"], skip, outlet, stats)
            self._create_distributor_ledgers(outlet, stats)

            if dry_run:
                self.stdout.write(self.style.WARNING("\nDRY RUN — rolling back all changes.\n"))
                transaction.set_rollback(True)

        self._print_summary(stats)

    # ── step 1 : MasterProduct (global, shared across outlets) ───

    def _import_products(self, path, stats):
        from apps.inventory.models import MasterProduct

        self.stdout.write("→ Importing products (item master) …")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active

        # Headers: ItemID(0) Company(1) ItemCode(2) Name(3) HSNCode(4)
        #          LocalTax(5) SGST(6) CGST(7) CentralTax(8) IGST(9)
        #          HsnName(10) OldTax(11) Rate(12) AddLess(13) P.Rate(14)
        #          M.R.P.(15) Stock(16) Tax Diff.(17) Category(18) Salt(19)

        for row in ws.iter_rows(min_row=2, values_only=True):
            name = _str(row[3])
            if not name:
                continue

            gst = _dec(row[6]) + _dec(row[7])   # SGST + CGST = total GST %
            hsn = _hsn(row[4])

            try:
                _, created = MasterProduct.objects.get_or_create(
                    name=name,
                    defaults=dict(
                        manufacturer   = _str(row[1]),
                        hsn_code       = hsn or None,
                        gst_rate       = gst,
                        mrp            = _dec(row[15]),
                        default_sale_rate = _dec(row[12]),
                        category       = _str(row[18]),
                        composition    = _str(row[19]),
                        drug_type      = "allopathy",   # not in Marg export
                        schedule_type  = "OTC",          # not in Marg export
                        pack_size      = 1,              # not in Marg export
                        pack_unit      = "tablet",       # not in Marg export
                        pack_type      = "strip",        # not in Marg export
                    ),
                )
                if created:
                    stats["products_created"] += 1
                else:
                    stats["products_existing"] += 1
            except Exception as e:
                stats["errors"].append(f"Product '{name}': {e}")

        wb.close()
        self.stdout.write(
            f"   Created: {stats['products_created']}  |  "
            f"Already existed: {stats['products_existing']}  |  "
            f"Errors: {len(stats['errors'])}\n"
        )

    # ── step 2 : Distributor (per outlet) ────────────────────────

    def _import_distributors(self, path, outlet, stats):
        from apps.purchases.models import Distributor

        self.stdout.write("→ Importing distributors (party master) …")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active

        # Headers: code(0) type(1) ledger(2) city(3) group(4) name(5)
        #          address1(6) address2(7) address3(8) pin(9) email(10)
        #          site(11) contact(12) phone1(13) phone2(14) mobile(15)
        #          resi(16) fax(17) licence(18) tin/gstin(19) …
        #          crdays(31)

        errors_before = len(stats["errors"])

        for row in ws.iter_rows(min_row=2, values_only=True):
            name = _str(row[5])
            if not name:
                continue

            gstin  = _gstin(row[19])
            addr   = " ".join(filter(None, [_str(row[6]), _str(row[7]), _str(row[8])]))
            phone  = _phone(row)
            email  = _str(row[10]) or None
            city   = _str(row[3])
            crdays = _int(row[31])

            try:
                _, created = Distributor.objects.get_or_create(
                    outlet=outlet,
                    name=name,
                    defaults=dict(
                        gstin          = gstin,
                        drug_license_no= _str(row[18]) or None,
                        phone          = phone,
                        email          = email if email and "@" in email else None,
                        address        = addr,
                        city           = city,
                        state          = "Maharashtra",   # not in Marg export
                        credit_days    = crdays,
                    ),
                )
                if created:
                    stats["distributors_created"] += 1
                else:
                    stats["distributors_existing"] += 1
            except Exception as e:
                if gstin and "unique constraint" in str(e).lower():
                    # Same GSTIN exists in this outlet with a different name
                    # (duplicate entry in Marg). Retry without GSTIN.
                    try:
                        _, created = Distributor.objects.get_or_create(
                            outlet=outlet,
                            name=name,
                            defaults=dict(
                                gstin          = None,
                                drug_license_no= _str(row[18]) or None,
                                phone          = phone,
                                email          = email if email and "@" in email else None,
                                address        = addr,
                                city           = city,
                                state          = "Maharashtra",
                                credit_days    = crdays,
                            ),
                        )
                        if created:
                            stats["distributors_created"] += 1
                        else:
                            stats["distributors_existing"] += 1
                    except Exception as e2:
                        stats["errors"].append(f"Distributor '{name}': {e2}")
                else:
                    stats["errors"].append(f"Distributor '{name}': {e}")

        wb.close()
        new_errors = len(stats["errors"]) - errors_before
        self.stdout.write(
            f"   Created: {stats['distributors_created']}  |  "
            f"Already existed: {stats['distributors_existing']}  |  "
            f"Errors: {new_errors}\n"
        )

    # ── step 3 : Batch + StockLedger OPENING (per outlet) ────────

    def _import_stock(self, path, skip_rows, outlet, stats):
        from datetime import date as date_cls
        from apps.inventory.models import MasterProduct, Batch, StockLedger

        self.stdout.write("→ Importing stock batches …")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active

        # Stock file headers (row at index skip_rows-1, data starts at skip_rows):
        # Code(0) Product Name(1) Unit(2) Current Stock(3) …
        # Cost Price(8) M.R.P.(10) Purchase Price(11) Sales Price(12)
        # Batch(16) MFG(17) EXP(18) Supplier(19) Rack No.(22)

        # Build product name → MasterProduct lookup map (faster than per-row DB hit)
        product_map = {p.name: p for p in MasterProduct.objects.all()}

        errors_before = len(stats["errors"])

        for row in ws.iter_rows(min_row=skip_rows + 1, values_only=True):
            product_name = _str(row[1])
            if not product_name:
                continue

            product = product_map.get(product_name)
            if product is None:
                stats["errors"].append(f"Batch skipped — product not found: '{product_name}'")
                continue

            batch_no    = _str(row[16]) or "NO-BATCH"
            expiry_date = _date(row[18])


            mrp           = _dec(row[10])
            purchase_rate = _dec(row[11])
            sale_rate     = _dec(row[12]) or mrp
            qty_strips    = _int(row[3])
            pack_unit_raw = _str(row[2], "tablet")
            pack_size_val = _pack_size(product_name, pack_unit_raw)
            rack          = _str(row[22]) or None

            # Medical devices (knee braces, splints etc.) have no expiry date.
            # Use 2099-12-31 as a "no expiry" placeholder instead of skipping.
            if expiry_date is None:
                expiry_date = date_cls(2099, 12, 31)

            try:
                batch, created = Batch.objects.get_or_create(
                    outlet      = outlet,
                    product     = product,
                    batch_no    = batch_no,
                    expiry_date = expiry_date,
                    defaults=dict(
                        mfg_date        = _date(row[17]),
                        mrp             = mrp,
                        purchase_rate   = purchase_rate,
                        sale_rate       = sale_rate,
                        qty_strips      = qty_strips,
                        qty_loose       = 0,
                        opening_qty     = Decimal(qty_strips),
                        pack_size       = pack_size_val,
                        pack_unit       = pack_unit_raw,
                        pack_type       = "strip",
                        rack_location   = rack,
                        is_active       = True,
                        is_opening_stock= True,
                    ),
                )

                if created:
                    stats["batches_created"] += 1
                    # Create OPENING StockLedger entry for this batch
                    value = purchase_rate * qty_strips
                    already_has_entry = StockLedger.objects.filter(
                        outlet=outlet, batch=batch, txn_type="OPENING"
                    ).exists()
                    if not already_has_entry:
                        StockLedger.objects.create(
                            outlet         = outlet,
                            product        = product,
                            batch          = batch,
                            txn_type       = "OPENING",
                            txn_date       = date_cls.today(),
                            voucher_type   = "Opening Stock",
                            voucher_number = "OPENING",
                            party_name     = "",
                            batch_number   = batch_no,
                            expiry_date    = expiry_date,
                            qty_in         = Decimal(qty_strips),
                            qty_out        = Decimal(0),
                            rate           = purchase_rate,
                            value_in       = value,
                            value_out      = Decimal(0),
                            running_qty    = Decimal(qty_strips),
                            running_value  = value,
                        )
                        stats["ledger_created"] += 1
                else:
                    stats["batches_existing"] += 1

            except Exception as e:
                stats["errors"].append(f"Batch '{product_name}' / '{batch_no}': {e}")

        wb.close()
        new_errors = len(stats["errors"]) - errors_before
        self.stdout.write(
            f"   Created: {stats['batches_created']}  |  "
            f"Already existed: {stats['batches_existing']}  |  "
            f"Ledger entries: {stats['ledger_created']}  |  "
            f"Errors: {new_errors}\n"
        )

    # ── step 4 : Sundry Creditor Ledger (auto-link distributors to accounts) ──

    def _create_distributor_ledgers(self, outlet, stats):
        """Create a Sundry Creditors Ledger entry for every distributor
        that doesn't already have one.  This is required so distributors
        appear in the LedgerPicker on the New Purchase form."""
        from apps.accounts.models import Ledger, LedgerGroup
        from apps.purchases.models import Distributor

        self.stdout.write("→ Linking distributors to Sundry Creditors ledger …")

        sc_group = LedgerGroup.objects.filter(outlet=outlet, name='Sundry Creditors').first()
        if not sc_group:
            stats["errors"].append(
                "No 'Sundry Creditors' LedgerGroup found — distributor ledgers not created."
            )
            self.stdout.write(self.style.WARNING(
                "   WARNING: Sundry Creditors group missing — skipping ledger creation."
            ))
            return

        # IDs that already have a linked ledger
        existing = set(
            Ledger.objects.filter(outlet=outlet, linked_distributor__isnull=False)
            .values_list('linked_distributor_id', flat=True)
        )

        for dist in Distributor.objects.filter(outlet=outlet).exclude(id__in=existing):
            try:
                Ledger.objects.create(
                    outlet=outlet,
                    linked_distributor=dist,
                    name=dist.name,
                    group=sc_group,
                    phone=dist.phone or '',
                    gstin=dist.gstin or '',
                    address=dist.address or '',
                    state=dist.state or '',
                )
                stats["ledger_accounts_created"] += 1
            except Exception as e:
                stats["errors"].append(f"Ledger '{dist.name}': {e}")

        self.stdout.write(
            f"   Created: {stats['ledger_accounts_created']}\n"
        )

    # ── summary ──────────────────────────────────────────────────

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("\n" + "="*60))
        self.stdout.write(self.style.SUCCESS("IMPORT SUMMARY"))
        self.stdout.write(self.style.SUCCESS("="*60))
        self.stdout.write(f"  Products (MasterProduct) created : {stats['products_created']}")
        self.stdout.write(f"  Products already existed         : {stats['products_existing']}")
        self.stdout.write(f"  Distributors created             : {stats['distributors_created']}")
        self.stdout.write(f"  Distributors already existed     : {stats['distributors_existing']}")
        self.stdout.write(f"  Batches created                  : {stats['batches_created']}")
        self.stdout.write(f"  Batches already existed          : {stats['batches_existing']}")
        self.stdout.write(f"  StockLedger OPENING entries      : {stats['ledger_created']}")
        self.stdout.write(f"  Sundry Creditor ledgers created  : {stats['ledger_accounts_created']}")
        self.stdout.write(f"  Errors / Skipped rows            : {len(stats['errors'])}")

        if stats["errors"]:
            self.stdout.write(self.style.WARNING("\nERRORS / SKIPPED:"))
            for err in stats["errors"][:30]:
                self.stdout.write(self.style.WARNING(f"  • {err}"))
            if len(stats["errors"]) > 30:
                self.stdout.write(self.style.WARNING(f"  … and {len(stats['errors']) - 30} more."))

        self.stdout.write(self.style.SUCCESS("="*60 + "\n"))
