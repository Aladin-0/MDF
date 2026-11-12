"""
Put back the invoice dates that an old edit bug moved.

The bug: the browser sends an edited bill's date as UTC; the old edit path read it as IST, so EVERY edit moved the
bill back by 5h30m (11h after two edits). A bill made just after midnight then landed on the PREVIOUS day: it left
that day's sales list and total, sat out of serial order, and showed up only under the "Modified" filter. Its stock
ledger, journal and customer ledger entries moved with it. New edits are already correct (parse_client_datetime);
this repairs the bills edited before that fix.

How it knows what is right: every edit wrote a revision whose diff holds the date before and after. A step counts as
the bug only when the date moved back by exactly 5h30m (up to a minute more: the edit form drops seconds). A date the
user changed on purpose is left alone, and a bill whose date was changed outside the audit trail is skipped.

    python manage.py repair_shifted_invoice_dates              # dry run: lists what it would change
    python manage.py repair_shifted_invoice_dates --apply      # does it
    python manage.py repair_shifted_invoice_dates --outlet <uuid> [--apply]

Take a database backup before --apply on production (docs/DEPLOYMENT_GUIDE.md).
"""
from datetime import datetime, timedelta

from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand
from django.db import transaction

SHIFT = timedelta(hours=5, minutes=30)
MINUTE = timedelta(seconds=60)


def _parse(text):
    return datetime.fromisoformat(str(text).replace('Z', '')).replace(tzinfo=None)


def is_bug_shift(old, new):
    """Did the date move BACK by exactly the 5h30m the old bug applied (the form's lost seconds allow up to a minute more)?"""
    return SHIFT - timedelta(seconds=1) <= (old - new) <= SHIFT + MINUTE + timedelta(seconds=1)


def true_date_from_steps(steps):
    """
    steps = [(old, new), ...] in order, one per revision that changed the date.
    Returns (true_date, date_it_was_left_at): what the bill's date should be, and what the audit says it is now.
    (None, None) when there is nothing to repair.
    """
    true = None
    left_at = None
    for old, new in steps:
        if is_bug_shift(old, new):
            if true is None:
                true = old                 # the exact original, seconds included
        else:
            true = new                     # the user changed it on purpose: keep it
        left_at = new
    return true, left_at


class Command(BaseCommand):
    help = "Restore the date of sales invoices whose date an old edit bug moved back by 5h30m per edit (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the repair (default: only list it).')
        parser.add_argument('--outlet', help='Only this outlet (uuid).')

    def handle(self, *args, **opts):
        from apps.audit.models import DocumentRevisionV2
        from apps.billing.models import SaleInvoice

        ct = ContentType.objects.get_for_model(SaleInvoice)
        revisions = DocumentRevisionV2.objects.filter(content_type=ct).order_by('object_id', 'created_at', 'revision_no')

        steps_by_invoice = {}
        for rev in revisions.iterator():
            change = (rev.diff_summary_json or {}).get('header', {}).get('invoice_date')
            if not change or 'old' not in change or 'new' not in change:
                continue
            try:
                steps_by_invoice.setdefault(rev.object_id, []).append((_parse(change['old']), _parse(change['new'])))
            except (ValueError, TypeError):
                self.stderr.write(f'  skipped a revision with an unreadable date on {rev.object_id}')

        invoices = SaleInvoice.objects.filter(id__in=list(steps_by_invoice)).select_related('outlet').order_by('outlet_id', 'invoice_date')
        if opts.get('outlet'):
            invoices = invoices.filter(outlet_id=opts['outlet'])

        repaired = moved_day = skipped = 0
        for inv in invoices:
            true, left_at = true_date_from_steps(steps_by_invoice[inv.id])
            if true is None or true == inv.invoice_date:
                continue
            if left_at != inv.invoice_date.replace(tzinfo=None):
                skipped += 1
                self.stdout.write(f'SKIP  {inv.invoice_no}: its date was changed outside the audit trail ({inv.invoice_date} vs {left_at})')
                continue

            crosses_day = true.date() != inv.invoice_date.date()
            self.stdout.write(f'{"FIX " if opts["apply"] else "WOULD FIX"}  {inv.invoice_no}: {inv.invoice_date:%Y-%m-%d %H:%M} -> {true:%Y-%m-%d %H:%M}'
                              f'{"   (moves back to its real DAY: ledgers follow)" if crosses_day else ""}')
            repaired += 1
            moved_day += int(crosses_day)
            if opts['apply']:
                self.repair(inv, true)

        verb = 'repaired' if opts['apply'] else 'would repair'
        self.stdout.write(self.style.SUCCESS(f'{verb} {repaired} bill(s), {moved_day} of them on a different day; {skipped} skipped.'))
        if repaired and not opts['apply']:
            self.stdout.write('Nothing was changed. Run again with --apply (after a backup) to repair them.')

    @transaction.atomic
    def repair(self, inv, true):
        from apps.accounts.models import JournalEntry
        from apps.audit.services import log_activity
        from apps.billing.models import CreditTransaction, LedgerEntry, SaleInvoice
        from apps.billing.sale_update_service import rebuild_customer_ledger
        from apps.inventory.models import StockLedger
        from apps.inventory.services import rebuild_stock_ledger

        wrong = inv.invoice_date
        wrong_day, right_day = wrong.date(), true.date()
        SaleInvoice.objects.filter(pk=inv.pk).update(invoice_date=true)      # update(): leave updated_at (the stale-edit guard) alone

        if wrong_day != right_day:
            stock = StockLedger.objects.filter(outlet_id=inv.outlet_id, voucher_number=inv.invoice_no, txn_type='SALE_OUT', txn_date=wrong_day)
            batch_ids = set(stock.values_list('batch_id', flat=True))
            stock.update(txn_date=right_day)
            JournalEntry.objects.filter(outlet_id=inv.outlet_id, source_type='SALE', source_id=inv.id, date=wrong_day).update(date=right_day)
            LedgerEntry.objects.filter(outlet_id=inv.outlet_id, reference_no=inv.invoice_no, entry_type__in=['sale', 'receipt'], date=wrong_day).update(date=right_day)
            CreditTransaction.objects.filter(invoice=inv, date=wrong_day).update(date=right_day)

            earliest = min(wrong_day, right_day)
            for batch_id in batch_ids:
                rebuild_stock_ledger(batch_id, earliest)
            if inv.customer_id:
                rebuild_customer_ledger(str(inv.outlet_id), str(inv.customer_id), earliest)

        log_activity(
            action='UPDATE', module='billing', entity_type='SaleInvoice', entity_id=inv.id, entity_label=inv.invoice_no,
            description=f'Repaired the date of {inv.invoice_no}: {wrong:%d %b %Y %H:%M} -> {true:%d %b %Y %H:%M} (an old edit bug had moved it back by 5h30m per edit)',
            changes={'invoice_date': {'old': wrong.isoformat(), 'new': true.isoformat()}}, outlet=inv.outlet,
        )
