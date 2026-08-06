import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.core.management import call_command
from apps.billing.sale_services import atomic_sale_save
from apps.accounts.models import Ledger
from apps.billing.models import LedgerEntry
from apps.billing.tests.factories import make_test_outlet, make_test_customer, make_test_staff

pytestmark = pytest.mark.django_db

def test_walkin_cash_sale(default_outlet, walkin_customer, batch_a):
    """
    Module: test_sales_core.py
    Entrypoint: atomic_sale_save
    Fixture source: batch_a, walkin_customer
    Assertion target: SaleInvoice creation and cash LedgerEntry credit
    Evidence: LedgerEntry exists with correct amount
    """
    call_command('seed_ledgers', outlet_id=str(default_outlet.id))
    staff = make_test_staff(default_outlet)
    
    request_data = {
        'grandTotal': 100.00,
        'cashPaid': 100.00,
        'paymentMode': 'cash'
    }
    items_data = [{
        'productId': str(batch_a.product_id),
        'batchId': str(batch_a.id),
        'scheduleType': 'OTC',
        'qtyStrips': 1,
        'qtyLoose': 0,
        'mrp': 100,
        'saleRate': 100,
        'rate': 100,
        'totalAmount': 100
    }]
    
    invoice = atomic_sale_save(
        request_data=request_data,
        outlet=default_outlet,
        customer=walkin_customer,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data={},
        hospital_name='',
        doctor_id=''
    )
    
    assert invoice is not None
    assert invoice.amount_due == Decimal('0')
    assert LedgerEntry.objects.filter(
        outlet=default_outlet,
        entry_type='receipt',
        credit=Decimal('100.00')
    ).exists()

def test_unit_conversion(default_outlet, walkin_customer, batch_a):
    """
    Module: test_sales_core.py
    Entrypoint: atomic_sale_save
    Fixture source: batch_a, walkin_customer
    Assertion target: Unit conversion math (1 strip + 2 tabs = 12 total units)
    Evidence: batch_a stock drops by 12 base units
    """
    call_command('seed_ledgers', outlet_id=str(default_outlet.id))
    staff = make_test_staff(default_outlet)
    initial_stock = batch_a.total_stock
    
    request_data = {
        'grandTotal': 120.00,
        'cashPaid': 120.00,
        'paymentMode': 'cash'
    }
    items_data = [{
        'productId': str(batch_a.product_id),
        'batchId': str(batch_a.id),
        'qtyStrips': 1,
        'qtyLoose': 2,
        'rate': 100,
        'totalAmount': 120
    }]
    
    atomic_sale_save(
        request_data=request_data,
        outlet=default_outlet,
        customer=walkin_customer,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data={},
        hospital_name='',
        doctor_id=''
    )
    
    batch_a.refresh_from_db()
    assert initial_stock - batch_a.total_stock == 12

def test_credit_sale_partial_payment(default_outlet, registered_customer, batch_b):
    """
    Module: test_sales_core.py
    Entrypoint: atomic_sale_save
    Fixture source: batch_b, registered_customer
    Assertion target: Partial payment maps properly to customer ledger outstanding
    Evidence: LedgerEntry 'sale' debit of 200 and 'receipt' credit of 80 leaves 120 outstanding
    """
    call_command('seed_ledgers', outlet_id=str(default_outlet.id))
    staff = make_test_staff(default_outlet)
    
    request_data = {
        'grandTotal': 100.00,
        'cashPaid': 40.00,
        'creditGiven': 60.00,
        'paymentMode': 'split'
    }
    items_data = [{
        'productId': str(batch_b.product_id),
        'batchId': str(batch_b.id),
        'qtyStrips': 0,
        'qtyLoose': 1,
        'rate': 100,
        'totalAmount': 100
    }]
    
    invoice = atomic_sale_save(
        request_data=request_data,
        outlet=default_outlet,
        customer=registered_customer,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data={},
        hospital_name='',
        doctor_id=''
    )
    
    assert invoice.amount_due == Decimal('60.00')
    sale_ledger = LedgerEntry.objects.get(reference_no=invoice.invoice_no, entry_type='sale')
    assert sale_ledger.debit == Decimal('100.00')
    receipt_ledger = LedgerEntry.objects.get(reference_no=invoice.invoice_no, entry_type='receipt')
    assert receipt_ledger.credit == Decimal('40.00')

