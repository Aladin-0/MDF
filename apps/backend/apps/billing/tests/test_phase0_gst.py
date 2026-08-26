import pytest
from decimal import Decimal
from apps.billing.sale_services import atomic_sale_save
from apps.accounts.tests.factories import OutletFactory, CustomerFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.billing.models import SaleInvoice

@pytest.mark.django_db
@pytest.mark.parametrize('outlet_state, customer_state, gst_rate, expected_cgst, expected_sgst, expected_igst', [('Maharashtra', 'Maharashtra', Decimal('12.00'), Decimal('6.00'), Decimal('6.00'), Decimal('0.00')), ('Delhi', 'Delhi', Decimal('18.00'), Decimal('9.00'), Decimal('9.00'), Decimal('0.00')), ('Maharashtra', 'Gujarat', Decimal('12.00'), Decimal('0.00'), Decimal('0.00'), Decimal('12.00')), ('Delhi', 'Haryana', Decimal('18.00'), Decimal('0.00'), Decimal('0.00'), Decimal('18.00')), ('Maharashtra', 'Maharashtra', Decimal('0.00'), Decimal('0.00'), Decimal('0.00'), Decimal('0.00')), ('Maharashtra', 'Gujarat', Decimal('0.00'), Decimal('0.00'), Decimal('0.00'), Decimal('0.00'))])
def test_gst_tax_calculation_matrix(outlet_state, customer_state, gst_rate, expected_cgst, expected_sgst, expected_igst):
    """
    Parameterized GST tax calculation matrix suite using factory boy builders.
    Verifies tax breakdown amounts match mathematical expectations down to exact decimal precision.
    """
    outlet = OutletFactory(state=outlet_state)
    from django.core.management import call_command
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet, state=customer_state)
    staff = StaffFactory(outlet=outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, mrp=Decimal('100.00'), pack_size=10, qty_strips=10, qty_loose=0)
    if gst_rate > 0:
        expected_taxable = (Decimal('100.00') * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
        expected_total_gst = Decimal('100.00') - expected_taxable
        if expected_igst > 0:
            exp_cgst_amt = Decimal('0.00')
            exp_sgst_amt = Decimal('0.00')
            exp_igst_amt = expected_total_gst
        else:
            exp_cgst_amt = (expected_total_gst / 2).quantize(Decimal('0.01'), rounding='ROUND_FLOOR')
            exp_sgst_amt = expected_total_gst - exp_cgst_amt
            exp_igst_amt = Decimal('0.00')
    else:
        expected_taxable = Decimal('100.00')
        expected_total_gst = Decimal('0.00')
        exp_cgst_amt = Decimal('0.00')
        exp_sgst_amt = Decimal('0.00')
        exp_igst_amt = Decimal('0.00')
    request_data = {'grandTotal': 100.0, 'subtotal': 100.0, 'discountAmount': 0, 'cashPaid': 100.0, 'paymentMode': 'cash'}
    items_data = [{'productId': str(product.id), 'batchId': str(batch.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': '100.00', 'gstRate': str(gst_rate), 'taxableAmount': str(expected_taxable), 'gstAmount': str(expected_total_gst)}]
    invoice = atomic_sale_save(request_data=request_data, outlet=outlet, customer=customer, billed_by=staff, items_data=items_data, schedule_h_data=None, hospital_name='', doctor_id=None)
    assert invoice.cgst == expected_cgst
    assert invoice.sgst == expected_sgst
    assert invoice.igst == expected_igst
    assert invoice.taxable_amount == expected_taxable
    assert invoice.cgst_amount == exp_cgst_amt
    assert invoice.sgst_amount == exp_sgst_amt
    assert invoice.igst_amount == exp_igst_amt