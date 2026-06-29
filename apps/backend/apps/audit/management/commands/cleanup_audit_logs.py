from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.audit.models import ActivityLog
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Deletes audit logs older than a specified number of days (Retention Policy Hook)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=365,
            help='Number of days to retain logs (default: 365)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']

        cutoff_date = timezone.now() - timedelta(days=days)
        old_logs = ActivityLog.objects.filter(timestamp__lt=cutoff_date)
        
        count = old_logs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS('No audit logs to delete.'))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING(f'[DRY-RUN] Would delete {count} audit logs older than {cutoff_date}.'))
        else:
            old_logs.delete()
            msg = f'Successfully deleted {count} audit logs older than {cutoff_date}.'
            self.stdout.write(self.style.SUCCESS(msg))
            logger.info(msg)
