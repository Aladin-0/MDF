from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Voucher, VoucherLine, Ledger, LedgerGroup, Customer
from apps.billing.models import SaleInvoice
from django.contrib.auth.hashers import make_password
from unittest.mock import patch

class VoucherBillModTests(TestCase):
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
        
        self.group = LedgerGroup.objects.create(outlet=self.outlet, name="Sundry Debtors", nature="asset")
        self.customer = Customer.objects.create(outlet=self.outlet, name="Customer", phone="123")
        self.ledger1 = Ledger.objects.create(outlet=self.outlet, name="Cash", group=self.group)
        self.party_ledger = Ledger.objects.create(outlet=self.outlet, name="Customer", group=self.group, linked_customer=self.customer)
        
        self.invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            customer=self.customer,
            invoice_no="INV-001",
            invoice_date="2026-07-01 10:00:00Z",
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            grand_total=Decimal('1000.00'),
            payment_mode='credit',
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('1000.00')
        )
        
        self.voucher = Voucher.objects.create(
            outlet=self.outlet,
            voucher_type="receipt",
            voucher_no="RCT-001",
            date="2026-07-02",
            total_amount=Decimal('200.00'),
            created_by=self.admin
        )
        VoucherLine.objects.create(voucher=self.voucher, ledger=self.ledger1, debit=Decimal('200.00'), credit=Decimal('0.00'))
        VoucherLine.objects.create(voucher=self.voucher, ledger=self.party_ledger, debit=Decimal('0.00'), credit=Decimal('200.00'))
        
        from apps.accounts.models import VoucherBillAdjustment
        VoucherBillAdjustment.objects.create(
            voucher=self.voucher,
            sale_invoice=self.invoice,
            adjusted_amount=Decimal('200.00')
        )
        self.invoice.amount_due = Decimal('800.00')
        self.invoice.save()
        
    def tearDown(self):
        self.patcher.stop()
        
    def test_voucher_modify_bill_allocation(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-02',
            'narration': 'Modified allocation',
            'total_amount': '300.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Adjusted amount',
            'lines': [
                {
                    'ledger_id': str(self.ledger1.id),
                    'debit': '300.00',
                    'credit': '0.00'
                },
                {
                    'ledger_id': str(self.party_ledger.id),
                    'debit': '0.00',
                    'credit': '300.00'
                }
            ],
            'bill_adjustments': [
                {
                    'invoice_id': str(self.invoice.id),
                    'invoice_type': 'sale',
                    'adjusted_amount': 300.00
                }
            ]
        }
        
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        
        adj = self.voucher.bill_adjustments.first()
        self.assertEqual(adj.adjusted_amount, Decimal('300.00'))

    def test_pending_bills_view_with_exclude_voucher(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('ledger-pending-bills', kwargs={'ledger_id': self.party_ledger.id}) + f"?outletId={self.outlet.id}"
        
        # Without exclude, outstanding should be 800 (since 200 was adjusted)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['data'][0]['outstanding'], 800.0)

        # With exclude, outstanding should be 1000
        url_exclude = url + f"&exclude_voucher_id={self.voucher.id}"
        resp2 = self.client.get(url_exclude)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data['data'][0]['outstanding'], 1000.0)
