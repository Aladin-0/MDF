from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.accounts.models import Staff
from apps.core.permissions import ALL_ROLES, ROLE_ALIASES


class Command(BaseCommand):
    help = (
        "Rewrite legacy staff role strings ('custom', 'cashier') to 'billing_staff' and report any "
        "other unknown roles. Dry run unless --apply is given. Per-user permission flags are untouched."
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually write the changes')

    def handle(self, *args, **options):
        counts = dict(Staff.objects.values_list('role').annotate(n=Count('id')))
        self.stdout.write(f'Staff by role: {counts}')

        legacy = Staff.objects.filter(role__in=list(ROLE_ALIASES))
        for staff in legacy:
            self.stdout.write(f'  {staff.name} ({staff.phone}): {staff.role} -> {ROLE_ALIASES[staff.role]}')

        unknown = Staff.objects.exclude(role__in=list(ALL_ROLES) + list(ROLE_ALIASES))
        for staff in unknown:
            self.stdout.write(self.style.WARNING(
                f'  UNKNOWN ROLE {staff.role!r}: {staff.name} ({staff.phone}) has NO permissions: fix this by hand'))

        if not options['apply']:
            self.stdout.write(self.style.NOTICE(f'Dry run: {legacy.count()} row(s) would change. Re-run with --apply.'))
            return
        changed = 0
        for old, new in ROLE_ALIASES.items():
            changed += Staff.objects.filter(role=old).update(role=new)
        self.stdout.write(self.style.SUCCESS(f'Updated {changed} row(s).'))
