"""
DB-backed tests for the Purchase Book / Consolidated Purchase Book / Purchase Return Book.

Follows docs/testing_architecture.md: isolated test DB (pytest-django), factory_boy
scaffolding, exact Decimal assertions for money (never float literals), explicit
boundary conditions.
"""
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import load_workbook
from rest_framework.test import APIClient

from apps.accounts.models import DebitNote
from apps.accounts.tests.factories import OutletFactory, StaffFactory, SupplierFactory
from apps.purchases.models import PurchaseInvoice
from apps.purchases.tests.factories import PurchaseInvoiceFactory

BOOK = '/api/v1/reports/erp/purchase-book/'
BOOK_EXPORT = '/api/v1/reports/erp/purchase-book/export/'
RETURNS = '/api/v1/reports/erp/purchase-return-book/'
RETURNS_EXPORT = '/api/v1/reports/erp/purchase-return-book/export/'

pytestmark = pytest.mark.django_db


def D(value) -> Decimal:
    """Exact Decimal from an API JSON number (via str, as the architecture doc requires)."""
    return Decimal(str(value))


def make_invoice(outlet, distributor, day, number, *, taxable, gst, round_off='0', freight='0',
                 ledger_adjustment='0', purchase_type='credit', status='POSTED'):
    taxable, gst, round_off = Decimal(taxable), Decimal(gst), Decimal(round_off)
    freight, ledger_adjustment = Decimal(freight), Decimal(ledger_adjustment)
    # Mirrors purchases/models.py: grand_total = taxable + gst + cess + freight + round_off - ledger_adjustment
    grand = taxable + gst + freight + round_off - ledger_adjustment
    return PurchaseInvoiceFactory(
        outlet=outlet, distributor=distributor, invoice_no=number, invoice_date=day,
        subtotal=taxable, taxable_amount=taxable, gst_amount=gst, round_off=round_off,
        freight=freight, ledger_adjustment=ledger_adjustment, grand_total=grand,
        purchase_type=purchase_type, status=status,
    )


def make_note(outlet, distributor, staff, day, number, *, subtotal, gst):
    subtotal, gst = Decimal(subtotal), Decimal(gst)
    return DebitNote.objects.create(
        outlet=outlet, debit_note_no=number, date=day, distributor=distributor,
        reason='Damaged', subtotal=subtotal, gst_amount=gst, total_amount=subtotal + gst,
        created_by=staff,
    )


@pytest.fixture
def shop():
    outlet = OutletFactory()
    admin = StaffFactory(outlet=outlet, role='admin')
    distributor = SupplierFactory(outlet=outlet, name='HRIM MEDICARE')
    client = APIClient()
    client.force_authenticate(user=admin)
    return type('Shop', (), {'outlet': outlet, 'admin': admin, 'distributor': distributor, 'client': client})


def params(shop, **extra):
    base = {'outletId': str(shop.outlet.id), 'startDate': '2026-10-01', 'endDate': '2026-10-31'}
    base.update(extra)
    return base


# ── Purchase Book ────────────────────────────────────────────────────────────

def test_purchase_book_lists_only_posted_invoices_with_exact_decimal_totals(shop):
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 31), 'AAH013970',
                 taxable='1016.55', gst='50.84', round_off='-0.39')
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 31), 'CU38788',
                 taxable='592.06', gst='29.60', round_off='0.34', purchase_type='cash')
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 31), 'DRAFT-1',
                 taxable='999', gst='0', status='SAVED')  # scanned, not yet posted

    res = shop.client.get(BOOK, params(shop, lessReturns='false'))
    assert res.status_code == 200, res.content

    rows = {r['bill_no']: r for r in res.json()['rows']}
    assert set(rows) == {'AAH013970', 'CU38788'}  # draft excluded
    assert D(rows['AAH013970']['bill_amt']) == Decimal('1067.00')
    assert rows['CU38788']['party_name'] == 'CASH (HRIM MEDICARE)'

    s = res.json()['summary']
    assert D(s['total_bill_amt']) == Decimal('1689.00')
    assert D(s['total_taxable']) == Decimal('1608.61')
    assert D(s['total_tax']) == Decimal('80.44')
    assert D(s['total_round_off']) == Decimal('-0.05')
    assert D(s['total_taxable']) + D(s['total_tax']) + D(s['total_round_off']) == D(s['total_bill_amt'])
    assert s['bill_count'] == 2


def test_bill_amount_is_the_invoice_value_not_net_of_ledger_adjustment(shop):
    """ledger_adjustment is a settlement (e.g. a debit note applied at payment). grand_total is net of it,
    but the book must show the bill's real value, otherwise TAXABLE + TAX + R.OFF != BILL AMT and a debit
    note netted via Less Returns would be deducted twice."""
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 10), 'ADJ-1',
                 taxable='933.33', gst='46.67', ledger_adjustment='20')
    res = shop.client.get(BOOK, params(shop, lessReturns='false'))
    row = res.json()['rows'][0]
    assert D(row['bill_amt']) == Decimal('980.00')
    assert D(row['taxable']) + D(row['tax']) + D(row['round_off']) == D(row['bill_amt'])


