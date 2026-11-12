"""
Inventory list (/inventory/) and stock adjustment: rules the Inventory page depends on.

Each test pins a bug found while reviewing the Inventory page:
  - an adjustment did not show for up to 2 minutes (cache invalidation called a method this cache lacks),
  - fully expired stock never appeared under "Expiring Soon" and showed no expiry date,
  - the Low Stock filter compared against an unconfigured 0 and matched nothing,
  - an adjustment needs a manager (and a PIN); the permission is now named so the UI can hide the button.
"""
from datetime import date, timedelta

from django.core.cache import cache
from django.urls import reverse

from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.core.permissions import effective_permissions
from apps.inventory.models import OutletProductConfig
from apps.inventory.tests.factories import BatchFactory, MasterProductFactory


class InventoryListBase(AccessControlBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.manager = make_staff(self.outlet, 'manager', pin='4321')
        self.client = self.as_user(self.manager)
        self.today = date.today()

    def stock(self, product, days_to_expiry=400, strips=5, loose=0, **kw):
        return BatchFactory(outlet=self.outlet, product=product, qty_strips=strips, qty_loose=loose,
                            expiry_date=self.today + timedelta(days=days_to_expiry), **kw)

    def listing(self, **params):
        params.setdefault('outletId', str(self.outlet.id))
        res = self.client.get('/api/v1/inventory/', params)
        self.assertEqual(res.status_code, 200, getattr(res, 'data', res))
        return res.data

    def names(self, **params):
        return sorted(p['name'] for p in self.listing(**params)['data'])


class ExpiryTests(InventoryListBase):
    def test_fully_expired_stock_is_listed_as_expiring_and_shows_its_date(self):
        expired = MasterProductFactory(name='Expired Syrup')
        fresh = MasterProductFactory(name='Fresh Tablets')
        self.stock(expired, days_to_expiry=-30)
        self.stock(fresh, days_to_expiry=400)

        data = self.listing(expiringSoon='true')['data']
        self.assertEqual([p['name'] for p in data], ['Expired Syrup'])
        # a real date, not the "none" placeholder, so the page can flag it red
        self.assertEqual(data[0]['nearestExpiry'], (self.today - timedelta(days=30)).isoformat())

    def test_expired_batch_with_no_stock_left_does_not_count(self):
        gone = MasterProductFactory(name='Written Off')
        self.stock(gone, days_to_expiry=-30, strips=0, loose=0)
        self.stock(gone, days_to_expiry=400, strips=5)   # healthy stock keeps it in the inventory
        self.assertEqual(self.names(expiringSoon='true'), [])

    def test_a_product_with_one_expiring_and_one_healthy_batch_shows_the_expiring_date(self):
        mixed = MasterProductFactory(name='Mixed')
        self.stock(mixed, days_to_expiry=45)
        self.stock(mixed, days_to_expiry=500)
        data = self.listing(expiringSoon='true')['data']
        self.assertEqual(data[0]['nearestExpiry'], (self.today + timedelta(days=45)).isoformat())

    def test_the_90_day_window_edges(self):
        inside = MasterProductFactory(name='Inside')
        outside = MasterProductFactory(name='Outside')
        self.stock(inside, days_to_expiry=90)
        self.stock(outside, days_to_expiry=91)
        self.assertEqual(self.names(expiringSoon='true'), ['Inside'])


class LowStockTests(InventoryListBase):
    def test_without_a_configured_minimum_low_means_below_10_like_the_row_flag(self):
        low = MasterProductFactory(name='Few Left')
        plenty = MasterProductFactory(name='Plenty')
        self.stock(low, strips=3)
        self.stock(plenty, strips=40)

        listing = self.listing(lowStock='true')['data']
        self.assertEqual([p['name'] for p in listing], ['Few Left'])
        self.assertTrue(listing[0]['isLowStock'])          # the filter and the flag agree
        everything = {p['name']: p['isLowStock'] for p in self.listing()['data']}
        self.assertEqual(everything, {'Few Left': True, 'Plenty': False})

    def test_a_configured_minimum_wins_over_the_default(self):
        product = MasterProductFactory(name='Configured')
        self.stock(product, strips=15)
        self.assertEqual(self.names(lowStock='true'), [])                 # 15 >= default 10
        OutletProductConfig.objects.create(outlet=self.outlet, product=product, min_qty=20, reorder_qty=50)
        cache.clear()
        self.assertEqual(self.names(lowStock='true'), ['Configured'])     # 15 < its own 20

    def test_loose_units_count_towards_stock(self):
        product = MasterProductFactory(name='Loose Counts', pack_size=10)
        self.stock(product, strips=9, loose=5)       # 9.5 packs: still low (< 10)
        self.stock(product, strips=1, loose=0)       # 10.5 in total: no longer low
        self.assertEqual(self.names(lowStock='true'), [])


class AdjustmentTests(InventoryListBase):
    def adjust(self, batch, qty, user=None, pin='4321', **extra):
        body = {'batchId': str(batch.id), 'type': 'damage', 'qty': qty, 'reason': 'Broken in transit', 'pin': pin, **extra}
        client = self.as_user(user or self.manager)
        return client.post(f'/api/v1/inventory/adjust/?outletId={self.outlet.id}', body, format='json')

    def test_the_list_shows_the_new_stock_immediately_after_an_adjustment(self):
        product = MasterProductFactory(name='Cached')
        batch = self.stock(product, strips=10)
        self.assertEqual(self.listing()['data'][0]['totalStock'], 10)   # now cached for 2 minutes

        self.assertEqual(self.adjust(batch, -4).status_code, 200)

        self.assertEqual(self.listing()['data'][0]['totalStock'], 6)    # not the stale 10

    def test_other_outlets_cache_is_left_alone(self):
        product = MasterProductFactory(name='Elsewhere')
        other_batch = BatchFactory(outlet=self.other_outlet, product=product, qty_strips=7)
        owner = self.as_user(make_staff(self.outlet, 'super_admin'))   # may read both outlets of the organization
        other = owner.get('/api/v1/inventory/', {'outletId': str(self.other_outlet.id)})
        self.assertEqual(other.data['data'][0]['totalStock'], 7)

        mine = self.stock(MasterProductFactory(name='Mine'), strips=10)
        self.assertEqual(self.adjust(mine, -1).status_code, 200)

        from apps.inventory.cache_utils import inventory_cache_version
        self.assertNotEqual(inventory_cache_version(self.outlet.id), inventory_cache_version(self.other_outlet.id))
        self.assertEqual(other_batch.qty_strips, 7)

    def test_loose_adjustment_and_pin_are_required_by_the_api(self):
        batch = self.stock(MasterProductFactory(name='Loose', pack_size=10), strips=3)
        self.assertEqual(self.adjust(batch, 4, adjustUnit='loose').status_code, 200)
        batch.refresh_from_db()
        self.assertEqual((batch.qty_strips, batch.qty_loose), (3, 4))
        self.assertEqual(self.adjust(batch, 1, pin='').status_code, 400)
        self.assertEqual(self.adjust(batch, 1, pin='0000').status_code, 401)

    def test_only_managers_may_adjust_and_the_permission_says_so(self):
        biller = make_staff(self.outlet, 'billing_staff')
        batch = self.stock(MasterProductFactory(name='Guarded'), strips=3)
        self.assertEqual(self.adjust(batch, -1, user=biller).status_code, 403)
        self.assertIn('adjust_stock', effective_permissions(self.manager))
        self.assertNotIn('adjust_stock', effective_permissions(biller))
        self.assertIn('adjust_stock', effective_permissions(make_staff(self.outlet, 'admin')))
