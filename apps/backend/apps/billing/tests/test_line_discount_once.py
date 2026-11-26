"""
Repro: a line discount, sent exactly as the billing screen sends it.

The screen's `rate` is the price AFTER the line discount (lib/cartLine.ts, calculateRowTotals) and `discountPct` only says
how big that discount was.
"""
import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

D = Decimal
URL = 'sale-list-create'


@pytest.fixture
def world(db):
    from apps.billing.tests.factories import make_test_outlet
    from apps.accounts.tests.factories import StaffFactory
    from apps.inventory.models import MasterProduct, Batch

    outlet = make_test_outlet()
    staff = StaffFactory(outlet=outlet, role='super_admin', max_discount=D('100'))
    p = MasterProduct.objects.create(name='DOLO', composition='.', manufacturer='MAKER', drug_type='allopathy', schedule_type='OTC',
                                     gst_rate=D('5'), pack_size=1, pack_unit='Piece', pack_type='vial', mrp=D('100'))
    batch = Batch.objects.create(outlet=outlet, product=p, batch_no='B1', expiry_date=datetime.date(2028, 12, 31), mrp=D('100'),
                                 purchase_rate=D('40'), ptr=D('45'), pts=D('50'), landing_rate=D('42'), pack_size=1,
                                 pack_unit='Piece', pack_type='vial', qty_strips=100, qty_loose=0)
    client = APIClient()
    client.force_authenticate(user=staff)
    return outlet, staff, batch, client


def post(world, *, rate, disc, qty, line_total, grand, sale_type='RETAIL', extra=0):
    outlet, staff, batch, client = world
    total = D(str(line_total))
    taxable = (total * 100 / 105).quantize(D('0.01'))
    return client.post(reverse(URL), {
        'outletId': str(outlet.id), 'saleType': sale_type, 'billingBasis': 'PTR' if sale_type == 'WHOLESALE' else 'MRP',
        'items': [{'batchId': str(batch.id), 'productId': str(batch.product_id), 'name': 'DOLO', 'qtyStrips': qty, 'qtyLoose': 0,
                   'rate': rate, 'discountPct': disc, 'gstRate': 5, 'totalAmount': str(total), 'taxableAmount': str(taxable),
                   'gstAmount': str(total - taxable), 'scheduleType': 'OTC', 'saleMode': 'strip'}],
        'discountAmount': 0, 'extraDiscountPct': extra, 'grandTotal': grand, 'paymentMode': 'cash', 'cashPaid': grand,
        'billedBy': str(staff.id),
    }, format='json')


def saved(response):
    from apps.billing.models import SaleItem
    assert response.status_code == 201, response.content
    return SaleItem.objects.get(invoice_id=response.data['id'])


def test_small_line_discount_is_stored_once(world):
    # MRP 100, 1% off -> 99
    row = saved(post(world, rate=99, disc=1, qty=1, line_total=99, grand=99))
    assert row.total_amount == D('99.00')


def test_large_line_discount_saves(world):
    # MRP 100, 10% off -> 90, two packs -> 180
    row = saved(post(world, rate=90, disc=10, qty=2, line_total=180, grand=180))
    assert row.total_amount == D('180.00')


def test_line_discount_with_bill_discount(world):
    # 10% off the line (180), then 5% off the bill -> 171
    row = saved(post(world, rate=90, disc=10, qty=2, line_total=171, grand=171, extra=5))
    assert row.total_amount == D('171.00')


def test_wholesale_line_discount(world):
    # PTS 50, 10% off -> 45, two packs = 90 + 5% GST = 94.50
    row = saved(post(world, rate=45, disc=10, qty=2, line_total='94.50', grand=94.5, sale_type='WHOLESALE'))
    assert row.total_amount == D('94.50')


def test_deep_line_discount_that_is_still_above_cost_is_allowed(world):
    # 40% off MRP 100 -> 60, above the cost floor 42 x 1.05 = 44.10
    row = saved(post(world, rate=60, disc=40, qty=1, line_total=60, grand=60))
    assert row.total_amount == D('60.00')


def test_line_discount_does_not_open_a_way_below_cost(world):
    from apps.billing.models import SaleInvoice
    # 60% off MRP 100 -> 40, under the cost floor 42 x 1.05 = 44.10
    r = post(world, rate=40, disc=60, qty=1, line_total=40, grand=40)
    assert r.status_code == 400, r.content
    assert r.data['code'] in ('LOSS_SALE_PREVENTED', 'DISCOUNT_BELOW_COST')
    assert SaleInvoice.objects.count() == 0


def test_a_rupee_line_discount_sent_with_an_unrounded_rate(world):
    # Rs 100 off three packs of MRP 100: rate 66.666..., discount 33.333...%
    row = saved(post(world, rate=200 / 3, disc=100 / 3, qty=3, line_total=200, grand=200))
    assert row.total_amount == D('200.00')


