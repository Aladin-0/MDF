import uuid
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.billing.sale_services import atomic_sale_save
from apps.billing.payment_services import create_sales_return
from apps.billing.tests.factories import make_test_outlet, make_test_staff, make_test_customer
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem

class StripMathTestCase(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.outlet = make_test_outlet('Math Pharmacy')
        cls.staff = make_test_staff(cls.outlet, name='Math Staff')
        cls.customer = make_test_customer(cls.outlet, name='Math Customer')
        cls.variants = [{'pack_type': 'bottle', 'pack_unit': 'bottle', 'pack_size': 1}, {'pack_type': 'strip', 'pack_unit': 'tablet', 'pack_size': 5}, {'pack_type': 'strip', 'pack_unit': 'capsule', 'pack_size': 10}, {'pack_type': 'box', 'pack_unit': 'sachet', 'pack_size': 15}, {'pack_type': 'strip', 'pack_unit': 'tablet', 'pack_size': 24}]
        cls.products = []
        cls.batches = []
        for i, v in enumerate(cls.variants):
            prod = MasterProduct.objects.create(name=f'Test Prod {i} - size {v['pack_size']}', drug_type='allopathy', schedule_type='OTC', pack_size=v['pack_size'], pack_unit=v['pack_unit'], pack_type=v['pack_type'], mrp=Decimal('100.00'))
            cls.products.append(prod)
            batch = Batch.objects.create(outlet=cls.outlet, product=prod, batch_no=f'B-{uuid.uuid4().hex[:6]}', expiry_date=timezone.now().date() + timezone.timedelta(days=365), mrp=Decimal('100.00'), purchase_rate=Decimal('70.00'), pack_size=v['pack_size'], pack_type=v['pack_type'], qty_strips=10, qty_loose=0)
            cls.batches.append(batch)
            StockLedger.objects.create(outlet=cls.outlet, product=prod, batch=batch, txn_type='PURCHASE_IN', txn_date=timezone.now().date(), voucher_type='Purchase Invoice', voucher_number='TEST-OPENING', party_name='Test Supplier', qty_in=10, qty_out=0, rate=Decimal('70.00'), value_in=10 * Decimal('70.00'), value_out=0, running_qty=10, running_value=10 * Decimal('70.00'))

    def refresh_batches(self):
        for batch in self.batches:
            batch.refresh_from_db()

    def get_stock(self, idx):
        self.batches[idx].refresh_from_db()
        return (self.batches[idx].qty_strips, self.batches[idx].qty_loose)

    def assert_ledger_parity(self, batch):
        ledgers = StockLedger.objects.filter(batch=batch)
        total_in = sum((l.qty_in for l in ledgers))
        total_out = sum((l.qty_out for l in ledgers))
        expected_total_strips = float(total_in - total_out)
        batch.refresh_from_db()
        actual_total_strips = batch.qty_strips + batch.qty_loose / float(batch.pack_size or 1)
        self.assertAlmostEqual(expected_total_strips, actual_total_strips, places=3)

    def test_borrow_logic_exact_loose(self):
        """Test borrow logic with exact loose quantities"""
        idx = 2
        batch = self.batches[idx]
        request_data = {'grandTotal': '27.00', 'cashPaid': '27.00'}
        items_data = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 0, 'qtyLoose': 3, 'scheduleType': 'OTC'}]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 9)
        self.assertEqual(l, 7)
        self.assert_ledger_parity(batch)

    def test_borrow_logic_spanning_multiple_strips(self):
        """Test borrow logic where loose quantity spans multiple strips"""
        idx = 1
        batch = self.batches[idx]
        request_data = {'grandTotal': '216.00', 'cashPaid': '216.00'}
        items_data = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 0, 'qtyLoose': 12, 'scheduleType': 'OTC'}]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 7)
        self.assertEqual(l, 3)
        self.assert_ledger_parity(batch)

    def test_borrow_logic_edge_cases_pack_boundaries(self):
        """Test exact pack size boundaries (e.g. buying exactly one pack size in loose)"""
        idx = 1
        batch = self.batches[idx]
        request_data = {'grandTotal': '90.00', 'cashPaid': '90.00'}
        items_data = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 0, 'qtyLoose': 5, 'scheduleType': 'OTC'}]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 9)
        self.assertEqual(l, 0)
        self.assert_ledger_parity(batch)

    def test_rollup_logic_small_returns(self):
        """Test returning a small number of loose items"""
        idx = 4
        batch = self.batches[idx]
        request_data = {'grandTotal': '100.00', 'cashPaid': '100.00'}
        items_data = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 1, 'qtyLoose': 5, 'scheduleType': 'OTC'}]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 19)
        self.assert_ledger_parity(batch)
        sale_item = SaleItem.objects.get(invoice=invoice)
        payload = {'originalSaleId': str(invoice.id), 'returnDate': timezone.now().isoformat(), 'refundMode': 'cash', 'items': [{'saleItemId': str(sale_item.id), 'batchId': str(batch.id), 'qtyReturned': 3, 'returnRate': '3.75'}]}
        create_sales_return(payload, str(self.outlet.id), str(self.staff.id))
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 22)
        self.assert_ledger_parity(batch)

    def test_rollup_logic_large_returns(self):
        """Test returning enough loose units to roll up multiple packs"""
        idx = 1
        batch = self.batches[idx]
        request_data = {'grandTotal': '360.00', 'cashPaid': '360.00'}
        items_data = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 4, 'qtyLoose': 0, 'scheduleType': 'OTC'}]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 6)
        self.assertEqual(l, 0)
        sale_item = SaleItem.objects.get(invoice=invoice)
        payload = {'originalSaleId': str(invoice.id), 'returnDate': timezone.now().isoformat(), 'refundMode': 'cash', 'items': [{'saleItemId': str(sale_item.id), 'batchId': str(batch.id), 'qtyReturned': 13, 'returnRate': '18.00'}]}
        create_sales_return(payload, str(self.outlet.id), str(self.staff.id))
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 3)
        self.assert_ledger_parity(batch)

    def test_chained_flows(self):
        """Test Purchase -> Sale -> Return chains for total stock and ledger parity"""
        idx = 2
        batch = self.batches[idx]
        request_data1 = {'grandTotal': '207.00', 'cashPaid': '207.00'}
        items_data1 = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 2, 'qtyLoose': 3, 'scheduleType': 'OTC'}]
        inv1 = atomic_sale_save(request_data1, self.outlet, self.customer, self.staff, items_data1, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 7)
        self.assertEqual(l, 7)
        self.assert_ledger_parity(batch)
        request_data2 = {'grandTotal': '72.00', 'cashPaid': '72.00'}
        items_data2 = [{'productId': self.products[idx].id, 'batchId': batch.id, 'qtyStrips': 0, 'qtyLoose': 8, 'scheduleType': 'OTC'}]
        inv2 = atomic_sale_save(request_data2, self.outlet, self.customer, self.staff, items_data2, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 6)
        self.assertEqual(l, 9)
        self.assert_ledger_parity(batch)
        si1 = SaleItem.objects.get(invoice=inv1)
        payload1 = {'originalSaleId': str(inv1.id), 'returnDate': timezone.now().isoformat(), 'refundMode': 'cash', 'items': [{'saleItemId': str(si1.id), 'batchId': str(batch.id), 'qtyReturned': 14, 'returnRate': '9.00'}]}
        create_sales_return(payload1, str(self.outlet.id), str(self.staff.id))
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 3)
        self.assert_ledger_parity(batch)
        si2 = SaleItem.objects.get(invoice=inv2)
        payload2 = {'originalSaleId': str(inv2.id), 'returnDate': timezone.now().isoformat(), 'refundMode': 'cash', 'items': [{'saleItemId': str(si2.id), 'batchId': str(batch.id), 'qtyReturned': 8, 'returnRate': '9.00'}]}
        create_sales_return(payload2, str(self.outlet.id), str(self.staff.id))
        s, l = self.get_stock(idx)
        self.assertEqual(s, 9)
        self.assertEqual(l, 1)
        self.assert_ledger_parity(batch)