import uuid
from decimal import Decimal
from django.utils import timezone
from apps.core.models import Outlet
from apps.accounts.models import Customer, Staff
from apps.inventory.models import MasterProduct, Batch
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem, ReceiptEntry, ReceiptAllocation

def make_test_outlet(name="Test Pharmacy"):
    from apps.core.models import Organization
    org, _ = Organization.objects.get_or_create(name="Test Org", slug="test-org")
    outlet = Outlet.objects.create(name=name, city="Test City", state="Test State", organization=org)
    from apps.accounts.management.commands.seed_ledgers import seed_outlet_ledgers
    seed_outlet_ledgers(outlet)
    return outlet

def make_test_customer(outlet, name="Test Customer", phone="9999999999"):
    customer = Customer.objects.create(outlet=outlet, name=name, phone=phone)
    from apps.accounts.models import Ledger, LedgerGroup
    group = LedgerGroup.objects.get(outlet=outlet, name='Sundry Debtors')
    Ledger.objects.get_or_create(
        outlet=outlet, 
        linked_customer=customer, 
        defaults={
            'name': customer.name,
            'group': group,
            'opening_balance': Decimal('0'),
            'balance_type': 'Dr'
        }
    )
    return customer

def make_test_medicine(outlet, name="Paracetamol", batch_qty=100, mrp=100.0, sale_rate=90.0, pack_size=10):
    product = MasterProduct.objects.create(
        name=name,
        drug_type='allopathy',
        schedule_type='OTC',
        pack_size=pack_size,
        pack_unit='tablet',
        pack_type='strip',
        mrp=Decimal(str(mrp)),
        default_sale_rate=Decimal(str(sale_rate))
    )
    batch = Batch.objects.create(
        outlet=outlet,
        product=product,
        batch_no=f"B-{uuid.uuid4().hex[:6]}",
        expiry_date=timezone.now().date() + timezone.timedelta(days=365),
        mrp=Decimal(str(mrp)),
        purchase_rate=Decimal(str(sale_rate * 0.8)),
        sale_rate=Decimal(str(sale_rate)),
        pack_size=pack_size,
        pack_type='strip',
        qty_strips=batch_qty,
        qty_loose=0
    )
    from apps.inventory.models import StockLedger
    StockLedger.objects.create(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type='PURCHASE_IN',
        txn_date=timezone.now().date(),
        voucher_type='Purchase Invoice',
        voucher_number='TEST-OPENING',
        party_name='Test Supplier',
        qty_in=batch_qty,
        qty_out=0,
        rate=Decimal(str(sale_rate * 0.8)),
        value_in=batch_qty * Decimal(str(sale_rate * 0.8)),
        value_out=0,
        running_qty=batch_qty,
        running_value=batch_qty * Decimal(str(sale_rate * 0.8))
    )
    return product, batch

def make_test_staff(outlet, name="Test Staff", phone="8888888888", role="cashier", permissions=[]):
    staff = Staff.objects.create(
        outlet=outlet,
        name=name,
        phone=phone,
        role=role,
        can_edit_rate=True,
        max_discount=Decimal('100.00'),
        can_modify_draft_bill='can_modify_draft_bill' in permissions,
        can_modify_unpaid_bill='can_modify_unpaid_bill' in permissions,
        can_modify_paid_bill='can_modify_paid_bill' in permissions,
        can_modify_bill_with_return='can_modify_bill_with_return' in permissions,
        can_correct_header_fields='can_correct_header_fields' in permissions,
        can_correct_rates_discounts='can_correct_rates_discounts' in permissions,
        can_correct_quantities='can_correct_quantities' in permissions,
        can_cancel_and_reissue_bill='can_cancel_and_reissue_bill' in permissions,
        can_view_bill_revision_history='can_view_bill_revision_history' in permissions,
    )
    # Give them a dummy user so they can login if needed
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user, _ = User.objects.get_or_create(phone=phone, defaults={'name': name, 'is_active': True})
    user.set_password("testpass")
    user.save()
    staff.user = user
    staff.save()
    return staff