def test_a_row_without_amounts_is_still_priced_from_rate_and_discount(world):
    outlet, staff, batch, client = world
    r = client.post(reverse(URL), {
        'outletId': str(outlet.id), 'billedBy': str(staff.id), 'grandTotal': 90, 'paymentMode': 'cash', 'cashPaid': 90,
        'items': [{'batchId': str(batch.id), 'productId': str(batch.product_id), 'qtyStrips': 1, 'qtyLoose': 0,
                   'rate': 100, 'discountPct': 10, 'gstRate': 5}],
    }, format='json')
    assert saved(r).total_amount == D('90.00')


# ---- quotations: the same meaning of `rate` ----

QUOTATION_FIX_PENDING = pytest.mark.skip(reason='server quotation fix not made yet; these tests have never been run')

def quote(world, *, rate, disc, qty, line_total, grand, extra=0):
    outlet, staff, batch, client = world
    total = D(str(line_total))
    return client.post(reverse('quotation-list-create'), {
        'outletId': str(outlet.id), 'subtotal': str(total), 'grandTotal': str(grand), 'extraDiscountPct': extra,
        'items': [{'batchId': str(batch.id), 'productId': str(batch.product_id), 'name': 'DOLO', 'qtyStrips': qty, 'qtyLoose': 0,
                   'rate': rate, 'discountPct': disc, 'gstRate': 5, 'totalAmount': str(total),
                   'taxableAmount': str((total * 100 / 105).quantize(D('0.01'))),
                   'gstAmount': str(total - (total * 100 / 105).quantize(D('0.01')))}],
    }, format='json')


def convert(world, quotation_id, grand):
    outlet, staff, batch, client = world
    return client.post(reverse('quotation-convert', kwargs={'pk': quotation_id}),
                       {'paymentMode': 'cash', 'cashPaid': str(grand), 'amountPaid': str(grand)}, format='json')


@QUOTATION_FIX_PENDING
def test_a_quotation_keeps_the_discounted_price_and_bills_it(world):
    from apps.billing.models import QuotationItem, SaleItem
    r = quote(world, rate=90, disc=10, qty=2, line_total=180, grand=180)
    assert r.status_code == 200 or r.status_code == 201, r.content
    line = QuotationItem.objects.get(quotation_id=r.data['id'])
    assert (line.rate, line.sale_rate, line.mrp) == (D('90.00'), D('100.00'), D('100.00'))
    c = convert(world, r.data['id'], 180)
    assert c.status_code == 201, c.content
    sold = SaleItem.objects.get(invoice_id=c.data['id'])
    assert (sold.rate, sold.total_amount) == (D('90.00'), D('180.00'))


@QUOTATION_FIX_PENDING
def test_a_quotation_accepts_an_unrounded_rate_and_discounts(world):
    r = quote(world, rate=200 / 3, disc=100 / 3, qty=3, line_total=200, grand=180, extra=9.661836)
    assert r.status_code in (200, 201), r.content


@QUOTATION_FIX_PENDING
def test_an_older_quotation_that_stored_the_mrp_as_its_rate_still_converts(world):
    from apps.billing.models import QuotationItem, SaleItem
    r = quote(world, rate=90, disc=10, qty=2, line_total=180, grand=180)
    QuotationItem.objects.filter(quotation_id=r.data['id']).update(rate=D('100.00'))       # how it used to be stored
    c = convert(world, r.data['id'], 180)
    assert c.status_code == 201, c.content
    sold = SaleItem.objects.get(invoice_id=c.data['id'])
    assert (sold.rate, sold.total_amount) == (D('90.00'), D('180.00'))


def test_modifying_a_bill_with_an_unrounded_rate(world):
    from apps.billing.models import SaleInvoice
    from apps.billing.sale_update_service import atomic_sale_update
    outlet, staff, batch, client = world
    created = post(world, rate=90, disc=10, qty=2, line_total=180, grand=180)
    assert created.status_code == 201, created.content
    updated = atomic_sale_update(str(created.data['id']), {
        'grandTotal': 200, 'cashPaid': 200,
        'items': [{'batchId': str(batch.id), 'productId': str(batch.product_id), 'qtyStrips': 3, 'qtyLoose': 0,
                   'rate': 200 / 3, 'discountPct': 100 / 3, 'gstRate': 5, 'totalAmount': 200, 'taxableAmount': 190.48, 'gstAmount': 9.52}],
    }, str(outlet.id), str(staff.id))
    assert updated.items.get().total_amount == D('200.00')


def test_a_half_paisa_line_is_saved_as_the_screen_showed_it(world):
    # 50.125 a pack: the screen rounds half up (50.13); the server's own rounding would store 50.12
    row = saved(post(world, rate=50.125, disc=49.875, qty=1, line_total='50.13', grand=50))
    assert row.total_amount == D('50.13')
