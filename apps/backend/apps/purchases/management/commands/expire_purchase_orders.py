from django.core.management.base import BaseCommand

from apps.purchases.po_services import expire_overdue


class Command(BaseCommand):
    help = 'Expire Sent purchase orders whose time is up with nothing received (only outlets that enabled the PO automatic rules). Run daily from cron.'

    def handle(self, *args, **options):
        n = expire_overdue()
        self.stdout.write(self.style.SUCCESS(f'Expired {n} purchase order(s).'))