def make_test_invoice(outlet, staff, customer=None, items=[], status='finalized', paid=0):
    # items format: [{'batch': batch_obj, 'qty': 5, 'rate': 10}]
    subtotal = sum(Decimal(str(item['rate'])) * item['qty'] for item in items)
    grand_total = subtotal # Assuming no GST for simple tests unless specified
    
    invoice = SaleInvoice.objects.create(
        outlet=outlet,
        invoice_no=f"INV-{uuid.uuid4().hex[:6]}",
        invoice_date=timezone.now(),
        customer=customer,
        subtotal=subtotal,
        taxable_amount=subtotal,
        grand_total=grand_total,
        payment_mode='cash' if paid > 0 else 'credit',
        cash_paid=Decimal(str(paid)),
        amount_paid=Decimal(str(paid)),
        amount_due=grand_total - Decimal(str(paid)),
        credit_given=grand_total - Decimal(str(paid)),
        billed_by=staff
    )

    for item in items:
        batch = item['batch']
        qty = item['qty']
        rate = Decimal(str(item['rate']))
        SaleItem.objects.create(
            invoice=invoice,
            batch=batch,
            product_name=batch.product.name if batch.product else "Custom",
            pack_size=batch.pack_size,
            pack_unit=batch.pack_unit,
            schedule_type='OTC',
            batch_no=batch.batch_no,
            expiry_date=batch.expiry_date,
            mrp=batch.mrp,
            sale_rate=batch.sale_rate,
            rate=rate,
            qty_strips=qty,
            qty_loose=0,
            taxable_amount=rate * qty,
            gst_amount=0,
            gst_rate=0,
            total_amount=rate * qty
        )
        # Deduct stock
        batch.qty_strips -= qty
        batch.save()
        
    if customer:
        from apps.billing.models import LedgerEntry, CreditAccount, CreditTransaction
        import datetime
        invoice_d = invoice.invoice_date.date() if isinstance(invoice.invoice_date, datetime.datetime) else invoice.invoice_date
        
        LedgerEntry.objects.create(
            outlet=outlet, entity_type='customer', customer=customer, date=invoice_d,
            entry_type='sale', reference_no=invoice.invoice_no, debit=invoice.grand_total, credit=Decimal('0'), running_balance=invoice.grand_total
        )
        if paid > 0:
            LedgerEntry.objects.create(
                outlet=outlet, entity_type='customer', customer=customer, date=invoice_d,
                entry_type='receipt', reference_no=invoice.invoice_no, debit=Decimal('0'), credit=Decimal(str(paid)), running_balance=invoice.grand_total - Decimal(str(paid))
            )
            
        if invoice.credit_given > 0:
            credit_account, _ = CreditAccount.objects.get_or_create(outlet=outlet, customer=customer)
            credit_account.total_outstanding += invoice.credit_given
            credit_account.total_borrowed += invoice.credit_given
            credit_account.save()
            CreditTransaction.objects.create(
                credit_account=credit_account,
                customer=customer,
                invoice=invoice,
                type='debit',
                amount=invoice.credit_given,
                description=f"Sale on {invoice.invoice_no}",
                balance_after=credit_account.total_outstanding,
                recorded_by=staff,
                date=invoice_d,
            )

    return invoice

def make_test_sales_return(outlet, staff, invoice, items=[]):
    # items format: [{'sale_item': obj, 'qty': 3}]
    total_amount = sum(Decimal(str(item['sale_item'].rate)) * item['qty'] for item in items)
    
    sales_return = SalesReturn.objects.create(
        outlet=outlet,
        original_sale=invoice,
        return_no=f"RTN-{uuid.uuid4().hex[:6]}",
        return_date=timezone.now().date(),
        reason="Test Return",
        total_amount=total_amount,
        refund_mode='cash',
        created_by=staff
    )
    
    for item in items:
        sale_item = item['sale_item']
        qty = item['qty']
        SalesReturnItem.objects.create(
            sales_return=sales_return,
            original_sale_item=sale_item,
            batch=sale_item.batch,
            product_name=sale_item.product_name,
            batch_no=sale_item.batch_no,
            qty_returned=qty * sale_item.pack_size, # Assuming qty in strips
            return_rate=sale_item.rate,
            total_amount=sale_item.rate * qty
        )
        # Restock
        sale_item.batch.qty_strips += qty
        sale_item.batch.save()
        sale_item.qty_returned += qty * (sale_item.pack_size or 1)
        sale_item.save()
        
        from apps.inventory.services import post_stock_ledger_entry
        post_stock_ledger_entry(
            outlet=outlet,
            product=sale_item.batch.product,
            batch=sale_item.batch,
            txn_type='SALE_RETURN',
            txn_date=sales_return.return_date,
            voucher_type='Sales Return',
            voucher_number=sales_return.return_no,
            party_name=invoice.customer.name if invoice.customer else 'Walk-in',
            qty_in=qty,
            qty_out=0,
            rate=sale_item.rate,
            source_object=sale_item
        )
        
    return sales_return

def make_test_receipt(outlet, staff, invoice, amount, date_offset_days=0):
    receipt_date = timezone.now().date() + timezone.timedelta(days=date_offset_days)
    receipt = ReceiptEntry.objects.create(
        outlet=outlet,
        customer=invoice.customer,
        date=receipt_date,
        total_amount=Decimal(str(amount)),
        payment_mode='cash',
        created_by=staff
    )
    ReceiptAllocation.objects.create(
        receipt=receipt,
        invoice=invoice,
        allocated_amount=Decimal(str(amount))
    )
    # Adjust invoice paid status
    invoice.amount_paid += Decimal(str(amount))
    invoice.cash_paid += Decimal(str(amount))
    invoice.amount_due -= Decimal(str(amount))
    invoice.save()
    return receipt
