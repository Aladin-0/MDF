import threading
import time
from decimal import Decimal
from datetime import date

from django.test import TransactionTestCase
from django.db import connection, transaction
from django.db.utils import OperationalError
from django.core.exceptions import ValidationError

from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Ledger, LedgerGroup
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.inventory.services import post_stock_ledger_entry, rebuild_stock_ledger
from apps.purchases.services import atomic_purchase_save, atomic_purchase_update, PurchaseServiceError
from apps.audit.models import DocumentRevisionV2

class PurchaseEditConcurrencyTest(TransactionTestCase):
    # Required for TransactionTestCase to avoid resetting sequence
    reset_sequences = True

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        self.user = Staff.objects.create(
            name="testuser",
            phone="9999999999",
            outlet=self.outlet,
            role="admin",
            can_modify_paid_purchases=True
        )

        self.distributor = Distributor.objects.create(
            outlet=self.outlet,
            name="Test Distributor",
        )

        self.group = LedgerGroup.objects.create(
            name='Sundry Creditors',
            outlet=self.outlet,
            nature='liability'
        )
        self.purchase_ledger = Ledger.objects.create(outlet=self.outlet, name="Purchase Account", group=self.group)
        self.cgst_ledger = Ledger.objects.create(outlet=self.outlet, name="GST Input (CGST)", group=self.group)
        self.sgst_ledger = Ledger.objects.create(outlet=self.outlet, name="GST Input (SGST)", group=self.group)
        
        self.ledger = Ledger.objects.create(
            outlet=self.outlet,
            name="Test Distributor Ledger",
            group=self.group,
            linked_distributor=self.distributor
        )

        self.product = MasterProduct.objects.create(
            name="Test Medicine",
            mrp=Decimal('100.00'),
            default_sale_rate=Decimal('80.00'),
            pack_size=1
        )

    def _create_purchase(self, qty=10, batch_no="BATCH-001"):
        payload = {
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': f'TEST-PUR-{batch_no}',
            'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': float(qty * 50),
            'discountAmount': 0.00,
            'taxableAmount': float(qty * 50),
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': float(qty * 50),
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': batch_no,
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': qty,
                    'actualQty': qty,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': float(qty * 50),
                    'gstAmount': 0.00,
                    'totalAmount': float(qty * 50),
                    'ptr': 50.00,
                    'pts': 45.00,
                }
            ]
        }
        return atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))

    def _create_sale(self, batch, qty=4):
        with transaction.atomic():
            post_stock_ledger_entry(
                outlet=self.outlet,
                product=self.product,
                batch=batch,
                txn_type='SALE_OUT',
                txn_date=date.today(),
                voucher_type='Sale Invoice',
                voucher_number='TEST-SALE-01',
                party_name='Test Customer',
                qty_in=0,
                qty_out=qty,
                rate=Decimal('80.00'),
                source_object=None
            )
            rebuild_stock_ledger(batch.pk, date.today())
            batch.refresh_from_db()
        return batch

    def test_concurrent_purchase_edit(self):
        invoice = self._create_purchase(10, "BTC78")
        batch = Batch.objects.get(batch_no="BTC78")
        self._create_sale(batch, 4)
        
        # We need a shared event to trigger both threads to execute update exactly at the same time
        start_event = threading.Event()
        results = {}
        exceptions = {}

        def perform_edit(thread_name, target_qty):
            try:
                payload = {
                    'revisionReasonCode': 'CORRECTION',
                    'revisionReasonText': f'update to {target_qty}',
                    'outletId': str(self.outlet.id),
                    'partyLedgerId': str(self.ledger.id),
                    'invoiceNo': invoice.invoice_no,
                    'invoiceDate': invoice.invoice_date.isoformat() + 'T00:00:00Z',
                    'purchaseType': 'credit',
                    'subtotal': float(target_qty * 50),
                    'discountAmount': 0.00,
                    'taxableAmount': float(target_qty * 50),
                    'gstAmount': 0.00,
                    'cessAmount': 0.00,
                    'grandTotal': float(target_qty * 50),
                    'items': [
                        {
                            'masterProductId': str(self.product.id),
                            'batchNo': "BTC78",
                            'expiryDate': '2026-12-01T00:00:00Z',
                            'qty': target_qty,
                            'actualQty': target_qty,
                            'purchaseRate': 50.00,
                            'mrp': 100.00,
                            'saleRate': 80.00,
                            'taxableAmount': float(target_qty * 50),
                            'gstAmount': 0.00,
                            'totalAmount': float(target_qty * 50),
                            'ptr': 50.00,
                            'pts': 45.00,
                        }
                    ]
                }
                
                # Wait for main thread to unleash
                start_event.wait()
                
                # Execute edit
                atomic_purchase_update(invoice.id, payload, str(self.outlet.id), str(self.user.id))
                results[thread_name] = "SUCCESS"
            except Exception as e:
                exceptions[thread_name] = str(e)
                results[thread_name] = "FAILED"
            finally:
                connection.close()
                
        # thread A attempts to change to 20
        t1 = threading.Thread(target=perform_edit, args=("Request A", 20))
        # thread B attempts to change to 12
        t2 = threading.Thread(target=perform_edit, args=("Request B", 12))
        
        t1.start()
        t2.start()
        
        # Unleash
        start_event.set()
        
        t1.join()
        t2.join()
        
        invoice.refresh_from_db()
        batch.refresh_from_db()
        
        # Output results to a file for parsing
        import json
        
        # Aggregate StockLedger
        ledger_entries = list(StockLedger.objects.filter(batch=batch).values('txn_type', 'qty_in', 'qty_out'))
        qty_in_total = sum(e['qty_in'] for e in ledger_entries if e['txn_type'] == 'PURCHASE_IN')
        qty_out_total = sum(e['qty_out'] for e in ledger_entries if e['txn_type'] == 'SALE_OUT')
        
        final_state = {
            'results': results,
            'exceptions': exceptions,
            'PurchaseInvoice.subtotal': float(invoice.subtotal),
            'PurchaseInvoice.qty': invoice.items.first().qty,
            'Batch.qty_strips': batch.qty_strips,
            'StockLedger.qty_in': float(qty_in_total),
            'StockLedger.qty_out': float(qty_out_total),
            'StockLedger.count_purchase_in': len([e for e in ledger_entries if e['txn_type'] == 'PURCHASE_IN']),
            'DocumentRevisionV2.count': DocumentRevisionV2.objects.count()
        }
        
        with open('concurrency_result.json', 'w') as f:
            json.dump(final_state, f, indent=2)
            
        # Basic assertion - we expect at least one to succeed
        self.assertTrue("SUCCESS" in results.values(), f"Both failed: {exceptions}")
        
        # Assert no duplicates
        self.assertEqual(final_state['StockLedger.count_purchase_in'], 1)
        
        # Assert consistent match
        self.assertEqual(batch.qty_strips, final_state['PurchaseInvoice.qty'] - final_state['StockLedger.qty_out'])
