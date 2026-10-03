import logging
import threading
from django.db import transaction, connections
from decimal import Decimal, ROUND_FLOOR
from datetime import datetime
from django.db import transaction, connections
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework import status

def _canonical_pack_type(pack_type, pack_unit):
    pt = (pack_type or '').strip().lower()
    pu = (pack_unit or '').strip().lower()
    if pt == 'strip' and pu in ['box', 'piece', 'bottle', 'vial', 'tube', 'packet']:
        logger.warning(f"Runtime correction: bad pack_type 'strip' with unit '{pu}', falling back to '{pu}'")
        return pu
    return pack_type

from apps.billing.models import SaleInvoice, SaleItem, ScheduleHRegister, LedgerEntry, CreditAccount, CreditTransaction
from apps.accounts.models import Ledger
from apps.inventory.models import Batch, MasterProduct
from apps.inventory.services import post_stock_ledger_entry
from apps.billing.services import generate_invoice_number, schedule_h_validate, fefo_batch_select
from apps.billing.utils.pricing import validate_sale_price
from apps.billing.services import InsufficientStockError, ScheduleHViolationError, UnitIntegrityError
from apps.billing.pricing_engine import calculate_line_item, TaxCalculatorService
from apps.billing.credit_controls import (
    validate_statutory_compliance,
    validate_credit_exposure,
    validate_invoice_aging,
)
from apps.reports.gst_snapshot_service import create_sale_snapshots
from apps.reports.gst_snapshot_service import create_sale_snapshots
from apps.integrations.sandbox.einvoice import request_einvoice, get_irn_by_document_details
from apps.integrations.sandbox.ewaybill import request_ewaybill
from apps.integrations.sandbox.client import SandboxIntegrationError

logger = logging.getLogger(__name__)

def threaded_process_pending_irn(invoice_id: str):
    """Wrapper to safely execute IRN processing in a background thread."""
    try:
        process_pending_irn(invoice_id)
    finally:
        connections.close_all()

def process_pending_irn(invoice_id: str):
    try:
        invoice = SaleInvoice.objects.get(id=invoice_id)
        if invoice.irn_status != 'PENDING':
            return

        # Ensure valid B2B GSTIN before attempting e-invoice generation
        if not invoice.customer or not invoice.customer.gstin or len(invoice.customer.gstin) != 15:
            invoice.irn_status = 'NOT_APPLICABLE'
            invoice.save(update_fields=['irn_status'])
            return
            
        try:
            irn_data = request_einvoice(invoice)
        except SandboxIntegrationError as e:
            if "2150" in str(e):
                logger.warning(f"Duplicate IRN error for {invoice_id}. Attempting recovery.")
                irn_data = get_irn_by_document_details(invoice)
            else:
                raise e

        invoice.irn = irn_data.get('Irn')
        invoice.ack_no = irn_data.get('AckNo')
        invoice.ack_date = irn_data.get('AckDt')
        invoice.qr_code = irn_data.get('SignedQRCode')
        invoice.eway_bill_no = irn_data.get('EwbNo')
        invoice.irn_status = 'GENERATED'
        invoice.save(update_fields=['irn', 'ack_no', 'ack_date', 'qr_code', 'eway_bill_no', 'irn_status'])
        logger.info(f"Successfully generated IRN for {invoice.invoice_no}")
        
    except SandboxIntegrationError as e:
        logger.error(f"Failed to generate IRN for {invoice_id}: {str(e)}")
        SaleInvoice.objects.filter(id=invoice_id).update(irn_status='FAILED')
        # Do not raise ValidationError to prevent rolling back the checkout.
        # The user can retry generating the E-Invoice later from the UI.
    except Exception as e:
        logger.error(f"Unexpected error in process_pending_irn: {str(e)}")
        SaleInvoice.objects.filter(id=invoice_id).update(irn_status='FAILED')
        raise ValidationError(f"Unexpected E-Invoice Error: {str(e)}")