def test_date_range_is_inclusive_and_falls_back_to_created_at_when_invoice_date_missing(shop):
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 1), 'FIRST', taxable='10', gst='0')
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 31), 'LAST', taxable='10', gst='0')
    make_invoice(shop.outlet, shop.distributor, date(2026, 9, 30), 'BEFORE', taxable='10', gst='0')
    make_invoice(shop.outlet, shop.distributor, date(2026, 11, 1), 'AFTER', taxable='10', gst='0')
    undated = make_invoice(shop.outlet, shop.distributor, date(2026, 10, 15), 'UNDATED', taxable='10', gst='0')
    PurchaseInvoice.objects.filter(pk=undated.pk).update(
        invoice_date=None, created_at=datetime(2026, 10, 15, 23, 59, 30))

    res = shop.client.get(BOOK, params(shop, lessReturns='false'))
    rows = {r['bill_no']: r for r in res.json()['rows']}
    assert set(rows) == {'FIRST', 'LAST', 'UNDATED'}
    assert rows['UNDATED']['date'] == '2026-10-15'


def test_other_outlets_data_never_appears(shop):
    other_outlet = OutletFactory()
    other_dist = SupplierFactory(outlet=other_outlet)
    make_invoice(other_outlet, other_dist, date(2026, 10, 5), 'OTHER', taxable='500', gst='0')
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 5), 'MINE', taxable='100', gst='0')

    res = shop.client.get(BOOK, params(shop, lessReturns='false'))
    assert [r['bill_no'] for r in res.json()['rows']] == ['MINE']


# ── Less returns / Consolidated ──────────────────────────────────────────────

def test_less_returns_nets_debit_notes_once_and_counts_bills_and_returns_separately(shop):
    day = date(2026, 10, 12)
    make_invoice(shop.outlet, shop.distributor, day, 'B-1', taxable='1000', gst='50')
    make_invoice(shop.outlet, shop.distributor, day, 'B-2', taxable='200', gst='0')
    make_note(shop.outlet, shop.distributor, shop.admin, day, 'DN-1', subtotal='100', gst='5')

    detailed = shop.client.get(BOOK, params(shop, lessReturns='true')).json()
    ret = [r for r in detailed['rows'] if r['is_return']]
    assert len(ret) == 1 and D(ret[0]['bill_amt']) == Decimal('-105.00')
    assert D(detailed['summary']['total_bill_amt']) == Decimal('1145.00')  # 1250 - 105
    assert detailed['summary']['bill_count'] == 2
    assert detailed['summary']['return_count'] == 1
    assert D(detailed['summary']['return_amount']) == Decimal('105.00')

    daily = shop.client.get(BOOK, params(shop, lessReturns='true', format='summarised')).json()
    assert len(daily['rows']) == 1
    # Day counts must add up to the footer: 2 bills + 1 return, not 3 "bills".
    assert daily['rows'][0]['bill_count'] == 2
    assert daily['rows'][0]['return_count'] == 1
    assert sum(r['bill_count'] for r in daily['rows']) == daily['summary']['bill_count']
    assert D(daily['rows'][0]['bill_amt']) == D(daily['summary']['total_bill_amt'])


def test_without_less_returns_debit_notes_are_ignored(shop):
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 12), 'B-1', taxable='1000', gst='0')
    make_note(shop.outlet, shop.distributor, shop.admin, date(2026, 10, 12), 'DN-1', subtotal='100', gst='0')
    body = shop.client.get(BOOK, params(shop, lessReturns='false')).json()
    assert D(body['summary']['total_bill_amt']) == Decimal('1000.00')
    assert body['summary']['return_count'] == 0


# ── Purchase Return Book ─────────────────────────────────────────────────────

def test_return_book_lists_only_this_outlets_debit_notes_in_range(shop):
    other_outlet = OutletFactory()
    other_staff = StaffFactory(outlet=other_outlet)
    other_dist = SupplierFactory(outlet=other_outlet)
    make_note(other_outlet, other_dist, other_staff, date(2026, 10, 5), 'DN-OTHER', subtotal='999', gst='0')
    make_note(shop.outlet, shop.distributor, shop.admin, date(2026, 10, 5), 'DN-2', subtotal='100', gst='12')
    make_note(shop.outlet, shop.distributor, shop.admin, date(2026, 10, 5), 'DN-1', subtotal='150', gst='0')
    make_note(shop.outlet, shop.distributor, shop.admin, date(2026, 11, 2), 'DN-LATE', subtotal='1', gst='0')

    body = shop.client.get(RETURNS, params(shop)).json()
    assert [r['bill_no'] for r in body['rows']] == ['DN-1', 'DN-2']
    assert all(r['is_return'] for r in body['rows'])
    assert D(body['summary']['total_bill_amt']) == Decimal('262.00')
    assert D(body['summary']['total_tax']) == Decimal('12.00')
    assert body['summary']['return_count'] == 2

    daily = shop.client.get(RETURNS, params(shop, format='summarised')).json()
    assert daily['rows'][0]['return_count'] == 2


