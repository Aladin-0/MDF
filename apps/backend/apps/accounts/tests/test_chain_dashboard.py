"""
Chain dashboard + outlet switching (super admin).

Each test pins a bug found while reviewing the Chain Dashboard page:
  - any super admin could read / change ANOTHER chain by putting its id in the request,
  - cancelled invoices and unreviewed OCR purchase drafts were counted in the totals,
  - a bad date was an unhandled 500,
  - a deactivated outlet could be entered by sending its id straight to switch-outlet.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone

from apps.accounts.tests.factories import OutletFactory, SupplierFactory
from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.billing.models import SaleInvoice
from apps.purchases.models import PurchaseInvoice


def make_sale(outlet, amount, *, when=None, **flags):
    amount = Decimal(str(amount))
    return SaleInvoice.objects.create(
        outlet=outlet, invoice_no=f'INV-{SaleInvoice.objects.count() + 1:05d}',
        invoice_date=when or timezone.now(), subtotal=amount, taxable_amount=amount,
        grand_total=amount, payment_mode='cash', cash_paid=amount, amount_paid=amount, **flags,
    )


def make_purchase(outlet, amount, *, outstanding=0, **fields):
    amount = Decimal(str(amount))
    return PurchaseInvoice.objects.create(
        outlet=outlet, distributor=SupplierFactory(outlet=outlet),
        invoice_no=f'PINV-{PurchaseInvoice.objects.count() + 1:05d}',
        invoice_date=date.today(), subtotal=amount, taxable_amount=amount, grand_total=amount,
        outstanding=Decimal(str(outstanding)), **fields,
    )


class ChainDashboardTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.sa = make_staff(self.outlet, 'super_admin')
        self.url = '/api/v1/organizations/dashboard/'

    def get(self, user=None, **params):
        params.setdefault('orgId', str(self.org.id))
        return self.as_user(user or self.sa).get(self.url, params)

    # ── Scoping ──────────────────────────────────────────────────────────────
    def test_cannot_read_another_organizations_dashboard(self):
        make_sale(self.foreign_outlet, 999)
        res = self.get(orgId=str(self.foreign_org.id))
        self.assertEqual(res.status_code, 404)

    def test_malformed_org_id_is_404_not_500(self):
        self.assertEqual(self.get(orgId='not-a-uuid').status_code, 404)

    def test_other_org_detail_and_outlet_endpoints_are_closed_too(self):
        client = self.as_user(self.sa)
        self.assertEqual(client.get(f'/api/v1/organizations/{self.foreign_org.id}/').status_code, 404)
        self.assertEqual(client.get(f'/api/v1/organizations/{self.foreign_org.id}/outlets/').status_code, 404)
        res = client.post(f'/api/v1/organizations/{self.foreign_org.id}/outlets/',
                          {'name': 'Hijack', 'city': 'x', 'state': 'x'}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertFalse(self.foreign_org.outlets.filter(name='Hijack').exists())

    def test_non_super_admin_is_refused(self):
        manager = make_staff(self.outlet, 'manager')
        self.assertEqual(self.get(user=manager).status_code, 403)

    # ── What is counted ──────────────────────────────────────────────────────
    def test_cancelled_returns_and_foreign_sales_are_not_counted(self):
        make_sale(self.outlet, 100)
        make_sale(self.other_outlet, 50)
        make_sale(self.outlet, 700, is_cancelled=True)
        make_sale(self.outlet, 300, is_return=True)
        make_sale(self.foreign_outlet, 5000)
        data = self.get().data['data']
        self.assertEqual(data['totalSales'], {'total': 150.0, 'invoices': 2})
        self.assertEqual(data['todaySales'], {'total': 150.0, 'invoices': 2})
        by_name = {o['name']: o for o in data['outlets']}
        self.assertEqual(by_name['Outlet A1']['periodSales'], 100.0)
        self.assertEqual(by_name['Outlet A2']['periodSales'], 50.0)
        # the per-outlet rows add up to the headline figure
        self.assertEqual(sum(o['periodSales'] for o in data['outlets']), data['totalSales']['total'])

    def test_unreviewed_scanned_purchases_are_not_counted(self):
        make_purchase(self.outlet, 400, outstanding=400, status='POSTED')
        make_purchase(self.outlet, 900, outstanding=900, status='SAVED')
        data = self.get().data['data']
        self.assertEqual(data['totalPurchases'], {'total': 400.0, 'invoices': 1})
        self.assertEqual(data['totalPayables'], 400.0)

    def test_deactivated_outlet_is_left_out(self):
        self.other_outlet.is_active = False
        self.other_outlet.save()
        make_sale(self.other_outlet, 50)
        data = self.get().data['data']
        self.assertEqual([o['name'] for o in data['outlets']], ['Outlet A1'])
        self.assertEqual(data['totalSales']['total'], 0.0)

    def test_period_filter_applies_and_outlets_without_sales_show_zero(self):
        make_sale(self.outlet, 100, when=timezone.now() - timedelta(days=40))
        today = str(date.today())
        data = self.get(**{'from': today, 'to': today}).data['data']
        self.assertEqual(data['totalSales']['total'], 0.0)
        self.assertEqual(len(data['outlets']), 2)
        self.assertTrue(all(o['periodSales'] == 0 and o['todaySales'] == 0 for o in data['outlets']))

    # ── Bad input ────────────────────────────────────────────────────────────
    def test_bad_dates_are_400_not_500(self):
        for bad in ({'from': 'yesterday'}, {'to': '2025-02-31'}, {'from': '2025-05-02', 'to': '2025-05-01'}):
            with self.subTest(bad=bad):
                self.assertEqual(self.get(**bad).status_code, 400)


class SwitchOutletTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.sa = make_staff(self.outlet, 'super_admin')

    def switch(self, outlet):
        return self.as_user(self.sa).post(reverse('switch-outlet'), {'outletId': str(outlet.id)}, format='json')

    def test_switch_changes_the_outlet_and_returns_it_in_the_user_payload(self):
        res = self.switch(self.other_outlet)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['user']['outletId'], str(self.other_outlet.id))
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.outlet_id, self.other_outlet.id)

    def test_cannot_switch_into_a_deactivated_outlet(self):
        self.other_outlet.is_active = False
        self.other_outlet.save()
        self.assertEqual(self.switch(self.other_outlet).status_code, 404)
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.outlet_id, self.outlet.id)

    def test_cannot_switch_into_another_organizations_outlet(self):
        # refused by the shared outlet-isolation check before the view even runs
        self.assertEqual(self.switch(self.foreign_outlet).status_code, 403)
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.outlet_id, self.outlet.id)

    def test_malformed_outlet_id_is_refused_not_a_500(self):
        res = self.as_user(self.sa).post(reverse('switch-outlet'), {'outletId': 'nope'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_malformed_outlet_id_on_any_outlet_scoped_endpoint_is_refused_not_a_500(self):
        # same shared check guards every endpoint that takes ?outletId=
        res = self.as_user(self.sa).get('/api/v1/organizations/outlets/all/', {'outletId': 'nope'})
        self.assertEqual(res.status_code, 403)