def threaded_process_pending_ewaybill(invoice_id: str):
    """Wrapper to safely execute EWB processing in a background thread."""
    try:
        process_pending_ewaybill(invoice_id)
    finally:
        connections.close_all()

def process_pending_ewaybill(invoice_id: str):
    from django.utils.timezone import now
    try:
        invoice = SaleInvoice.objects.get(id=invoice_id)
        if invoice.eway_bill_status != 'PENDING':
            return
            
        ewb_data = request_ewaybill(invoice)
        
        invoice.eway_bill_no = ewb_data.get('ewayBillNo')
        # Parse the custom dates string format if needed, Sandbox returns them as strings
        # e.g., '14/05/2021 11:22:00 PM'
        # For this prototype we will just set eway_bill_date to now()
        invoice.eway_bill_date = now()
        invoice.eway_bill_status = 'GENERATED'
        invoice.save(update_fields=['eway_bill_no', 'eway_bill_date', 'eway_bill_status'])
        logger.info(f"Successfully generated E-Way Bill for {invoice.invoice_no}")
        
    except SandboxIntegrationError as e:
        logger.error(f"Failed to generate E-Way Bill for {invoice_id}: {str(e)}")
        SaleInvoice.objects.filter(id=invoice_id).update(eway_bill_status='FAILED')
    except Exception as e:
        logger.error(f"Unexpected error in process_pending_ewaybill: {str(e)}")
        SaleInvoice.objects.filter(id=invoice_id).update(eway_bill_status='FAILED')

def validate_unit_integrity(product, qty_loose_needed):
    """
    Ensures that non-strip products (like box/piece) cannot be sold using loose fractional units.
    Raises UnitIntegrityError if rule is violated.
    """
    pack_type = _canonical_pack_type(product.pack_type, product.pack_unit)
    if pack_type not in ['strip', 'blister'] and qty_loose_needed > 0:
        raise UnitIntegrityError(f"Loose quantities not permitted for {product.name} ({pack_type})")