# ── Excel export through the API ─────────────────────────────────────────────

def test_excel_exports_download_with_matching_totals(shop):
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 12), 'B-1', taxable='1016.55', gst='50.84',
                 round_off='-0.39')
    make_note(shop.outlet, shop.distributor, shop.admin, date(2026, 10, 12), 'DN-1', subtotal='150', gst='0')

    res = shop.client.get(BOOK_EXPORT, params(shop, lessReturns='false', variant='consolidated'))
    assert res.status_code == 200
    assert 'Consolidated_Purchase_Book_Detailed_2026-10-01_to_2026-10-31.xlsx' in res['Content-Disposition']
    ws = load_workbook(BytesIO(res.content)).active
    assert ws['D6'].value == 1067.0
    assert [c.value for c in ws[7]][3] == 1067.0  # TOTAL row

    res = shop.client.get(RETURNS_EXPORT, params(shop))
    assert res.status_code == 200
    ws = load_workbook(BytesIO(res.content)).active
    assert 'PURCHASE RETURN BOOK' in ws['A3'].value
    assert ws['A6'].value == '2026-10-12' and ws['B6'].value == 'DN-1' and ws['D6'].value == 150.0


# ── Access control ───────────────────────────────────────────────────────────

@pytest.mark.parametrize('url', [BOOK, BOOK_EXPORT, RETURNS, RETURNS_EXPORT])
@pytest.mark.parametrize('param_name', ['outletId', 'outlet_id'])
def test_staff_cannot_read_another_outlet_by_any_outlet_param(shop, url, param_name):
    other_outlet = OutletFactory()
    make_invoice(other_outlet, SupplierFactory(outlet=other_outlet), date(2026, 10, 5), 'SECRET',
                 taxable='500', gst='0')

    res = shop.client.get(url, {param_name: str(other_outlet.id), 'startDate': '2026-10-01',
                                'endDate': '2026-10-31'})
    assert res.status_code == 403, res.content
    assert b'SECRET' not in res.content


def test_super_admin_may_read_any_outlet(shop):
    other_outlet = OutletFactory()
    make_invoice(other_outlet, SupplierFactory(outlet=other_outlet), date(2026, 10, 5), 'OTHER-OK',
                 taxable='500', gst='0')
    boss = StaffFactory(outlet=shop.outlet, role='super_admin')
    client = APIClient()
    client.force_authenticate(user=boss)

    res = client.get(BOOK, {'outlet_id': str(other_outlet.id), 'startDate': '2026-10-01',
                            'endDate': '2026-10-31', 'lessReturns': 'false'})
    assert res.status_code == 200
    assert [r['bill_no'] for r in res.json()['rows']] == ['OTHER-OK']


def test_user_without_report_access_is_refused_and_anonymous_gets_401(shop):
    low = StaffFactory(outlet=shop.outlet, role='billing_staff', can_access_reports=False)
    client = APIClient()
    client.force_authenticate(user=low)
    assert client.get(BOOK, params(shop)).status_code == 403
    assert APIClient().get(BOOK, params(shop)).status_code == 401


def test_outlet_defaults_to_the_users_own_outlet_and_unknown_outlet_is_404(shop):
    make_invoice(shop.outlet, shop.distributor, date(2026, 10, 5), 'MINE', taxable='100', gst='0')
    res = shop.client.get(BOOK, {'startDate': '2026-10-01', 'endDate': '2026-10-31', 'lessReturns': 'false'})
    assert [r['bill_no'] for r in res.json()['rows']] == ['MINE']

    super_admin = StaffFactory(outlet=shop.outlet, role='super_admin')
    client = APIClient()
    client.force_authenticate(user=super_admin)
    assert client.get(BOOK, {'outletId': '00000000-0000-0000-0000-000000000000'}).status_code == 404


# ── Defaults when the client omits lessReturns ───────────────────────────────

@pytest.mark.parametrize('extra, netted', [
    ({}, False),                                # plain Purchase Book: a register of purchases
    ({'variant': 'consolidated'}, True),        # Consolidated Purchase Book nets returns by default
    ({'lessReturns': 'true'}, True),            # an explicit value always wins
    ({'variant': 'consolidated', 'lessReturns': 'false'}, False),
])
def test_less_returns_default_depends_on_the_book_but_explicit_value_wins(shop, extra, netted):
    day = date(2026, 10, 12)
    make_invoice(shop.outlet, shop.distributor, day, 'B-1', taxable='1000', gst='0')
    make_note(shop.outlet, shop.distributor, shop.admin, day, 'DN-1', subtotal='100', gst='0')

    body = shop.client.get(BOOK, params(shop, **extra)).json()
    assert D(body['summary']['total_bill_amt']) == (Decimal('900.00') if netted else Decimal('1000.00'))
    assert body['less_returns'] is netted
