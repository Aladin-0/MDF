"""
Pack definition (size / unit / type): one rule, kept in step between product and batches.

Regression for the live bug "a product showed pieces, billing offered Strip and Loose, selling loose
said it could not, and editing the pack details in Inventory did not fix it":
  * the product edit changed only the MasterProduct while billing sells from the Batch's own copy,
  * the server judged 'loose allowed?' on the product while the screen judged it on the batch,
  * a type/unit mix-up could be saved without any complaint.
"""
from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from apps.accounts.tests.factories import OutletFactory
from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.inventory import pack_rules as rules
from apps.inventory.models import Batch, MasterProduct
from apps.inventory.tests.factories import BatchFactory, MasterProductFactory
from apps.inventory.views import serialize_batch, serialize_product


class RuleTests(SimpleTestCase):
    def test_loose_needs_a_countable_pack_of_more_than_one(self):
        self.assertTrue(rules.allows_loose(10, 'strip'))
        self.assertTrue(rules.allows_loose(10, 'Blister'))
        self.assertTrue(rules.allows_loose(12, 'box'))       # box of 12 strips / 10 pieces
        self.assertFalse(rules.allows_loose(1, 'strip'))     # nothing to split
        self.assertFalse(rules.allows_loose(100, 'bottle'))  # 100 means ml, not 100 sellable bottles
        self.assertFalse(rules.allows_loose(30, 'tube'))
        self.assertFalse(rules.allows_loose(None, 'strip'))
        self.assertFalse(rules.allows_loose('abc', 'strip'))

    def test_valid_and_invalid_packs(self):
        self.assertEqual(rules.pack_errors(10, 'Tablet', 'strip'), {})
        self.assertEqual(rules.pack_errors(12, 'Strip', 'box'), {})
        self.assertIn('packSize', rules.pack_errors(0, 'Tablet', 'strip'))
        self.assertIn('packSize', rules.pack_errors('x', 'Tablet', 'strip'))
        self.assertIn('packUnit', rules.pack_errors(10, '  ', 'strip'))
        self.assertIn('packType', rules.pack_errors(10, 'Tablet', 'banana'))

    def test_a_strip_counted_in_pieces_or_bottles_is_the_mixup_and_is_refused(self):
        for unit in ('Piece', 'box', 'Bottle', 'vial', 'tube', 'packet'):
            with self.subTest(unit=unit):
                self.assertIn('packUnit', rules.pack_errors(10, unit, 'strip'))
        # the same unit is perfectly fine under the right type
        self.assertEqual(rules.pack_errors(10, 'Piece', 'box'), {})

    def test_whole_packs_hiding_in_loose_are_folded_back(self):
        self.assertEqual(rules.fold_loose_into_packs(3, 7, 5), (4, 2))
        self.assertEqual(rules.fold_loose_into_packs(3, 4, 5), (3, 4))
        self.assertEqual(rules.fold_loose_into_packs(3, 4, 1), (7, 0))   # size 1 has no loose


class DefinitionApiTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.manager = make_staff(self.outlet, 'manager')
        self.product = MasterProductFactory(pack_size=10, pack_unit='tablet', pack_type='strip')
        self.batch = BatchFactory(outlet=self.outlet, product=self.product, pack_size=10,
                                  pack_unit='tablet', pack_type='strip', qty_strips=5, qty_loose=3)

    def put_product(self, **payload):
        return self.as_user(self.manager).put(f'/api/v1/products/{self.product.id}/', payload, format='json')

    def put_batch(self, **payload):
        return self.as_user(self.manager).put(f'/api/v1/batches/{self.batch.id}/', payload, format='json')

    # ── the bug: product edit must reach the batches billing sells from ──────
    def test_fixing_the_product_pack_fixes_its_batches_too(self):
        # the live state: product and batch both carry the mixed-up pack
        MasterProduct.objects.filter(pk=self.product.pk).update(pack_unit='Piece', pack_type='box', pack_size=10)
        Batch.objects.filter(pk=self.batch.pk).update(pack_unit='Piece', pack_type='box', pack_size=10)

        res = self.put_product(packType='strip', packUnit='Tablet', packSize=10)

        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['batchesUpdated'], 1)
        self.batch.refresh_from_db()
        self.assertEqual((self.batch.pack_type, self.batch.pack_unit), ('strip', 'Tablet'))

    def test_saving_the_product_again_repairs_a_batch_that_drifted_earlier(self):
        # the product was already corrected in a past edit; the batch never followed
        Batch.objects.filter(pk=self.batch.pk).update(pack_unit='Piece', pack_type='box')

        res = self.put_product(packType='strip', packUnit='tablet', packSize=10)  # same values as stored

        self.assertEqual(res.status_code, 200, res.data)
        self.batch.refresh_from_db()
        self.assertEqual((self.batch.pack_type, self.batch.pack_unit), ('strip', 'tablet'))

    def test_changing_the_product_pack_size_reaches_batches_and_refolds_loose(self):
        res = self.put_product(packSize=5)     # 3 loose of 10 stays 3; make it overflow instead:
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.pack_size, 5)
        self.assertEqual((self.batch.qty_strips, self.batch.qty_loose), (5, 3))

        Batch.objects.filter(pk=self.batch.pk).update(qty_loose=7)
        res = self.put_product(packSize=3)
        self.assertEqual(res.status_code, 200, res.data)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.pack_size, 3)
        self.assertEqual((self.batch.qty_strips, self.batch.qty_loose), (7, 1))  # 7 loose of 3 = 2 packs + 1

    def test_a_batch_with_its_own_pack_size_keeps_it_when_the_size_was_not_edited(self):
        Batch.objects.filter(pk=self.batch.pk).update(pack_size=15)
        self.put_product(mrp=55, packSize=10)    # product size unchanged (10 -> 10)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.pack_size, 15)

    def test_other_outlets_batches_of_the_product_follow_too(self):
        other = BatchFactory(outlet=self.other_outlet, product=self.product, pack_unit='tablet', pack_type='strip')
        self.put_product(packType='box', packUnit='Piece', packSize=10)
        other.refresh_from_db()
        self.assertEqual((other.pack_type, other.pack_unit), ('box', 'Piece'))

    # ── a contradictory pack can no longer be saved ──────────────────────────
    def test_product_edit_with_a_mixed_up_pack_is_refused_and_changes_nothing(self):
        res = self.put_product(packType='strip', packUnit='Piece', packSize=10)
        self.assertEqual(res.status_code, 400)
        self.assertIn('packUnit', res.data['errors'])
        self.product.refresh_from_db()
        self.batch.refresh_from_db()
        self.assertEqual((self.product.pack_type, self.product.pack_unit), ('strip', 'tablet'))
        self.assertEqual((self.batch.pack_type, self.batch.pack_unit), ('strip', 'tablet'))

    def test_unknown_pack_type_is_refused(self):
        res = self.put_product(packType='banana')
        self.assertEqual(res.status_code, 400)
        self.assertIn('packType', res.data['errors'])

    def test_unrelated_edit_is_not_blocked_by_an_old_bad_pack(self):
        MasterProduct.objects.filter(pk=self.product.pk).update(pack_unit='Piece', pack_type='strip')
        res = self.put_product(mrp=77)     # no pack field sent
        self.assertEqual(res.status_code, 200, res.data)

    def test_create_product_refuses_a_mixed_up_pack(self):
        res = self.as_user(self.manager).post('/api/v1/products/', {
            'name': 'X', 'hsnCode': '3004', 'packUnit': 'bottle', 'packType': 'strip',
            'packSize': 10, 'mrp': 10, 'gstRate': 12}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('packUnit', res.data['errors'])

    # ── batch level ──────────────────────────────────────────────────────────
    def test_batch_edit_fixes_that_batch_and_validates_the_result(self):
        Batch.objects.filter(pk=self.batch.pk).update(pack_unit='Piece', pack_type='strip')
        self.assertEqual(self.put_batch(packUnit='Tablet').status_code, 200)   # one field fixes the pair
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.pack_unit, 'Tablet')

        bad = self.put_batch(packUnit='Bottle')
        self.assertEqual(bad.status_code, 400)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.pack_unit, 'Tablet')

    def test_batch_pack_size_change_refolds_loose(self):
        Batch.objects.filter(pk=self.batch.pk).update(qty_loose=8)
        self.assertEqual(self.put_batch(packSize=4).status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual((self.batch.qty_strips, self.batch.qty_loose), (7, 0))


class PayloadTests(TestCase):
    def test_the_server_sends_allows_loose_and_does_not_reinterpret_the_type(self):
        outlet = OutletFactory()
        box = BatchFactory(outlet=outlet, pack_size=10, pack_unit='piece', pack_type='box')
        bottle = BatchFactory(outlet=outlet, pack_size=100, pack_unit='ml', pack_type='bottle')
        strip_of_pieces = BatchFactory(outlet=outlet, pack_size=10, pack_unit='Piece', pack_type='strip')

        self.assertTrue(serialize_batch(box)['allowsLoose'])
        self.assertFalse(serialize_batch(bottle)['allowsLoose'])
        # the old code turned this into type "piece"; the type is now exactly what was stored
        self.assertEqual(serialize_batch(strip_of_pieces)['packType'], 'strip')
        self.assertTrue(serialize_product(MasterProductFactory(pack_size=10, pack_type='strip'))['allowsLoose'])

    def test_a_batch_without_its_own_type_uses_the_products(self):
        batch = BatchFactory(outlet=OutletFactory(), pack_size=10, pack_type='',
                             product=MasterProductFactory(pack_type='strip'))
        self.assertTrue(serialize_batch(batch)['allowsLoose'])


class RepairCommandTests(TestCase):
    def setUp(self):
        self.outlet = OutletFactory()
        self.product = MasterProductFactory(pack_size=10, pack_unit='tablet', pack_type='strip')
        self.drifted = BatchFactory(outlet=self.outlet, product=self.product, pack_size=10,
                                    pack_unit='Piece', pack_type='box', qty_strips=2, qty_loose=23)
        self.own_size = BatchFactory(outlet=self.outlet, product=self.product, pack_size=15,
                                     pack_unit='tablet', pack_type='strip', qty_strips=1, qty_loose=2)

    def run_cmd(self, *args):
        out = StringIO()
        call_command('repair_pack_definitions', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_reports_and_changes_nothing(self):
        text = self.run_cmd()
        self.assertIn('DRY RUN', text)
        self.drifted.refresh_from_db()
        self.assertEqual((self.drifted.pack_type, self.drifted.pack_unit, self.drifted.qty_loose), ('box', 'Piece', 23))

    def test_apply_syncs_type_and_unit_and_refolds_loose_but_leaves_a_different_size_alone(self):
        text = self.run_cmd('--apply')
        self.drifted.refresh_from_db()
        self.own_size.refresh_from_db()
        self.assertEqual((self.drifted.pack_type, self.drifted.pack_unit), ('strip', 'tablet'))
        self.assertEqual((self.drifted.qty_strips, self.drifted.qty_loose), (4, 3))     # 23 loose of 10 = 2 packs + 3
        self.assertEqual(self.own_size.pack_size, 15)
        self.assertIn('review by hand): 1', text)