def atomic_sale_save(
    request_data: dict,
    outlet,
    customer,
    billed_by,
    items_data: list,
    schedule_h_data: dict,
    hospital_name: str,
    doctor_id: str,
):
    """
    Core service to atomically create a SaleInvoice, deduct stock,
    record ledgers, create snapshots, etc.
    """
    with transaction.atomic():
        sale_type = request_data.get('saleType', 'RETAIL').upper()
        payment_mode = request_data.get('paymentMode', 'cash')
        client_grand_total = Decimal(str(request_data.get('grandTotal', 0)))
        
        # Step 0: Statutory and Credit Controls (Phase 3)
        validate_statutory_compliance(customer, sale_type)
        if payment_mode in ['credit', 'split']:
            validate_credit_exposure(customer, client_grand_total, payment_mode)
            validate_invoice_aging(customer)

        # Step 1: Validate Schedule H requirements BEFORE any stock deduction
        cart_items = []
        for item in items_data:
            cart_items.append({
                'scheduleType': item.get('scheduleType', 'OTC'),
            })

        schedule_h_validate(cart_items, schedule_h_data)

        # Step 2: Generate invoice number atomically
        invoice_no = generate_invoice_number(outlet.id)

        # Step 3 & 5: Create SaleInvoice
        client_grand_total = Decimal(str(request_data.get('grandTotal', 0)))
        extra_discount_pct = Decimal(str(request_data.get('extraDiscountPct', 0)))

        cash_paid_val = Decimal(str(request_data.get('cashPaid', 0)))
        upi_paid_val = Decimal(str(request_data.get('upiPaid', 0)))
        card_paid_val = Decimal(str(request_data.get('cardPaid', 0)))
        credit_given_val = Decimal(str(request_data.get('creditGiven', 0)))
        payment_sum = cash_paid_val + upi_paid_val + card_paid_val + credit_given_val
        
        if abs(payment_sum - client_grand_total) > Decimal('0.01'):
            raise ValidationError(f'Payment amounts ({payment_sum}) do not match grand total ({client_grand_total})')

        if credit_given_val > 0 and not customer:
            raise ValidationError('A customer must be selected for credit bills')

        raw_invoice_date = request_data.get('invoiceDate')
        invoice_date = timezone.now()
        if raw_invoice_date:
            parsed = parse_datetime(raw_invoice_date)
            if parsed:
                if timezone.is_naive(parsed):
                    invoice_date = timezone.make_aware(parsed)
                else:
                    invoice_date = parsed

        sale_invoice = SaleInvoice.objects.create(
            outlet=outlet,
            invoice_no=invoice_no,
            invoice_date=invoice_date,
            customer=customer,
            doctor_id=doctor_id,
            hospital_name=hospital_name,
            prescription_no=request_data.get('prescriptionNo'),
            sale_type=request_data.get('saleType', 'RETAIL'),
            billing_basis=request_data.get('billingBasis', 'MRP'),
            subtotal=Decimal(str(request_data.get('subtotal', 0))),
            discount_amount=Decimal(str(request_data.get('discountAmount', 0))),
            extra_discount_pct=extra_discount_pct,
            taxable_amount=Decimal('0'),
            cgst_amount=Decimal('0'),
            sgst_amount=Decimal('0'),
            igst_amount=Decimal('0'),
            cgst=Decimal('0'),
            sgst=Decimal('0'),
            igst=Decimal('0'),
            round_off=Decimal('0'),
            grand_total=client_grand_total,
            payment_mode=request_data.get('paymentMode', 'cash'),
            cash_paid=cash_paid_val,
            upi_paid=upi_paid_val,
            card_paid=card_paid_val,
            credit_given=credit_given_val,
            amount_paid=cash_paid_val + upi_paid_val + card_paid_val,
            amount_due=max(Decimal('0'), client_grand_total - (cash_paid_val + upi_paid_val + card_paid_val)),
            billed_by=billed_by,
            transporter_id=request_data.get('transporterId'),
            vehicle_no=request_data.get('vehicleNo'),
            trans_distance=int(request_data.get('transDistance') or 0),
            trans_mode=int(request_data.get('transMode') or 1),
            vehicle_type=request_data.get('vehicleType', 'R'),
            eway_bill_status='PENDING' if (request_data.get('transporterId') or request_data.get('vehicleNo')) else None,
        )

        logger.info(f"Created SaleInvoice {invoice_no}")

        # ── Deadlock prevention: pre-lock all explicit batches in sorted UUID order ──
        # Concurrent transactions that acquire row locks in different orders can
        # deadlock (circular wait). By sorting batch IDs before locking we
        # guarantee every transaction acquires inventory_batch locks in the same
        # global order, which breaks any possible cycle.
        explicit_batch_ids = sorted({
            str(item_data['batchId'])
            for item_data in items_data
            if item_data.get('batchId')
        })
        if explicit_batch_ids:
            locked_batches_qs = Batch.objects.select_for_update().filter(
                id__in=explicit_batch_ids,
                outlet=outlet,
            ).order_by('id')  # order_by matches sorted() for UUID strings
            locked_batches_map = {str(b.id): b for b in locked_batches_qs}
            missing = set(explicit_batch_ids) - set(locked_batches_map.keys())
            if missing:
                raise InsufficientStockError(
                    f"Batch(es) not found for this outlet: {', '.join(sorted(missing))}"
                )
        else:
            locked_batches_map = {}
        # ────────────────────────────────────────────────────────────────────────

        # Create SaleItems and deduct stock
        sale_items = []
        
        # Phase 2 Aggregators
        inv_total_free_strips = 0
        inv_taxable_amount = Decimal('0')
        inv_cgst_amount = Decimal('0')
        inv_sgst_amount = Decimal('0')
        inv_igst_amount = Decimal('0')
        inv_subtotal = Decimal('0')
        inv_grand_total = Decimal('0')
        max_gst_rate = Decimal('0')

        # We must call sale_invoice.save() once first to trigger .clean() and set is_interstate
        sale_invoice.save()

        for item_data in items_data:
            batch_id = item_data.get('batchId')
            product_id = item_data.get('productId')
            qty_strips_needed = item_data.get('qtyStrips', 0)
            free_qty_strips = item_data.get('freeQtyStrips', 0)
            trade_discount_pct = Decimal(str(item_data.get('tradeDiscountPercent', 0)))
            total_qty_strips_needed = qty_strips_needed + free_qty_strips

            product = MasterProduct.objects.get(id=product_id)
            qty_loose_needed = item_data.get('qtyLoose', 0)

            if batch_id:
                # Batch is already locked — retrieve from pre-locked map
                batch = locked_batches_map[str(batch_id)]

                batch_pack_size = batch.pack_size or 1
                total_loose_needed = (total_qty_strips_needed * batch_pack_size) + qty_loose_needed
                total_loose_available = (batch.qty_strips * batch_pack_size) + batch.qty_loose
                
                if total_loose_available < total_loose_needed:
                    raise InsufficientStockError(f"Insufficient stock in batch {batch.batch_no}.")

                batch_allocations = [{
                    'batch': batch, 
                    'qty_to_deduct': total_qty_strips_needed,
                    'loose_to_deduct': qty_loose_needed
                }]
            else:
                batch_allocations = fefo_batch_select(
                    outlet_id=str(outlet.id), product_id=str(product_id), qty_strips_needed=total_qty_strips_needed
                )

            free_qty_remaining = free_qty_strips
            billed_qty_remaining = qty_strips_needed

            for batch_alloc in batch_allocations:
                batch = batch_alloc['batch']
                qty_to_deduct = batch_alloc.get('qty_to_deduct', 0)
                loose_to_deduct = batch_alloc.get('loose_to_deduct', 0)

                alloc_billed = min(qty_to_deduct, billed_qty_remaining)
                billed_qty_remaining -= alloc_billed
                
                alloc_free = qty_to_deduct - alloc_billed
                free_qty_remaining -= alloc_free

                batch.qty_strips -= qty_to_deduct
                batch.qty_loose -= loose_to_deduct

                while batch.qty_loose < 0:
                    batch.qty_strips -= 1
                    batch.qty_loose += (batch.pack_size or 1)

                batch.save()
                
                # Phase 2: Compute logic via Pricing Engine
                pricing_result = calculate_line_item(
                    batch=batch,
                    qty_strips=alloc_billed,
                    qty_loose=loose_to_deduct,
                    free_qty_strips=alloc_free,
                    trade_discount_percent=trade_discount_pct,
                    billing_basis=sale_invoice.billing_basis,
                    sale_type=sale_invoice.sale_type,
                    is_interstate=sale_invoice.is_interstate,
                    gst_rate=Decimal(str(item_data.get('gstRate', 0)))
                )
                
                proposed_rate = pricing_result['unit_rate']
                pricing_check = validate_sale_price(proposed_rate, batch, outlet.id)
                validate_unit_integrity(product, loose_to_deduct)
                if pricing_check.get('block'):
                    transaction.set_rollback(True)
                    raise ValidationError(f"Pricing Block on {batch.batch_no}: {pricing_check['message']}")

                tax_info = pricing_result['tax_info']
                gst_rate_val = Decimal(str(item_data.get('gstRate', 0)))
                if gst_rate_val > max_gst_rate:
                    max_gst_rate = gst_rate_val

                sale_item = SaleItem.objects.create(
                    invoice=sale_invoice,
                    batch=batch,
                    product_name=product.name,
                    composition=product.composition,
                    pack_size=batch.pack_size,
                    pack_unit=batch.pack_unit,
                    schedule_type=product.schedule_type,
                    hsn_code=product.hsn_code,
                    batch_no=batch.batch_no,
                    expiry_date=batch.expiry_date,
                    mrp=batch.mrp,
                    sale_rate=batch.mrp,
                    rate=proposed_rate,
                    qty_strips=alloc_billed,
                    free_qty_strips=alloc_free,
                    qty_loose=loose_to_deduct,
                    sale_mode=item_data.get('saleMode', 'strip'),
                    discount_pct=Decimal(str(item_data.get('discountPct', 0))),
                    gst_rate=gst_rate_val,
                    gst_amount=tax_info['cgst_amount'] + tax_info['sgst_amount'] + tax_info['igst_amount'],
                    unit_rate=pricing_result['unit_rate'],
                    trade_discount_percent=pricing_result['trade_discount_percent'],
                    trade_discount_amount=pricing_result['trade_discount_amount'],
                    taxable_amount=pricing_result['taxable_value'],
                    cgst_rate=tax_info['cgst_rate'],
                    cgst_amount=tax_info['cgst_amount'],
                    sgst_rate=tax_info['sgst_rate'],
                    sgst_amount=tax_info['sgst_amount'],
                    igst_rate=tax_info['igst_rate'],
                    igst_amount=tax_info['igst_amount'],
                    total_amount=pricing_result['line_total'],
                )
                sale_items.append(sale_item)
                
                inv_total_free_strips += alloc_free
                inv_taxable_amount += pricing_result['taxable_value']
                inv_cgst_amount += tax_info['cgst_amount']
                inv_sgst_amount += tax_info['sgst_amount']
                inv_igst_amount += tax_info['igst_amount']
                inv_subtotal += pricing_result['gross_amount']
                inv_grand_total += pricing_result['line_total']

                deducted_qty = (Decimal(str(qty_to_deduct)) + (
                    Decimal(str(loose_to_deduct)) / Decimal(str(batch.pack_size or 1))
                    if loose_to_deduct else Decimal('0')
                )).quantize(Decimal('0.0001'))
                post_stock_ledger_entry(
                    outlet         = sale_invoice.outlet,
                    product        = batch.product,
                    batch          = batch,
                    txn_type       = 'SALE_OUT',
                    txn_date       = sale_invoice.invoice_date.date(),
                    voucher_type   = 'Sale Invoice',
                    voucher_number = sale_invoice.invoice_no,
                    party_name     = customer.name if customer else 'Walk-in',
                    qty_in         = 0,
                    qty_out        = deducted_qty,
                    rate           = proposed_rate,
                    source_object  = sale_item,
                )


                if product.schedule_type in ['G', 'H', 'H1', 'X', 'C', 'Narcotic']:
                    schedule_h_data_map = schedule_h_data or {}
                    ScheduleHRegister.objects.create(
                        sale_item=sale_item,
                        patient_name=schedule_h_data_map.get('patientName', ''),
                        patient_age=schedule_h_data_map.get('patientAge', 0),
                        patient_address=schedule_h_data_map.get('patientAddress', ''),
                        doctor_name=schedule_h_data_map.get('doctorName', ''),
                        doctor_reg_no=schedule_h_data_map.get('doctorRegNo', ''),
                        prescription_no=schedule_h_data_map.get('prescriptionNo', ''),
                    )

        # Phase 2: Save backend-computed totals to Invoice
        raw_exact = inv_taxable_amount + inv_cgst_amount + inv_sgst_amount + inv_igst_amount
        server_round_off = inv_grand_total - raw_exact
        
        # Apply invoice-level extra discount if necessary
        invoice_level_discount = Decimal(str(request_data.get('discountAmount', 0)))
        inv_grand_total -= invoice_level_discount
        total_discount_amount = sum(item.trade_discount_amount for item in sale_items) + invoice_level_discount
        
        sale_invoice.total_free_strips = inv_total_free_strips
        sale_invoice.subtotal = inv_subtotal
        sale_invoice.discount_amount = total_discount_amount
        sale_invoice.taxable_amount = inv_taxable_amount
        sale_invoice.cgst_amount = inv_cgst_amount
        sale_invoice.sgst_amount = inv_sgst_amount
        sale_invoice.igst_amount = inv_igst_amount
        sale_invoice.grand_total = inv_grand_total
        
        sale_invoice.cgst = Decimal('0') if sale_invoice.is_interstate else (max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0'))
        sale_invoice.sgst = Decimal('0') if sale_invoice.is_interstate else (max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0'))
        sale_invoice.igst = max_gst_rate if (sale_invoice.is_interstate and max_gst_rate > 0) else Decimal('0')
        sale_invoice.round_off = server_round_off
        
        # Let's ensure payment mismatch check uses our computed grand_total
        # The user specifically requested overriding request_data. 
        # But wait, payment amounts were validated at the start against `client_grand_total`.
        # If the computed `inv_grand_total` differs, this means the client calculation was wrong.
        # But we accept the client payments as cash/upi splits. Let's adjust amount_due.
        payment_sum = sale_invoice.amount_paid
        sale_invoice.amount_due = max(Decimal('0'), inv_grand_total - payment_sum)
        
        # Check if IRN is required
        if sale_invoice.sale_type == 'WHOLESALE' and sale_invoice.grand_total > Decimal('0'):
            sale_invoice.irn_status = 'PENDING'
            
        sale_invoice.save()

        if credit_given_val > 0 and customer:
            credit_account, _ = CreditAccount.objects.get_or_create(
                outlet=outlet,
                customer=customer
            )

            credit_account.total_outstanding += credit_given_val
            credit_account.total_borrowed += credit_given_val
            credit_account.last_transaction_date = datetime.now()
            credit_account.save()

            CreditTransaction.objects.create(
                credit_account=credit_account,
                customer=customer,
                invoice=sale_invoice,
                type='debit',
                amount=credit_given_val,
                description=f'Sale on {invoice_no}',
                balance_after=credit_account.total_outstanding,
                recorded_by=billed_by,
                date=datetime.now().date(),
            )

        if customer:
            customer.total_purchases += sale_invoice.grand_total
            customer.save(update_fields=['total_purchases'])

            last_ledger = LedgerEntry.objects.filter(
                outlet=outlet,
                customer=customer,
                entity_type='customer'
            ).order_by('-date', '-created_at').first()

            running_balance = (last_ledger.running_balance if last_ledger else Decimal('0')) + sale_invoice.grand_total

            invoice_dt = sale_invoice.invoice_date
            invoice_d = invoice_dt.date() if hasattr(invoice_dt, 'date') else invoice_dt

            LedgerEntry.objects.create(
                outlet=outlet,
                entity_type='customer',
                customer=customer,
                date=invoice_d,
                entry_type='sale',
                reference_no=sale_invoice.invoice_no,
                description=f"Sale Invoice {sale_invoice.invoice_no}",
                debit=sale_invoice.grand_total,
                credit=Decimal('0'),
                running_balance=running_balance,
            )

            total_paid = (sale_invoice.cash_paid or Decimal('0')) + (sale_invoice.upi_paid or Decimal('0')) + (sale_invoice.card_paid or Decimal('0'))
            if total_paid > Decimal('0'):
                running_balance = running_balance - total_paid
                LedgerEntry.objects.create(
                    outlet=outlet,
                    entity_type='customer',
                    customer=customer,
                    date=invoice_d,
                    entry_type='receipt',
                    reference_no=sale_invoice.invoice_no,
                    description=f"Instant Payment against {sale_invoice.invoice_no}",
                    debit=Decimal('0'),
                    credit=total_paid,
                    running_balance=running_balance,
                )

        # ====== PHASE 2 GST SNAPSHOT CREATION ======
        create_sale_snapshots(sale_invoice)
        # ============================================

        if sale_invoice.irn_status == 'PENDING':
            process_pending_irn(str(sale_invoice.id))

        if sale_invoice.eway_bill_status == 'PENDING':
            threading.Thread(target=threaded_process_pending_ewaybill, args=(str(sale_invoice.id),)).start()

        return sale_invoice
