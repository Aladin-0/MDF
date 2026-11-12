"""
Stock valuation (GET /reports/inventory/valuation/) as the Inventory page uses it.

Pinned problems:
  - the page downloaded every product and batch (~580 KB) to read three totals and a batch count,
  - a batch holding only loose units was left out of the value,
  - the answer was cached for 10 minutes and nothing refreshed it, so the Stock Value card stayed stale
    after an edit or a stock adjustment.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache

from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.inventory.tests.factories import BatchFactory, MasterProductFactory

URL = '/api/v1/reports/inventory/valuation/'


class ValuationBase(AccessControlBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.manager = make_staff(self.outlet, 'manager', pin='4321')
        self.client = self.as_user(self.manager)
        soon = date.today() + timedelta(days=300)
        a = MasterProductFactory(name='A', pack_size=10)
        b = MasterProductFactory(name='B', pack_size=10)
        # 2.5 packs, 4 packs, loose-only (0.5 pack), and an empty batch that must not count
        self.b1 = BatchFactory(outlet=self.outlet, product=a, qty_strips=2, qty_loose=5, pack_size=10, purchase_rate=Decimal('100'), landing_rate=Decimal('110'), mrp=Decimal('150'), expiry_date=soon)
        self.b2 = BatchFactory(outlet=self.outlet, product=a, qty_strips=4, qty_loose=0, pack_size=10, purchase_rate=Decimal('50'), landing_rate=None, mrp=Decimal('80'), expiry_date=soon)
        self.b3 = BatchFactory(outlet=self.outlet, product=b, qty_strips=0, qty_loose=5, pack_size=10, purchase_rate=Decimal('200'), landing_rate=Decimal('210'), mrp=Decimal('300'), expiry_date=soon)
        BatchFactory(outlet=self.outlet, product=b, qty_strips=0, qty_loose=0, purchase_rate=Decimal('999'), mrp=Decimal('999'), expiry_date=soon)

    def get(self, **params):
        params.setdefault('outletId', str(self.outlet.id))
        res = self.client.get(URL, params)
        self.assertEqual(res.status_code, 200, getattr(res, 'data', res))
        return res.data['data']


class SummaryTests(ValuationBase):
    def test_the_summary_totals_are_right_and_count_loose_only_batches(self):
        data = self.get(summary='true')
        # purchase: 2.5x100 + 4x50 + 0.5x200 = 250 + 200 + 100 = 550
        # landing:  2.5x110 + 4x50(no landing: purchase) + 0.5x210 = 275 + 200 + 105 = 580
        # mrp:      2.5x150 + 4x80 + 0.5x300 = 375 + 320 + 150 = 845
        self.assertEqual(data['total_value_purchase'], 550.0)
        self.assertEqual(data['total_value_landing'], 580.0)
        self.assertEqual(data['total_value_mrp'], 845.0)
        self.assertEqual(data['activeBatches'], 3)        # the empty batch is not active stock
        self.assertEqual(data['totalProducts'], 2)

    def test_the_summary_agrees_exactly_with_the_full_report(self):
        summary = self.get(summary='true')
        full = self.get()
        for key in ('total_value_purchase', 'total_value_landing', 'total_value_mrp', 'totalProducts'):
            self.assertEqual(summary[key], full[key], key)
        self.assertEqual(summary['activeBatches'], sum(len(p['batches']) for p in full['products']))

    def test_the_summary_is_tiny_and_has_no_product_list(self):
        res = self.client.get(URL, {'outletId': str(self.outlet.id), 'summary': 'true'})
        self.assertNotIn('products', res.data['data'])
        self.assertLess(len(res.content), 700)

    def test_other_outlets_stock_is_not_counted(self):
        BatchFactory(outlet=self.other_outlet, product=MasterProductFactory(), qty_strips=100, purchase_rate=Decimal('1000'))
        self.assertEqual(self.get(summary='true')['total_value_purchase'], 550.0)

    def test_an_outlet_with_no_stock_is_all_zeros_not_an_error(self):
        owner = self.as_user(make_staff(self.outlet, 'super_admin'))   # may read both outlets of the organization
        data = owner.get(URL, {'outletId': str(self.other_outlet.id), 'summary': 'true'})
        self.assertEqual(data.status_code, 200)
        self.assertEqual((data.data['data']['total_value_purchase'], data.data['data']['activeBatches']), (0.0, 0))


class FreshnessTests(ValuationBase):
    def test_a_price_edit_shows_in_the_stock_value_straight_away(self):
        self.assertEqual(self.get(summary='true')['total_value_mrp'], 845.0)   # now cached
        res = self.client.put(f'/api/v1/batches/{self.b2.id}/', {'mrp': '100.00'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.get(summary='true')['total_value_mrp'], 925.0)   # 4 packs went from 80 to 100

    def test_a_stock_adjustment_shows_in_the_stock_value_straight_away(self):
        self.assertEqual(self.get(summary='true')['total_value_purchase'], 550.0)
        res = self.client.post(
            f'/api/v1/inventory/adjust/?outletId={self.outlet.id}',
            {'batchId': str(self.b2.id), 'type': 'damage', 'qty': -2, 'reason': 'Broken', 'pin': '4321'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.get(summary='true')['total_value_purchase'], 450.0)   # 2 packs less at 50
        self.assertEqual(self.get()['total_value_purchase'], 450.0)                 # the full report too

    def test_billing_staff_can_still_read_it(self):
        biller = make_staff(self.outlet, 'billing_staff')
        res = self.as_user(biller).get(URL, {'outletId': str(self.outlet.id), 'summary': 'true'})
        self.assertEqual(res.status_code, 200)
