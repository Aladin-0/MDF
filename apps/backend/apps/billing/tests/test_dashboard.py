"""
The home dashboard numbers (GET /dashboard/daily/).

Pinned problems:
  - cancelled invoices were counted (a cancel-and-reissue showed twice),
  - "Credit Given" was everything customers owe, all time, shown for whatever period was picked,
  - the trends ("+12% vs yesterday") were typed into the page, not measured,
  - the stock alerts used a different rule from the Inventory page (per batch, loose ignored, empty batches listed,
    expired batches missing) and sent every row,
  - the top sellers were ranked by strips, which cannot be compared across pack types, and ignored loose units,
  - one outlet's staff could ask for another outlet's numbers.
"""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from apps.accounts.tests.test_access_control import AccessControlBase, make_staff
from apps.billing.models import CreditAccount, SaleInvoice, SaleItem, SalesReturn
from apps.inventory.models import OutletProductConfig
from apps.inventory.tests.factories import BatchFactory, MasterProductFactory

URL = '/api/v1/dashboard/daily/'


def at(day, hour=12):
    moment = datetime.combine(day, time(hour))
    return timezone.make_aware(moment) if settings.USE_TZ else moment    # the test settings run without timezone support


class DashboardBase(AccessControlBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.today = date.today()
        self.manager = make_staff(self.outlet, 'manager')
        self.client = self.as_user(self.manager)
        self.product = MasterProductFactory(name='Dolo 650', pack_size=10)
        self.batch = BatchFactory(outlet=self.outlet, product=self.product, qty_strips=50, qty_loose=0, pack_size=10,
                                  purchase_rate=Decimal('60'), landing_rate=Decimal('70'), mrp=Decimal('100'),
                                  expiry_date=self.today + timedelta(days=400))

    def sale(self, total, *, cash=0, upi=0, card=0, credit=0, day=None, hour=12, cancelled=False, staff=None,
             lines=None, discount=0, outlet=None, is_return=False):
        """An invoice; `lines` = [(batch, packs, loose, line_total)]. Payment defaults to all cash."""
        if not (cash or upi or card or credit):
            cash = total
        outlet = outlet or self.outlet
        inv = SaleInvoice.objects.create(
            outlet=outlet, invoice_no=f'T-{uuid.uuid4().hex[:8]}', invoice_date=at(day or self.today, hour),
            subtotal=total, taxable_amount=total, grand_total=total, discount_amount=discount,
            payment_mode='cash', cash_paid=cash, upi_paid=upi, card_paid=card, credit_given=credit,
            amount_paid=cash + upi + card, amount_due=credit, billed_by=staff or self.manager,
            is_cancelled=cancelled, is_return=is_return,
        )
        for batch, packs, loose, line_total in (lines or []):
            SaleItem.objects.create(
                invoice=inv, batch=batch, product_name=batch.product.name, pack_size=batch.pack_size, pack_unit='tablet',
                schedule_type='OTC', batch_no=batch.batch_no, expiry_date=batch.expiry_date, mrp=batch.mrp,
                sale_rate=batch.mrp, rate=batch.mrp, qty_strips=packs, qty_loose=loose,
                taxable_amount=line_total, gst_amount=0, gst_rate=0, total_amount=line_total,
            )
        return inv

    def get(self, user=None, **params):
        params.setdefault('outletId', str(self.outlet.id))
        return (self.as_user(user) if user else self.client).get(URL, params)

    def data(self, **params):
        res = self.get(**params)
        self.assertEqual(res.status_code, 200, getattr(res, 'data', res))
        return res.data


class SalesTotalsTests(DashboardBase):
    def test_cancelled_invoices_are_not_counted_anywhere(self):
        self.sale(100, lines=[(self.batch, 1, 0, 100)])
        self.sale(500, cancelled=True, lines=[(self.batch, 5, 0, 500)])          # the voided original of a reissue
        d = self.data(date=self.today.isoformat())
        self.assertEqual((d['totalSales'], d['totalBills']), (100.0, 1))
        self.assertEqual([h['sales'] for h in d['hourlySales']], [100.0])
        self.assertEqual([t['totalRevenue'] for t in d['topSellingItems']], [100.0])
        self.assertEqual(d['staffLeaderboard'][0]['billsCount'], 1)
        self.assertEqual(d['paymentBreakdown']['cash'], 100.0)

    def test_the_payment_mix_comes_from_the_invoices_and_adds_up_to_the_sales(self):
        self.sale(100, cash=40, upi=30, card=10, credit=20)
        self.sale(50, upi=50)
        d = self.data(date=self.today.isoformat())
        self.assertEqual(d['paymentBreakdown'], {'cash': 40.0, 'upi': 80.0, 'card': 10.0, 'credit': 20.0})
        self.assertEqual(sum(d['paymentBreakdown'].values()), d['totalSales'])

    def test_credit_given_is_this_periods_credit_not_everything_owed(self):
        from apps.accounts.models import Customer
        c = Customer.objects.create(outlet=self.outlet, name='Rahul', phone='9111111111')
        CreditAccount.objects.create(outlet=self.outlet, customer=c, total_outstanding=Decimal('4000'), status='active')
        self.sale(100, cash=70, credit=30)
        d = self.data(date=self.today.isoformat())
        self.assertEqual(d['creditGiven'], 30.0)
        self.assertEqual(d['outstandingCredit'], 4000.0)

    def test_returns_reduce_net_sales_and_cancelled_returns_do_not(self):
        self.sale(300)
        self.sale(40, is_return=True)
        self.sale(999, is_return=True, cancelled=True)
        d = self.data(date=self.today.isoformat())
        self.assertEqual((d['totalSales'], d['salesReturnAmount'], d['salesReturnCount'], d['netSales']), (300.0, 40.0, 1, 260.0))

    def test_discount_and_gst_are_summed(self):
        inv = self.sale(110, discount=10)
        SaleInvoice.objects.filter(pk=inv.pk).update(cgst_amount=3, sgst_amount=3, igst_amount=1)
        d = self.data(date=self.today.isoformat())
        self.assertEqual((d['totalDiscount'], d['totalGst']), (10.0, 7.0))

    def test_a_date_range_and_reversed_dates(self):
        yesterday = self.today - timedelta(days=1)
        self.sale(100, day=self.today)
        self.sale(200, day=yesterday)
        self.sale(900, day=self.today - timedelta(days=5))
        both = self.data(startDate=yesterday.isoformat(), endDate=self.today.isoformat())
        self.assertEqual((both['totalSales'], both['totalBills']), (300.0, 2))
        reversed_ = self.data(startDate=self.today.isoformat(), endDate=yesterday.isoformat())
        self.assertEqual(reversed_['totalSales'], 300.0)
        self.assertEqual((both['startDate'], both['endDate']), (yesterday.isoformat(), self.today.isoformat()))

    def test_hourly_sales_are_grouped_by_hour(self):
        self.sale(100, hour=9)
        self.sale(50, hour=9)
        self.sale(70, hour=14)
        d = self.data(date=self.today.isoformat())
        self.assertEqual([(h['hour'], h['bills'], h['sales']) for h in d['hourlySales']], [('09:00', 2, 150.0), ('14:00', 1, 70.0)])


class TrendTests(DashboardBase):
    def test_the_previous_period_has_the_same_length_and_its_own_numbers(self):
        for offset, amount in ((0, 100), (1, 200), (2, 50), (3, 70), (4, 30)):
            self.sale(amount, day=self.today - timedelta(days=offset))
        d = self.data(startDate=(self.today - timedelta(days=1)).isoformat(), endDate=self.today.isoformat())
        self.assertEqual(d['totalSales'], 300.0)                           # today + yesterday
        self.assertEqual(d['previous']['totalSales'], 120.0)               # the two days before: 50 + 70
        self.assertEqual((d['previousStartDate'], d['previousEndDate']),
                         ((self.today - timedelta(days=3)).isoformat(), (self.today - timedelta(days=2)).isoformat()))

    def test_one_day_compares_with_the_day_before(self):
        self.sale(100)
        self.sale(80, day=self.today - timedelta(days=1))
        d = self.data(date=self.today.isoformat())
        self.assertEqual(d['previous']['totalSales'], 80.0)
        self.assertEqual(d['previousEndDate'], (self.today - timedelta(days=1)).isoformat())

    def test_no_history_gives_zero_not_a_made_up_number(self):
        self.sale(100)
        self.assertEqual(self.data(date=self.today.isoformat())['previous']['totalSales'], 0.0)


class MarginTests(DashboardBase):
    def test_margin_is_revenue_minus_landing_cost_with_loose_units_counted(self):
        # 2 packs + 5 loose of 10 = 2.5 packs at landing 70 = 175 cost; revenue 250
        self.sale(250, lines=[(self.batch, 2, 5, 250)])
        owner = make_staff(self.outlet, 'admin')
        d = self.get(user=owner, date=self.today.isoformat()).data
        self.assertEqual(d['grossProfit'], 75.0)
        self.assertEqual(d['grossMarginPct'], 30.0)

    def test_staff_who_may_not_see_purchase_rates_get_no_margin(self):
        self.sale(250, lines=[(self.batch, 2, 5, 250)])
        biller = make_staff(self.outlet, 'billing_staff')
        d = self.get(user=biller, date=self.today.isoformat()).data
        self.assertIsNone(d['grossProfit'])
        self.assertIsNone(d['grossMarginPct'])

    def test_cancelled_sales_have_no_margin_and_no_sales_means_none(self):
        self.sale(250, cancelled=True, lines=[(self.batch, 2, 5, 250)])
        d = self.get(user=make_staff(self.outlet, 'admin'), date=self.today.isoformat()).data
        self.assertIsNone(d['grossProfit'])


class TopSellerTests(DashboardBase):
    def test_ranked_by_revenue_and_loose_units_are_reported(self):
        cheap = BatchFactory(outlet=self.outlet, product=MasterProductFactory(name='Cheap', pack_size=10), qty_strips=100, pack_size=10)
        self.sale(120, lines=[(self.batch, 1, 3, 120)])
        self.sale(90, lines=[(cheap, 9, 0, 90)])                           # more packs, less money
        top = self.data(date=self.today.isoformat())['topSellingItems']
        self.assertEqual([t['name'] for t in top], ['Dolo 650', 'Cheap'])
        self.assertEqual((top[0]['totalQty'], top[0]['totalLoose']), (1, 3))

    def test_only_five_are_returned(self):
        for i in range(7):
            b = BatchFactory(outlet=self.outlet, product=MasterProductFactory(name=f'P{i}'), qty_strips=10)
            self.sale(10 + i, lines=[(b, 1, 0, 10 + i)])
        self.assertEqual(len(self.data(date=self.today.isoformat())['topSellingItems']), 5)


class AlertTests(DashboardBase):
    def alerts(self):
        return self.data(date=self.today.isoformat())['alerts']

    def test_low_stock_is_per_product_with_loose_counted_like_the_inventory_page(self):
        low = MasterProductFactory(name='Low Item', pack_size=10)
        BatchFactory(outlet=self.outlet, product=low, qty_strips=3, qty_loose=5)      # 3.5
        BatchFactory(outlet=self.outlet, product=low, qty_strips=2, qty_loose=0)      # +2 = 5.5 packs: low
        fine = MasterProductFactory(name='Fine Item', pack_size=10)
        BatchFactory(outlet=self.outlet, product=fine, qty_strips=6, qty_loose=0)
        BatchFactory(outlet=self.outlet, product=fine, qty_strips=6, qty_loose=0)     # 12 packs in two small batches: NOT low
        a = self.alerts()
        self.assertEqual([r['productName'] for r in a['lowStock']], ['Low Item'])
        self.assertEqual(a['lowStock'][0]['currentStock'], 5.5)
        self.assertEqual(a['counts']['lowStock'], 1)

    def test_the_outlets_own_minimum_replaces_the_default(self):
        item = MasterProductFactory(name='Few', pack_size=10)
        BatchFactory(outlet=self.outlet, product=item, qty_strips=5)
        self.assertEqual(self.alerts()['counts']['lowStock'], 1)                      # 5 < default 10
        OutletProductConfig.objects.create(outlet=self.outlet, product=item, min_qty=Decimal('2'))
        self.assertEqual(self.alerts()['counts']['lowStock'], 0)                      # 5 >= its own 2

    def test_the_list_is_short_but_the_count_is_the_truth(self):
        for i in range(11):
            BatchFactory(outlet=self.outlet, product=MasterProductFactory(name=f'Low{i:02d}'), qty_strips=1)
        a = self.alerts()
        self.assertEqual(a['counts']['lowStock'], 11)
        self.assertEqual(len(a['lowStock']), 8)

    def test_expiring_includes_expired_stock_and_ignores_empty_batches(self):
        soon = BatchFactory(outlet=self.outlet, product=self.product, batch_no='SOON', qty_strips=5, expiry_date=self.today + timedelta(days=30))
        gone = BatchFactory(outlet=self.outlet, product=self.product, batch_no='GONE', qty_strips=5, expiry_date=self.today - timedelta(days=10))
        BatchFactory(outlet=self.outlet, product=self.product, batch_no='EMPTY', qty_strips=0, qty_loose=0, expiry_date=self.today + timedelta(days=5))
        loose_only = BatchFactory(outlet=self.outlet, product=self.product, batch_no='LOOSE', qty_strips=0, qty_loose=4, expiry_date=self.today + timedelta(days=60))
        BatchFactory(outlet=self.outlet, product=self.product, batch_no='LATER', qty_strips=5, expiry_date=self.today + timedelta(days=200))
        rows = self.alerts()['expiringSoon']
        self.assertEqual([r['batch']['batchNumber'] for r in rows], ['GONE', 'SOON', 'LOOSE'])   # soonest first
        self.assertEqual([r['daysUntilExpiry'] for r in rows], [-10, 30, 60])                  # negative = already expired
        self.assertEqual(self.alerts()['counts']['expiringSoon'], 3)

    def test_other_outlets_stock_is_not_in_the_alerts(self):
        BatchFactory(outlet=self.other_outlet, product=MasterProductFactory(name='Elsewhere'), qty_strips=1,
                     expiry_date=self.today + timedelta(days=5))
        a = self.alerts()
        self.assertNotIn('Elsewhere', str(a))

    def test_overdue_accounts_are_counted_with_their_total(self):
        from apps.accounts.models import Customer
        for i, owed in enumerate((300, 700)):
            c = Customer.objects.create(outlet=self.outlet, name=f'C{i}', phone=f'92222222{i:02d}')
            CreditAccount.objects.create(outlet=self.outlet, customer=c, total_outstanding=Decimal(owed), status='overdue')
        a = self.alerts()
        self.assertEqual((a['counts']['overdueAccounts'], a['counts']['overdueAmount']), (2, 1000.0))
        self.assertEqual([r['outstandingAmount'] for r in a['overdueAccounts']], [700.0, 300.0])


class AccessTests(DashboardBase):
    def test_staff_of_another_outlet_cannot_read_this_outlets_numbers(self):
        self.sale(100)
        intruder = make_staff(self.other_outlet, 'manager')
        self.assertEqual(self.get(user=intruder).status_code, 403)

    def test_a_super_admin_can_read_every_outlet_of_their_own_organization_only(self):
        boss = make_staff(self.outlet, 'super_admin')
        self.assertEqual(self.get(user=boss, outletId=str(self.other_outlet.id)).status_code, 200)
        self.assertEqual(self.get(user=boss, outletId=str(self.foreign_outlet.id)).status_code, 403)

    def test_login_is_required(self):
        from rest_framework.test import APIClient
        self.assertIn(APIClient().get(URL, {'outletId': str(self.outlet.id)}).status_code, (401, 403))

    def test_a_missing_or_malformed_outlet_is_refused_not_a_crash(self):
        # the access layer refuses an outlet the caller cannot be shown to own (403) before the view runs; either is safe, a 500 is not
        for params in ({}, {'outletId': 'not-a-uuid'}, {'outletId': str(uuid.uuid4())}):
            with self.subTest(params=params):
                self.assertIn(self.client.get(URL, params).status_code, (403, 404))
