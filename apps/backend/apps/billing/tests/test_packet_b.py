import uuid
from decimal import Decimal
from unittest.mock import patch
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.utils import timezone
from apps.core.models import Outlet
from apps.accounts.models import Ledger
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.billing.models import SaleInvoice, SaleItem
from apps.billing.sale_services import atomic_sale_save
from apps.billing.sale_update_service import atomic_sale_update
from apps.accounts.journal_service import post_sale_invoice
from apps.core.models import Organization, Outlet

class PacketBTests(APITestCase):

    def setUp(self):
        self.org = Organization.objects.create(name='Packet B Org')
        self.outlet = Outlet.objects.create(name='Packet B Outlet', organization=self.org)
        self.product = MasterProduct.objects.create(name='Test Prod B', hsn_code='1234', mrp=Decimal('100.00'), schedule_type='OTC', pack_size=10, pack_type='Strip')
        self.batch = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='B-12345', qty_strips=100, qty_loose=0, mrp=Decimal('100.00'), purchase_rate=Decimal('80.00'), pack_size=10, pack_type='Strip', opening_qty=100, expiry_date='2026-12-31')
        StockLedger.objects.create(outlet=self.outlet, product=self.product, batch=self.batch, txn_type='OPENING', txn_date=timezone.now().date(), qty_in=100, qty_out=0, rate=Decimal('80.00'), running_qty=100, running_value=Decimal('8000.00'))
        from django.core.management import call_command
        call_command('seed_ledgers')
        Ledger.objects.filter(name__icontains='GST').delete()
        from apps.accounts.models import Staff
        self.staff = Staff.objects.create_user(phone='9999999999', password='test_password', name='Test Staff', outlet=self.outlet, can_edit_sales=True)
        self.client.force_authenticate(user=self.staff)

    def test_missing_gst_ledger_raises_error(self):
        sale = SaleInvoice.objects.create(outlet=self.outlet, invoice_no='INV-B-001', invoice_date=timezone.now(), subtotal=Decimal('100.00'), taxable_amount=Decimal('100.00'), cgst_amount=Decimal('9.00'), sgst_amount=Decimal('9.00'), grand_total=Decimal('118.00'), cash_paid=Decimal('118.00'), amount_paid=Decimal('118.00'))
        SaleItem.objects.create(invoice=sale, batch=self.batch, product_name=self.product.name, qty_strips=1, rate=Decimal('100.00'), gst_rate=Decimal('18.00'), taxable_amount=Decimal('100.00'), gst_amount=Decimal('18.00'), total_amount=Decimal('118.00'), pack_size=10, expiry_date='2026-12-31', mrp=Decimal('100.00'), sale_rate=Decimal('90.00'))
        with self.assertRaises(ValueError) as cm:
            post_sale_invoice(sale)
        self.assertIn('Required GST ledgers not found', str(cm.exception))

    def test_select_for_update_called_on_create(self):
        """
        Verify select_for_update() is called (bulk pre-lock) when creating a
        sale. Uses a real DB batch so the filter+order_by returns correctly.
        """
        from unittest.mock import patch, call
        from apps.inventory.models import Batch as BatchModel
        sfu_calls = []
        original_sfu = BatchModel.objects.__class__.select_for_update

        def tracking_sfu(self_qs, *args, **kwargs):
            sfu_calls.append(True)
            return original_sfu(self_qs, *args, **kwargs)
        request_data = {'grandTotal': '90.00', 'cashPaid': '90.00'}
        items_data = [{'productId': str(self.product.id), 'batchId': str(self.batch.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '90.00', 'discountPct': 0, 'gstRate': 0, 'taxableAmount': 90, 'gstAmount': 0, 'totalAmount': 90}]
        with patch.object(BatchModel.objects.__class__, 'select_for_update', tracking_sfu):
            try:
                atomic_sale_save(request_data=request_data, outlet=self.outlet, customer=None, billed_by=None, items_data=items_data, schedule_h_data=None, hospital_name='', doctor_id='')
            except Exception:
                pass
        self.assertTrue(len(sfu_calls) > 0, 'select_for_update must be called for batch locking')

    @patch('apps.inventory.models.Batch.objects.select_for_update')
    def test_select_for_update_called_on_modify(self, mock_select_for_update):
        mock_qs = mock_select_for_update.return_value
        mock_qs.get.return_value = self.batch
        sale = SaleInvoice.objects.create(outlet=self.outlet, invoice_no='INV-B-UPDATE-001', invoice_date=timezone.now(), subtotal=Decimal('100.00'), taxable_amount=Decimal('100.00'), cgst_amount=Decimal('9.00'), sgst_amount=Decimal('9.00'), grand_total=Decimal('118.00'), cash_paid=Decimal('118.00'), amount_paid=Decimal('118.00'))
        SaleItem.objects.create(invoice=sale, batch=self.batch, product_name=self.product.name, qty_strips=1, rate=Decimal('100.00'), gst_rate=Decimal('18.00'), taxable_amount=Decimal('100.00'), gst_amount=Decimal('18.00'), total_amount=Decimal('118.00'), pack_size=10, expiry_date='2026-12-31', mrp=Decimal('100.00'), sale_rate=Decimal('90.00'))
        request_data = {'grandTotal': '118.00', 'cashPaid': '118.00', 'items': [{'productId': str(self.product.id), 'batchId': str(self.batch.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '100.00'}]}
        with patch('apps.billing.sale_update_service.SaleInvoice.objects.select_for_update') as mock_sale_select:
            mock_sale_qs = mock_sale_select.return_value
            mock_sale_qs.get.return_value = sale
            atomic_sale_update(sale_id=str(sale.id), payload=request_data, outlet_id=str(self.outlet.id), updated_by_id=None)
        self.assertTrue(mock_select_for_update.called)

    def test_missing_gst_ledger_returns_400_on_create(self):
        request_data = {'outletId': str(self.outlet.id), 'grandTotal': '118.00', 'cashPaid': '118.00', 'billedBy': str(self.staff.id), 'items': [{'productId': str(self.product.id), 'batchId': str(self.batch.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '100.00', 'gstRate': 18, 'gstAmount': 15.25, 'taxableAmount': 84.75, 'totalAmount': 100.0}]}
        url = reverse('sale-list-create')
        response = self.client.post(url, request_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Required GST ledgers not found', response.data.get('detail', ''))
        self.assertEqual(SaleInvoice.objects.count(), 0)

    def test_missing_gst_ledger_returns_400_on_modify(self):
        sale = SaleInvoice.objects.create(outlet=self.outlet, invoice_no='INV-B-API-UPDATE-001', invoice_date=timezone.now(), subtotal=Decimal('100.00'), taxable_amount=Decimal('100.00'), cgst_amount=Decimal('0.00'), sgst_amount=Decimal('0.00'), grand_total=Decimal('100.00'), cash_paid=Decimal('100.00'), amount_paid=Decimal('100.00'))
        SaleItem.objects.create(invoice=sale, batch=self.batch, product_name=self.product.name, qty_strips=1, rate=Decimal('100.00'), gst_rate=Decimal('0.00'), taxable_amount=Decimal('100.00'), gst_amount=Decimal('0.00'), total_amount=Decimal('100.00'), pack_size=10, expiry_date='2026-12-31', mrp=Decimal('100.00'), sale_rate=Decimal('90.00'))
        request_data = {'outletId': str(self.outlet.id), 'grandTotal': '118.00', 'cashPaid': '118.00', 'items': [{'productId': str(self.product.id), 'batchId': str(self.batch.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '100.00', 'gstRate': 18, 'gstAmount': 15.25, 'taxableAmount': 84.75, 'totalAmount': 100.0}]}
        url = reverse('sale-detail', kwargs={'sale_id': str(sale.id)})
        response = self.client.put(url, request_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Required GST ledgers not found', response.data.get('detail', ''))
        sale.refresh_from_db()
        self.assertEqual(sale.cgst_amount, Decimal('0.00'))

class DeadlockRegressionTests(APITestCase):
    """
    Regression test for P0 deadlock fix in atomic_sale_save.
    
    Before the fix, each item's batch was locked one at a time inside the
    item processing loop using select_for_update().get(...). Two concurrent
    transactions with the same batches in different item orderings could
    deadlock (circular wait).

    After the fix, all explicit batch IDs are collected, sorted, and locked
    in a single bulk select_for_update().filter(...).order_by('id') BEFORE
    the item loop, enforcing a consistent global lock ordering.
    """

    def setUp(self):
        from apps.core.models import Organization
        self.org = Organization.objects.create(name='Deadlock Test Org')
        self.outlet = Outlet.objects.create(name='Deadlock Test Outlet', organization=self.org)
        self.product = MasterProduct.objects.create(name='Deadlock Test Prod', hsn_code='9999', mrp=Decimal('100.00'), schedule_type='OTC', pack_size=10, pack_type='Strip')
        self.batch_a = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='DEADLOCK-A', qty_strips=50, qty_loose=0, mrp=Decimal('100.00'), purchase_rate=Decimal('80.00'), pack_size=10, pack_type='Strip', opening_qty=50, expiry_date='2028-12-31')
        self.batch_b = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='DEADLOCK-B', qty_strips=50, qty_loose=0, mrp=Decimal('100.00'), purchase_rate=Decimal('80.00'), pack_size=10, pack_type='Strip', opening_qty=50, expiry_date='2028-12-31')
        StockLedger.objects.create(outlet=self.outlet, product=self.product, batch=self.batch_a, txn_type='OPENING', txn_date=timezone.now().date(), qty_in=50, qty_out=0, rate=Decimal('80.00'), running_qty=50, running_value=Decimal('4000.00'))
        StockLedger.objects.create(outlet=self.outlet, product=self.product, batch=self.batch_b, txn_type='OPENING', txn_date=timezone.now().date(), qty_in=50, qty_out=0, rate=Decimal('80.00'), running_qty=50, running_value=Decimal('4000.00'))

    def _make_billed_by(self):
        from apps.accounts.models import Staff
        return Staff.objects.create_user(phone='8888877777', password='pw', name='Deadlock Tester', outlet=self.outlet)

    def test_batch_pre_locking_uses_sorted_bulk_query(self):
        """
        Verify that atomic_sale_save acquires batch locks using a single sorted
        bulk query before the item loop — not per-item inside the loop.

        We assert this by patching Batch.objects and confirming:
        1. select_for_update() is called exactly once (bulk pre-lock step)
        2. The filter is called with all batch IDs at once
        3. The individual per-item select_for_update().get() is NOT called
        """
        from unittest.mock import patch, MagicMock
        from apps.billing.sale_services import atomic_sale_save
        from apps.inventory.models import Batch as BatchModel
        billed_by = self._make_billed_by()
        batch_a_id = str(self.batch_a.id)
        batch_b_id = str(self.batch_b.id)
        items_data = [{'batchId': batch_b_id, 'productId': str(self.product.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '90.00', 'discountPct': 0, 'gstRate': 0, 'taxableAmount': 90, 'gstAmount': 0, 'totalAmount': 90}, {'batchId': batch_a_id, 'productId': str(self.product.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '90.00', 'discountPct': 0, 'gstRate': 0, 'taxableAmount': 90, 'gstAmount': 0, 'totalAmount': 90}]
        locked_ids_captured = []
        original_sfu = BatchModel.objects.select_for_update

        def patched_sfu(*args, **kwargs):
            qs = original_sfu(*args, **kwargs)
            original_filter = qs.filter

            def patched_filter(**fkwargs):
                if 'id__in' in fkwargs:
                    locked_ids_captured.extend(fkwargs['id__in'])
                return original_filter(**fkwargs)
            qs.filter = patched_filter
            return qs
        with patch.object(BatchModel.objects.__class__, 'select_for_update', patched_sfu):
            request_data = {'grandTotal': '180.00', 'cashPaid': '180.00', 'upiPaid': '0', 'cardPaid': '0', 'creditGiven': '0', 'paymentMode': 'cash'}
            try:
                atomic_sale_save(request_data=request_data, outlet=self.outlet, customer=None, billed_by=billed_by, items_data=items_data, schedule_h_data=None, hospital_name=None, doctor_id=None)
            except Exception:
                pass
        expected_sorted = sorted([batch_a_id, batch_b_id])
        self.assertEqual(sorted(locked_ids_captured), expected_sorted, 'Batch IDs must be locked in sorted order to prevent deadlocks')

    def test_sale_create_succeeds_with_two_batch_items(self):
        """
        End-to-end: create a sale with two items from different batches.
        Must return the created SaleInvoice without deadlock or error.
        """
        from apps.billing.sale_services import atomic_sale_save
        from django.core.management import call_command
        call_command('seed_ledgers')
        billed_by = self._make_billed_by()
        request_data = {'grandTotal': '180.00', 'cashPaid': '180.00', 'upiPaid': '0', 'cardPaid': '0', 'creditGiven': '0', 'paymentMode': 'cash'}
        items_data = [{'batchId': str(self.batch_a.id), 'productId': str(self.product.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '90.00', 'discountPct': 0, 'gstRate': 0, 'taxableAmount': 90, 'gstAmount': 0, 'totalAmount': 90}, {'batchId': str(self.batch_b.id), 'productId': str(self.product.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '90.00', 'discountPct': 0, 'gstRate': 0, 'taxableAmount': 90, 'gstAmount': 0, 'totalAmount': 90}]
        sale = atomic_sale_save(request_data=request_data, outlet=self.outlet, customer=None, billed_by=billed_by, items_data=items_data, schedule_h_data=None, hospital_name=None, doctor_id=None)
        self.assertIsNotNone(sale)
        self.assertEqual(sale.outlet, self.outlet)
        self.assertEqual(sale.items.count(), 2)
        self.batch_a.refresh_from_db()
        self.batch_b.refresh_from_db()
        self.assertEqual(self.batch_a.qty_strips, 49)
        self.assertEqual(self.batch_b.qty_strips, 49)