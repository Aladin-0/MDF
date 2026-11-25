"""
Phase 2 of the Marg reload: delete one outlet's old books and load Marg's ledgers, opening balances, suppliers and
customers. Stock from Phase 1 is kept (each batch only gets its supplier). Rules: apps/inventory/marg_import/parties.py.

  # show only (the default): does everything inside a transaction, checks it, then undoes it
  python manage.py marg_import_parties --outlet <uuid> --master master.xml --daybook daybook.xml --stock stock_51.xls --report parties.xlsx

  # for real
  python manage.py marg_import_parties ... --apply --confirm "Manavta Pharma"

The other outlets are measured before and after; any change refuses the whole load.
"""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.models import Outlet
from apps.inventory.marg_import import files, parties, report
from apps.inventory.marg_import.apply import ImportRefused

RECENT_DAYS = 7


class Command(BaseCommand):
    help = "Delete one outlet's old books and load Marg's ledgers, opening balances, suppliers and customers (show-only unless --apply)"

    def add_arguments(self, parser):
        parser.add_argument('--outlet', required=True)
        parser.add_argument('--master', required=True, help="Marg's All Masters export (master.xml)")
        parser.add_argument('--daybook', required=True, help="Marg's daybook export (daybook.xml): customers' mobiles come from the bill notes")
        parser.add_argument('--stock', help="Marg's stock report (.xls): to give each stock batch its supplier")
        parser.add_argument('--report', help='Write the Excel summary to this path')
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--confirm', help="With --apply: the outlet's exact name")
        parser.add_argument('--allow-live-outlet', action='store_true')

    def handle(self, *args, **o):
        try:
            outlet = Outlet.objects.get(id=o['outlet'])
        except (Outlet.DoesNotExist, ValueError, ValidationError):
            raise CommandError(f"Outlet not found: {o['outlet']}")
        try:
            groups, ledgers = files.read_masters(o['master'])
            items = files.read_items(o['master'])
            notes = files.read_sale_notes(o['daybook'])
            sheet = files.read_stock(o['stock']) if o['stock'] else None
        except (files.MargFileError, OSError) as e:
            raise CommandError(str(e))
        try:
            plan = parties.build_party_plan(outlet, groups, ledgers, notes, sheet)
        except ValueError as e:
            raise CommandError(str(e))
        if o['apply']:
            self._guard(outlet, o, notes)
        if o['report']:
            report.write_party_workbook(plan, o['report'])

        w = self.stdout.write
        w(f'\nOutlet : {outlet.name} ({outlet.id})')
        w(f"Marg   : {len(groups)} groups, {len(ledgers)} ledgers, {sum(1 for n in notes if n.kind == 'Sales')} sale bills")
        w(f"Mode   : {'SAVE' if o['apply'] else 'SHOW ONLY (everything is undone at the end)'}\n")
        try:
            with transaction.atomic():
                others = parties.others_fingerprint(outlet)
                stock = parties.outlet_stock_fingerprint(outlet)
                deleted = parties.purge(outlet)
                twins = parties.tidy_twins(items)
                done = parties.rebuild(plan)
                checked = parties.verify(plan)
                if parties.others_fingerprint(outlet) != others:
                    raise ImportRefused('another outlet would change')
                if parties.outlet_stock_fingerprint(outlet) != stock:
                    raise ImportRefused("this outlet's stock would change")
                if not o['apply']:
                    transaction.set_rollback(True)
        except ImportRefused as e:
            raise CommandError(f'REFUSED, nothing was saved: {e}')

        w('Deleted (this outlet only)')
        for label, n in sorted(deleted.items(), key=lambda kv: -kv[1]):
            if n:
                w(f'  {label:40} {n}')
        w(f'  {"duplicate product spellings nothing uses":40} {twins}')
        w('\nLoaded')
        for k, v in done.items():
            w(f'  {k.replace("_", " "):40} {v}')
        w('\nRead back from the database')
        for k, v in checked.items():
            w(f'  {k.replace("_", " "):40} {v}')
        if plan.unknown_suppliers:
            w(f'  {"stock batches whose supplier is not a Marg supplier":40} {sum(plan.unknown_suppliers.values())} ({len(plan.unknown_suppliers)} names)')
        for note in plan.notes:
            w(f'  note: {note}')
        w("\nOther outlets: unchanged. This outlet's stock: unchanged.")
        if o['report']:
            w(f"Summary: {o['report']}")
        w(self.style.SUCCESS('SAVED.') if o['apply'] else self.style.WARNING('SHOW ONLY: nothing was saved.'))

    def _guard(self, outlet, o, notes):
        if (o['confirm'] or '') != outlet.name:
            raise CommandError(f'--apply needs --confirm with the outlet\'s exact name ("{outlet.name}").')
        if not o['allow_live_outlet']:
            from apps.billing.models import SaleInvoice
            from apps.purchases.models import PurchaseInvoice
            since = timezone.now() - timedelta(days=RECENT_DAYS)
            # bills an earlier Phase 3 run loaded from Marg carry Marg's numbers: only bills made at the counter make the outlet live
            sold = [n.number for n in notes if n.kind == 'Sales']
            bought = [n.number for n in notes if n.kind == 'Purchase']
            recent = (SaleInvoice.objects.filter(outlet=outlet, created_at__gte=since).exclude(invoice_no__in=sold).count()
                      + PurchaseInvoice.objects.filter(outlet=outlet, created_at__gte=since).exclude(invoice_no__in=bought).count())
            if recent:
                raise CommandError(f'{outlet.name} made {recent} bills / purchases in the last {RECENT_DAYS} days: it looks live. '
                                   f'Deleting its books now would lose them. Pass --allow-live-outlet only if that is meant.')
