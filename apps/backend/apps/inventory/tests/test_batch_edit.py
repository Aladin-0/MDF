"""
Editing a batch (PUT /batches/<id>/) and a product (PUT /products/<id>/): the rules the Quick Edit feature relies on.

Each test pins a bug found when reviewing Quick Edit against live inventory:
  - a sale that committed during an edit had its stock deduction overwritten (the whole row was saved),
  - clearing the expiry crashed with a 500; MRP could be 0; mfg could be after expiry; a batch number could be
    renamed to one that already exists for the product,
  - nobody could tell afterwards who changed a price or a date (no audit),
  - the list and the billing screen's product search kept the OLD price / date for up to 2 minutes / 1 minute,
  - the UI offered editing to people the API refuses (it checked `manage_products`; the API needs manager+).
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache

from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.core.permissions import effective_permissions
from apps.inventory.cache_utils import inventory_cache_version
from apps.inventory.models import Batch
from apps.inventory.tests.factories import BatchFactory, MasterProductFactory


class BatchEditBase(AccessControlBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.manager = make_staff(self.outlet, 'manager')
        self.product = MasterProductFactory(name='Edit Me', pack_size=10, pack_type='strip', pack_unit='tablet')
        self.batch = BatchFactory(
            outlet=self.outlet, product=self.product, batch_no='B100', qty_strips=10, qty_loose=0,
            mrp=Decimal('250.00'), purchase_rate=Decimal('180.00'), landing_rate=Decimal('200.00'),
            expiry_date=date.today() + timedelta(days=400),
        )

    def put(self, user=None, batch=None, **body):
        batch = batch or self.batch
        return self.as_user(user or self.manager).put(f'/api/v1/batches/{batch.id}/', body, format='json')

    def fresh(self):
        self.batch.refresh_from_db()
        return self.batch


class StockSafetyTests(BatchEditBase):
    def test_an_edit_does_not_put_sold_stock_back_on_the_shelf(self):
        """A sale commits between the edit reading the batch and writing it: its deduction must survive."""
        def a_sale_commits_now(*args, **kwargs):
            Batch.objects.filter(pk=self.batch.pk).update(qty_strips=3)   # 7 packs sold meanwhile

        with patch('apps.inventory.views.assert_outlet_access', side_effect=a_sale_commits_now):
            res = self.put(rackLocation='Z9')

        self.assertEqual(res.status_code, 200, res.data)
        batch = self.fresh()
        self.assertEqual(batch.rack_location, 'Z9')
        self.assertEqual(batch.qty_strips, 3)   # it used to be written back as 10

    def test_only_the_changed_fields_are_reported_and_saved(self):
        res = self.put(rackLocation='A1', mrp='250.00')
        self.assertEqual(res.data['changed'], ['rack_location'])      # the unchanged MRP is not "changed"
        self.assertEqual(self.put(rackLocation='A1').data['changed'], [])


class ValidationTests(BatchEditBase):
    def test_clearing_the_expiry_is_a_400_not_a_500(self):
        for bad in (None, '', 'tomorrow', '2026-13-45'):
            with self.subTest(expiry=bad):
                res = self.put(expiryDate=bad)
                self.assertEqual(res.status_code, 400)
                self.assertIn('expiryDate', res.data['errors'])
        self.assertEqual(self.fresh().expiry_date, date.today() + timedelta(days=400))

    def test_mrp_must_be_a_real_positive_price(self):
        for bad in (0, '0', -5, 'abc', None, '123456789012'):
            with self.subTest(mrp=bad):
                res = self.put(mrp=bad)
                self.assertEqual(res.status_code, 400)
                self.assertIn('mrp', res.data['errors'])
        self.assertEqual(self.fresh().mrp, Decimal('250.00'))

    def test_prices_are_rounded_to_paise(self):
        self.put(mrp='250.456', purchaseRate='181.004')
        batch = self.fresh()
        self.assertEqual((batch.mrp, batch.purchase_rate), (Decimal('250.46'), Decimal('181.00')))

    def test_negative_purchase_and_landing_rates_are_refused_but_landing_can_be_cleared(self):
        self.assertEqual(self.put(purchaseRate=-1).status_code, 400)
        self.assertEqual(self.put(landingRate=-1).status_code, 400)
        self.assertEqual(self.put(landingRate=None).status_code, 200)
        self.assertIsNone(self.fresh().landing_rate)

    def test_mfg_date_cannot_be_after_expiry_and_can_be_cleared(self):
        too_late = (date.today() + timedelta(days=500)).isoformat()
        res = self.put(mfgDate=too_late)
        self.assertEqual(res.status_code, 400)
        self.assertIn('mfgDate', res.data['errors'])
        self.assertEqual(self.put(mfgDate=(date.today() - timedelta(days=30)).isoformat()).status_code, 200)
        self.assertEqual(self.put(mfgDate=None).status_code, 200)
        self.assertIsNone(self.fresh().mfg_date)

    def test_moving_the_expiry_before_an_existing_mfg_date_is_refused(self):
        self.put(mfgDate=(date.today() - timedelta(days=10)).isoformat())
        res = self.put(expiryDate=(date.today() - timedelta(days=60)).isoformat())
        self.assertEqual(res.status_code, 400)
        self.assertIn('mfgDate', res.data['errors'])

    def test_a_batch_number_cannot_be_renamed_to_one_that_already_exists_for_the_product(self):
        BatchFactory(outlet=self.outlet, product=self.product, batch_no='Dup-1')
        res = self.put(batchNo='dup-1')
        self.assertEqual(res.status_code, 400)
        self.assertIn('batchNo', res.data['errors'])
        self.assertEqual(self.fresh().batch_no, 'B100')

    def test_the_same_batch_number_is_fine_for_another_product_or_outlet_and_for_itself(self):
        BatchFactory(outlet=self.outlet, product=MasterProductFactory(name='Other'), batch_no='SHARED')
        self.assertEqual(self.put(batchNo='SHARED').status_code, 200)
        self.assertEqual(self.put(batchNo='SHARED').status_code, 200)    # unchanged: not a clash with itself

    def test_a_blank_batch_number_is_refused(self):
        self.assertEqual(self.put(batchNo='  ').status_code, 400)

    def test_a_pack_size_change_refolds_loose_and_reports_the_stock_fields(self):
        Batch.objects.filter(pk=self.batch.pk).update(qty_strips=7, qty_loose=8)
        res = self.put(packSize=4)
        self.assertEqual(res.status_code, 200, res.data)
        batch = self.fresh()
        self.assertEqual((batch.pack_size, batch.qty_strips, batch.qty_loose), (4, 9, 0))   # 8 loose of 4 = 2 packs
        self.assertIn('qty_strips', res.data['changed'])


class AuditTests(BatchEditBase):
    def test_a_price_edit_is_logged_with_who_what_old_and_new(self):
        with patch('apps.inventory.views.log_activity') as log:
            self.put(mrp='260.00')
        log.assert_called_once()
        kwargs = log.call_args.kwargs
        self.assertEqual((kwargs['action'], kwargs['module'], kwargs['entity_type']), ('UPDATE', 'inventory', 'Batch'))
        self.assertEqual(kwargs['user'], self.manager)
        self.assertEqual(kwargs['changes'], {'mrp': {'old': '250.00', 'new': '260.00'}})
        self.assertIn('MRP 250.00 → 260.00', kwargs['description'])
        self.assertIn('B100', kwargs['entity_label'])

    def test_an_edit_that_changes_nothing_is_not_logged(self):
        with patch('apps.inventory.views.log_activity') as log:
            self.put(rackLocation=self.batch.rack_location or '')
        log.assert_not_called()

    def test_a_refused_edit_is_not_logged(self):
        with patch('apps.inventory.views.log_activity') as log:
            self.put(mrp=0)
        log.assert_not_called()

    def test_a_product_edit_is_logged_too(self):
        with patch('apps.inventory.views.log_activity') as log:
            res = self.as_user(self.manager).put(f'/api/v1/products/{self.product.id}/', {'hsnCode': '9999'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        log.assert_called_once()
        self.assertEqual(log.call_args.kwargs['entity_type'], 'Product')
        self.assertEqual(log.call_args.kwargs['changes']['hsn_code']['new'], '9999')

    def test_a_product_edit_that_changes_nothing_is_not_logged(self):
        with patch('apps.inventory.views.log_activity') as log:
            self.as_user(self.manager).put(f'/api/v1/products/{self.product.id}/', {'name': self.product.name}, format='json')
        log.assert_not_called()


class WarningTests(BatchEditBase):
    def test_selling_below_cost_is_allowed_but_warned_about(self):
        res = self.put(mrp='150.00')           # landing is 200
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['warnings']), 1)
        self.assertIn('below the cost', res.data['warnings'][0])

    def test_no_warning_when_the_price_covers_the_cost(self):
        self.assertEqual(self.put(mrp='260.00').data['warnings'], [])


class FreshnessTests(BatchEditBase):
    def test_the_list_shows_the_new_price_immediately(self):
        client = self.as_user(self.manager)
        before = client.get('/api/v1/inventory/', {'outletId': str(self.outlet.id)}).data['data'][0]['batches'][0]['mrp']
        self.assertEqual(before, 250.0)                                   # now cached for 2 minutes
        self.put(mrp='275.00')
        after = client.get('/api/v1/inventory/', {'outletId': str(self.outlet.id)}).data['data'][0]['batches'][0]['mrp']
        self.assertEqual(after, 275.0)

    def test_an_edit_makes_the_billing_search_cache_stale_but_a_no_op_does_not(self):
        key = lambda: inventory_cache_version(self.outlet.id)             # the product search key includes this
        start = key()
        self.put(rackLocation=self.batch.rack_location or '')             # nothing changed
        self.assertEqual(key(), start)
        self.put(rackLocation='NEW-RACK')
        self.assertNotEqual(key(), start)

    def test_billing_product_search_returns_the_new_mrp_straight_after_an_edit(self):
        client = self.as_user(self.manager)
        params = {'q': 'Edit Me', 'outletId': str(self.outlet.id)}
        first = client.get('/api/v1/products/search/', params)
        self.assertEqual(first.status_code, 200, getattr(first, 'data', first))
        self.put(mrp='290.00')
        second = client.get('/api/v1/products/search/', params)
        batches = [b for p in second.data['data'] for b in p['batches']]
        self.assertEqual([b['mrp'] for b in batches], [290.0])            # not the cached 250


class PermissionTests(BatchEditBase):
    def test_only_managers_and_above_may_edit_and_the_permission_says_so(self):
        biller = make_staff(self.outlet, 'billing_staff', can_create_purchases=True)   # has manage_products, still no edit
        self.assertEqual(self.put(user=biller, mrp='260').status_code, 403)
        self.assertEqual(self.put(user=self.manager, mrp='260').status_code, 200)
        self.assertIn('edit_inventory', effective_permissions(self.manager))
        self.assertIn('manage_products', effective_permissions(biller))
        self.assertNotIn('edit_inventory', effective_permissions(biller))
        self.assertNotIn('edit_inventory', effective_permissions(make_staff(self.outlet, 'view_only')))
        self.assertIn('edit_inventory', effective_permissions(make_staff(self.outlet, 'admin')))

    def test_another_outlets_batch_cannot_be_edited(self):
        foreign = BatchFactory(outlet=self.foreign_outlet, product=self.product, batch_no='F1')
        self.assertEqual(self.put(batch=foreign, mrp='260').status_code, 403)
        foreign.refresh_from_db()
        self.assertNotEqual(foreign.mrp, Decimal('260'))
