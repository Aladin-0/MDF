from django.test import TestCase
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
import json

from apps.core.models import Organization, Outlet
from apps.accounts.models import Customer, Ledger, LedgerGroup, Staff, JournalEntry, JournalLine
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, ReceiptEntry, ReceiptAllocation, CreditAccount, CreditTransaction
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.billing.sale_update_service import atomic_sale_update, get_sale_modification_constraints, SaleServiceError

class SaleModificationTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        
        from django.core.management import call_command
        call_command('seed_ledgers', f'--outlet={self.outlet.id}')
        
        # We need to import Staff correctly
        try:
            from apps.accounts.models import Staff
            self.staff = Staff.objects.create(name="Test Staff", phone="1234567890", role="billing_staff", outlet=self.outlet, max_discount=100)
        except ImportError:
            pass # Handle imports appropriately if needed

        self.customer = Customer.objects.create(name="Test Customer", phone="0987654321", outlet=self.outlet)
        from apps.accounts.services import LedgerService
        LedgerService.sync_customer_ledgers(self.outlet)
        
        self.product = MasterProduct.objects.create(name="Paracetamol", hsn_code="1234", gst_rate=12, pack_size=10, pack_type='strip')
        self.batch = Batch.objects.create(
            outlet=self.outlet, product=self.product, batch_no="B001",
            expiry_date=timezone.now().date() + timedelta(days=365),
            qty_strips=100, qty_loose=0, mrp=50, purchase_rate=30, sale_rate=45, pack_size=10, opening_qty=100
        )
        
        from apps.inventory.models import StockLedger
        StockLedger.objects.create(
            outlet=self.outlet, product=self.product, batch=self.batch, txn_type='OPENING',
            txn_date=timezone.now().date(), qty_in=100, qty_out=0, running_qty=100,
            running_value=100*30
        )
        
        # Create a base invoice
        self.invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-001",
            invoice_date=timezone.now(),
            customer=self.customer,
            subtotal=Decimal('450.00'),
            discount_amount=Decimal('0.00'),
            taxable_amount=Decimal('401.79'),
            cgst_amount=Decimal('24.11'),
            sgst_amount=Decimal('24.11'),
            igst_amount=Decimal('0.00'),
            cgst=Decimal('6.00'),
            sgst=Decimal('6.00'),
            igst=Decimal('0.00'),
            round_off=Decimal('-0.01'),
            grand_total=Decimal('450.00'),
            payment_mode="cash",
            cash_paid=Decimal('450.00'),
            upi_paid=Decimal('0.00'),
            card_paid=Decimal('0.00'),
            credit_given=Decimal('0.00'),
            amount_paid=Decimal('450.00'),
            amount_due=Decimal('0.00'),
        )
        
        self.item = SaleItem.objects.create(
            invoice=self.invoice,
            batch=self.batch,
            product_name="Paracetamol",
            pack_size=10,
            batch_no="B001",
            expiry_date=self.batch.expiry_date,
            mrp=50,
            sale_rate=45,
            rate=45,
            qty_strips=10,
            qty_loose=0,
            taxable_amount=Decimal('401.79'),
            gst_amount=Decimal('48.22'),
            total_amount=Decimal('450.00'), gst_rate=Decimal('12.00')
        )
        
    def test_a1_edit_invoice_with_return_blocked(self):
        SalesReturn.objects.create(
            outlet=self.outlet,
            return_no="RTN-001",
            return_date=timezone.now(),
            original_sale=self.invoice,
            total_amount=Decimal('45.00')
        )
        
        constraints = get_sale_modification_constraints(self.invoice)
        self.assertFalse(constraints['can_edit'])
        self.assertEqual(constraints['code'], 'SALE_EDIT_BLOCKED_HAS_RETURN')
        
    def test_a2_edit_invoice_with_later_payment_blocked(self):
        receipt = ReceiptEntry.objects.create(
            outlet=self.outlet,
            customer=self.customer,
            date=timezone.now().date(),
            total_amount=Decimal('100.00'),
            payment_mode='cash'
        )
        ReceiptAllocation.objects.create(
            receipt=receipt,
            invoice=self.invoice,
            allocated_amount=Decimal('100.00')
        )
        
        constraints = get_sale_modification_constraints(self.invoice)
        self.assertFalse(constraints['can_edit'])
        self.assertEqual(constraints['code'], 'SALE_EDIT_BLOCKED_LATER_PAYMENT')

    def test_a3_edit_fully_paid_invoice_blocked(self):
        self.invoice.amount_due = Decimal('0.00')
        self.invoice.credit_given = Decimal('450.00')
        self.invoice.save()
        
        constraints = get_sale_modification_constraints(self.invoice)
        self.assertFalse(constraints['can_edit'])
        self.assertEqual(constraints['code'], 'SALE_EDIT_BLOCKED_FULLY_PAID')


    def test_b1_overpayment_converted_to_advance(self):
        payload = {
            'grandTotal': 350.00,
            'cashPaid': 350.00,
            'subtotal': 350.00,
            'cashPaid': 450.00, # Customer originally gave 450
            'upiPaid': 0.00,
            'cardPaid': 0.00,
            'creditGiven': 0.00,
            'items': [
                {
                    'batchId': str(self.batch.id),
                    'productId': str(self.product.id),
                    'qtyStrips': 7,
                    'qtyLoose': 0,
                    'rate': 50.00,
                    'totalAmount': 350.00
                }
            ],
            'customerId': str(self.customer.id)
        }
        
        updated_invoice = atomic_sale_update(str(self.invoice.id), payload, str(self.outlet.id), str(self.staff.id))
        
        self.assertEqual(updated_invoice.grand_total, Decimal('350.00'))
        self.assertEqual(updated_invoice.credit_given, Decimal('-100.00')) # Overpayment 100
        self.assertEqual(updated_invoice.amount_paid, Decimal('450.00'))
        
        # Check CreditAccount
        credit_acc = CreditAccount.objects.get(outlet=self.outlet, customer=self.customer)
        self.assertEqual(credit_acc.total_outstanding, Decimal('-100.00'))
        self.assertEqual(credit_acc.total_repaid, Decimal('100.00'))
        
        # Check CreditTransaction
        tx = CreditTransaction.objects.get(invoice=updated_invoice)
        self.assertEqual(tx.type, 'credit')
        self.assertEqual(tx.amount, Decimal('100.00'))
        
    def test_c3_discount_stacking_consistency(self):
        # Original: rate=45 (MRP 50 with 10% disc).
        # We test updating to a 5% extra discount
        payload = {
            'grandTotal': 299.25,
            'cashPaid': 299.25, # 45 * 7 = 315. 315 * 0.95 = 299.25
            'extraDiscountPct': 5.0,
            'cashPaid': 299.25,
            'items': [
                {
                    'batchId': str(self.batch.id),
                    'productId': str(self.product.id),
                    'qtyStrips': 7,
                    'qtyLoose': 0,
                    'rate': 45.00,
                    'discountPct': 10.0,
                    'gstRate': 12.0,
                    'taxableAmount': 267.19,
                    'gstAmount': 32.06,
                    'totalAmount': 299.25
                }
            ],
            'customerId': str(self.customer.id)
        }
        updated_invoice = atomic_sale_update(str(self.invoice.id), payload, str(self.outlet.id), str(self.staff.id))
        item = updated_invoice.items.first()
        self.assertEqual(item.rate, Decimal('45.00'))
        self.assertEqual(updated_invoice.extra_discount_pct, Decimal('5.0'))

