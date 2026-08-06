import pytest
from decimal import Decimal
from datetime import date
from django.utils import timezone
from apps.billing.sale_services import atomic_sale_save
from apps.inventory.services import rebuild_stock_ledger
from apps.accounts.tests.factories import OutletFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.inventory.models import Batch, StockLedger
from apps.billing.services import InsufficientStockError

@pytest.mark.django_db
def test_stock_invariant_exact_deduction():
    outlet = OutletFactory()
    from django.core.management import call_command
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    staff = StaffFactory(outlet=outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=5, qty_loose=0, mrp=Decimal('100.00'))
    
    request_data = {
        'grandTotal': 200.00,
        'subtotal': 200.00,
        'discountAmount': 0,
        'cashPaid': 200.00,
        'paymentMode': 'cash',
        'invoiceDate': timezone.now().isoformat(),
    }
    
    items_data = [{
        'productId': str(product.id),
        'batchId': str(batch.id),
        'qtyStrips': 2,
        'qtyLoose': 0,
        'rate': '100.00',
        'gstRate': '0',
    }]
    
    invoice = atomic_sale_save(
        request_data=request_data,
        outlet=outlet,
        customer=None,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data=None,
        hospital_name='',
        doctor_id=None
    )
    
    batch.refresh_from_db()
    assert batch.qty_strips == 3
    assert batch.qty_loose == 0
    
    # Check StockLedger
    ledger = StockLedger.objects.filter(batch=batch, voucher_number=invoice.invoice_no).first()
    assert ledger is not None
    assert ledger.txn_type == 'SALE_OUT'
    assert ledger.qty_out == Decimal('2')

@pytest.mark.django_db
def test_stock_invariant_negative_stock_guard():
    outlet = OutletFactory()
    from django.core.management import call_command
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    staff = StaffFactory(outlet=outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=2, qty_loose=0, mrp=Decimal('100.00'))
    
    request_data = {
        'grandTotal': 300.00,
        'subtotal': 300.00,
        'discountAmount': 0,
        'cashPaid': 300.00,
        'paymentMode': 'cash',
        'invoiceDate': timezone.now().isoformat(),
    }
    
    items_data = [{
        'productId': str(product.id),
        'batchId': str(batch.id),
        'qtyStrips': 3,
        'qtyLoose': 0,
        'rate': '100.00',
        'gstRate': '0',
    }]
    
    with pytest.raises(InsufficientStockError):
        atomic_sale_save(
            request_data=request_data,
            outlet=outlet,
            customer=None,
            billed_by=staff,
            items_data=items_data,
            schedule_h_data=None,
            hospital_name='',
            doctor_id=None
        )

@pytest.mark.django_db
def test_stock_invariant_deterministic_rebuild():
    outlet = OutletFactory()
    from django.core.management import call_command
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    staff = StaffFactory(outlet=outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'))
    
    # Establish initial balance
    from apps.inventory.services import post_stock_ledger_entry
    post_stock_ledger_entry(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type='PURCHASE_IN',
        txn_date=date(2025, 1, 1),
        voucher_type='Purchase Invoice',
        voucher_number='PINV-001',
        party_name='Supplier',
        qty_in=10,
        qty_out=0,
        rate=80.00
    )
    
    request_data = {
        'grandTotal': 200.00,
        'subtotal': 200.00,
        'discountAmount': 0,
        'cashPaid': 200.00,
        'paymentMode': 'cash',
        'invoiceDate': date(2025, 1, 2).isoformat(),
    }
    items_data = [{
        'productId': str(product.id),
        'batchId': str(batch.id),
        'qtyStrips': 2,
        'qtyLoose': 0,
        'rate': '100.00',
        'gstRate': '0',
    }]
    
    atomic_sale_save(
        request_data=request_data,
        outlet=outlet,
        customer=None,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data=None,
        hospital_name='',
        doctor_id=None
    )
    
    batch.refresh_from_db()
    assert batch.qty_strips == 8
    
    # Corrupt the stock
    Batch.objects.filter(id=batch.id).update(qty_strips=999)
    
    # Rebuild stock
    rebuild_stock_ledger(str(batch.id), from_date=date(2025, 1, 1))
    
    batch.refresh_from_db()
    assert batch.qty_strips == 8
