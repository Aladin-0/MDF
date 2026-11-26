"""
A bill discount typed in rupees is remembered on the saved bill, so modifying the bill keeps that many rupees.
"""
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.billing.tests.test_line_discount_once import world  # noqa: F401  (fixture)

D = Decimal


def body(world, rupees, pct, grand, qty=5, **extra):
    outlet, staff, batch, client = world
    total = D(str(grand))
    taxable = (total * 100 / 105).quantize(D('0.01'))
    return {
        'outletId': str(outlet.id), 'billedBy': str(staff.id), 'paymentMode': 'cash', 'cashPaid': grand, 'grandTotal': grand,
        'extraDiscountPct': pct, 'extraDiscountRupees': rupees, 'discountAmount': rupees or 0,
        'items': [{'batchId': str(batch.id), 'productId': str(batch.product_id), 'name': 'DOLO', 'qtyStrips': qty, 'qtyLoose': 0, 'rate': 100,
                   'discountPct': 0, 'gstRate': 5, 'totalAmount': str(total), 'taxableAmount': str(taxable), 'gstAmount': str(total - taxable)}],
        **extra,
    }


def create(world, rupees, pct=20, grand=400):
    from apps.billing.models import SaleInvoice
    client = world[3]
    r = client.post(reverse('sale-list-create'), body(world, rupees, pct, grand), format='json')
    assert r.status_code == 201, r.content
    return SaleInvoice.objects.get(id=r.data['id']), r


def test_rupees_are_saved_and_sent_back(world):
    outlet, staff, batch, client = world
    invoice, response = create(world, 100)
    assert invoice.extra_discount_rupees == D('100.00')
    assert response.data['extraDiscountRupees'] == 100.0
    detail = client.get(reverse('sale-detail', kwargs={'sale_id': invoice.id}), {'outletId': str(outlet.id)})
    assert detail.status_code == 200, detail.content
    assert detail.data['extraDiscountRupees'] == 100.0


def test_a_percent_discount_remembers_no_rupees(world):
    invoice, response = create(world, None)
    assert invoice.extra_discount_rupees is None
    assert response.data['extraDiscountRupees'] is None


@pytest.mark.parametrize('nonsense', [-5, 'abc', 10 ** 15, 0])
def test_a_nonsense_rupee_figure_is_ignored(world, nonsense):
    outlet, staff, batch, client = world
    payload = body(world, None, 20, 400)
    payload['extraDiscountRupees'] = nonsense
    r = client.post(reverse('sale-list-create'), payload, format='json')
    assert r.status_code == 201, r.content
    from apps.billing.models import SaleInvoice
    assert SaleInvoice.objects.get(id=r.data['id']).extra_discount_rupees is None


def test_modifying_keeps_or_changes_the_rupees(world):
    from apps.billing.sale_update_service import atomic_sale_update
    outlet, staff, batch, client = world
    invoice, _ = create(world, 100)
    updated = atomic_sale_update(str(invoice.id), body(world, 100, 12.5, 700, qty=8), str(outlet.id), str(staff.id))
    assert (updated.extra_discount_rupees, updated.grand_total) == (D('100.00'), D('700.00'))
    updated = atomic_sale_update(str(invoice.id), body(world, None, 10, 720, qty=8), str(outlet.id), str(staff.id))
    assert updated.extra_discount_rupees is None


def quantity_only_staff(outlet):
    from apps.accounts.tests.factories import StaffFactory
    return StaffFactory(outlet=outlet, role='billing_staff', can_correct_quantities=True, can_correct_rates_discounts=False)


def scope(world, invoice, **changes):
    from apps.billing.sale_update_service import check_correction_scope
    payload = body(world, changes.pop('rupees'), changes.pop('pct'), changes.pop('grand'), qty=changes.pop('qty'))
    check_correction_scope(quantity_only_staff(world[0]), invoice, payload, 'commercial_correction')


def test_adding_quantity_with_the_same_rupees_is_not_a_discount_change(world):
    invoice, _ = create(world, 100)
    scope(world, invoice, rupees=100, pct=12.5, grand=700, qty=8)          # allowed: only quantities changed
    scope(world, invoice, rupees=100, pct=20, grand=400, qty=5)            # an unchanged re-save


@pytest.mark.parametrize('rupees, pct', [
    (200, 25),          # different rupees
    (100, 90),          # the same rupees beside a percent that gives away far more
    (None, 12.5),       # switched to a percent
])
def test_changing_the_discount_still_needs_the_discount_right(world, rupees, pct):
    from apps.billing.sale_update_service import RevisionNotAllowed
    invoice, _ = create(world, 100)
    with pytest.raises(RevisionNotAllowed):
        scope(world, invoice, rupees=rupees, pct=pct, grand=700, qty=8)


def test_typing_rupees_on_a_percent_bill_needs_the_discount_right(world):
    from apps.billing.sale_update_service import RevisionNotAllowed
    invoice, _ = create(world, None)
    with pytest.raises(RevisionNotAllowed):
        scope(world, invoice, rupees=100, pct=20, grand=400, qty=5)


def test_rupees_larger_than_the_bill_are_an_unchanged_discount_too(world):
    invoice, _ = create(world, 100)
    scope(world, invoice, rupees=100, pct=12.5, grand=700, qty=8)
    from apps.billing.sale_update_service import check_correction_scope
    # one pack left: the Rs 100 is the whole line, which the screen sends as 100%
    check_correction_scope(quantity_only_staff(world[0]), invoice, body(world, 100, 100, 0, qty=1), 'commercial_correction')
