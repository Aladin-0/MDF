import pytest
from decimal import Decimal
from datetime import date
from django.utils import timezone
from rest_framework.test import APIClient
from django.urls import reverse
from apps.accounts.models import Staff, Ledger, LedgerGroup, Customer
from apps.purchases.models import Distributor
from apps.purchases.services import atomic_purchase_save
from apps.billing.sale_services import atomic_sale_save
from apps.billing.payment_services import create_sales_return
from apps.accounts.services import DebitNoteService
from apps.billing.models import SaleItem

@pytest.mark.django_db
def test_stock_in_purchase(inventory_outlet, strip_product, strip_batch):
    from apps.accounts.tests.factories import StaffFactory
    staff = StaffFactory(outlet=inventory_outlet, role='admin')
    distributor = Distributor.objects.create(outlet=inventory_outlet, name='Test Dist')
    creditors = LedgerGroup.objects.get(name='Sundry Creditors', outlet=inventory_outlet)
    ledger = Ledger.objects.create(outlet=inventory_outlet, name='Test Dist', group=creditors, linked_distributor=distributor)
    initial_qty = strip_batch.qty_strips
    payload = {'outletId': str(inventory_outlet.id), 'partyLedgerId': str(ledger.id), 'invoiceNo': 'TEST-PUR-1', 'invoiceDate': timezone.now().date().isoformat() + 'T00:00:00Z', 'purchaseType': 'credit', 'subtotal': 500.0, 'discountAmount': 0.0, 'taxableAmount': 500.0, 'gstAmount': 0.0, 'cessAmount': 0.0, 'grandTotal': 500.0, 'items': [{'masterProductId': str(strip_product.id), 'batchNo': strip_batch.batch_no, 'expiryDate': strip_batch.expiry_date.isoformat() + 'T00:00:00Z', 'qty': 10, 'actualQty': 10, 'purchaseRate': 50.0, 'mrp': 100.0, 'saleRate': 80.0, 'taxableAmount': 500.0, 'gstAmount': 0.0, 'totalAmount': 500.0, 'ptr': 50.0, 'pts': 45.0}]}
    atomic_purchase_save(payload, str(inventory_outlet.id), str(staff.id))
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_qty + 10

@pytest.mark.django_db
def test_stock_out_sale(inventory_outlet, strip_product, strip_batch, box_product, box_batch):
    from apps.accounts.tests.factories import StaffFactory
    staff = StaffFactory(outlet=inventory_outlet, role='admin')
    customer = Customer.objects.create(outlet=inventory_outlet, name='Test Customer')
    initial_strip_strips = strip_batch.qty_strips
    initial_strip_loose = strip_batch.qty_loose
    initial_box_strips = box_batch.qty_strips
    request_data = {'grandTotal': '300.00', 'subtotal': '300.00', 'cashPaid': '300.00', 'creditGiven': '0', 'upiPaid': '0', 'cardPaid': '0', 'invoiceDate': timezone.now().isoformat(), 'extraDiscountPct': '0'}
    items_data = [{'productId': str(strip_product.id), 'batchId': str(strip_batch.id), 'qtyStrips': 1, 'qtyLoose': 2, 'rate': 50.0, 'taxableAmount': 100.0, 'gstAmount': 0.0}, {'productId': str(box_product.id), 'batchId': str(box_batch.id), 'qtyStrips': 2, 'qtyLoose': 0, 'rate': 100.0, 'taxableAmount': 200.0, 'gstAmount': 0.0}]
    atomic_sale_save(request_data=request_data, outlet=inventory_outlet, customer=customer, billed_by=staff, items_data=items_data, schedule_h_data={}, hospital_name='', doctor_id=None)
    strip_batch.refresh_from_db()
    box_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_strip_strips - 2
    assert strip_batch.qty_loose == 8
    assert box_batch.qty_strips == initial_box_strips - 2

@pytest.mark.django_db
def test_returns(inventory_outlet, strip_product, strip_batch):
    from apps.accounts.tests.factories import StaffFactory
    staff = StaffFactory(outlet=inventory_outlet, role='admin')
    customer = Customer.objects.create(outlet=inventory_outlet, name='Test Customer')
    distributor = Distributor.objects.create(outlet=inventory_outlet, name='Test Dist')
    creditors = LedgerGroup.objects.get(name='Sundry Creditors', outlet=inventory_outlet)
    distributor_ledger = Ledger.objects.create(outlet=inventory_outlet, name='Test Dist', group=creditors, linked_distributor=distributor)
    purchase_accounts = LedgerGroup.objects.get(name='Purchase Account', outlet=inventory_outlet)
    purchase_returns_ledger = Ledger.objects.get(outlet=inventory_outlet, name='Purchase Returns')
    request_data = {'grandTotal': '100.00', 'subtotal': '100.00', 'cashPaid': '100.00', 'creditGiven': '0', 'upiPaid': '0', 'cardPaid': '0', 'invoiceDate': timezone.now().isoformat(), 'extraDiscountPct': '0'}
    items_data = [{'productId': str(strip_product.id), 'batchId': str(strip_batch.id), 'qtyStrips': 5, 'qtyLoose': 0, 'rate': 20.0, 'taxableAmount': 100.0, 'gstAmount': 0.0}]
    initial_strips = strip_batch.qty_strips
    sale = atomic_sale_save(request_data=request_data, outlet=inventory_outlet, customer=customer, billed_by=staff, items_data=items_data, schedule_h_data={}, hospital_name='', doctor_id=None)
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_strips - 5
    sale_item = SaleItem.objects.get(invoice=sale, batch=strip_batch)
    return_payload = {'originalSaleId': str(sale.id), 'returnDate': timezone.now().isoformat(), 'refundMode': 'cash', 'items': [{'saleItemId': str(sale_item.id), 'batchId': str(strip_batch.id), 'qtyReturned': 20, 'returnRate': 20.0}]}
    create_sales_return(return_payload, str(inventory_outlet.id), str(staff.id))
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_strips - 3
    dn_payload = {'outletId': str(inventory_outlet.id), 'distributor_id': str(distributor.id), 'date': date.today().isoformat(), 'reason': 'Expired Goods', 'subtotal': Decimal('100.00'), 'gst_amount': Decimal('0.00'), 'total_amount': Decimal('100.00'), 'items': [{'batch_id': str(strip_batch.id), 'product_name': strip_product.name, 'qty': Decimal('1'), 'rate': Decimal('100.00'), 'gst_rate': Decimal('0.00'), 'total': Decimal('100.00')}]}
    DebitNoteService.create(str(inventory_outlet.id), str(staff.id), dn_payload)
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_strips - 4

@pytest.mark.django_db
def test_manual_adjustment(inventory_outlet, strip_batch):
    from apps.accounts.tests.factories import StaffFactory
    staff = StaffFactory(outlet=inventory_outlet, role='admin', staff_pin='1234')
    client = APIClient()
    client.force_authenticate(user=staff)
    url = reverse('inventory-adjust') + f'?outletId={inventory_outlet.id}'
    initial_strips = strip_batch.qty_strips
    response = client.post(url, {'batchId': str(strip_batch.id), 'type': 'correction', 'qty': 5, 'adjustUnit': 'strips', 'reason': 'Found extra', 'pin': '1234'}, format='json')
    assert response.status_code == 200, response.data
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_strips + 5
    response = client.post(url, {'batchId': str(strip_batch.id), 'type': 'damage', 'qty': -2, 'adjustUnit': 'loose', 'reason': 'Damaged', 'pin': '1234'}, format='json')
    assert response.status_code == 200, response.data
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == initial_strips + 4
    assert strip_batch.qty_loose == 8