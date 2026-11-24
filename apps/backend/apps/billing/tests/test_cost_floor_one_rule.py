"""
One cost-floor rule, shared with the billing screen, and it follows what the shop PAID.

The bug (24 Nov 2026, a bill of ₹359.70 with a ₹135 bill discount): BUDECORT had been bought 30 + 10 free at ₹19.49,
so a pack cost ₹14.62, but its batch carried no landing cost (purchases stored it on the purchase line only). The
server's floor rule then tried the PTR (19.49, the supplier's list price) BEFORE the purchase rate, while the screen's
own copy of the rule used the purchase rate. The screen gave BUDECORT more of the discount than the server allowed,
the server lifted the line back to 4 x 19.49, the lines no longer added up to the total and the bill was refused with
"Security Block: Invalid Round Off (₹-13.98)".

Now: the rule lives in `cost_floor_per_pack` (landing cost, else purchase rate, PTR only as a last resort), the screen
receives its answer with every batch, and a bill whose discount really does take a line below cost is refused in plain
words with the floors the screen needs to correct itself.
"""
import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

D = Decimal
URL = 'sale-list-create'

# name, MRP, pack size, strips, loose, landing, ptr, purchase  (the live batches of the refused bill)
LINES = [
    ('DILZEM INJ 5ML', '18.67', 5, 1, 0, '14.58', '14.32', '14.32'),
    ('DUONICS RESPULE 5S', '27.00', 5, 5, 0, '5.66', '5.50', '5.50'),
    ('MUCIDOTE INJ 2ML', '50.50', 2, 1, 0, '17.06', '16.25', '16.25'),
    ('BUDECORT 0.5MG RESPULE', '25.58', 1, 4, 0, None, '19.49', '14.62'),      # no landing cost on record
    ('NICARDIA RETARD 20MG TAB', '159.64', 15, 0, 5, '127.71', '121.63', '121.63'),
]
SENT = ['14.58', '73.12', '30.75', '63.68', '42.57']            # exactly what the screen sent for the refused bill (sum 224.70)
BELOW_COST = ['14.58', '86.80', '30.75', '50.00', '42.57']      # same total, but BUDECORT at 50.00: under 4 x 14.62 = 58.48


@pytest.fixture
def world(db):
    from apps.billing.tests.factories import make_test_outlet
    from apps.accounts.tests.factories import StaffFactory
    from apps.core.models import OutletSettings
    from apps.inventory.models import MasterProduct, Batch

    outlet = make_test_outlet()
    OutletSettings.objects.update_or_create(outlet=outlet, defaults={'landing_cost_include_gst': True})   # as on the live outlet
    staff = StaffFactory(outlet=outlet, role='super_admin', max_discount=D('100'))
    batches = []
    for i, (name, mrp, pack, strips, loose, landing, ptr, purchase) in enumerate(LINES):
        p = MasterProduct.objects.create(name=name, composition='.', manufacturer='MAKER', drug_type='allopathy', schedule_type='OTC',
                                         gst_rate=D('5'), pack_size=pack, pack_unit='Tablet' if pack == 15 else 'Piece',
                                         pack_type='strip' if pack == 15 else 'vial', mrp=D(mrp))
        batches.append(Batch.objects.create(
            outlet=outlet, product=p, batch_no=f'B{i}', expiry_date=datetime.date(2028, 12, 31), mrp=D(mrp),
            purchase_rate=D(purchase), ptr=D(ptr), pts=D('0'), landing_rate=D(landing) if landing else None,
            pack_size=pack, pack_unit=p.pack_unit, pack_type=p.pack_type, qty_strips=20, qty_loose=0))
    client = APIClient()
    client.force_authenticate(user=staff)
    return outlet, staff, batches, client


def bill(outlet, staff, batches, sent_totals, grand_total='225'):
    items = []
    for batch, (name, mrp, pack, strips, loose, *_), total in zip(batches, LINES, sent_totals):
        total = D(total)
        taxable = (total * 100 / 105).quantize(D('0.01'))
        items.append({'batchId': str(batch.id), 'productId': str(batch.product_id), 'name': name, 'qtyStrips': strips, 'qtyLoose': loose,
                      'rate': mrp, 'discountPct': 0, 'gstRate': 5, 'totalAmount': str(total), 'taxableAmount': str(taxable),
                      'gstAmount': str(total - taxable), 'scheduleType': 'OTC', 'saleMode': 'strip'})
    return {'outletId': str(outlet.id), 'items': items, 'subtotal': '214.01', 'discountAmount': '135.00', 'extraDiscountPct': 37.53,
            'grandTotal': grand_total, 'paymentMode': 'upi', 'invoiceDate': '2026-11-24T17:18:00', 'billedBy': str(staff.id)}


