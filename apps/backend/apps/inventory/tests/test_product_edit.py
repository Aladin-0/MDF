"""
Editing a product: every fact shown on the product page can be changed, whatever its GST rate.

The bug: a product at GST 40% could not be saved at all. The form re-sends the rate on every save, the server refused any
rate that was not an "active slab", so its salt, maker or anything else could not be corrected either. And the Type
(Allopathy / Ayurveda / General ...) had no field: it was rewritten from the schedule on every save.
"""
from decimal import Decimal

from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.inventory.models import MasterProduct
from apps.inventory.tests.factories import MasterProductFactory

D = Decimal


class ProductEditTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.manager = make_staff(self.outlet, 'manager')
        self.product = MasterProductFactory(name='ENERZAL ZERO ORANGE', composition='.', manufacturer='FDC PHARMA LTD', hsn_code='2202',
                                            gst_rate=D('40'), pack_size=1, pack_unit='Piece', pack_type='piece',
                                            drug_type='allopathy', schedule_type='OTC', mrp=D('81'))

    def put(self, **payload):
        return self.as_user(self.manager).put(f'/api/v1/products/{self.product.id}/', payload, format='json')

    def test_a_40_percent_product_can_be_edited_like_any_other(self):
        """What the Edit Product form sends: every field, the unchanged 40% included."""
        r = self.put(name='ENERZAL ZERO ORANGE', composition='Electrolytes + Dextrose', manufacturer='FDC LTD', hsnCode='22029990',
                     gstRate=40, packSize=1, packUnit='Piece', packType='piece', scheduleType='OTC', drugType='general', mrp=85)
        self.assertEqual(r.status_code, 200, r.content)
        self.product.refresh_from_db()
        self.assertEqual((self.product.composition, self.product.manufacturer, self.product.hsn_code, self.product.gst_rate, self.product.mrp),
                         ('Electrolytes + Dextrose', 'FDC LTD', '22029990', D('40.00'), D('85.00')))
        self.assertEqual(self.product.drug_type, 'general')

    def test_the_rate_can_be_set_to_any_possible_value_and_only_those(self):
        for rate in (40, 28, 12, 3, 0, '0.25'):
            self.assertEqual(self.put(gstRate=rate).status_code, 200, rate)
        self.product.refresh_from_db()
        self.assertEqual(self.product.gst_rate, D('0.25'))
        for bad in (-1, 101, 'forty', None):
            r = self.put(gstRate=bad)
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('gstRate', r.data['errors'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.gst_rate, D('0.25'))               # a refused save changes nothing

    def test_the_type_is_a_field_of_its_own(self):
        self.assertEqual(self.put(drugType='general').status_code, 200)
        self.assertEqual(self.put(scheduleType='OTC', name='ENERZAL ZERO ORANGE').status_code, 200)   # any later save, schedule unchanged
        self.product.refresh_from_db()
        self.assertEqual(self.product.drug_type, 'general')                                           # no longer reset to allopathy

        r = self.put(drugType='magic')
        self.assertEqual(r.status_code, 400)
        self.assertIn('drugType', r.data['errors'])

    def test_changing_the_schedule_still_suggests_the_usual_type_when_none_is_sent(self):
        self.assertEqual(self.put(scheduleType='Ayurvedic').status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual((self.product.schedule_type, self.product.drug_type), ('Ayurvedic', 'ayurveda'))
        self.assertEqual(self.put(scheduleType='H', drugType='homeo').status_code, 200)                # an explicit choice wins
        self.product.refresh_from_db()
        self.assertEqual((self.product.schedule_type, self.product.drug_type), ('H', 'homeo'))

    def test_every_type_the_screen_offers_is_accepted(self):
        for value, _label in MasterProduct.DRUG_TYPE_CHOICES:
            self.assertEqual(self.put(drugType=value).status_code, 200, value)

    def test_a_new_product_can_be_created_at_40_percent_with_a_type(self):
        r = self.as_user(self.manager).post('/api/v1/products/', {
            'name': 'RED BULL 250ML', 'hsnCode': '22029990', 'gstRate': 40, 'packSize': 1, 'packUnit': 'Piece', 'packType': 'piece',
            'scheduleType': 'OTC', 'drugType': 'general', 'mrp': 125}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data['gstRate'], r.data['drugType']), (40.0, 'general'))
