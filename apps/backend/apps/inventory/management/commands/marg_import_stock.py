"""
Phase 1 of the Marg reload: the product list and the stock of ONE outlet, from Marg's own exports.

  # show only (the default): works everything out, writes it inside a transaction to prove it adds up, then undoes it
  python manage.py marg_import_stock --outlet <uuid> --master master.xml --stock stock_51.xls --report lists.xlsx

  # with the shop's answers (the same Excel, yellow columns filled in)
  python manage.py marg_import_stock ... --answers lists.xlsx

  # for real: the outlet's name must be typed, and the lists that block a load must be answered
  python manage.py marg_import_stock ... --apply --confirm "Manavta Pharma"

Nothing of any other outlet is changed: the command measures the other outlets before and after and refuses the whole
load if a single number moved. The rules are in apps/inventory/marg_import/ (start with its __init__.py).
"""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.models import Outlet
from apps.inventory.marg_import import apply as A
from apps.inventory.marg_import import files, plan as P, report

RECENT_DAYS = 7


class Command(BaseCommand):
    help = "Load one outlet's products and stock from Marg's master.xml and stock report (show-only unless --apply)"

    def add_arguments(self, parser):
        parser.add_argument('--outlet', required=True, help='Outlet id')
        parser.add_argument('--master', required=True, help="Marg's All Masters export (master.xml)")
        parser.add_argument('--stock', required=True, help="Marg's stock report (.xls)")
        parser.add_argument('--answers', help='The Excel lists with the yellow columns filled in by the shop')
        parser.add_argument('--report', help='Write the Excel lists for the shop to this path')
        parser.add_argument('--apply', action='store_true', help='Save. Without it everything is undone at the end')
        parser.add_argument('--confirm', help="With --apply: the outlet's exact name, typed by hand")
        parser.add_argument('--allow-open-issues', action='store_true',
                            help='With --apply: load although MRP / part-quantity rows are unanswered (those rows load with MRP 0 / whole packs only)')
        parser.add_argument('--allow-live-outlet', action='store_true',
                            help=f'With --apply: load although the outlet made bills or purchases in the last {RECENT_DAYS} days')

    def handle(self, *args, **o):
        try:
            outlet = Outlet.objects.get(id=o['outlet'])
        except (Outlet.DoesNotExist, ValueError, ValidationError):   # a malformed id raises ValidationError
            raise CommandError(f"Outlet not found: {o['outlet']}")
        try:
            items = files.read_items(o['master'])
            sheet = files.read_stock(o['stock'])
        except (files.MargFileError, OSError) as e:
            raise CommandError(str(e))
        answers = report.read_answers(o['answers']) if o['answers'] else None
        plan = P.build_plan(outlet, items, sheet, answers)

        if o['apply']:
            self._guard(outlet, plan, o)
        if o['report']:
            report.write_workbook(plan, o['report'])

        w = self.stdout.write
        w(f"\nOutlet      : {outlet.name} ({outlet.id})")
        w(f"Stock report: {sheet.company} as on {sheet.as_on:%d-%b-%Y}, {len(sheet.rows)} rows, total {sheet.total_value}")
        w(f"Marg items  : {len(items)}")
        w(f"Mode        : {'SAVE' if o['apply'] else 'SHOW ONLY (everything is undone at the end)'}\n")

        try:
            with transaction.atomic():
                before = A.others_fingerprint(outlet)
                done = A.apply_products(plan)
                done.update(A.replace_stock(plan))
                checked = A.verify(plan)
                after = A.others_fingerprint(outlet)
                if before != after:
                    raise A.ImportRefused(f'Another outlet would change. before={before} after={after}')
                if not o['apply']:
                    transaction.set_rollback(True)
        except A.ImportRefused as e:
            raise CommandError(f'REFUSED, nothing was saved: {e}')

        t = plan.totals()
        w('What the load does')
        for k, v in done.items():
            w(f'  {k.replace("_", " "):34} {v}')
        w('\nStock after the load (read back from the database)')
        for k in ('batches', 'whole_packs', 'loose_units', 'landing_value', 'opening_stock_value', 'marg_opening_stock'):
            w(f'  {k.replace("_", " "):34} {checked[k]}')
        w(f"  {'report value of the same rows':34} {t['sheet_value_of_loaded_rows']}")
        w(f"  {'batches with a real expiry':34} {t['with_expiry']} ({t['already_expired']} already expired)")
        w(f"  {'stock ledger check':34} {checked['ledger_health']}")
        w('\nFor the shop')
        for kind, label in ((P.MRP_MISSING, 'MRP missing'), (P.QTY_UNCLEAR, 'part quantity not clear'), (P.COST_ABOVE_MRP, 'cost above MRP'),
                            (P.COST_PER_PIECE, 'cost looks per piece'), (P.TAX_MISSING, 'HSN or GST missing'), (P.NEGATIVE_STOCK, 'negative stock (not loaded)')):
            w(f"  {label:34} {len(plan.of(kind))}{'   <- blocks a real load' if kind in P.BLOCKING and plan.of(kind) else ''}")
        for note in plan.notes:
            w(f'  note: {note}')
        w(f"\nOther outlets: unchanged ({before['batches']['n']} batches, {before['stock_ledger_rows']} ledger rows, {before['products_in_use']} products in use).")
        if o['report']:
            w(f"Lists for the shop: {o['report']}")
        w(self.style.SUCCESS('SAVED.') if o['apply'] else self.style.WARNING('SHOW ONLY: nothing was saved.'))

    def _guard(self, outlet, plan, o):
        if (o['confirm'] or '') != outlet.name:
            raise CommandError(f'--apply needs --confirm with the outlet\'s exact name ("{outlet.name}").')
        if plan.blocking and not o['allow_open_issues']:
            raise CommandError(f'{len(plan.blocking)} row(s) still need the shop (MRP missing / part quantity). Answer them with --answers, '
                               f'or pass --allow-open-issues to load them as they are.')
        if not o['allow_live_outlet']:
            from apps.billing.models import SaleInvoice
            from apps.purchases.models import PurchaseInvoice
            since = timezone.now() - timedelta(days=RECENT_DAYS)
            recent = SaleInvoice.objects.filter(outlet=outlet, created_at__gte=since).count() + PurchaseInvoice.objects.filter(outlet=outlet, created_at__gte=since).count()
            if recent:
                raise CommandError(f'{outlet.name} made {recent} bills / purchases in the last {RECENT_DAYS} days: it looks live. '
                                   f'Replacing its stock now would wipe what those did. Pass --allow-live-outlet only if that is meant.')
