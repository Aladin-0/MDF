"""
A product is sold at the GST rate it carries. No "allowed slab" list decides whether a bill may be saved.

The bug: ENERZAL (an energy drink, HSN 2202, GST 40%) had been bought and was in stock, but every bill with it was refused
with "GST rate 40% is deactivated under GST 2.0 reforms". The same gate had refused 12% and 28% goods before. The rate
comes from the purchase bill; the only check left is that it is a possible rate (a number from 0 to 100).
"""
import datetime
from decimal import Decimal, ROUND_HALF_UP

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

D = Decimal
URL = 'sale-list-create'


def q2(x):
    return D(x).quantize(D('0.01'), rounding=ROUND_HALF_UP)


def make_world(n_products=1, stock=50):
    """An outlet, a cashier and `n_products` products with one stocked batch each."""
    from apps.billing.tests.factories import make_test_outlet
    from apps.accounts.tests.factories import StaffFactory
    from apps.inventory.models import MasterProduct, Batch

    outlet = make_test_outlet()
    staff = StaffFactory(outlet=outlet, role='super_admin', max_discount=D('100'))
    batches = []
    for i in range(n_products):
        p = MasterProduct.objects.create(name=f'DRINK {i:02d}', composition='.', manufacturer='MAKER', drug_type='general',
                                         schedule_type='OTC', gst_rate=D('18'), pack_size=1, pack_unit='Piece', pack_type='piece',
                                         mrp=D('100'))
        batches.append(Batch.objects.create(outlet=outlet, product=p, batch_no=f'B{i:02d}', expiry_date=datetime.date(2028, 12, 31),
                                            mrp=D('100'), purchase_rate=D('40'), ptr=D('50'), pts=D('45'), landing_rate=D('44'),
                                            pack_size=1, pack_unit='Piece', pack_type='piece', qty_strips=stock, qty_loose=0))
    client = APIClient()
    client.force_authenticate(user=staff)
    return outlet, staff, batches, client


def line(batch, packs):
    """One bill line as the billing screen sends it, at the product's own GST rate."""
    gst = batch.product.gst_rate
    total = q2(batch.mrp * D(packs))
    taxable = q2(total * 100 / (100 + gst))
    return {'batchId': str(batch.id), 'productId': str(batch.product_id), 'qtyStrips': packs, 'qtyLoose': 0, 'rate': str(batch.mrp),
            'discountPct': '0', 'gstRate': str(gst), 'totalAmount': str(total), 'taxableAmount': str(taxable),
            'gstAmount': str(total - taxable), 'scheduleType': 'OTC'}


def bill(outlet, staff, items):
    total = sum(D(i['totalAmount']) for i in items)
    return {'outletId': str(outlet.id), 'items': items, 'subtotal': str(total), 'discountAmount': '0', 'grandTotal': str(total),
            'paymentMode': 'cash', 'invoiceDate': '2026-08-01T10:00:00', 'billedBy': str(staff.id)}


def with_rate(batch, rate):
    batch.product.gst_rate = D(rate)
    batch.product.save(update_fields=['gst_rate'])
    return batch


@pytest.mark.django_db
def test_a_40_percent_product_in_stock_can_be_sold():
    from apps.billing.models import SaleItem
    from apps.core.models import TaxSlab
    outlet, staff, batches, client = make_world(n_products=1)
    enerzal = with_rate(batches[0], '40')
    TaxSlab.objects.filter(rate=D('40')).delete()            # even when the slab table has never heard of 40%

    r = client.post(reverse(URL), bill(outlet, staff, [line(enerzal, 2)]), format='json')

    assert r.status_code == 201, r.content
    item = SaleItem.objects.get(invoice_id=r.data['id'])
    assert item.gst_rate == D('40.00')
    enerzal.refresh_from_db()
    assert enerzal.qty_strips == 48


@pytest.mark.django_db
@pytest.mark.parametrize('rate', ['12', '28', '3', '0.25'])
def test_no_rate_is_refused_for_not_being_a_current_slab(rate):
    from apps.core.models import TaxSlab
    outlet, staff, batches, client = make_world(n_products=1)
    TaxSlab.objects.update(is_active=False)                  # nothing in the table is "active": it is a list, not a gate
    r = client.post(reverse(URL), bill(outlet, staff, [line(with_rate(batches[0], rate), 1)]), format='json')
    assert r.status_code == 201, r.content


@pytest.mark.django_db
@pytest.mark.parametrize('rate', ['-5', '140', 'abc'])
def test_an_impossible_rate_is_still_refused(rate):
    outlet, staff, batches, client = make_world(n_products=1)
    row = line(batches[0], 1)
    row['gstRate'] = rate
    r = client.post(reverse(URL), bill(outlet, staff, [row]), format='json')
    assert r.status_code == 400
    assert r.data['code'] == 'INVALID_GST_RATE'
    batches[0].refresh_from_db()
    assert batches[0].qty_strips == 50                       # nothing was sold


@pytest.mark.django_db
def test_40_percent_is_a_known_standard_rate():
    """The slab table feeds pick-lists and the journals' rate matching, so it should list 40% (migration core 0017)."""
    from apps.core.models import TaxSlab
    assert D('40.00') in TaxSlab.get_all_rates()
    assert TaxSlab.rate_error('40') == '' and TaxSlab.rate_error(0) == '' and TaxSlab.rate_error('100') == ''
    assert TaxSlab.rate_error('100.01') and TaxSlab.rate_error(None) and TaxSlab.rate_error('NaN')
