from decimal import Decimal
import pytest
from apps.billing.sale_services import atomic_sale_save
from apps.inventory.models import StockLedger
from apps.inventory.tests.factories import BatchFactory, ProductFactory
from apps.accounts.tests.factories import OutletFactory, UserFactory

@pytest.mark.django_db
def test_fractional_sale_deduction_ledger_precision():
    # Setup
    outlet = OutletFactory()
    user = UserFactory()
    
    product = ProductFactory(pack_size=10, pack_type='strip')
    batch = BatchFactory(
        outlet=outlet,
        product=product,
        pack_size=10,
        qty_strips=5,
        qty_loose=0,
        mrp=100.0,
        purchase_rate=80.0
    )

    items_data = [{
        'productId': str(product.id),
        'batchId': str(batch.id),
        'qtyStrips': 0,
        'qtyLoose': 3,
        'rate': 10.0, # 100/10 = 10 per loose
        'scheduleType': 'OTC',
    }]

    request_data = {
        'grandTotal': '30.00',
        'subtotal': '30.00',
        'cashPaid': '30.00',
    }

    # Execute
    invoice = atomic_sale_save(
        request_data=request_data,
        outlet=outlet,
        customer=None,
        billed_by=user,
        items_data=items_data,
        schedule_h_data={},
        hospital_name="",
        doctor_id=""
    )

    # Verify
    ledger_entry = StockLedger.objects.filter(voucher_number=invoice.invoice_no).first()
    
    # 3 loose units out of 10 pack size = 0.3000
    assert ledger_entry is not None
    assert ledger_entry.qty_out == Decimal('0.3000')

    batch.refresh_from_db()
    assert batch.qty_strips == 4
    assert batch.qty_loose == 7
