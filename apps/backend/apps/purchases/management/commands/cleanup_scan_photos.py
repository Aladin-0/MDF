from django.core.management.base import BaseCommand

from apps.purchases.scan_cleanup import cleanup_scan_photos, draft_ttl_days, ttl_hours


class Command(BaseCommand):
    help = ('Delete scanned bill photos older than OCR_SCAN_PHOTO_TTL_HOURS (default 24 h) and scan drafts '
            'not saved within OCR_DRAFT_TTL_DAYS (default 3 days). Saved purchases are never touched.')

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only report what would be deleted.')
        parser.add_argument('--include-old', action='store_true',
                            help='Also delete photos scanned before scan times were recorded (uses created_at).')

    def handle(self, *args, **opts):
        stats = cleanup_scan_photos(include_old=opts['include_old'], dry_run=opts['dry_run'])
        verb = 'Would delete' if opts['dry_run'] else 'Deleted'
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {stats['drafts']} unsaved draft(s) older than {draft_ttl_days():g} days, "
            f"{stats['invoices']} scan photo(s) and {stats['pages']} extra page(s) "
            f"older than {ttl_hours():g} h ({stats['bytes'] / 1e6:.1f} MB)."))
