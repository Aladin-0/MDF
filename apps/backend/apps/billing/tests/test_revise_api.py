from django.test import override_settings
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from apps.core.models import Outlet
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff
from apps.inventory.models import MasterProduct, Batch
from apps.purchases.models import Distributor
from apps.billing.models import SaleInvoice, SaleItem 
from apps.audit.models import DocumentRevision
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from apps.billing.sale_update_service import atomic_sale_update, get_sale_modification_constraints, SaleServiceError

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SaleReviseAPITests(APITestCase):
    def setUp(self):
        # Create user and staff
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(organization=self.org, name='Test Outlet')
        
        from django.core.management import call_command
        call_command('seed_ledgers')
        
        self.staff = Staff.objects.create(
            outlet=self.outlet,
            name='Test Staff',
            phone='9999999999',
            role='admin',
            max_discount=Decimal('10.00'),
            can_modify_unpaid_bill=True,
            can_modify_paid_bill=True
        )
        self.staff.set_password('testpassword123')
        self.staff.save()

        self.client.force_authenticate(user=self.staff)

        # Create master product and batch
        self.distributor = Distributor.objects.create(outlet=self.outlet, name="Test Dist")
        self.product = MasterProduct.objects.create(
            name="Test Prod",
            pack_size=10,
            pack_unit="Tablets",
        )
        from datetime import date
        self.batch = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="B001",
            expiry_date=date(2099, 12, 31),
            purchase_rate=Decimal('80.00'),
            qty_strips=10,
            qty_loose=0,
            pack_size=10,
            mrp=Decimal('100.00'),
            sale_rate=Decimal('90.00')
        )

        # Seed initial stock ledger so rebuild_stock_ledger doesn't zero it
        from apps.inventory.models import StockLedger
        StockLedger.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch=self.batch,
            txn_type='PURCHASE_IN',
            txn_date=date(2026, 1, 1),
            voucher_type='Purchase',
            voucher_number='PUR-001',
            party_name='Test Dist',
            qty_in=Decimal('10'),
            qty_out=Decimal('0'),
            rate=Decimal('80.00'),
            value_in=Decimal('800.00'),
            value_out=Decimal('0'),
            running_qty=Decimal('10'),
            running_value=Decimal('800.00')
        )
        
        from apps.accounts.models import Customer
        self.customer = Customer.objects.create(
            outlet=self.outlet,
            name='Test Customer',
            phone='8888888888'
        )
        
        from apps.accounts.services import LedgerService
        LedgerService.sync_customer_ledgers(self.outlet)
        
        from django.utils import timezone
        self.invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no='INV-001',
            customer=self.customer,
            invoice_date=timezone.now(),
            subtotal=Decimal('90.00'),
            taxable_amount=Decimal('90.00'),
            grand_total=Decimal('90.00'),
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('90.00'),
            billed_by=self.staff
        )
        from datetime import date
        self.sale_item = SaleItem.objects.create(
            invoice=self.invoice,
            batch=self.batch,
            product_name=self.product.name,
            pack_size=10,
            pack_unit="Tablets",
            batch_no="B001",
            expiry_date=date(2099, 12, 31),
            qty_strips=1,
            qty_loose=0,
            rate=Decimal('90.00'),
            sale_rate=Decimal('90.00'),
            mrp=Decimal('100.00'),
            gst_rate=Decimal('0.00'),
            taxable_amount=Decimal('90.00'),
            gst_amount=Decimal('0.00'),
            total_amount=Decimal('90.00')
        )

    def test_direct_revise_unpaid_bill(self):
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'direct_revise',
            'revisionReasonCode': 'ENTRY_ERROR_QTY',
            'revisionReasonText': 'Wrong quantity entered',
            'grandTotal': 180.00,
            'cashPaid': 180.00,
            'subtotal': 180.00,
            'paymentMode': 'cash',
            'cashPaid': 180.00,
            'items': [
                {
                    'batchId': str(self.batch.id),
                    'productId': str(self.product.id),
                    'qtyStrips': 2,
                    'qtyLoose': 0,
                    'rate': 90.00,
                    'totalAmount': 180.00
                }
            ]
        }
        
        self.batch.refresh_from_db()
        print(f"DEBUG 1: Batch qty before: {self.batch.qty_strips}")
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, f"Response: {response.data}")
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.grand_total, Decimal('180.00'))
        
        # Verify BillRevision was created
        self.assertEqual(DocumentRevision.objects.count(), 1)
        revision = DocumentRevision.objects.first()
        self.assertEqual(revision.object_id, self.invoice.id)
        self.assertEqual(revision.revision_type, 'direct_revise')
        self.assertEqual(revision.reason_code, 'ENTRY_ERROR_QTY')
        self.assertEqual(revision.new_snapshot_json['grand_total'], '180.00')

    def test_revise_blocked_if_paid(self):
        # Make the invoice paid
        self.invoice.amount_paid = Decimal('90.00')
        self.invoice.cash_paid = Decimal('90.00')
        self.invoice.save()
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'direct_revise',
            'revisionReasonCode': 'ENTRY_ERROR_QTY',
            'revisionReasonText': 'Wrong quantity',
            'grandTotal': 180.00,
            'cashPaid': 180.00,
            'items': []
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot direct revise a paid bill', response.data['detail'])

    def test_revise_blocked_if_no_permission(self):
        # Remove permission and change role so they don't bypass checks as admin
        self.staff.role = 'billing_staff'
        self.staff.can_modify_unpaid_bill = False
        self.staff.save()
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'direct_revise',
            'revisionReasonCode': 'ENTRY_ERROR_QTY',
            'revisionReasonText': 'Wrong quantity',
            'grandTotal': 180.00,
            'cashPaid': 180.00,
            'subtotal': 180.00,
            'paymentMode': 'cash',
            'cashPaid': 180.00,
            'items': []
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_paid_correction_success(self):
        # Make the invoice paid
        self.invoice.amount_paid = Decimal('90.00')
        self.invoice.cash_paid = Decimal('90.00')
        self.invoice.amount_due = Decimal('0.00')
        self.invoice.save()
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'paid_bill_correction',
            'revisionReasonCode': 'DISCOUNT_OMITTED',
            'revisionReasonText': 'Forgot to add discount',
            'grandTotal': 80.00,
            'cashPaid': 80.00,
            'subtotal': 90.00,
            'discountAmount': 10.00,
            'paymentMode': 'cash',
            'cashPaid': 90.00,  # Send existing payment amount so overpayment acts as credit
            'items': [
                {
                    'batchId': str(self.batch.id),
                    'productId': str(self.product.id),
                    'qtyStrips': 1,
                    'qtyLoose': 0,
                    'rate': 80.00,
                    'totalAmount': 80.00
                }
            ]
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, f"Response: {response.data}")
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.grand_total, Decimal('80.00'))
        # With credit generated, credit_given should be -10.00 indicating a refund due or advanced
        self.assertEqual(self.invoice.credit_given, Decimal('-10.00'))
        
        # Verify BillRevision was created and has payment_impact
        revision = DocumentRevision.objects.get(object_id=self.invoice.id)
        self.assertEqual(revision.revision_type, 'paid_bill_correction')
        self.assertEqual(revision.payment_impact_json['refund_required'], '10.00')

    def test_paid_correction_blocked_if_no_permission(self):
        # Make the invoice paid
        self.invoice.amount_paid = Decimal('90.00')
        self.invoice.cash_paid = Decimal('90.00')
        self.invoice.amount_due = Decimal('0.00')
        self.invoice.save()
        
        self.staff.role = 'billing_staff'
        self.staff.can_modify_paid_bill = False
        self.staff.save()
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'paid_bill_correction',
            'revisionReasonCode': 'DISCOUNT_OMITTED',
            'revisionReasonText': 'Forgot to add discount',
            'grandTotal': 80.00,
            'cashPaid': 80.00,
            'items': []
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancel_and_reissue_success(self):
        # Setup permission
        self.staff.can_cancel_and_reissue_bill = True
        self.staff.save()
        
        # Setup initial stock
        self.batch.qty_strips = 5
        self.batch.save()
        
        # Original invoice has 1 item (2 strips) -> leaves 3 strips in batch.
        # But wait, setUp doesn't deduct stock for the mock invoice! Let's mock the initial deduction.
        from apps.inventory.models import StockLedger
        StockLedger.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch=self.batch,
            txn_type='SALE_OUT',
            txn_date=timezone.now().date(),
            voucher_type='Sale Invoice',
            voucher_number=self.invoice.invoice_no,
            qty_out=2
        )
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        
        # The new payload will just have 1 strip
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'cancel_and_reissue',
            'revisionReasonCode': 'OTHER',
            'revisionReasonText': 'Wrong patient entirely, cancelling and reissuing',
            'grandTotal': 50.00,
            'cashPaid': 50.00,
            'paymentMode': 'cash',
            'cashPaid': 50.00,
            'items': [
                {
                    'batchId': str(self.batch.id),
                    'productId': str(self.product.id),
                    'qtyStrips': 1,
                    'qtyLoose': 0,
                    'rate': 50.00,
                    'totalAmount': 50.00
                }
            ]
        }
        
        response = self.client.post(url, payload, format='json')
        
        # Assert success
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        # Assert new invoice created
        new_invoice_id = response.data['id']
        self.assertNotEqual(str(self.invoice.id), new_invoice_id)
        
        new_invoice = SaleInvoice.objects.get(id=new_invoice_id)
        self.assertEqual(new_invoice.grand_total, 50.00)
        
        # Assert old invoice cancelled
        self.invoice.refresh_from_db()
        self.assertTrue(self.invoice.is_cancelled)
        
        # Assert BillRevision created properly linking both
        revision = DocumentRevision.objects.get(object_id=self.invoice.id, revision_type='cancel_and_reissue')
        self.assertEqual(str(revision.resulting_document_id), str(new_invoice.id))
        
        # Assert stock is correct: 
        # Started at 5 + 1 (reverted from old item during cancel) = 6
        # Deducted 1 for new invoice = 5 strips remaining.
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, 5)
        
    def test_cancel_and_reissue_blocked_if_no_permission(self):
        self.staff.role = 'billing_staff'
        self.staff.can_cancel_and_reissue_bill = False
        self.staff.save()
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'cancel_and_reissue',
            'revisionReasonCode': 'OTHER',
            'revisionReasonText': 'Wrong patient entirely, cancelling and reissuing',
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sale_revision_history_api(self):
        # Create a revision
        revision = DocumentRevision.objects.create(
            content_type=ContentType.objects.get_for_model(SaleInvoice),
            object_id=self.invoice.id,
            outlet=self.outlet,

            revision_type='direct_revise',
            reason_code='ENTRY_ERROR_QTY',
            reason_text='Wrong quantity',
            modified_by=self.staff
        )
        
        # Test List API
        url_list = reverse('sale-revisions-list') + f'?outletId={self.outlet.id}'
        response = self.client.get(url_list)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], str(revision.id))
        
        # Test Detail API
        url_detail = reverse('unified-revisions', kwargs={'record_type': 'sale', 'record_id': self.invoice.id}) + f'?outletId={self.outlet.id}'
        response = self.client.get(url_detail)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('record', response.data)
        self.assertIn('revisions', response.data)
        self.assertEqual(len(response.data['revisions']), 1)
        self.assertEqual(response.data['revisions'][0]['id'], str(revision.id))

    def test_sale_revision_report_and_export(self):
        # Create a revision
        revision = DocumentRevision.objects.create(
            content_type=ContentType.objects.get_for_model(SaleInvoice),
            object_id=self.invoice.id,
            outlet=self.outlet,

            revision_type='direct_revise',
            reason_code='ENTRY_ERROR_QTY',
            reason_text='Wrong quantity',
            modified_by=self.staff
        )
        
        # Test Report API
        url_report = reverse('sale-revisions-report') + f'?outletId={self.outlet.id}'
        response = self.client.get(url_report)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['totalModified'], 1)
        self.assertEqual(response.data['summary']['directRevise'], 1)
        
        # Test CSV Export
        url_export = reverse('sale-revisions-list') + f'?outletId={self.outlet.id}&export=csv'
        response = self.client.get(url_export)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="revision_history.csv"', response['Content-Disposition'])
        
        content = response.content.decode('utf-8')
        self.assertIn('Date,Revision Number,Invoice Number,Type,Status,Modified By,Reason Code,Reason Text', content)
        self.assertIn('ENTRY_ERROR_QTY', content)
        self.assertIn('Wrong quantity', content)