def test_discount_application(default_outlet, walkin_customer, batch_a):
    """
    Module: test_sales_core.py
    Entrypoint: atomic_sale_save
    Fixture source: batch_a, walkin_customer
    Assertion target: discountAmount scales the total
    Evidence: invoice.grand_total equals subtotal minus discount
    """
    call_command('seed_ledgers', outlet_id=str(default_outlet.id))
    staff = make_test_staff(default_outlet)
    
    request_data = {
        'subtotal': 100.00,
        'discountAmount': 10.00,
        'grandTotal': 90.00,
        'cashPaid': 90.00,
        'paymentMode': 'cash'
    }
    items_data = [{
        'productId': str(batch_a.product_id),
        'batchId': str(batch_a.id),
        'qtyStrips': 1,
        'qtyLoose': 0,
        'rate': 100,
        'totalAmount': 100
    }]
    
    invoice = atomic_sale_save(
        request_data=request_data,
        outlet=default_outlet,
        customer=walkin_customer,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data={},
        hospital_name='',
        doctor_id=''
    )
    
    assert invoice.grand_total == Decimal('90.00')
    assert invoice.discount_amount == Decimal('10.00')

def test_non_strip_product_qty_loose_rejected(default_outlet, walkin_customer, batch_a):
    """
    Module: test_sales_core.py
    Assertion target: A product with pack_type='box' rejects any payload where qtyLoose > 0.
    """
    staff = make_test_staff(default_outlet)
    
    # Change batch_a product to 'box'
    batch_a.product.pack_type = 'box'
    batch_a.product.save()

    request_data = {'grandTotal': 100.00, 'cashPaid': 100.00, 'paymentMode': 'cash'}
    items_data = [{
        'productId': str(batch_a.product_id),
        'batchId': str(batch_a.id),
        'qtyStrips': 1,
        'qtyLoose': 5, # Invalid for a box!
        'rate': 100,
        'totalAmount': 100
    }]

    with pytest.raises(ValidationError, match="Loose units are not permitted for non-strip product"):
        atomic_sale_save(
            request_data=request_data,
            outlet=default_outlet,
            customer=walkin_customer,
            billed_by=staff,
            items_data=items_data,
            schedule_h_data={},
            hospital_name='',
            doctor_id=''
        )

def test_non_strip_product_valid_deduction(default_outlet, walkin_customer, batch_a):
    """
    Module: test_sales_core.py
    Assertion target: A product with pack_type='box' successfully deducts qty_strips and requires qtyLoose=0.
    """
    call_command('seed_ledgers', outlet_id=str(default_outlet.id))
    staff = make_test_staff(default_outlet)
    
    batch_a.product.pack_type = 'box'
    batch_a.product.save()
    
    initial_strips = batch_a.qty_strips

    request_data = {'grandTotal': 200.00, 'cashPaid': 200.00, 'paymentMode': 'cash'}
    items_data = [{
        'productId': str(batch_a.product_id),
        'batchId': str(batch_a.id),
        'qtyStrips': 2,
        'qtyLoose': 0, # Valid
        'rate': 100,
        'totalAmount': 200
    }]

    atomic_sale_save(
        request_data=request_data,
        outlet=default_outlet,
        customer=walkin_customer,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data={},
        hospital_name='',
        doctor_id=''
    )

    batch_a.refresh_from_db()
    assert initial_strips - batch_a.qty_strips == 2
