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
        cls.outlet = make_test_outlet("Math Pharmacy")
        cls.staff = make_test_staff(cls.outlet, name="Math Staff")
        cls.customer = make_test_customer(cls.outlet, name="Math Customer")
        
        # 1. Multiple MasterProduct configs with pack_size variants
        cls.variants = [
            {'pack_type': 'bottle', 'pack_unit': 'bottle', 'pack_size': 1},
            {'pack_type': 'strip', 'pack_unit': 'tablet', 'pack_size': 5},
            {'pack_type': 'strip', 'pack_unit': 'capsule', 'pack_size': 10},
            {'pack_type': 'box', 'pack_unit': 'sachet', 'pack_size': 15},
            {'pack_type': 'strip', 'pack_unit': 'tablet', 'pack_size': 24},
        ]
        
        cls.products = []
        cls.batches = []
        for i, v in enumerate(cls.variants):
            prod = MasterProduct.objects.create(
                name=f"Test Prod {i} - size {v['pack_size']}",
                drug_type='allopathy',
                schedule_type='OTC',
                pack_size=v['pack_size'],
                pack_unit=v['pack_unit'],
                pack_type=v['pack_type'],
                mrp=Decimal('100.00'),
                default_sale_rate=Decimal('90.00')
            )
            cls.products.append(prod)
            
            # Start each batch with 10 strips/boxes/bottles and 0 loose
            batch = Batch.objects.create(
                outlet=cls.outlet,
                product=prod,
                batch_no=f"B-{uuid.uuid4().hex[:6]}",
                expiry_date=timezone.now().date() + timezone.timedelta(days=365),
                mrp=Decimal('100.00'),
                purchase_rate=Decimal('70.00'),
                sale_rate=Decimal('90.00'),
                pack_size=v['pack_size'],
                pack_type=v['pack_type'],
                qty_strips=10,
                qty_loose=0
            )
            cls.batches.append(batch)
            
            StockLedger.objects.create(
                outlet=cls.outlet,
                product=prod,
                batch=batch,
                txn_type='PURCHASE_IN',
                txn_date=timezone.now().date(),
                voucher_type='Purchase Invoice',
                voucher_number='TEST-OPENING',
                party_name='Test Supplier',
                qty_in=10,
                qty_out=0,
                rate=Decimal('70.00'),
                value_in=10 * Decimal('70.00'),
                value_out=0,
                running_qty=10,
                running_value=10 * Decimal('70.00')
            )

    def refresh_batches(self):
        for batch in self.batches:
            batch.refresh_from_db()

    def get_stock(self, idx):
        self.batches[idx].refresh_from_db()
        return self.batches[idx].qty_strips, self.batches[idx].qty_loose

    def assert_ledger_parity(self, batch):
        # We assert that the ledger running quantity makes sense, or at least that 
        # the total stock equals PURCHASE_IN - SALE_OUT + SALE_RETURN (in strips + loose fractional)
        ledgers = StockLedger.objects.filter(batch=batch)
        total_in = sum(l.qty_in for l in ledgers)
        total_out = sum(l.qty_out for l in ledgers)
        expected_total_strips = float(total_in - total_out)
        
        batch.refresh_from_db()
        actual_total_strips = batch.qty_strips + (batch.qty_loose / float(batch.pack_size or 1))
        
        # Due to float / decimal precision in tests, we check almost equal
        self.assertAlmostEqual(expected_total_strips, actual_total_strips, places=3)

    def test_borrow_logic_exact_loose(self):
        """Test borrow logic with exact loose quantities"""
        # product 2: pack_size = 10. initial: 10 strips, 0 loose.
        idx = 2
        batch = self.batches[idx]
        
        request_data = {'grandTotal': '27.00', 'cashPaid': '27.00'}
        items_data = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 0,
            'qtyLoose': 3,
            'scheduleType': 'OTC'
        }]
        
        invoice = atomic_sale_save(
            request_data, self.outlet, self.customer, self.staff, items_data, {}, '', ''
        )
        
        s, l = self.get_stock(idx)
        # borrowed 1 strip (10 loose). sold 3 loose. remaining: 9 strips, 7 loose.
        self.assertEqual(s, 9)
        self.assertEqual(l, 7)
        self.assert_ledger_parity(batch)

    def test_borrow_logic_spanning_multiple_strips(self):
        """Test borrow logic where loose quantity spans multiple strips"""
        # product 1: pack_size = 5. initial: 10 strips, 0 loose.
        idx = 1
        batch = self.batches[idx]
        
        # We want to buy 12 loose. (Spans 3 strips). 3 strips = 15 loose. 15 - 12 = 3 loose left.
        # Should borrow 3 strips. Remaining: 7 strips, 3 loose.
        request_data = {'grandTotal': '216.00', 'cashPaid': '216.00'} # arbitrary
        items_data = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 0,
            'qtyLoose': 12,
            'scheduleType': 'OTC'
        }]
        
        invoice = atomic_sale_save(
            request_data, self.outlet, self.customer, self.staff, items_data, {}, '', ''
        )
        
        s, l = self.get_stock(idx)
        self.assertEqual(s, 7)
        self.assertEqual(l, 3)
        self.assert_ledger_parity(batch)

    def test_borrow_logic_edge_cases_pack_boundaries(self):
        """Test exact pack size boundaries (e.g. buying exactly one pack size in loose)"""
        # product 3: pack_size = 15. initial: 10 strips, 0 loose.
        idx = 3
        batch = self.batches[idx]
        
        # Buy exactly 15 loose (which equals 1 pack).
        # Depending on the logic, it might borrow 1 strip -> 15 loose, then subtract 15 loose -> 0 loose.
        # So 9 strips, 0 loose.
        request_data = {'grandTotal': '90.00', 'cashPaid': '90.00'}
        items_data = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 0,
            'qtyLoose': 15,
            'scheduleType': 'OTC'
        }]
        
        invoice = atomic_sale_save(
            request_data, self.outlet, self.customer, self.staff, items_data, {}, '', ''
        )
        
        s, l = self.get_stock(idx)
        # Assuming the system normalizes loose >= pack_size to strips, or just leaves it if it borrows 1.
        # Wait, if you need 15 loose, it borrows math.ceil(15/15) = 1 strip = 15 loose. 15 - 15 = 0.
        # Left: 9 strips, 0 loose.
        self.assertEqual(s, 9)
        self.assertEqual(l, 0)
        self.assert_ledger_parity(batch)

    def test_rollup_logic_small_returns(self):
        """Test returning a small number of loose items"""
        idx = 4 # pack_size = 24.
        batch = self.batches[idx]
        
        # First sell 1 strip and 5 loose. (Total sold: 29 loose).
        request_data = {'grandTotal': '100.00', 'cashPaid': '100.00'}
        items_data = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 1,
            'qtyLoose': 5,
            'scheduleType': 'OTC'
        }]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        
        s, l = self.get_stock(idx)
        # started 10 strips, 0 loose.
        # sell 1 strip -> 9 strips. sell 5 loose -> borrow 1 strip (24 loose), 24 - 5 = 19 loose.
        # so remaining: 8 strips, 19 loose.
        self.assertEqual(s, 8)
        self.assertEqual(l, 19)
        self.assert_ledger_parity(batch)
        
        # Now return 3 loose.
        # loose goes from 19 -> 22. (Still under 24, so no rollup).
        sale_item = SaleItem.objects.get(invoice=invoice)
        payload = {
            'originalSaleId': str(invoice.id),
            'returnDate': timezone.now().isoformat(),
            'refundMode': 'cash',
            'items': [{
                'saleItemId': str(sale_item.id),
                'batchId': str(batch.id),
                'qtyReturned': 3,
                'returnRate': '3.75' # 90 / 24
            }]
        }
        create_sales_return(payload, str(self.outlet.id), str(self.staff.id))
        
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 22)
        self.assert_ledger_parity(batch)

    def test_rollup_logic_large_returns(self):
        """Test returning enough loose units to roll up multiple packs"""
        idx = 1 # pack_size = 5
        batch = self.batches[idx]
        
        # First, sell 4 strips (20 units).
        request_data = {'grandTotal': '360.00', 'cashPaid': '360.00'}
        items_data = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 4,
            'qtyLoose': 0,
            'scheduleType': 'OTC'
        }]
        invoice = atomic_sale_save(request_data, self.outlet, self.customer, self.staff, items_data, {}, '', '')
        
        s, l = self.get_stock(idx)
        self.assertEqual(s, 6)
        self.assertEqual(l, 0)
        
        # Now return 13 loose. (pack_size = 5)
        # The stock loose goes from 0 -> 13.
        # Since 13 >= 5, rolls up: 13 // 5 = 2 strips, 3 loose left.
        # strips goes from 6 -> 8.
        sale_item = SaleItem.objects.get(invoice=invoice)
        payload = {
            'originalSaleId': str(invoice.id),
            'returnDate': timezone.now().isoformat(),
            'refundMode': 'cash',
            'items': [{
                'saleItemId': str(sale_item.id),
                'batchId': str(batch.id),
                'qtyReturned': 13,
                'returnRate': '18.00' # 90 / 5
            }]
        }
        create_sales_return(payload, str(self.outlet.id), str(self.staff.id))
        
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 3)
        self.assert_ledger_parity(batch)

    def test_chained_flows(self):
        """Test Purchase -> Sale -> Return chains for total stock and ledger parity"""
        idx = 2 # pack_size = 10
        batch = self.batches[idx]
        
        # Initial: 10 strips, 0 loose.
        # SALE 1: 2 strips, 3 loose. -> Remaining: 7 strips, 7 loose.
        request_data1 = {'grandTotal': '207.00', 'cashPaid': '207.00'}
        items_data1 = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 2,
            'qtyLoose': 3,
            'scheduleType': 'OTC'
        }]
        inv1 = atomic_sale_save(request_data1, self.outlet, self.customer, self.staff, items_data1, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 7)
        self.assertEqual(l, 7)
        self.assert_ledger_parity(batch)
        
        # SALE 2: 0 strips, 8 loose. -> Remaining: 6 strips, 9 loose.
        request_data2 = {'grandTotal': '72.00', 'cashPaid': '72.00'}
        items_data2 = [{
            'productId': self.products[idx].id,
            'batchId': batch.id,
            'qtyStrips': 0,
            'qtyLoose': 8,
            'scheduleType': 'OTC'
        }]
        inv2 = atomic_sale_save(request_data2, self.outlet, self.customer, self.staff, items_data2, {}, '', '')
        s, l = self.get_stock(idx)
        self.assertEqual(s, 6)
        self.assertEqual(l, 9)
        self.assert_ledger_parity(batch)
        
        # RETURN 1 (from SALE 1): return 14 loose.
        # current loose 9 + 14 = 23 -> rolls to +2 strips, 3 loose.
        # new stock: 8 strips, 3 loose.
        si1 = SaleItem.objects.get(invoice=inv1)
        payload1 = {
            'originalSaleId': str(inv1.id),
            'returnDate': timezone.now().isoformat(),
            'refundMode': 'cash',
            'items': [{
                'saleItemId': str(si1.id),
                'batchId': str(batch.id),
                'qtyReturned': 14,
                'returnRate': '9.00'
            }]
        }
        create_sales_return(payload1, str(self.outlet.id), str(self.staff.id))
        s, l = self.get_stock(idx)
        self.assertEqual(s, 8)
        self.assertEqual(l, 3)
        self.assert_ledger_parity(batch)
        
        # RETURN 2 (from SALE 2): return 8 loose.
        # current loose 3 + 8 = 11 -> rolls to +1 strip, 1 loose.
        # new stock: 9 strips, 1 loose.
        si2 = SaleItem.objects.get(invoice=inv2)
        payload2 = {
            'originalSaleId': str(inv2.id),
            'returnDate': timezone.now().isoformat(),
            'refundMode': 'cash',
            'items': [{
                'saleItemId': str(si2.id),
                'batchId': str(batch.id),
                'qtyReturned': 8,
                'returnRate': '9.00'
            }]
        }
        create_sales_return(payload2, str(self.outlet.id), str(self.staff.id))
        s, l = self.get_stock(idx)
        self.assertEqual(s, 9)
        self.assertEqual(l, 1)
        self.assert_ledger_parity(batch)
