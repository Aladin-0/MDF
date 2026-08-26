from django.core.management.base import BaseCommand
from django.core.management import call_command

class Command(BaseCommand):
    help = 'Resets the database and seeds initial state using factories for E2E testing'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING('Flushing database...'))
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("\n                DO $$ DECLARE\n                    r RECORD;\n                BEGIN\n                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT IN ('django_migrations', 'django_content_type')) LOOP\n                        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';\n                    END LOOP;\n                END $$;\n            ")
        self.stdout.write(self.style.SUCCESS('Database flushed. Seeding new data...'))
        from apps.accounts.tests.factories import OutletFactory, StaffFactory
        from apps.inventory.tests.factories import MasterProductFactory, BatchFactory, StockLedgerFactory
        from django.utils import timezone
        
        # Keep existing stuff
        call_command('flush', '--no-input')
        outlet = OutletFactory()
        call_command('seed_ledgers', outlet=str(outlet.id))
        admin = StaffFactory(outlet=outlet, role='admin', phone='9876543210', is_superuser=True)
        admin.set_password('password123')
        from django.contrib.auth.hashers import make_password
        admin.staff_pin = make_password('1234')
        admin.save()
        from apps.accounts.models import Ledger, LedgerGroup
        sundry_creditors, _ = LedgerGroup.objects.get_or_create(outlet=outlet, name='Sundry Creditors', defaults={'nature': 'liability'})
        Ledger.objects.create(outlet=outlet, name='test supplier', group=sundry_creditors, is_system=False)
        
        test_product = MasterProductFactory(name='test medicine')
        tb = BatchFactory(outlet=outlet, product=test_product, qty_strips=1000)
        StockLedgerFactory(outlet=outlet, product=test_product, batch=tb, qty_in=1000, running_qty=1000)
        
        test_h1_product = MasterProductFactory(name='test schedule h1', schedule_type='H1')
        tb_h1 = BatchFactory(outlet=outlet, product=test_h1_product, qty_strips=1000)
        StockLedgerFactory(outlet=outlet, product=test_h1_product, batch=tb_h1, qty_in=1000, running_qty=1000)
        
        for i in range(4):
            product = MasterProductFactory()
            b = BatchFactory(outlet=outlet, product=product)
            StockLedgerFactory(outlet=outlet, product=product, batch=b, qty_in=10, running_qty=10)
            
        call_command('seed_gst_e2e_data', outlet_id=str(outlet.id))
            
        self.stdout.write(self.style.SUCCESS('Successfully seeded baseline state for Playwright E2E tests!'))