def stock(batches):
    for b in batches:
        b.refresh_from_db()
    return [(b.qty_strips, b.qty_loose) for b in batches]


def test_the_rule_and_what_the_screen_is_sent(world):
    from apps.billing.utils.pricing import cost_floor_per_pack, cost_floors, line_cost_floor
    from apps.inventory.views import serialize_batch
    outlet, staff, batches, client = world
    budecort, dilzem = batches[3], batches[0]

    assert cost_floor_per_pack(dilzem, 'RETAIL') == (D('14.58'), 'landing cost')          # the landing cost first
    assert cost_floor_per_pack(budecort, 'RETAIL') == (D('14.62'), 'landing cost')        # none: what was PAID, not the PTR (19.49)
    assert cost_floor_per_pack(budecort, 'WHOLESALE') == (D('14.62'), 'purchase rate')
    budecort.purchase_rate = D('0')
    assert cost_floor_per_pack(budecort, 'RETAIL')[0] == D('19.49')                       # no cost at all on record: PTR, the last resort
    budecort.refresh_from_db()

    # the screen gets the answer with the batch: it never works the floor out for itself
    assert cost_floors(budecort) == {'retailCostFloor': 14.62, 'wholesaleCostFloor': 14.62}
    sent = serialize_batch(budecort)
    assert (sent['retailCostFloor'], sent['wholesaleCostFloor']) == (14.62, 14.62)
    # and the line floor every sale path uses is built on the same per-pack figure
    assert line_cost_floor(budecort, 'RETAIL', 4, 0, D('5'), landing_cost_include_gst=True)['line_floor'] == D('58.48')


def test_the_refused_bill_now_saves_at_225_exactly_as_the_screen_sent_it(world):
    from apps.billing.models import SaleInvoice, SaleItem
    outlet, staff, batches, client = world

    r = client.post(reverse(URL), bill(outlet, staff, batches, SENT), format='json')

    assert r.status_code == 201, r.content
    invoice = SaleInvoice.objects.get(id=r.data['id'])
    assert invoice.grand_total == D('225.00')
    assert abs(invoice.round_off) <= D('0.50')                           # only the rupee rounding (224.70 -> 225)
    rows = {i.product_name: i.total_amount for i in SaleItem.objects.filter(invoice=invoice)}
    assert rows['BUDECORT 0.5MG RESPULE'] == D('63.68')                  # no longer lifted to 4 x PTR = 77.96
    assert sum(rows.values()) == D('224.70')                             # the customer got the full ₹135


def test_it_also_saves_once_the_batch_carries_its_real_landing_cost(world):
    """What purchases now write on the batch: 14.6175 a pack + 5% GST = 15.35, so the line may not go under 61.40."""
    from apps.billing.utils.pricing import cost_floors
    outlet, staff, batches, client = world
    budecort = batches[3]
    budecort.landing_rate = D('15.35')
    budecort.save(update_fields=['landing_rate'])
    assert cost_floors(budecort)['retailCostFloor'] == 15.35

    r = client.post(reverse(URL), bill(outlet, staff, batches, SENT), format='json')
    assert r.status_code == 201, r.content                               # 63.68 is above 61.40


def test_a_discount_that_really_goes_below_cost_is_refused_in_plain_words_and_nothing_is_sold(world):
    outlet, staff, batches, client = world
    before = stock(batches)

    r = client.post(reverse(URL), bill(outlet, staff, batches, BELOW_COST), format='json')

    assert r.status_code == 400
    assert r.data['code'] == 'DISCOUNT_BELOW_COST'                       # not "Security Block: Invalid Round Off"
    assert 'Security Block' not in r.data['detail']
    assert 'BUDECORT 0.5MG RESPULE' in r.data['detail'] and '58.48' in r.data['detail'] and '50.00' in r.data['detail']
    # the floors the screen needs to correct the line on its own
    assert len(r.data['floors']) == 1
    floor = r.data['floors'][0]
    assert (floor['batchId'], floor['retailCostFloor'], floor['wholesaleCostFloor'], floor['lineFloor'], floor['sent']) == (
        str(batches[3].id), 14.62, 14.62, 58.48, 50.0)
    assert stock(batches) == before


def test_a_total_that_simply_does_not_match_its_lines_is_still_blocked(world):
    """The tamper guard is unchanged: no line was below cost here, the total is just wrong."""
    outlet, staff, batches, client = world
    r = client.post(reverse(URL), bill(outlet, staff, batches, SENT, grand_total='150'), format='json')
    assert r.status_code == 400
    assert r.data['code'] == 'INVALID_ROUND_OFF'
