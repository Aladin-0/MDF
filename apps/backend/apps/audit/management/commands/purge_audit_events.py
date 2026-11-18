"""Remove audit rows older than each organisation's retention (default 365 days). Dry run unless --apply. Also runs by itself about once a day."""
from django.core.management.base import BaseCommand

from apps.audit import policy


class Command(BaseCommand):
    help = 'Apply the audit retention (dry run unless --apply)'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **o):
        out = policy.purge(dry_run=not o['apply'])
        verb = 'Removed' if o['apply'] else 'Would remove'
        self.stdout.write(self.style.SUCCESS(f"{verb}: {out['events']} event(s), {out['flags']} flag(s), {out['old_log']} old-table row(s)."))
        if not o['apply']:
            self.stdout.write('Dry run only. Run again with --apply to remove them.')
