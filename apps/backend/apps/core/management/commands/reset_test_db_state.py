from django.core.management.base import BaseCommand
from django.core.management import call_command

class Command(BaseCommand):
    help = 'Resets the database and seeds initial state using factories for E2E testing'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING("Flushing database..."))
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('''
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT IN ('django_migrations', 'django_content_type')) LOOP
                        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            ''')
        
        self.stdout.write(self.style.SUCCESS("Database flushed. Seeding new data..."))

        from apps.accounts.tests.factories import OutletFactory, StaffFactory
        from apps.inventory.tests.factories import MasterProductFactory, BatchFactory

        outlet = OutletFactory()
        call_command('seed_ledgers', outlet=str(outlet.id))

        admin = StaffFactory(outlet=outlet, role='admin', phone='9876543210')
        admin.set_password('password123')
        from django.contrib.auth.hashers import make_password
        admin.staff_pin = make_password('1234')
        admin.save()
        
        from apps.accounts.models import Ledger, LedgerGroup
        sundry_creditors, _ = LedgerGroup.objects.get_or_create(outlet=outlet, name='Sundry Creditors', defaults={'nature': 'liability'})
        Ledger.objects.create(outlet=outlet, name="test supplier", group=sundry_creditors, is_system=False)

        test_product = MasterProductFactory(name="test medicine")
        BatchFactory(outlet=outlet, product=test_product)
        for i in range(4):
            product = MasterProductFactory()
            BatchFactory(outlet=outlet, product=product)

        self.stdout.write(self.style.SUCCESS("Successfully seeded baseline state for Playwright E2E tests!"))
