from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from decimal import Decimal
from django.utils import timezone
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff
from apps.billing.models import SaleInvoice

class TestSaleModificationOptionsView(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(organization=self.org, name="Test Outlet")
        
        # User with permissions
        self.admin = Staff.objects.create(
            outlet=self.outlet, 
            phone="1111111111", 
            name="Admin", 
            role="admin"
        )
        self.admin.set_password("password")
        self.admin.save()
        
        # User without permissions
        self.staff = Staff.objects.create(
            outlet=self.outlet, 
            phone="2222222222", 
            name="Staff", 
            role="billing_staff"
        )
        self.staff.set_password("password")
        self.staff.save()
        
        self.invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-100",
            invoice_date=timezone.now(),
            subtotal=Decimal("100.00"),
            taxable_amount=Decimal("100.00"),
            grand_total=Decimal("100.00"),
            payment_mode="cash",
            cash_paid=Decimal("0.00"),
            amount_paid=Decimal("0.00"),
            amount_due=Decimal("100.00")
        )

    def test_modification_options_admin(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('sale-modification-options', kwargs={'sale_id': self.invoice.id})
        response = self.client.get(url, {'outletId': self.outlet.id})
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Invoice context
        self.assertEqual(data['invoice']['invoiceNo'], "INV-100")
        self.assertEqual(data['invoice']['isPaid'], False)
        
        # Admin bypasses all checks, so should get everything applicable to a draft/unpaid bill
        self.assertIn('direct_revise', data['allowedActions'])
        self.assertIn('commercial_correction', data['allowedActions'])
        self.assertIn('cancel_and_reissue', data['allowedActions'])
        self.assertIn('header_correction', data['allowedActions'])
        self.assertIsNone(data['blockReason'])

    def test_modification_options_blocked(self):
        self.client.force_authenticate(user=self.staff)
        url = reverse('sale-modification-options', kwargs={'sale_id': self.invoice.id})
        response = self.client.get(url, {'outletId': self.outlet.id})
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(len(data['allowedActions']), 0)
        self.assertIsNotNone(data['blockReason'])
        self.assertIn("You do not have the required permissions", data['blockReason'])
