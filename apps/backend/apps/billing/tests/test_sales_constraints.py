import pytest
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from apps.billing.sale_services import atomic_sale_save, InsufficientStockError
from apps.billing.tests.factories import make_test_outlet, make_test_customer, make_test_staff
pytestmark = pytest.mark.django_db

def test_missing_customer_credit_sale(default_outlet, batch_c):
    """
    Module: test_sales_constraints.py
    Entrypoint: atomic_sale_save
    Fixture source: batch_c
    Assertion target: Credit sale with no customer raises ValidationError
    Evidence: ValidationError is raised
    """
    staff = make_test_staff(default_outlet)
    request_data = {'grandTotal': 100.0, 'cashPaid': 0.0, 'creditGiven': 100.0, 'paymentMode': 'credit'}
    items_data = [{'productId': str(batch_c.product_id), 'batchId': str(batch_c.id), 'qtyStrips': 1, 'qtyLoose': 0, 'rate': 100, 'totalAmount': 100}]
    with pytest.raises(ValidationError, match='customer must be selected for credit bills'):
        atomic_sale_save(request_data=request_data, outlet=default_outlet, customer=None, billed_by=staff, items_data=items_data, schedule_h_data={}, hospital_name='', doctor_id='')

def test_out_of_stock_boundary(default_outlet, walkin_customer, batch_c):
    """
    Module: test_sales_constraints.py
    Entrypoint: atomic_sale_save
    Fixture source: batch_c (qty_loose=2)
    Assertion target: Selling more than available raises InsufficientStockError
    Evidence: InsufficientStockError is raised
    """
    staff = make_test_staff(default_outlet)
    request_data = {'grandTotal': 300.0, 'cashPaid': 300.0, 'paymentMode': 'cash'}
    items_data = [{'productId': str(batch_c.product_id), 'batchId': str(batch_c.id), 'qtyStrips': 0, 'qtyLoose': 3, 'rate': 100, 'totalAmount': 300}]
    with pytest.raises(InsufficientStockError):
        atomic_sale_save(request_data=request_data, outlet=default_outlet, customer=walkin_customer, billed_by=staff, items_data=items_data, schedule_h_data={}, hospital_name='', doctor_id='')