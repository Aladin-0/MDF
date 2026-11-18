"""
Find (and, with --apply, repair) batches whose stock ledger is incomplete or disagrees with the stock the batch holds.

    python manage.py repair_stock_ledger                       # dry run: counts per state, what it would do
    python manage.py repair_stock_ledger --apply               # add the missing opening balances (changes no profit figure)
    python manage.py repair_stock_ledger --apply --corrections # ALSO make ledgers that disagree with the batch agree (owner's call)
    python manage.py repair_stock_ledger --outlet <uuid> --include-inactive

Read apps/inventory/ledger_health.py first: what is safe, what needs a decision, and why OPENING rows move the P&L.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Outlet
from apps.inventory import ledger_health as lh


class Command(BaseCommand):
    help = 'Report (default) or repair batches whose stock ledger is incomplete or disagrees with their stock.'

    def add_arguments(self, parser):
        parser.add_argument('--outlet', help='one outlet id (default: all)')
        parser.add_argument('--apply', action='store_true', help='write the repairs (default is a dry run)')
        parser.add_argument('--corrections', action='store_true', help='also fix ledgers that DISAGREE with the batch (needs the owner\'s decision)')
        parser.add_argument('--book-as-opening', action='store_true', help='book openings as true OPENING stock: this CHANGES the P&L Opening Stock')
        parser.add_argument('--include-inactive', action='store_true')

    def handle(self, *args, **o):
        outlet = None
        if o['outlet']:
            outlet = Outlet.objects.filter(id=o['outlet']).first()
            if not outlet:
                raise CommandError('outlet not found')
        rep = lh.scan(outlet, o['include_inactive'], sample=0)
        w = self.stdout.write
        w('Stock ledger health' + (f' for {outlet.name}' if outlet else ' (all outlets)'))
        for k, n in rep['counts'].items():
            w(f"  {k:>3}  {n:>7}  {lh.LABELS[k]}" + (f"   (gap worth {rep['costOfGap'][k]:,.2f} at cost)" if k not in (lh.OK, lh.RUNNING_OFF) and n else ''))
        w(f"  safe to repair: {rep['safeToRepair']}   needing a decision: {rep['needsDecision']}")
        w(f"  Booking the safe repairs as true OPENING stock would add {rep['openingStockIfBookedAsOpening']:,.2f} to the P&L's Opening Stock.")
        w('  (Default books them as ledger repairs, which change no profit figure.)')

        out = lh.repair(outlet, apply=o['apply'], corrections=o['corrections'], book_as='opening' if o['book_as_opening'] else 'adjustment',
                        include_inactive=o['include_inactive'])
        verb = 'Repaired' if o['apply'] else 'Would repair'
        w(f"{verb} {out['total']} batch(es): {out['repaired']}; left for a decision: {out['leftForDecision']}")
        if not o['apply']:
            w('Dry run: nothing was written. Add --apply to repair.')
