import logging
from decimal import Decimal, ROUND_FLOOR
from datetime import datetime
from django.db import transaction
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
from apps.accounts.journal_service import post_sale_invoice
from apps.reports.gst_snapshot_service import create_sale_snapshots

logger = logging.getLogger(__name__)

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
        for item_data in items_data:
            batch_id = item_data.get('batchId')
            product_id = item_data.get('productId')
            qty_strips_needed = item_data.get('qtyStrips', 0)

            product = MasterProduct.objects.get(id=product_id)
            qty_loose_needed = item_data.get('qtyLoose', 0)

            if batch_id:
                # Batch is already locked — retrieve from pre-locked map
                batch = locked_batches_map[str(batch_id)]

                batch_pack_size = batch.pack_size or 1
                total_loose_needed = (qty_strips_needed * batch_pack_size) + qty_loose_needed
                total_loose_available = (batch.qty_strips * batch_pack_size) + batch.qty_loose
                
                if total_loose_available < total_loose_needed:
                    raise InsufficientStockError(f"Insufficient stock in batch {batch.batch_no}.")

                batch_allocations = [{
                    'batch': batch, 
                    'qty_to_deduct': qty_strips_needed,
                    'loose_to_deduct': qty_loose_needed
                }]
            else:
                batch_allocations = fefo_batch_select(
                    outlet_id=str(outlet.id), product_id=str(product_id), qty_strips_needed=qty_strips_needed
                )

            for batch_alloc in batch_allocations:
                batch = batch_alloc['batch']
                qty_to_deduct = batch_alloc.get('qty_to_deduct', 0)
                loose_to_deduct = batch_alloc.get('loose_to_deduct', 0)

                batch.qty_strips -= qty_to_deduct
                batch.qty_loose -= loose_to_deduct

                while batch.qty_loose < 0:
                    batch.qty_strips -= 1
                    batch.qty_loose += (batch.pack_size or 1)

                batch.save()

                proposed_rate = Decimal(str(item_data.get('rate', batch.mrp)))
                pricing_check = validate_sale_price(proposed_rate, batch, outlet.id)
                validate_unit_integrity(product, qty_loose_needed)
                if pricing_check.get('block'):
                    transaction.set_rollback(True)
                    raise ValidationError(f"Pricing Block on {batch.batch_no}: {pricing_check['message']}")

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
                    qty_strips=qty_to_deduct,
                    qty_loose=item_data.get('qtyLoose', 0),
                    sale_mode=item_data.get('saleMode', 'strip'),
                    discount_pct=Decimal(str(item_data.get('discountPct', 0))),
                    gst_rate=Decimal(str(item_data.get('gstRate', 0))),
                    taxable_amount=Decimal(str(item_data.get('taxableAmount', 0))),
                    gst_amount=Decimal(str(item_data.get('gstAmount', 0))),
                    total_amount=Decimal(str(item_data.get('totalAmount', 0))),
                )
                sale_items.append(sale_item)

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
                    ScheduleHRegister.objects.create(
                        sale_item=sale_item,
                        patient_name=schedule_h_data.get('patientName') if schedule_h_data else '',
                        patient_age=schedule_h_data.get('patientAge') if schedule_h_data else 0,
                        patient_address=schedule_h_data.get('patientAddress') if schedule_h_data else '',
                        doctor_name=schedule_h_data.get('doctorName') if schedule_h_data else '',
                        doctor_reg_no=schedule_h_data.get('doctorRegNo') if schedule_h_data else '',
                        prescription_no=(schedule_h_data.get('prescriptionNo') or '') if schedule_h_data else '',
                    )

        is_interstate = False
        if customer and customer.state and outlet.state:
            is_interstate = customer.state.strip().lower() != outlet.state.strip().lower()

        discount_factor = Decimal('1') - extra_discount_pct / Decimal('100')
        server_taxable = Decimal('0')
        server_cgst = Decimal('0')
        server_sgst = Decimal('0')
        server_igst = Decimal('0')
        max_gst_rate = Decimal('0')

        for si in sale_items:
            pack_size = Decimal(str(si.pack_size)) if si.pack_size else Decimal('1')
            total_fractional_strips = Decimal(str(si.qty_strips)) + (Decimal(str(si.qty_loose)) / pack_size)
            raw_total = si.rate * total_fractional_strips
            
            discounted_total = (raw_total * discount_factor).quantize(Decimal('0.01'))
            gst_rate = si.gst_rate

            if gst_rate > 0:
                item_taxable = (discounted_total * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
                item_gst = discounted_total - item_taxable
            else:
                item_taxable = discounted_total
                item_gst = Decimal('0')

            server_taxable += item_taxable

            if is_interstate:
                item_cgst = Decimal('0')
                item_sgst = Decimal('0')
                item_igst = item_gst
            else:
                item_cgst = (item_gst / 2).quantize(Decimal('0.01'), rounding=ROUND_FLOOR)
                item_sgst = item_gst - item_cgst
                item_igst = Decimal('0')

            server_cgst += item_cgst
            server_sgst += item_sgst
            server_igst += item_igst

            if gst_rate > max_gst_rate:
                max_gst_rate = gst_rate

        raw_exact = server_taxable + server_cgst + server_sgst + server_igst
        server_round_off = client_grand_total - raw_exact

        sale_invoice.taxable_amount = server_taxable
        sale_invoice.cgst_amount = server_cgst
        sale_invoice.sgst_amount = server_sgst
        sale_invoice.igst_amount = server_igst
        sale_invoice.cgst = Decimal('0') if is_interstate else (max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0'))
        sale_invoice.sgst = Decimal('0') if is_interstate else (max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0'))
        sale_invoice.igst = max_gst_rate if (is_interstate and max_gst_rate > 0) else Decimal('0')
        sale_invoice.round_off = server_round_off
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

        post_sale_invoice(sale_invoice)

        # ====== PHASE 2 GST SNAPSHOT CREATION ======
        create_sale_snapshots(sale_invoice)
        # ============================================

        return sale_invoice
