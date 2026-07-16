import os
import sys
import django
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Customer, Staff
from apps.core.models import Outlet
from apps.billing.models import CreditAccount, CreditTransaction
from rest_framework.test import APIClient

outlet = Outlet.objects.first()
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.first()

client = APIClient()
client.force_authenticate(user=user)

def run_test():
    # 1. Create a customer
    customer = Customer.objects.create(
        outlet=outlet,
        name="Credit Sync Customer",
        phone="8888877777",
        created_by=user
    )
    print(f"Customer created: {customer.id}")

    # 2. Simulate a credit sale
    credit_account, _ = CreditAccount.objects.get_or_create(
        outlet=outlet,
        customer=customer,
        defaults={'credit_limit': 10000}
    )
    credit_account.total_borrowed = Decimal('1000')
    credit_account.total_outstanding = Decimal('1000')
    credit_account.status = 'active'
    credit_account.save()
    
    # 3. Add an initial balance to Customer Ledger to simulate the sale posting
    from apps.accounts.models import LedgerEntry
    LedgerEntry.objects.create(
        outlet=outlet,
        entity_type='customer',
        customer=customer,
        date='2026-06-29',
        entry_type='sale',
        reference_no='TEST-SALE',
        debit=1000,
        credit=0,
        running_balance=1000
    )
    
    print(f"Initial - CreditAccount Outstanding: {credit_account.total_outstanding}")
    print(f"Initial - Customer Ledger Outstanding: {customer.outstanding_balance}")

    # 4. Use the Pay API
    payload = {
        "creditAccountId": str(credit_account.id),
        "amount": 300,
        "mode": "cash",
        "paymentDate": "2026-06-29"
    }
    
    res = client.post('/api/v1/credit/payment/', payload, format='json')
    print("Pay API Response:", res.status_code, res.data.get('voucher_no'), res.data.get('totalOutstanding'))
    
    # 5. Check balances
    credit_account.refresh_from_db()
    
    print(f"After API - CreditAccount Outstanding: {credit_account.total_outstanding}")
    print(f"After API - Customer Ledger Outstanding: {customer.outstanding_balance}")
    
    # 6. Now let's try Voucher Entry explicitly!
    from apps.accounts.services import VoucherService
    from apps.accounts.models import Ledger
    
    cash_ledger = Ledger.objects.filter(name='Cash', outlet=outlet).first()
    customer_ledger = Ledger.objects.filter(linked_customer=customer, outlet=outlet).first()
    
    voucher_data = {
        'voucher_type': 'receipt',
        'date': '2026-06-29',
        'narration': 'Voucher Entry Payment',
        'total_amount': 200,
        'payment_mode': 'cash',
        'lines': [
            {
                'ledger_id': str(cash_ledger.id),
                'debit': 200,
                'credit': 0,
            },
            {
                'ledger_id': str(customer_ledger.id),
                'debit': 0,
                'credit': 200,
            }
        ]
    }
    
    print("Creating Voucher directly...")
    voucher = VoucherService.create_voucher(outlet.id, user.id, voucher_data)
    
    # Check balances again
    credit_account.refresh_from_db()
    
    print(f"After Voucher - CreditAccount Outstanding: {credit_account.total_outstanding}")
    print(f"After Voucher - Customer Ledger Outstanding: {customer.outstanding_balance}")

if __name__ == '__main__':
    run_test()
