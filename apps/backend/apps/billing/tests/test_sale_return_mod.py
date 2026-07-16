from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Customer, LedgerGroup, Ledger
from apps.inventory.models import MasterProduct, Batch
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem
from django.contrib.auth.hashers import make_password
from apps.audit.models import DocumentRevisionV2
from unittest.mock import patch
from django.test import override_settings

class SaleReturnModTests(TestCase):
    @override_settings(AUDIT_V2_WRITE_ENABLED=True)
    def setUp(self):
        self.patcher = patch('apps.audit.services.create_audit_log_async.delay')
        self.mock_delay = self.patcher.start()
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        
        self.admin = Staff.objects.create(
            phone="9999999999", name="Admin", outlet=self.outlet, 
            role="admin", password=make_password("password123")
        )
        self.billing = Staff.objects.create(
            phone="8888888888", name="Billing", outlet=self.outlet, 
            role="billing_staff", password=make_password("password123")
        )
        
        self.customer = Customer.objects.create(outlet=self.outlet, name="Test Customer")
        
        self.product = MasterProduct.objects.create(name="Dolo 650", mrp=Decimal('10.00'), default_sale_rate=Decimal('10.00'), pack_size=10, pack_unit='tablet', pack_type='strip')
        self.batch = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no="B-001", expiry_date="2026-12-31", mrp=Decimal('10.00'), purchase_rate=Decimal('8.00'), sale_rate=Decimal('10.00'), qty_strips=10)
        
        # We need an original sale
        self.sale = SaleInvoice.objects.create(
            outlet=self.outlet, customer=self.customer,
            invoice_no="INV-001", invoice_date="2026-07-01", grand_total=Decimal('100.00'), subtotal=Decimal('100.00'),
            taxable_amount=Decimal('100.00'),
            payment_mode="cash", amount_paid=Decimal('100.00'), cash_paid=Decimal('100.00')
        )
        self.sale_item = SaleItem.objects.create(
            invoice=self.sale, batch=self.batch, product_name="Dolo 650",
            pack_size=10, pack_unit='tablet', expiry_date="2026-12-31",
            qty_strips=10, qty_loose=0, rate=Decimal('10.00'), mrp=Decimal('10.00'), sale_rate=Decimal('10.00'),
            taxable_amount=Decimal('100.00'), gst_rate=Decimal('0.00'), gst_amount=Decimal('0.00'), total_amount=Decimal('100.00')
        )
        
        self.sale_return = SalesReturn.objects.create(
            outlet=self.outlet,
            original_sale=self.sale,
            return_no="RTN-001",
            return_date="2026-07-02",
            total_amount=Decimal('50.00'),
            refund_mode="cash",
            reason="Wrong Item",
            created_by=self.admin
        )
        self.return_item = SalesReturnItem.objects.create(
            sales_return=self.sale_return,
            original_sale_item=self.sale_item,
            batch=self.batch,
            product_name="Dolo 650",
            qty_returned=5,
            return_rate=Decimal('10.00'),
            total_amount=Decimal('50.00')
        )
        
    def tearDown(self):
        self.patcher.stop()
        
    @override_settings(AUDIT_V2_WRITE_ENABLED=True)
    def test_sale_return_revise_logs_diff(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('sales-return-detail', kwargs={'pk': self.sale_return.id}) + f"?outletId={self.outlet.id}"
        
        payload = {
            'outletId': str(self.outlet.id),
            'reason': 'Expired Item',
            'refundMode': 'cash',
            'totalAmount': '100.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Wrong quantity',
            'items': [
                {
                    'id': str(self.return_item.id),
                    'originalSaleItemId': str(self.sale_item.id),
                    'batchId': str(self.batch.id),
                    'productName': 'Dolo 650',
                    'qtyReturned': 10,
                    'returnRate': '10.00',
                    'totalAmount': '100.00'
                }
            ]
        }
        
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        
        self.sale_return.refresh_from_db()
        self.assertEqual(self.sale_return.reason, "Expired Item")
        # total amount is server-recalculated: 10 units * rate (10.00/loose) = 100.00
        self.assertEqual(self.sale_return.total_amount, Decimal('100.00'))
        
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(SalesReturn)
        revs = DocumentRevisionV2.objects.filter(content_type=ct, object_id=str(self.sale_return.id))
        self.assertEqual(revs.count(), 1)
        
        diff = revs.first().diff_summary_json
        print("DIFF SUMMARY:", diff)
        
    def test_sale_return_unauthorized(self):
        self.client.force_authenticate(user=self.billing)
        url = reverse('sales-return-detail', kwargs={'pk': self.sale_return.id}) + f"?outletId={self.outlet.id}"
        resp = self.client.put(url, {'outletId': str(self.outlet.id)}, format='json')
        self.assertEqual(resp.status_code, 403)
