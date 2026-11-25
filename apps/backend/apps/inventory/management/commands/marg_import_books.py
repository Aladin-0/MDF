"""
Phase 3 of the Marg reload: every entry of Marg's daybook (sales, returns, purchases, payments, receipts, journals,
contra) becomes the MediFlow document with its journal entry. Run after Phases 1 and 2. Rules: apps/inventory/marg_import/books.py.

  python manage.py marg_import_books --outlet <uuid> --daybook daybook.xml --report books.xlsx          # show only
  python manage.py marg_import_books ... --apply --confirm "Manavta Pharma"

Old bills do not move stock. The other outlets and this outlet's stock are measured before and after; any change refuses the load.
"""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.models import Outlet
from apps.inventory.marg_import import books as B
from apps.inventory.marg_import import files, parties, report
from apps.inventory.marg_import.apply import ImportRefused


class Command(BaseCommand):
    help = "Load one outlet's sales, purchases, returns and vouchers from Marg's daybook (show-only unless --apply)"

    def add_arguments(self, parser):
        parser.add_argument('--outlet', required=True)
        parser.add_argument('--daybook', required=True)
        parser.add_argument('--report')
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--confirm')
        parser.add_argument('--allow-live-outlet', action='store_true')

    def handle(self, *args, **o):
        try:
            outlet = Outlet.objects.get(id=o['outlet'])
        except (Outlet.DoesNotExist, ValueError, ValidationError):
            raise CommandError(f"Outlet not found: {o['outlet']}")
        try:
            vouchers = files.read_daybook(o['daybook'])
            books = B.build_books(outlet, vouchers)
        except (files.MargFileError, OSError, ValueError) as e:
            raise CommandError(str(e))
        if o['apply']:
            if (o['confirm'] or '') != outlet.name:
                raise CommandError(f'--apply needs --confirm with the outlet\'s exact name ("{outlet.name}").')
            if not o['allow_live_outlet']:
                from apps.billing.models import SaleInvoice
                since = timezone.now() - timedelta(days=7)
                # bills this loader wrote itself (Marg numbers) do not make the outlet live; bills made at the counter do
                recent = SaleInvoice.objects.filter(outlet=outlet, created_at__gte=since).exclude(invoice_no__in=[v.number for v in vouchers]).count()
                if recent:
                    raise CommandError(f'{outlet.name} made {recent} bills in MediFlow in the last 7 days: it looks live. Pass --allow-live-outlet only if meant.')

        w = self.stdout.write
        w(f'\nOutlet : {outlet.name} ({outlet.id})')
        w(f'Marg   : {dict(books.counts)}')
        w(f"Mode   : {'SAVE' if o['apply'] else 'SHOW ONLY (everything is undone at the end)'}\n")
        try:
            with transaction.atomic():
                others = parties.others_fingerprint(outlet)
                stock = parties.outlet_stock_fingerprint(outlet)
                removed = B.purge_books(outlet)
                done = B.write_books(books, B.Ledgers(outlet), B.History(outlet, books))
                dues = B.settle(outlet)
                checked = B.verify(books)
                if parties.others_fingerprint(outlet) != others:
                    raise ImportRefused('another outlet would change')
                if parties.outlet_stock_fingerprint(outlet) != stock:
                    raise ImportRefused("this outlet's stock would change")
                if o['report']:
                    report.write_books_workbook(books, checked, dues, o['report'])
                if not o['apply']:
                    transaction.set_rollback(True)
        except ImportRefused as e:
            raise CommandError(f'REFUSED, nothing was saved: {e}')

        if any(removed.values()):
            w('Removed first (an earlier load of these books): ' + ', '.join(f'{k} {v}' for k, v in removed.items() if v))
        w('Loaded')
        for k, v in done.items():
            w(f'  {k.replace("_", " "):34} {v}')
        w('\nRead back from the database')
        for k, v in {**checked, **dues}.items():
            w(f'  {k.replace("_", " "):34} {v}')
        w('\nCorrections to Marg\'s export (listed in the report)')
        for kind, label in (('rounding', 'paise round-off added'), ('double', 'item written twice, copy dropped'),
                            ('difference', 'did not add up: to MARG DIFFERENCE'), ('renumbered', 'voucher number used twice')):
            fx = books.of(kind)
            w(f'  {label:34} {len(fx)} entries, Rs {sum((abs(f.amount) for f in fx), B.ZERO)}')
        w("\nOther outlets: unchanged. This outlet's stock: unchanged.")
        w(self.style.SUCCESS('SAVED.') if o['apply'] else self.style.WARNING('SHOW ONLY: nothing was saved.'))
