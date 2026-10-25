import logging
import re
import uuid
from django.db import transaction
from datetime import datetime, timedelta, date
from django.utils import timezone
from django.db.models import Sum, Count, Q, F
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated, IsManagerOrAbove, CanEditSalesInvoice, IsBillingStaffOrAbove
from rest_framework import status
from rest_framework.filters import OrderingFilter
from decimal import Decimal, ROUND_FLOOR
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.billing.models import (
    SaleInvoice, SaleItem, ScheduleHRegister, CreditTransaction, CreditAccount, LedgerEntry,
    ReceiptEntry, ReceiptAllocation, ExpenseEntry, SalesReturn, SalesReturnItem, InvoicePayment,
)
from apps.billing.services import (
    fefo_batch_select,
    schedule_h_validate,
    generate_invoice_number,
    InsufficientStockError,
    ScheduleHViolationError,
    UnitIntegrityError,
)
from apps.billing.utils.pricing import validate_sale_price
from apps.inventory.models import Batch, MasterProduct
from apps.accounts.models import Staff, Customer, Ledger
from apps.accounts.journal_service import post_sale_invoice, _get_ledger
from apps.core.models import Outlet, TaxSlab
from apps.billing.payment_services import (
    create_receipt_payment, create_expense_entry, create_sales_return,
    ReceiptServiceError, ExpenseServiceError, ReturnServiceError,
)
from apps.audit.services import log_activity

class NextInvoiceNumberView(APIView):
    """
    GET /api/v1/billing/next-invoice-number/?outletId=xxx

    Returns a PREVIEW of the next invoice number.
    The actual number is re-generated (with a row-level lock) when the bill is
    saved, so this value may differ if another bill is created in the interim.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        # Wrap in atomic so the SELECT FOR UPDATE inside generate_invoice_number is valid.
        # This is read-only — no row is inserted — the lock is released immediately.
        with transaction.atomic():
            invoice_no = generate_invoice_number(outlet_id)
        return Response({'invoiceNo': invoice_no, 'isPreview': True}, status=status.HTTP_200_OK)

logger = logging.getLogger(__name__)

from django.http import FileResponse, JsonResponse
from apps.integrations.sandbox.ewaybill import fetch_eway_bill_pdf
import io

class EwayBillPdfDownloadView(APIView):
    """
    GET /api/v1/billing/sales/{id}/eway-bill-pdf/
    Downloads the E-Way bill PDF from the Sandbox API.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id, *args, **kwargs):
        try:
            invoice = SaleInvoice.objects.get(id=sale_id, outlet=request.user.outlet)
        except SaleInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        if not invoice.eway_bill_no:
            return JsonResponse({'detail': 'This invoice does not have an E-Way Bill Number.'}, status=400)

        try:
            pdf_bytes = fetch_eway_bill_pdf(invoice.eway_bill_no)
            buffer = io.BytesIO(pdf_bytes)
            return FileResponse(buffer, as_attachment=True, filename=f"EwayBill_{invoice.eway_bill_no}.pdf", content_type='application/pdf')
        except Exception as e:
            logger.error(str(e))
            return JsonResponse({'detail': f'Sandbox API failed: {str(e)}'}, status=400)


class PatchEwbView(APIView):
    """Dev/test endpoint: directly set eway_bill_no on a SaleInvoice to simulate EWB generation."""
    permission_classes = []

    def post(self, request, sale_id, *args, **kwargs):
        try:
            invoice = SaleInvoice.objects.get(id=sale_id)
        except SaleInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        eway_bill_no = request.data.get('eway_bill_no')
        if not eway_bill_no:
            return Response({'detail': 'eway_bill_no is required'}, status=status.HTTP_400_BAD_REQUEST)

        invoice.eway_bill_no = eway_bill_no
        invoice.irn_status = 'GENERATED'
        invoice.save(update_fields=['eway_bill_no', 'irn_status'])
        return Response({'detail': 'EWB patched', 'eway_bill_no': invoice.eway_bill_no})

class RetryEinvoiceView(APIView):
    def post(self, request, sale_id):
        from apps.billing.sale_services import process_pending_irn
        from apps.billing.models import SaleInvoice
        from .serializers import SaleInvoiceSerializer
        
        try:
            invoice = SaleInvoice.objects.get(id=sale_id)
        except SaleInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        if invoice.irn_status not in ['FAILED', 'PENDING'] or invoice.irn:
            return Response({'detail': 'Invoice already has an IRN or is not in a failed state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            process_pending_irn(str(invoice.id))
            invoice.refresh_from_db()
            if invoice.irn_status == 'FAILED':
                # Assuming process_pending_irn logged the actual error
                return Response({'detail': 'Sandbox API failed again. Please check the credentials.'}, status=status.HTTP_400_BAD_REQUEST)
            
            serializer = SaleInvoiceSerializer(invoice)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': f'Sandbox API failed: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


def build_sale_response_payload(sale_invoice, message=None, revision_id=None):
    from decimal import Decimal
    sale_items = sale_invoice.items.all()
    
    schedule_h_record = None
    for si in sale_items:
        if hasattr(si, 'schedule_h_register'):
            schedule_h_record = si.schedule_h_register
            break

    response_data = {
        'id': str(sale_invoice.id),
        'outletId': str(sale_invoice.outlet.id),
        'outlet': {
            'id': str(sale_invoice.outlet.id),
            'name': sale_invoice.outlet.name,
            'address': sale_invoice.outlet.address,
            'city': sale_invoice.outlet.city,
            'state': sale_invoice.outlet.state,
            'pincode': sale_invoice.outlet.pincode,
            'phone': sale_invoice.outlet.phone,
            'gstin': sale_invoice.outlet.gstin,
            'drugLicenseNo': sale_invoice.outlet.drug_license_no,
            'invoiceFooter': sale_invoice.outlet.invoice_footer,
            'logoUrl': sale_invoice.outlet.logo_url,
        } if sale_invoice.outlet else None,
        'invoiceNo': sale_invoice.invoice_no,
        'invoiceDate': sale_invoice.invoice_date.isoformat() if sale_invoice.invoice_date else None,
        'customerId': str(sale_invoice.customer.id) if sale_invoice.customer else None,
        'customer': {
            'id': str(sale_invoice.customer.id),
            'name': sale_invoice.customer.name,
            'phone': sale_invoice.customer.phone,
            'address': sale_invoice.customer.address,
        } if sale_invoice.customer else None,
        'doctorId': str(sale_invoice.doctor.id) if sale_invoice.doctor else None,
        'doctorName': schedule_h_record.doctor_name if schedule_h_record else (sale_invoice.doctor.name if sale_invoice.doctor else None),
        'doctorRegNo': schedule_h_record.doctor_reg_no if schedule_h_record else (sale_invoice.doctor.reg_no if hasattr(sale_invoice.doctor, 'reg_no') and sale_invoice.doctor else None),
        'patientName': schedule_h_record.patient_name if schedule_h_record else None,
        'patientAddress': schedule_h_record.patient_address if schedule_h_record else None,
        'prescriptionNo': schedule_h_record.prescription_no if schedule_h_record else sale_invoice.prescription_no,
        'hospitalName': sale_invoice.hospital_name,
        'items': [
            {
                'batchId': str(si.batch_id) if si.batch_id else '',
                'productId': str(si.batch.product_id) if si.batch and si.batch.product_id else '',
                'name': si.product_name,
                'composition': si.composition,
                'manufacturer': si.batch.product.manufacturer if si.batch and si.batch.product else None,
                'packSize': si.pack_size,
                'packUnit': si.pack_unit,
                'batchNo': si.batch_no,
                'expiryDate': si.expiry_date.isoformat() if getattr(si, 'expiry_date', None) else None,
                'scheduleType': si.schedule_type,
                'mrp': float(si.mrp),
                'rate': float(si.rate),
                'qtyStrips': si.qty_strips,
                'qtyLoose': si.qty_loose,
                'totalQty': (si.qty_strips * si.pack_size + si.qty_loose) if si.pack_size else si.qty_strips,
                'saleMode': si.sale_mode,
                'discountPct': float(si.discount_pct),
                'gstRate': float(si.gst_rate),
                'taxableAmount': float(si.taxable_amount),
                'gstAmount': float(si.gst_amount),
                'totalAmount': float(si.total_amount),
            }
            for si in sale_items
        ],
        'subtotal': float(sale_invoice.subtotal),
        'discountAmount': float(sale_invoice.discount_amount),
        'extraDiscountPct': float(sale_invoice.extra_discount_pct),
        'extraDiscountAmount': float(
            (sale_invoice.subtotal - sale_invoice.discount_amount)
            * sale_invoice.extra_discount_pct / Decimal('100')
        ),
        'taxableAmount': float(sale_invoice.taxable_amount),
        'cgstAmount': float(sale_invoice.cgst_amount),
        'sgstAmount': float(sale_invoice.sgst_amount),
        'igstAmount': float(sale_invoice.igst_amount),
        'cgst': float(sale_invoice.cgst),
        'sgst': float(sale_invoice.sgst),
        'igst': float(sale_invoice.igst),
        'roundOff': float(sale_invoice.round_off),
        'grandTotal': float(sale_invoice.grand_total),
        'paymentMode': sale_invoice.payment_mode,
        'sale_type': getattr(sale_invoice, 'sale_type', 'RETAIL'),
        'billing_basis': getattr(sale_invoice, 'billing_basis', 'MRP'),
        'cashPaid': float(sale_invoice.cash_paid),
        'upiPaid': float(sale_invoice.upi_paid),
        'cardPaid': float(sale_invoice.card_paid),
        'creditGiven': float(sale_invoice.credit_given),
        'amountPaid': float(sale_invoice.amount_paid),
        'amountDue': float(sale_invoice.amount_due),
        'isReturn': sale_invoice.is_return,
        'ewayBillNo': getattr(sale_invoice, 'eway_bill_no', None),
        'billedBy': str(sale_invoice.billed_by.id) if sale_invoice.billed_by else None,
        'billedByName': sale_invoice.billed_by.name if getattr(sale_invoice.billed_by, 'name', None) else None,
        'payments': [
            {
                'id': str(p.id),
                'method': p.method,
                'amount': float(p.amount),
                'referenceNo': p.reference_no,
                'ledgerId': str(p.ledger_id) if p.ledger_id else None,
            }
            for p in sale_invoice.payments.all()
        ],
        'createdAt': sale_invoice.created_at.isoformat() if sale_invoice.created_at else None,
        'isModified': bool(revision_id),
    }
    if not revision_id and getattr(sale_invoice, 'id', None):
        try:
            from apps.audit.models import DocumentRevisionV2, DocumentRevision
            from apps.billing.models import BillRevision
            from django.contrib.contenttypes.models import ContentType
            from django.db.models import Q
            si_ct = ContentType.objects.get_for_model(sale_invoice.__class__)
            has_rev = DocumentRevisionV2.objects.filter(
                content_type=si_ct, object_id=sale_invoice.id
            ).filter(
                Q(action__in=['UPDATE', 'update', 'correction', 'standard_correction', 'direct_revise', 'financial_change', 'cancel_reissue', 'paid_bill_correction']) |
                Q(revision_no__gt=1) |
                ~Q(action__iexact='create')
            ).exists() or DocumentRevision.objects.filter(
                content_type=si_ct, object_id=sale_invoice.id
            ).exists() or BillRevision.objects.filter(
                original_invoice_id=sale_invoice.id
            ).exists()
            response_data['isModified'] = has_rev
        except Exception:
            pass
    if message:
        response_data['message'] = message
    if revision_id:
        response_data['revisionId'] = revision_id
    return response_data


class SaleCreateView(APIView):
    """
    POST /api/v1/sales/

    Create a new sale invoice with atomic stock deduction and payment recording.
    Validates Schedule H requirements, allocates batches using FEFO, and records
    customer credit transactions if applicable.
    """

    permission_classes = [IsBillingStaffOrAbove]

    def post(self, request, *args, **kwargs):
        """
        Create a sale invoice.

        Request body:
        {
            "outletId": "...",
            "customerId": "...",  // optional
            "items": [
                {
                    "batchId": "...",
                    "productId": "...",
                    "qtyStrips": 5,
                    "qtyLoose": 0,
                    "rate": 40.0,
                    "discountPct": 0,
                    "gstRate": 5,
                    "taxableAmount": 200,
                    "gstAmount": 10,
                    "totalAmount": 210
                }
            ],
            "subtotal": 2100,
            "discountAmount": 0,
            "taxableAmount": 2100,
            "cgstAmount": 105,
            "sgstAmount": 105,
            "igstAmount": 0,
            "cgst": 5,
            "sgst": 5,
            "igst": 0,
            "roundOff": 0,
            "grandTotal": 2310,
            "paymentMode": "split",
            "cashPaid": 1000,
            "upiPaid": 1310,
            "cardPaid": 0,
            "creditGiven": 0,
            "scheduleHData": {
                "patientName": "...",
                "patientAge": 45,
                "patientAddress": "...",
                "doctorName": "...",
                "doctorRegNo": "...",
                "prescriptionNo": "..."
            }
        }

        Response:
        {
            "id": "...",
            "outletId": "...",
            "invoiceNo": "INV-2026-000001",
            "invoiceDate": "2026-03-17T...",
            "customerId": "...",
            "subtotal": 2100,
            "discountAmount": 0,
            "taxableAmount": 2100,
            "cgstAmount": 105,
            "sgstAmount": 105,
            "igstAmount": 0,
            "cgst": 5,
            "sgst": 5,
            "igst": 0,
            "roundOff": 0,
            "grandTotal": 2310,
            "paymentMode": "split",
            "cashPaid": 1000,
            "upiPaid": 1310,
            "cardPaid": 0,
            "creditGiven": 0,
            "amountPaid": 2310,
            "amountDue": 0,
            "isReturn": false,
            "billedBy": "...",
            "items": [...],
            "createdAt": "2026-03-17T..."
        }
        """

        try:
            outlet_id = request.data.get('outletId')
            customer_id = request.data.get('customerId')
            doctor_id = request.data.get('doctorId')
            hospital_name = request.data.get('hospitalName')
            items_data = request.data.get('items', [])
            schedule_h_data = request.data.get('scheduleHData')

            if not items_data:
                return Response(
                    {'detail': 'Invoice must contain at least one item.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validate outlet exists
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                print(f"404 ERROR: Outlet {outlet_id} not found")
                return Response(
                    {'detail': f'Outlet {outlet_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Resolve customer — prioritize customerId UUID, then partyLedgerId
            party_ledger_id = request.data.get('partyLedgerId')
            create_new_customer = bool(request.data.get('createNewCustomer', False))
            customer = None

            if customer_id:
                try:
                    uuid.UUID(str(customer_id))
                    customer = Customer.objects.get(id=customer_id, outlet=outlet)
                except (ValueError, AttributeError):
                    return Response(
                        {'detail': f'Invalid customerId UUID format: {customer_id}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                except Customer.DoesNotExist:
                    # Fallback lookup: Check if customerId is actually a Ledger UUID
                    try:
                        ledger_id_to_check = customer_id
                        ledger = Ledger.objects.select_related('linked_customer').get(
                            id=ledger_id_to_check, outlet=outlet
                        )
                        if ledger.linked_customer:
                            customer = ledger.linked_customer
                            if ledger.gstin and not customer.gstin:
                                customer.gstin = ledger.gstin
                                customer.save(update_fields=['gstin'])
                        else:
                            phone_number = ledger.phone or f"L-{ledger.id}"[:20]
                            customer, created = Customer.objects.get_or_create(
                                outlet=outlet,
                                phone=phone_number,
                                defaults={
                                    'name': ledger.name or 'Walk-in Customer',
                                    'address': ledger.address or '',
                                    'gstin': ledger.gstin or None,
                                }
                            )
                            if not created and ledger.gstin and not customer.gstin:
                                customer.gstin = ledger.gstin
                                customer.save(update_fields=['gstin'])

                            ledger.linked_customer = customer
                            ledger.save(update_fields=['linked_customer'])
                    except Ledger.DoesNotExist:
                        # Also check if partyLedgerId was provided and can resolve customer
                        if party_ledger_id and party_ledger_id != customer_id:
                            try:
                                uuid.UUID(str(party_ledger_id))
                                party_ledger = Ledger.objects.select_related('linked_customer').get(
                                    id=party_ledger_id, outlet=outlet
                                )
                                if party_ledger.linked_customer:
                                    customer = party_ledger.linked_customer
                                    if party_ledger.gstin and not customer.gstin:
                                        customer.gstin = party_ledger.gstin
                                        customer.save(update_fields=['gstin'])
                                else:
                                    phone_number = party_ledger.phone or f"L-{party_ledger.id}"[:20]
                                    customer, created = Customer.objects.get_or_create(
                                        outlet=outlet,
                                        phone=phone_number,
                                        defaults={
                                            'name': party_ledger.name or 'Walk-in Customer',
                                            'address': party_ledger.address or '',
                                            'gstin': party_ledger.gstin or None,
                                        }
                                    )
                                    if not created and party_ledger.gstin and not customer.gstin:
                                        customer.gstin = party_ledger.gstin
                                        customer.save(update_fields=['gstin'])

                                    party_ledger.linked_customer = customer
                                    party_ledger.save(update_fields=['linked_customer'])
                            except (Ledger.DoesNotExist, ValueError, AttributeError):
                                return Response(
                                    {'detail': f'Customer {customer_id} not found'},
                                    status=status.HTTP_404_NOT_FOUND
                                )
                        else:
                            return Response(
                                {'detail': f'Customer {customer_id} not found'},
                                status=status.HTTP_404_NOT_FOUND
                            )
            elif party_ledger_id:
                try:
                    uuid.UUID(str(party_ledger_id))
                    party_ledger = Ledger.objects.select_related('linked_customer').get(
                        id=party_ledger_id, outlet=outlet
                    )
                except (ValueError, AttributeError):
                    return Response(
                        {'detail': f'Invalid partyLedgerId UUID format: {party_ledger_id}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                except Ledger.DoesNotExist:
                    print(f"404 ERROR: Ledger {party_ledger_id} not found")
                    return Response({'detail': f'Ledger {party_ledger_id} not found'}, status=404)

                if party_ledger.linked_customer:
                    customer = party_ledger.linked_customer
                    # Sync GSTIN if missing on customer but present on ledger
                    if party_ledger.gstin and not customer.gstin:
                        customer.gstin = party_ledger.gstin
                        customer.save(update_fields=['gstin'])
                else:
                    phone_number = party_ledger.phone or f"L-{party_ledger.id}"[:20]
                    customer, created = Customer.objects.get_or_create(
                        outlet=outlet,
                        phone=phone_number,
                        defaults={
                            'name': party_ledger.name or 'Walk-in Customer',
                            'address': party_ledger.address or '',
                            'gstin': party_ledger.gstin or None,
                        }
                    )
                    
                    if not created and party_ledger.gstin and not customer.gstin:
                        customer.gstin = party_ledger.gstin
                        customer.save(update_fields=['gstin'])

                    party_ledger.linked_customer = customer
                    party_ledger.save(update_fields=['linked_customer'])

            # Determine if this sale involves credit tender
            raw_pm = str(request.data.get('paymentMode') or '').lower()
            raw_cg = Decimal(str(request.data.get('creditGiven') or 0))
            raw_payments = request.data.get('payments') or []
            has_credit_tender = (
                any(str(p.get('method') or '').lower() == 'credit' and Decimal(str(p.get('amount') or 0)) > 0 for p in raw_payments)
                if isinstance(raw_payments, list) else False
            )
            is_credit_sale = (raw_pm == 'credit' or raw_cg > Decimal('0') or has_credit_tender)

            # Prevent Accidental Creation:
            # Only create a permanent Customer entity and Sundry Debtors ledger if:
            # 1. The pharmacist explicitly clicked "Create New Customer" in the UI (createNewCustomer: True), OR
            # 2. It is an explicit credit sale with provided customer contact info.
            # Otherwise, non-credit walk-in sales (including cash/UPI Schedule H) remain customer=None (Walk-in).
            if not customer:
                if create_new_customer or is_credit_sale:
                    cand_name = (request.data.get('customerName') or (schedule_h_data or {}).get('patientName') or '').strip()
                    cand_phone = (request.data.get('customerPhone') or (schedule_h_data or {}).get('patientPhone') or '').strip()
                    cand_address = (request.data.get('customerAddress') or (schedule_h_data or {}).get('patientAddress') or '').strip()

                    if cand_phone and re.match(r'^[6-9]\d{9}$', cand_phone):
                        # Match existing customer by phone first to avoid duplicate entities
                        customer = Customer.objects.filter(outlet=outlet, phone=cand_phone).first()
                        if not customer:
                            customer = Customer.objects.create(
                                outlet=outlet,
                                phone=cand_phone,
                                name=cand_name or 'Customer',
                                address=cand_address,
                            )
                            from apps.accounts.models import LedgerGroup
                            debtor_group, _ = LedgerGroup.objects.get_or_create(
                                outlet=outlet,
                                name='Sundry Debtors',
                                defaults={'nature': 'asset', 'is_system': True}
                            )
                            Ledger.objects.create(
                                outlet=outlet,
                                name=f"{customer.name} ({customer.phone})",
                                group=debtor_group,
                                linked_customer=customer,
                                phone=customer.phone,
                                address=customer.address or '',
                                is_system=True
                            )
                
                # If it's a credit sale and we still have no customer, reject
                if is_credit_sale and not customer:
                    return Response(
                        {'detail': 'Credit sales require selecting an existing customer or explicitly creating a new customer.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Get billed_by staff (from request payload if PIN verified, fallback to request user)
            billed_by_id = request.data.get('billedBy')
            try:
                if billed_by_id:
                    billed_by = Staff.objects.get(id=billed_by_id)
                else:
                    billed_by = Staff.objects.get(id=request.user.id)
            except (Staff.DoesNotExist, AttributeError):
                billed_by = None

            # H5: Enforce per-staff max_discount before entering the transaction
            if billed_by:
                staff_max_discount = billed_by.max_discount
                for item_data in items_data:
                    item_disc = Decimal(str(item_data.get('discountPct', 0)))
                    if item_disc > staff_max_discount:
                        return Response(
                            {'detail': (
                                f"Discount {item_disc}% exceeds your maximum allowed "
                                f"discount of {staff_max_discount}%"
                            )},
                            status=status.HTTP_400_BAD_REQUEST
                        )

            # Validate GST 2.0 Tax Rates for all items in cart
            raw_invoice_date = request.data.get('invoiceDate')
            for item_data in items_data:
                product_obj = None
                product_id = item_data.get('productId')
                batch_id = item_data.get('batchId')
                if product_id:
                    product_obj = MasterProduct.objects.filter(id=product_id).first()
                elif batch_id:
                    batch_obj = Batch.objects.filter(id=batch_id, outlet=outlet).select_related('product').first()
                    if batch_obj:
                        product_obj = batch_obj.product

                raw_rate = item_data.get('gstRate')
                if raw_rate is None:
                    raw_rate = item_data.get('gst_rate')
                if raw_rate is None and product_obj:
                    raw_rate = product_obj.gst_rate

                try:
                    dec_rate = Decimal(str(raw_rate if raw_rate is not None else 0))
                except Exception:
                    dec_rate = Decimal('0')

                is_valid, err_msg = TaxSlab.is_rate_active(dec_rate, transaction_date=raw_invoice_date)
                if not is_valid:
                    prod_name = item_data.get('productName') or (product_obj.name if product_obj else 'Unknown Item')
                    return Response(
                        {
                            'detail': f"Product '{prod_name}' has an inactive/legacy GST rate of {dec_rate}%. {err_msg}",
                            'code': 'DEACTIVATED_GST_RATE',
                            'product_name': prod_name,
                            'gst_rate': float(dec_rate)
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Enforce Loss-Sale Prevention & Margin Lock:
            # Prevent items from being sold below their cost floor (PTR or landing cost)
            extra_disc_pct = Decimal(str(request.data.get('extraDiscountPct', 0)))
            discount_factor = Decimal('1') - (extra_disc_pct / Decimal('100')) if extra_disc_pct > Decimal('0') else Decimal('1')
            req_sale_type = request.data.get('saleType', 'RETAIL')
            outlet_settings = getattr(outlet, 'settings', None)
            landing_cost_include_gst = outlet_settings.landing_cost_include_gst if outlet_settings else False

            for item_data in items_data:
                batch_id = item_data.get('batchId')
                if not batch_id:
                    continue
                batch_obj = Batch.objects.filter(id=batch_id, outlet=outlet).select_related('product').first()
                if not batch_obj:
                    continue

                if req_sale_type == 'WHOLESALE':
                    if batch_obj.purchase_rate and batch_obj.purchase_rate > Decimal('0'):
                        cost_floor = batch_obj.purchase_rate
                    elif batch_obj.pts and batch_obj.pts > Decimal('0'):
                        cost_floor = batch_obj.pts
                    else:
                        cost_floor = batch_obj.landing_rate or batch_obj.ptr or Decimal('0')
                    floor_label = "purchase rate"
                else:
                    if batch_obj.landing_rate and batch_obj.landing_rate > Decimal('0'):
                        cost_floor = batch_obj.landing_rate
                    elif batch_obj.ptr and batch_obj.ptr > Decimal('0'):
                        cost_floor = batch_obj.ptr
                    else:
                        cost_floor = batch_obj.purchase_rate or Decimal('0')
                    floor_label = "landing cost"

                if cost_floor > Decimal('0'):
                    pack_size = Decimal(str(batch_obj.pack_size or 1))
                    qty_strips = Decimal(str(item_data.get('qtyStrips', 0)))
                    qty_loose = Decimal(str(item_data.get('qtyLoose', 0)))
                    free_qty_strips = Decimal(str(item_data.get('freeQtyStrips', 0)))

                    # Revenue is generated strictly by billed quantity; free scheme quantity must not inflate the cost floor
                    billed_qty = qty_strips + (qty_loose / pack_size)
                    if billed_qty <= Decimal('0'):
                        if free_qty_strips > Decimal('0'):
                            # 100% free promotional scheme item - safe harbor exempt from loss sale lock
                            continue
                        total_qty_val = Decimal(str(item_data.get('totalQty', 0)))
                        billed_qty = total_qty_val if total_qty_val > Decimal('0') else Decimal('1')

                    if billed_qty > Decimal('0'):
                        gst_rate = Decimal(str(item_data.get('gstRate', getattr(batch_obj.product, 'gst_rate', Decimal('0')) or Decimal('0'))))
                        tax_multiplier = Decimal('1') + (gst_rate / Decimal('100'))

                        # FIX: If cost floor already includes GST (toggle ON), do not multiply it again.
                        cost_tax_multiplier = Decimal('1') if landing_cost_include_gst else tax_multiplier
                        line_cost_floor_inclusive = (cost_floor * cost_tax_multiplier * billed_qty).quantize(Decimal('0.01'))

                        rate_val = Decimal(str(item_data.get('rate', batch_obj.mrp)))
                        disc_pct = Decimal(str(item_data.get('discountPct', 0)))
                        rate_discounted = rate_val * (Decimal('1') - disc_pct / Decimal('100'))

                        if req_sale_type == 'WHOLESALE':
                            base_row_amount = (rate_discounted * billed_qty * tax_multiplier).quantize(Decimal('0.01'))
                        else:
                            base_row_amount = (rate_discounted * billed_qty).quantize(Decimal('0.01'))

                        client_total = Decimal(str(item_data.get('totalAmount', 0))) if item_data.get('totalAmount') is not None else Decimal('0')
                        if client_total <= Decimal('0'):
                            taxable_amt = Decimal(str(item_data.get('taxableAmount', 0)))
                            gst_amt = Decimal(str(item_data.get('gstAmount', 0)))
                            client_total = taxable_amt + gst_amt

                        # If client already applied smart-capping / extra discount, respect client total to prevent double-discounting
                        if client_total > Decimal('0') and client_total < (base_row_amount - Decimal('0.01')):
                            final_item_amount = client_total
                        else:
                            final_item_amount = (base_row_amount * discount_factor).quantize(Decimal('0.01'))

                        # Smart Cap: If item was legal before bill discount, cap final row amount to cost floor
                        if base_row_amount >= (line_cost_floor_inclusive - Decimal('0.005')) and final_item_amount < line_cost_floor_inclusive:
                            final_item_amount = line_cost_floor_inclusive

                        # Tax-exclusive net selling rate per pack for UI response
                        net_rate_per_pack = final_item_amount / (billed_qty * tax_multiplier)

                        # Loss-Sale: Compare exact row amounts to prevent fractional reverse-division rounding drift
                        if final_item_amount < (line_cost_floor_inclusive - Decimal('0.005')):
                            prod_name = item_data.get('name') or item_data.get('productName') or (batch_obj.product.name if batch_obj.product else f"Batch {batch_obj.batch_no}")
                            return Response(
                                {
                                    'detail': f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{cost_floor:.2f}.",
                                    'code': 'LOSS_SALE_PREVENTED',
                                    'batch_id': str(batch_obj.id),
                                    'product_name': prod_name,
                                    'cost_floor': float(cost_floor),
                                    'net_rate': float(net_rate_per_pack.quantize(Decimal('0.01')))
                                },
                                status=status.HTTP_400_BAD_REQUEST
                            )

            logger.info(f"Creating sale invoice for outlet {outlet.name}")

            # Entire transaction must be atomic - rollback on any failure
            with transaction.atomic():
                # Step 1: Validate Schedule H requirements BEFORE any stock deduction
                cart_items = []
                for item in items_data:
                    cart_items.append({
                        'scheduleType': item.get('scheduleType', 'OTC'),
                    })

                try:
                    schedule_h_validate(cart_items, schedule_h_data)
                except ScheduleHViolationError as e:
                    return Response(
                        {'detail': str(e)},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Step 2: Generate invoice number atomically
                try:
                    invoice_no = generate_invoice_number(outlet_id)
                except Exception as e:
                    logger.error(f"Failed to generate invoice number: {str(e)}")
                    return Response(
                        {'detail': 'Failed to generate invoice number'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )

                # Step 3 & 5: Create SaleInvoice (GST fields are placeholders — re-derived after items are created)
                raw_gt = request.data.get('grandTotal') or request.data.get('grand_total') or request.data.get('totalAmount') or 0
                client_grand_total = Decimal(str(raw_gt))
                extra_discount_pct = Decimal(str(request.data.get('extraDiscountPct', 0)))

                # Multi-Entry Tender Extraction & Validation
                payments_data_raw = request.data.get('payments')
                parsed_payments = []
                cash_paid_val = Decimal('0')
                upi_paid_val = Decimal('0')
                card_paid_val = Decimal('0')
                credit_given_val = Decimal('0')

                if payments_data_raw and isinstance(payments_data_raw, list) and len(payments_data_raw) > 0:
                    for p in payments_data_raw:
                        p_amt = Decimal(str(p.get('amount', 0)))
                        if p_amt <= Decimal('0'):
                            continue
                        p_method = str(p.get('method') or 'cash').lower()
                        if p_method == 'cash':
                            cash_paid_val += p_amt
                        elif p_method == 'upi':
                            upi_paid_val += p_amt
                        elif p_method == 'card':
                            card_paid_val += p_amt
                        elif p_method == 'credit':
                            credit_given_val += p_amt
                        
                        parsed_payments.append({
                            'method': p_method,
                            'amount': p_amt,
                            'reference_no': p.get('referenceNo') or p.get('reference_no'),
                            'ledger_id': p.get('ledgerId') or p.get('ledger_id'),
                        })
                    
                    payment_sum = sum(p['amount'] for p in parsed_payments)
                    if abs(payment_sum - client_grand_total) > Decimal('0.01'):
                        return Response(
                            {'detail': f'Payment amounts ({payment_sum}) do not match grand total ({client_grand_total})'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    
                    if len(parsed_payments) > 1 or request.data.get('paymentMode') == 'split':
                        resolved_payment_mode = 'split'
                    elif len(parsed_payments) == 1:
                        resolved_payment_mode = parsed_payments[0]['method']
                    else:
                        resolved_payment_mode = 'cash'
                else:
                    # Legacy fallback: read scalar fields
                    cash_paid_val = Decimal(str(request.data.get('cashPaid', 0)))
                    upi_paid_val = Decimal(str(request.data.get('upiPaid', 0)))
                    card_paid_val = Decimal(str(request.data.get('cardPaid', 0)))
                    credit_given_val = Decimal(str(request.data.get('creditGiven', 0)))
                    payment_sum = cash_paid_val + upi_paid_val + card_paid_val + credit_given_val

                    # If all scalars are zero, fallback to paymentMode for full grand total
                    if payment_sum == Decimal('0') and client_grand_total > Decimal('0'):
                        pm = str(request.data.get('paymentMode', 'cash')).lower()
                        if pm == 'cash':
                            cash_paid_val = client_grand_total
                        elif pm == 'upi':
                            upi_paid_val = client_grand_total
                        elif pm == 'card':
                            card_paid_val = client_grand_total
                        elif pm == 'credit':
                            credit_given_val = client_grand_total
                        payment_sum = client_grand_total

                    if abs(payment_sum - client_grand_total) > Decimal('0.01'):
                        return Response(
                            {'detail': f'Payment amounts ({payment_sum}) do not match grand total ({client_grand_total})'},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    resolved_payment_mode = request.data.get('paymentMode', 'cash')
                    if cash_paid_val > 0:
                        parsed_payments.append({'method': 'cash', 'amount': cash_paid_val})
                    if upi_paid_val > 0:
                        parsed_payments.append({'method': 'upi', 'amount': upi_paid_val})
                    if card_paid_val > 0:
                        parsed_payments.append({'method': 'card', 'amount': card_paid_val})
                    if credit_given_val > 0:
                        parsed_payments.append({'method': 'credit', 'amount': credit_given_val})

                if credit_given_val > 0 and not customer:
                    return Response(
                        {'detail': 'A customer must be selected for credit bills'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                from django.utils import timezone
                from django.utils.dateparse import parse_datetime

                raw_invoice_date = request.data.get('invoiceDate')
                invoice_date = timezone.now()
                if raw_invoice_date:
                    parsed = parse_datetime(raw_invoice_date)
                    if parsed:
                        if timezone.is_naive(parsed):
                            invoice_date = timezone.make_aware(parsed)
                        else:
                            invoice_date = parsed

                sale_type = request.data.get('saleType', 'RETAIL')
                irn_status = 'NOT_REQUIRED'
                if sale_type == 'WHOLESALE' and customer and customer.gstin and len(customer.gstin) == 15:
                    irn_status = 'PENDING'

                sale_invoice = SaleInvoice.objects.create(
                    outlet=outlet,
                    invoice_no=invoice_no,
                    invoice_date=invoice_date,
                    customer=customer,
                    doctor_id=doctor_id,
                    hospital_name=hospital_name,
                    prescription_no=request.data.get('prescriptionNo'),
                    subtotal=Decimal(str(request.data.get('subtotal', 0))),
                    discount_amount=Decimal(str(request.data.get('discountAmount', 0))),
                    extra_discount_pct=extra_discount_pct,
                    # Placeholder GST values — overwritten by server re-derivation below
                    taxable_amount=Decimal('0'),
                    cgst_amount=Decimal('0'),
                    sgst_amount=Decimal('0'),
                    igst_amount=Decimal('0'),
                    cgst=Decimal('0'),
                    sgst=Decimal('0'),
                    igst=Decimal('0'),
                    round_off=Decimal('0'),
                    grand_total=client_grand_total,
                    payment_mode=resolved_payment_mode,
                    cash_paid=cash_paid_val,
                    upi_paid=upi_paid_val,
                    card_paid=card_paid_val,
                    credit_given=credit_given_val,
                    amount_paid=cash_paid_val + upi_paid_val + card_paid_val,
                    amount_due=max(Decimal('0'), client_grand_total - (cash_paid_val + upi_paid_val + card_paid_val)),
                    billed_by=billed_by,
                    sale_type=sale_type,
                    irn_status=irn_status,
                    billing_basis=request.data.get('billingBasis', 'MRP'),
                    transporter_id=request.data.get('transporterId'),
                    vehicle_no=request.data.get('vehicleNo'),
                    trans_distance=int(request.data.get('transDistance') or 0),
                    trans_mode=int(request.data.get('transMode') or 1),
                    vehicle_type=request.data.get('vehicleType', 'R'),
                    eway_bill_status='PENDING' if (request.data.get('transporterId') or request.data.get('vehicleNo')) else None,
                )

                # Persist InvoicePayment child records
                for p in parsed_payments:
                    InvoicePayment.objects.create(
                        outlet=outlet,
                        invoice=sale_invoice,
                        method=p['method'],
                        amount=p['amount'],
                        reference_no=p.get('reference_no'),
                        ledger_id=p.get('ledger_id'),
                    )

                logger.info(f"Created SaleInvoice {invoice_no} with {len(parsed_payments)} payment tender(s)")

                # Create SaleItems and deduct stock
                sale_items = []
                for item_data in items_data:
                    batch_id = item_data.get('batchId')
                    product_id = item_data.get('productId')
                    qty_strips_needed = item_data.get('qtyStrips', 0)

                    try:
                        # Get product details
                        if product_id:
                            product = MasterProduct.objects.get(id=product_id)
                            
                            from apps.billing.sale_services import validate_unit_integrity
                            qty_loose_needed = item_data.get('qtyLoose', 0)
                            validate_unit_integrity(product, qty_loose_needed)
                        
                        qty_loose_needed = item_data.get('qtyLoose', 0)

                        if batch_id:
                            try:
                                # Lookup by id + outlet only — product is already linked on the batch
                                # and using product= here would fail if frontend productId ever drifts
                                batch = Batch.objects.get(id=batch_id, outlet=outlet)
                            except Batch.DoesNotExist:
                                raise InsufficientStockError(f"Batch {batch_id} not found")

                            # --- THE PHARMACY MATH: Check total tablets available ---
                            # Use batch.pack_size (frozen at purchase time), NOT product.pack_size
                            # which changes when the master item is edited.
                            batch_pack_size = batch.pack_size or 1
                            total_loose_needed = (qty_strips_needed * batch_pack_size) + qty_loose_needed
                            total_loose_available = (batch.qty_strips * batch_pack_size) + batch.qty_loose
                            
                            if total_loose_available < total_loose_needed:
                                raise InsufficientStockError(
                                    f"Insufficient stock in batch {batch.batch_no}."
                                )

                            # We pass BOTH strips and loose to the allocation
                            batch_allocations = [{
                                'batch': batch, 
                                'qty_to_deduct': qty_strips_needed,
                                'loose_to_deduct': qty_loose_needed
                            }]
                        else:
                            # FEFO logic (assumes strips for now)
                            batch_allocations = fefo_batch_select(
                                outlet_id=str(outlet_id), product_id=str(product_id), qty_strips_needed=qty_strips_needed
                            )

                        # Step 5: Deduct stock and Create SaleItems
                        for batch_alloc in batch_allocations:
                            batch = batch_alloc['batch']
                            qty_to_deduct = batch_alloc.get('qty_to_deduct', 0)
                            loose_to_deduct = batch_alloc.get('loose_to_deduct', 0)

                            # Deduct what the user asked for
                            batch.qty_strips -= qty_to_deduct
                            batch.qty_loose -= loose_to_deduct

                            # MAGIC: If loose tablets go below 0, break open a strip!
                            # Use batch.pack_size (frozen at purchase time)
                            while batch.qty_loose < 0:
                                batch.qty_strips -= 1
                                batch.qty_loose += (batch.pack_size or 1)

                            batch.save()

                            logger.debug(f"Deducted {qty_to_deduct} strips from batch {batch.batch_no}")

                            # NEW: Validate Landing Cost & MRP pricing
                            proposed_rate = Decimal(str(item_data.get('rate', batch.mrp)))
                            pricing_check = validate_sale_price(proposed_rate, batch, outlet_id)
                            if pricing_check.get('block'):
                                transaction.set_rollback(True)
                                return Response({
                                    "detail": pricing_check['message'],
                                    "batchId": str(batch.id),
                                    "sale_rate": pricing_check['message'],
                                    "landing_cost": str(pricing_check['landing_cost']),
                                    "mrp": str(pricing_check['mrp'])
                                }, status=status.HTTP_400_BAD_REQUEST)

                            # Margin Lock check on net selling price using unified formula: (Final Row Amount / Quantity)
                            pack_sz = Decimal(str(batch.pack_size or 1))
                            billed_qty = Decimal(str(qty_to_deduct)) + (Decimal(str(loose_to_deduct)) / pack_sz)
                            free_qty_strips = Decimal(str(item_data.get('freeQtyStrips', 0)))

                            # Revenue is generated strictly by billed quantity; free scheme quantity must not inflate the cost floor
                            if billed_qty <= Decimal('0'):
                                if free_qty_strips > Decimal('0'):
                                    pass  # Free scheme safe-harbor
                                else:
                                    billed_qty = Decimal('1')

                            if billed_qty > Decimal('0'):
                                disc_factor = Decimal('1') - (extra_discount_pct / Decimal('100')) if extra_discount_pct > Decimal('0') else Decimal('1')
                                if sale_type == 'WHOLESALE':
                                    if batch.purchase_rate and batch.purchase_rate > Decimal('0'):
                                        c_floor = batch.purchase_rate
                                    elif batch.pts and batch.pts > Decimal('0'):
                                        c_floor = batch.pts
                                    else:
                                        c_floor = batch.landing_rate or batch.ptr or Decimal('0')
                                    floor_label = "purchase rate"
                                else:
                                    if batch.landing_rate and batch.landing_rate > Decimal('0'):
                                        c_floor = batch.landing_rate
                                    elif batch.ptr and batch.ptr > Decimal('0'):
                                        c_floor = batch.ptr
                                    else:
                                        c_floor = batch.purchase_rate or Decimal('0')
                                    floor_label = "landing cost"

                                if c_floor > Decimal('0'):
                                    gst_rate = Decimal(str(item_data.get('gstRate', getattr(product, 'gst_rate', Decimal('0')) or Decimal('0'))))
                                    tax_multiplier = Decimal('1') + (gst_rate / Decimal('100'))

                                    # FIX: If cost floor already includes GST (toggle ON), do not multiply it again.
                                    cost_tax_multiplier = Decimal('1') if landing_cost_include_gst else tax_multiplier
                                    line_cost_floor_inclusive = (c_floor * cost_tax_multiplier * billed_qty).quantize(Decimal('0.01'))

                                    p_rate = Decimal(str(item_data.get('rate', batch.mrp)))
                                    d_pct = Decimal(str(item_data.get('discountPct', 0)))
                                    rate_discounted = p_rate * (Decimal('1') - d_pct / Decimal('100'))

                                    if sale_type == 'WHOLESALE':
                                        base_item_amt = (rate_discounted * billed_qty * tax_multiplier).quantize(Decimal('0.01'))
                                    else:
                                        base_item_amt = (rate_discounted * billed_qty).quantize(Decimal('0.01'))

                                    client_item_amt = Decimal(str(item_data.get('totalAmount', 0))) if item_data.get('totalAmount') is not None else Decimal('0')
                                    if client_item_amt <= Decimal('0'):
                                        tax_amt = Decimal(str(item_data.get('taxableAmount', 0)))
                                        g_amt = Decimal(str(item_data.get('gstAmount', 0)))
                                        client_item_amt = tax_amt + g_amt

                                    # If client already applied smart-capping / extra discount, respect client total to prevent double-discounting
                                    if client_item_amt > Decimal('0') and client_item_amt < (base_item_amt - Decimal('0.01')):
                                        final_row_amt = client_item_amt
                                    else:
                                        final_row_amt = (base_item_amt * disc_factor).quantize(Decimal('0.01'))

                                    # Smart Cap: If item was legal before bill discount, cap the final row amount to the floor
                                    if base_item_amt >= (line_cost_floor_inclusive - Decimal('0.005')) and final_row_amt < line_cost_floor_inclusive:
                                        final_row_amt = line_cost_floor_inclusive

                                    # Tax-exclusive net selling rate per pack for UI response
                                    net_unit_price = final_row_amt / (billed_qty * tax_multiplier)

                                    # Loss-Sale: Compare exact row amounts to prevent fractional reverse-division rounding drift
                                    if final_row_amt < (line_cost_floor_inclusive - Decimal('0.005')):
                                        transaction.set_rollback(True)
                                        prod_name = product.name if product else batch.batch_no
                                        return Response({
                                            "detail": f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{c_floor:.2f}.",
                                            "code": "LOSS_SALE_PREVENTED",
                                            "batchId": str(batch.id),
                                            "cost_floor": float(c_floor),
                                            "net_rate": float(net_unit_price.quantize(Decimal('0.01')))
                                        }, status=status.HTTP_400_BAD_REQUEST)

                            # Create SaleItem — snapshot pack_size from batch (frozen at purchase time),
                            # not from product (which changes when master item is edited)
                            sale_item = SaleItem.objects.create(
                                invoice=sale_invoice,
                                batch=batch,
                                product_name=product.name,
                                composition=product.composition,
                                pack_size=batch.pack_size,
                                pack_unit=batch.pack_unit,
                                schedule_type=product.schedule_type,
                                batch_no=batch.batch_no,
                                expiry_date=batch.expiry_date,
                                mrp=batch.mrp,
                                sale_rate=batch.mrp,
                                rate=proposed_rate,
                                qty_strips=qty_to_deduct,
                                free_qty_strips=free_qty_strips,
                                qty_loose=item_data.get('qtyLoose', 0),
                                sale_mode=item_data.get('saleMode', 'strip'),
                                discount_pct=Decimal(str(item_data.get('discountPct', 0))),
                                gst_rate=Decimal(str(item_data.get('gstRate', 0))),
                                taxable_amount=Decimal(str(item_data.get('taxableAmount', 0))),
                                gst_amount=Decimal(str(item_data.get('gstAmount', 0))),
                                total_amount=Decimal(str(item_data.get('totalAmount', 0))),
                            )

                            sale_items.append(sale_item)

                            # Step 6a: Post stock ledger entry (SALE_OUT)
                            from apps.inventory.services import post_stock_ledger_entry
                            deducted_qty = Decimal(str(qty_to_deduct)) + (
                                Decimal(str(loose_to_deduct)) / Decimal(str(batch.pack_size or 1))
                                if loose_to_deduct else Decimal('0')
                            )
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
                            logger.info(f"Stock ledger SALE_OUT posted: {deducted_qty} of {product.name} (batch {batch.batch_no})")

                            # Step 6b: Create ScheduleHRegister if Schedule H drug
                            if product.schedule_type in ['G', 'H', 'H1', 'X', 'C', 'Narcotic']:
                                ScheduleHRegister.objects.create(
                                    sale_item=sale_item,
                                    patient_name=schedule_h_data.get('patientName') if schedule_h_data else None,
                                    patient_age=schedule_h_data.get('patientAge') if schedule_h_data else 0,
                                    patient_address=schedule_h_data.get('patientAddress') if schedule_h_data else '',
                                    doctor_name=schedule_h_data.get('doctorName') if schedule_h_data else None,
                                    doctor_reg_no=schedule_h_data.get('doctorRegNo') if schedule_h_data else '',
                                    prescription_no=schedule_h_data.get('prescriptionNo') or '' if schedule_h_data else '',
                                )
                                logger.debug(f"Created ScheduleHRegister for {product.name}")

                    except MasterProduct.DoesNotExist:
                        logger.error(f"Product {product_id} not found")
                        raise
                    except InsufficientStockError as e:
                        logger.error(f"Insufficient stock: {str(e)}")
                        raise

                # ── C3 fix: Re-derive GST server-side from line items ──
                # Never trust client-sent cgst/sgst/igst values.
                discount_factor = Decimal('1') - extra_discount_pct / Decimal('100')
                server_taxable = Decimal('0')
                server_cgst = Decimal('0')
                server_sgst = Decimal('0')
                server_igst = Decimal('0')
                max_gst_rate = Decimal('0')
                
                is_interstate = False
                if customer and hasattr(customer, 'state') and customer.state and hasattr(outlet, 'state') and outlet.state:
                    is_interstate = str(customer.state).strip().lower() != str(outlet.state).strip().lower()

                for si in sale_items:
                    # Account for loose tablets by adding fractional strip equivalents
                    pack_size = Decimal(str(si.pack_size)) if si.pack_size else Decimal('1')
                    total_fractional_strips = Decimal(str(si.qty_strips)) + (Decimal(str(si.qty_loose)) / pack_size)
                    raw_total = si.rate * total_fractional_strips
                    
                    # Apply extra discount proportionally before GST extraction, respecting smart-allocated total if provided
                    if si.total_amount and si.total_amount > Decimal('0'):
                        discounted_total = si.total_amount
                    else:
                        discounted_total = (raw_total * discount_factor).quantize(Decimal('0.01'))
                    gst_rate = si.gst_rate

                    if gst_rate > 0:
                        item_taxable = (discounted_total * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
                        item_gst = discounted_total - item_taxable
                    else:
                        item_taxable = discounted_total
                        item_gst = Decimal('0')

                    server_taxable += item_taxable

                    # H8 fix: floor-based CGST/SGST split — guarantees cgst + sgst = item_gst exactly
                    # TODO: use outlet state vs customer state to determine IGST (C9)
                    
                    item_igst = Decimal('0')
                    item_cgst = (item_gst / 2).quantize(Decimal('0.01'), rounding=ROUND_FLOOR)
                    item_sgst = item_gst - item_cgst
                    
                    if is_interstate:
                        item_igst = item_gst
                        item_cgst = Decimal('0')
                        item_sgst = Decimal('0')
                    
                    server_cgst += item_cgst
                    server_sgst += item_sgst
                    server_igst += item_igst
                    
                    # C3 fix part 2: Save the re-derived item-level GST back to the database!
                    # Sandbox E-Invoice needs accurate item-level cgst/sgst values to pass validation.
                    si.taxable_amount = item_taxable
                    si.gst_amount = item_gst
                    si.cgst_amount = item_cgst
                    si.sgst_amount = item_sgst
                    si.igst_amount = item_igst
                    si.save(update_fields=['taxable_amount', 'gst_amount', 'cgst_amount', 'sgst_amount', 'igst_amount'])

                    if gst_rate > max_gst_rate:
                        max_gst_rate = gst_rate

                # round_off absorbs any sub-rupee difference
                raw_exact = server_taxable + server_cgst + server_sgst + server_igst
                server_round_off = client_grand_total - raw_exact

                # Sanity check: round_off should never exceed ±₹1
                if abs(server_round_off) > Decimal('1.00'):
                    logger.warning(
                        f"Large round-off ₹{server_round_off} for invoice {invoice_no}: "
                        f"client_grand_total={client_grand_total}, server_exact={raw_exact}"
                    )

                # Update invoice with server-computed GST values
                sale_invoice.taxable_amount = server_taxable
                sale_invoice.cgst_amount = server_cgst
                sale_invoice.sgst_amount = server_sgst
                sale_invoice.igst_amount = server_igst
                sale_invoice.cgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
                sale_invoice.sgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
                sale_invoice.igst = Decimal('0')
                sale_invoice.round_off = server_round_off
                sale_invoice.save()

                logger.info(
                    f"Server-derived GST for {invoice_no}: "
                    f"taxable={server_taxable}, cgst={server_cgst}, sgst={server_sgst}, "
                    f"round_off={server_round_off}, extra_disc={extra_discount_pct}%"
                )

                # Step 7: Create CreditTransaction if credit_given > 0
                if credit_given_val > 0 and customer:
                    # Get or create CreditAccount
                    credit_account, _ = CreditAccount.objects.get_or_create(
                        outlet=outlet,
                        customer=customer
                    )

                    # Update outstanding
                    credit_account.total_outstanding += credit_given_val
                    credit_account.total_borrowed += credit_given_val
                    credit_account.last_transaction_date = datetime.now()
                    credit_account.save()

                    # Create CreditTransaction (debit entry)
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

                    logger.info(f"Created CreditTransaction for customer {customer.name}: ₹{credit_given_val}")

                # Step 7b: Update customer's total_purchases
                if customer:
                    customer.total_purchases += sale_invoice.grand_total
                    customer.save(update_fields=['total_purchases'])
                    logger.debug(f"Updated total_purchases for {customer.name}: +{sale_invoice.grand_total}")

                    # ─── Step 7c: Create LedgerEntry (append-only) for Customer ───
                    # 1. Invoice Posting Entry
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

                    # 2. Payment Posting Entry (if any paid immediately)
                    if parsed_payments:
                        for p in parsed_payments:
                            p_amt = p['amount']
                            if p_amt > Decimal('0') and p['method'] != 'credit':
                                running_balance = running_balance - p_amt
                                meth_raw = p['method'].upper()
                                meth_lbl = 'Cash' if meth_raw == 'CASH' else ('UPI' if meth_raw == 'UPI' else ('Card' if meth_raw == 'CARD' else p['method'].title()))
                                LedgerEntry.objects.create(
                                    outlet=outlet,
                                    entity_type='customer',
                                    customer=customer,
                                    date=invoice_d,
                                    entry_type='receipt',
                                    reference_no=sale_invoice.invoice_no,
                                    description=f"Payment ({meth_lbl}) for {sale_invoice.invoice_no}",
                                    debit=Decimal('0'),
                                    credit=p_amt,
                                    running_balance=running_balance,
                                )
                    else:
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

                # Post journal entry to general ledger (auto journal posting)
                try:
                    post_sale_invoice(sale_invoice)
                except Exception as e:
                    logger.error(f"Journal posting failed for sale {sale_invoice.id}: {e}")
                    raise  # Re-raise to rollback entire transaction


            # Serialize response
            response_data = build_sale_response_payload(sale_invoice)

            logger.info(f"Sale invoice {invoice_no} created successfully with {len(sale_items)} items")

            # Quotation linking (if converted from UI)
            quotation_id = request.data.get('quotationId')
            if quotation_id:
                try:
                    from apps.billing.models import Quotation
                    from django.utils import timezone
                    quotation = Quotation.objects.get(id=quotation_id)
                    quotation.status = 'converted'
                    quotation.converted_at = timezone.now()
                    quotation.converted_to_invoice_id = sale_invoice.id
                    quotation.save(update_fields=['status', 'converted_at', 'converted_to_invoice_id'])
                    logger.info(f"Marked quotation {quotation_id} as converted to sale {sale_invoice.id}")
                except Exception as e:
                    logger.error(f"Failed to link quotation {quotation_id} to sale {sale_invoice.id}: {e}")

            # Trigger external API call OUTSIDE the database transaction lock!
            if sale_invoice.irn_status == 'PENDING':
                try:
                    from apps.billing.sale_services import process_pending_irn
                    process_pending_irn(str(sale_invoice.id))
                    # Refresh response data if IRN was generated successfully
                    sale_invoice.refresh_from_db()
                    response_data = build_sale_response_payload(sale_invoice)
                except Exception as e:
                    logger.warning(f"Background IRN processing failed gracefully: {e}")

            if sale_invoice.eway_bill_status == 'PENDING':
                try:
                    from apps.billing.sale_services import threaded_process_pending_ewaybill
                    import threading
                    threading.Thread(target=threaded_process_pending_ewaybill, args=(str(sale_invoice.id),)).start()
                except Exception as e:
                    logger.warning(f"Background EWB processing failed gracefully: {e}")

            return Response(response_data, status=status.HTTP_201_CREATED)

        except InsufficientStockError as e:
            logger.warning(f"Insufficient stock error: {str(e)}")
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except UnitIntegrityError as e:
            logger.warning(f"Unit integrity error: {str(e)}")
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ValueError as e:
            logger.warning(f"Value error: {str(e)}")
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ValidationError as e:
            # Handle DRF/Django Validation Errors (including our explicit Sandbox API exceptions)
            # The exception usually contains the detail string or dictionary
            error_msg = str(e.detail[0]) if hasattr(e, 'detail') and isinstance(e.detail, list) else str(e)
            logger.warning(f"Validation error: {error_msg}")
            return Response(
                {'detail': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error creating sale invoice: {str(e)}")
            return Response(
                {'detail': 'Internal server error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SaleListView(APIView):
    """
    GET /api/v1/sales/?outletId=xxx

    List all sales invoices for an outlet (paginated, newest first).
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ['created_at', 'invoice_date', 'grand_total', 'customer__name']
    ordering = ['-invoice_date', '-created_at']

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request, *args, **kwargs):
        """
        Get paginated list of sales invoices.

        Query parameters:
        - outletId: Outlet UUID to filter invoices (required)
        - page: Page number (default: 1)
        - pageSize: Items per page (default: 50, max: 100)

        Returns:
        {
            "data": [{SaleInvoice}],
            "pagination": {
                "page": 1,
                "pageSize": 50,
                "totalPages": 1,
                "totalRecords": 5
            }
        }
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet exists
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching sales invoices for outlet: {outlet.name}")

        # Get all invoices for this outlet
        invoices = SaleInvoice.objects.filter(outlet=outlet).prefetch_related('items__batch', 'payments').annotate(
            items_count=Count('items')
        )

        # ── Date range filter (startDate / endDate) ─────────────────────────
        start_date_str = request.query_params.get('startDate') or request.query_params.get('start_date')
        end_date_str   = request.query_params.get('endDate')   or request.query_params.get('end_date')
        try:
            if start_date_str:
                from datetime import datetime as dt
                start_dt = dt.fromisoformat(start_date_str).date()
                invoices = invoices.filter(invoice_date__date__gte=start_dt)
                logger.info(f"Filtering sales from {start_dt}")
            if end_date_str:
                from datetime import datetime as dt
                end_dt = dt.fromisoformat(end_date_str).date()
                invoices = invoices.filter(invoice_date__date__lte=end_dt)
                logger.info(f"Filtering sales to {end_dt}")
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid date filter: {e}")

        # ── Optional customer filter ─────────────────────────────────────────
        customer_id = request.query_params.get('customerId') or request.query_params.get('customer_id')
        customer_obj = None
        if customer_id:
            from apps.accounts.models import Customer
            try:
                customer_obj = Customer.objects.get(id=customer_id)
                invoices = invoices.filter(customer_id=customer_id)
            except Customer.DoesNotExist:
                pass

        # ── Optional doctor and hospital filter (backwards-compatibility) ────
        doctor_id = request.query_params.get('doctorId')
        hospital_name = request.query_params.get('hospitalName') or request.query_params.get('hospital')
        
        if doctor_id:
            try:
                import uuid
                uuid.UUID(str(doctor_id))
                invoices = invoices.filter(doctor_id=doctor_id)
            except (ValueError, AttributeError):
                invoices = invoices.filter(doctor__name__icontains=doctor_id)
        if hospital_name:
            from django.db.models import Q
            invoices = invoices.filter(
                Q(hospital_name__icontains=hospital_name) | Q(doctor__hospital_name__icontains=hospital_name)
            )

        # ── Optional saleType filter ─────────────────────────────────────────
        sale_type_param = request.query_params.get('saleType') or request.query_params.get('sale_type')
        sale_type_filter = {}
        if sale_type_param and sale_type_param.upper() in ['RETAIL', 'WHOLESALE']:
            sale_type_upper = sale_type_param.upper()
            from django.db.models import Q
            if sale_type_upper == 'RETAIL':
                invoices = invoices.filter(Q(sale_type=sale_type_upper) | Q(sale_type__isnull=True))
                sale_type_filter = {'sale_type__in': ['RETAIL', None]}
            else:
                invoices = invoices.filter(sale_type=sale_type_upper)
                sale_type_filter = {'sale_type': sale_type_upper}

        # ── Optional omni-search filter (invoice #, customer, doctor, hospital, staff) ───
        search_q = request.query_params.get('search', '').strip()
        if search_q:
            from django.db.models import Q
            search_filter = (
                Q(invoice_no__icontains=search_q) |
                Q(prescription_no__icontains=search_q) |
                Q(irn__icontains=search_q) |
                Q(eway_bill_no__icontains=search_q) |
                Q(customer__name__icontains=search_q) |
                Q(customer__phone__icontains=search_q) |
                Q(customer__gstin__icontains=search_q) |
                Q(doctor__name__icontains=search_q) |
                Q(doctor__phone__icontains=search_q) |
                Q(doctor__registration_no__icontains=search_q) |
                Q(hospital_name__icontains=search_q) |
                Q(doctor__hospital_name__icontains=search_q) |
                Q(billed_by__name__icontains=search_q)
            )
            # If search_q looks like a UUID, match exact UUID fields as well
            try:
                import uuid
                uuid_obj = uuid.UUID(search_q)
                search_filter |= Q(id=uuid_obj) | Q(customer_id=uuid_obj) | Q(doctor_id=uuid_obj)
            except (ValueError, AttributeError):
                pass

            invoices = invoices.filter(search_filter)

        # ── Optional payment mode filter ─────────────────────────────────────
        payment_mode_param = request.query_params.get('paymentMode') or request.query_params.get('payment_mode')
        if payment_mode_param and payment_mode_param.strip().lower() not in ['all', '']:
            pm = payment_mode_param.strip().lower()
            from django.db.models import Q
            if pm == 'cash':
                invoices = invoices.filter(
                    Q(payment_mode__iexact='cash') |
                    (Q(payment_mode__iexact='split') & (Q(cash_paid__gt=0) | Q(payments__method__iexact='cash', payments__amount__gt=0)))
                ).distinct()
            elif pm == 'upi':
                invoices = invoices.filter(
                    Q(payment_mode__iexact='upi') |
                    (Q(payment_mode__iexact='split') & (Q(upi_paid__gt=0) | Q(payments__method__iexact='upi', payments__amount__gt=0)))
                ).distinct()
            elif pm == 'card':
                invoices = invoices.filter(
                    Q(payment_mode__iexact='card') |
                    (Q(payment_mode__iexact='split') & (Q(card_paid__gt=0) | Q(payments__method__iexact='card', payments__amount__gt=0)))
                ).distinct()
            elif pm == 'credit':
                invoices = invoices.filter(
                    Q(payment_mode__iexact='credit') |
                    (Q(payment_mode__iexact='split') & (Q(credit_given__gt=0) | Q(payments__method__iexact='credit', payments__amount__gt=0)))
                ).distinct()
            elif pm == 'split':
                invoices = invoices.filter(payment_mode__iexact='split')
            else:
                invoices = invoices.filter(
                    Q(payment_mode__iexact=pm) |
                    (Q(payment_mode__iexact='split') & Q(payments__method__iexact=pm, payments__amount__gt=0))
                ).distinct()

        # ── Optional isModified filter ─────────────────────────────────────────
        is_modified_param = request.query_params.get('isModified') or request.query_params.get('modified') or request.query_params.get('status')
        if is_modified_param in ('true', '1', 'modified'):
            from apps.audit.models import DocumentRevisionV2, DocumentRevision
            from apps.billing.models import BillRevision
            from django.contrib.contenttypes.models import ContentType
            from django.db.models import Exists, OuterRef, Q
            
            si_ct = ContentType.objects.get_for_model(SaleInvoice)
            rev_v2_sub = DocumentRevisionV2.objects.filter(
                content_type=si_ct,
                object_id=OuterRef('pk')
            ).filter(
                Q(action__in=['UPDATE', 'update', 'correction', 'standard_correction', 'direct_revise', 'financial_change', 'cancel_reissue', 'paid_bill_correction', 'return_aware_correction']) |
                Q(revision_no__gt=1) |
                ~Q(action__iexact='create')
            )
            rev_v1_sub = DocumentRevision.objects.filter(
                content_type=si_ct,
                object_id=OuterRef('pk')
            )
            bill_rev_sub = BillRevision.objects.filter(
                original_invoice=OuterRef('pk')
            )
            invoices = invoices.filter(
                Q(Exists(rev_v2_sub)) | Q(Exists(rev_v1_sub)) | Q(Exists(bill_rev_sub))
            )
            logger.info("Filtered sales by isModified")

        # ── Profit aggregates for the filtered set (EXCLUDE return invoices) ───
        from django.db.models import Sum as dSum, Count as dCount
        agg = SaleInvoice.objects.filter(
            outlet=outlet,
            is_return=False,
            **({'invoice_date__date__gte': start_dt} if start_date_str else {}),
            **({'invoice_date__date__lte': end_dt}   if end_date_str   else {}),
            **sale_type_filter
        ).aggregate(
            total_revenue=dSum('grand_total'),
            total_discount=dSum('discount_amount'),
            total_gst=dSum('cgst_amount') if hasattr(SaleInvoice, 'cgst_amount') else dSum('grand_total'),
            total_cash=dSum('cash_paid'),
            total_upi=dSum('upi_paid'),
            total_card=dSum('card_paid'),
            total_credit=dSum('credit_given'),
            total_bills=dCount('id'),
        )

        # Legacy return invoices — deduct from revenue so net = sales - returns
        legacy_return_agg = SaleInvoice.objects.filter(
            outlet=outlet,
            is_return=True,
            **({'invoice_date__date__gte': start_dt} if start_date_str else {}),
            **({'invoice_date__date__lte': end_dt}   if end_date_str   else {}),
            **sale_type_filter
        ).aggregate(
            total_return=dSum('grand_total'),
            return_count=dCount('id'),
        )
        
        from apps.billing.models import SalesReturn
        new_return_agg = SalesReturn.objects.filter(
            outlet=outlet,
            **({'return_date__gte': start_dt} if start_date_str else {}),
            **({'return_date__lte': end_dt}   if end_date_str   else {}),
        ).aggregate(
            total_return=dSum('total_amount'),
            return_count=dCount('id'),
        )

        return_revenue = float(legacy_return_agg.get('total_return') or 0) + float(new_return_agg.get('total_return') or 0)
        return_count   = int(legacy_return_agg.get('return_count') or 0) + int(new_return_agg.get('return_count') or 0)

        # Profit = sale amount - purchase cost for each item (exclude returns)
        from apps.billing.models import SaleItem as SaleItemModel
        from django.db.models import ExpressionWrapper, FloatField, F as dbF
        from django.db.models.functions import Coalesce, NullIf
        cost_agg = SaleItemModel.objects.filter(
            invoice__outlet=outlet,
            invoice__is_return=False,
            **({'invoice__invoice_date__date__gte': start_dt} if start_date_str else {}),
            **({'invoice__invoice_date__date__lte': end_dt}   if end_date_str   else {}),
        ).aggregate(
            total_cost=Sum(
                ExpressionWrapper(
                    dbF('batch__purchase_rate') * (
                        dbF('qty_strips') + 
                        (dbF('qty_loose') * 1.0 / Coalesce(NullIf(dbF('pack_size'), 0), 1))
                    ),
                    output_field=FloatField()
                )
            )
        )

        total_sales = float(agg.get('total_revenue') or 0)
        total_bills = int(agg.get('total_bills') or 0)
        avg_bill_value = round(total_sales / total_bills, 2) if total_bills > 0 else 0.0

        gross_revenue = total_sales
        net_revenue   = total_sales - return_revenue
        total_cost    = float(cost_agg.get('total_cost') or 0)
        total_profit  = net_revenue - total_cost

        analytics = {
            'totalRevenue': total_sales,
            'totalSales': total_sales,
            'grossRevenue': gross_revenue,
            'netRevenue': net_revenue,
            'avgBillValue': avg_bill_value,
            'salesReturnAmount': return_revenue,
            'salesReturnCount': return_count,
            'totalCost': round(total_cost, 2),
            'totalProfit': round(total_profit, 2),
            'totalDiscount': float(agg.get('total_discount') or 0),
            'totalBills': total_bills,
            'cashCollected': float(agg.get('total_cash') or 0),
            'upiCollected': float(agg.get('total_upi') or 0),
            'cardCollected': float(agg.get('total_card') or 0),
            'creditGiven': float(agg.get('total_credit') or 0),
            'customerOutstanding': float(customer_obj.outstanding_balance) if customer_obj else None,
        }

        # ── Apply Ordering ───────────────────────────────────────────────────
        invoices = self.filter_queryset(invoices)

        # ── Pagination ───────────────────────────────────────────────────────
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('pageSize', 50)), 200)

        total_records = invoices.count()
        total_pages = (total_records + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_invoices = invoices[start_idx:end_idx]

        # ── Bulk fetch modified status for paginated sales ───────────────────
        sale_ids = [inv.id for inv in paginated_invoices]
        sale_mod_info = self._get_sale_modified_status_bulk(sale_ids)

        # ── Serialize invoices ───────────────────────────────────────────────
        results = []
        for invoice in paginated_invoices:
            mod = sale_mod_info.get(str(invoice.id), {'isModified': False, 'revisionCount': 0})
            result = {
                'id': str(invoice.id),
                'outletId': str(invoice.outlet.id),
                'invoiceNo': invoice.invoice_no,
                'invoiceDate': invoice.invoice_date.isoformat(),
                'saleType': invoice.sale_type,
                'customerId': str(invoice.customer.id) if invoice.customer else None,
                'customer': {
                    'id': str(invoice.customer.id),
                    'name': invoice.customer.name,
                    'phone': getattr(invoice.customer, 'phone', ''),
                    'gstin': getattr(invoice.customer, 'gstin', ''),
                    'address': getattr(invoice.customer, 'address', ''),
                } if invoice.customer else None,
                'doctorName': invoice.doctor.name if invoice.doctor else None,
                'hospitalName': invoice.hospital_name,
                'prescriptionNo': invoice.prescription_no,
                'subtotal': float(invoice.subtotal),
                'discountAmount': float(invoice.discount_amount),
                'taxableAmount': float(invoice.taxable_amount),
                'cgstAmount': float(invoice.cgst_amount),
                'sgstAmount': float(invoice.sgst_amount),
                'igstAmount': float(invoice.igst_amount),
                'cgst': float(invoice.cgst),
                'sgst': float(invoice.sgst),
                'igst': float(invoice.igst),
                'roundOff': float(invoice.round_off),
                'grandTotal': float(invoice.grand_total),
                'paymentMode': invoice.payment_mode,
                'cashPaid': float(invoice.cash_paid),
                'upiPaid': float(invoice.upi_paid),
                'cardPaid': float(invoice.card_paid),
                'creditGiven': float(invoice.credit_given),
                'amountPaid': float(invoice.amount_paid),
                'amountDue': float(invoice.amount_due),
                'payments': [
                    {
                        'method': p.method,
                        'amount': float(p.amount),
                        'referenceNo': p.reference_no,
                    }
                    for p in invoice.payments.all()
                ],
                'isReturn': invoice.is_return,
                'isModified': mod['isModified'],
                'revisionCount': mod['revisionCount'],
                'eway_bill_no': invoice.eway_bill_no,
                'irn': invoice.irn,
                'qr_code': invoice.qr_code,
                'irn_status': invoice.irn_status,
                'billedBy': str(invoice.billed_by.id) if invoice.billed_by else None,
                'billedByName': invoice.billed_by.name if invoice.billed_by else None,
                'itemsCount': getattr(invoice, 'items_count', 0),
                'createdAt': invoice.created_at.isoformat(),
            }
            # Compute invoice-level cost from prefetched items
            invoice_cost = 0.0
            for item in invoice.items.all():
                if item.batch and hasattr(item.batch, 'purchase_rate') and item.batch.purchase_rate:
                    pack_size = item.pack_size or 1
                    total_qty = item.qty_strips + (item.qty_loose / pack_size)
                    invoice_cost += float(item.batch.purchase_rate) * total_qty
            result['invoiceCost']   = round(invoice_cost, 2)
            result['invoiceProfit'] = round(float(invoice.grand_total) - invoice_cost, 2)
            results.append(result)

        # ── Customer ledger fallback: if filtering by customer and no SaleInvoice rows exist ──
        if customer_obj and total_records == 0:
            from apps.accounts.models import JournalLine, VoucherLine
            import re
            ledger = customer_obj.ledgers.filter(group__name='Sundry Debtors').first()
            if ledger:
                ledger_entries = []

                # 1. Opening balance
                if ledger.opening_balance and ledger.opening_balance > 0:
                    ob_amt = float(ledger.opening_balance)
                    ledger_entries.append({
                        'id': f"ob-{ledger.id}",
                        'outletId': str(ledger.outlet_id),
                        'invoiceNo': 'OPENING-BAL',
                        'invoiceDate': '2026-04-01T00:00:00',
                        'saleType': 'RETAIL',
                        'customerId': str(customer_obj.id),
                        'customer': {
                            'id': str(customer_obj.id),
                            'name': customer_obj.name,
                            'phone': getattr(customer_obj, 'phone', ''),
                            'gstin': getattr(customer_obj, 'gstin', ''),
                            'address': getattr(customer_obj, 'address', ''),
                        },
                        'doctorName': None,
                        'hospitalName': None,
                        'prescriptionNo': None,
                        'subtotal': ob_amt,
                        'discountAmount': 0.0,
                        'taxableAmount': ob_amt,
                        'cgstAmount': 0.0,
                        'sgstAmount': 0.0,
                        'igstAmount': 0.0,
                        'cgst': 0.0,
                        'sgst': 0.0,
                        'igst': 0.0,
                        'roundOff': 0.0,
                        'grandTotal': ob_amt,
                        'paymentMode': 'credit',
                        'cashPaid': 0.0,
                        'upiPaid': 0.0,
                        'cardPaid': 0.0,
                        'creditGiven': ob_amt,
                        'amountPaid': 0.0,
                        'amountDue': ob_amt,
                        'itemsCount': 1,
                        'payments': [],
                        'invoiceCost': 0.0,
                        'invoiceProfit': 0.0,
                        'createdAt': '2026-04-01T00:00:00',
                    })

                # 2. JournalLines (Sales / manual journals excluding VOUCHER)
                jlines = JournalLine.objects.filter(ledger=ledger).exclude(
                    journal_entry__source_type='VOUCHER'
                ).select_related('journal_entry')
                for jl in jlines:
                    je = jl.journal_entry
                    is_debit = (jl.debit_amount > 0)
                    amt = float(jl.debit_amount if is_debit else jl.credit_amount)
                    if amt == 0:
                        continue
                    m = re.match(r'^([A-Za-z0-9\-_]+)', je.narration or '')
                    inv_no = m.group(1) if m else f"JE-{str(je.id)[:8]}"
                    dt_str = je.date.isoformat() if je.date else (je.created_at.date().isoformat() if je.created_at else '2026-04-01')
                    dt_iso = f"{dt_str}T12:00:00"
                    created_iso = je.created_at.isoformat() if je.created_at else dt_iso

                    ledger_entries.append({
                        'id': str(je.source_id) if je.source_id else str(jl.id),
                        'outletId': str(ledger.outlet_id),
                        'invoiceNo': inv_no,
                        'invoiceDate': dt_iso,
                        'saleType': 'RETAIL',
                        'customerId': str(customer_obj.id),
                        'customer': {
                            'id': str(customer_obj.id),
                            'name': customer_obj.name,
                            'phone': getattr(customer_obj, 'phone', ''),
                            'gstin': getattr(customer_obj, 'gstin', ''),
                            'address': getattr(customer_obj, 'address', ''),
                        },
                        'doctorName': None,
                        'hospitalName': None,
                        'prescriptionNo': None,
                        'subtotal': amt,
                        'discountAmount': 0.0,
                        'taxableAmount': amt,
                        'cgstAmount': 0.0,
                        'sgstAmount': 0.0,
                        'igstAmount': 0.0,
                        'cgst': 0.0,
                        'sgst': 0.0,
                        'igst': 0.0,
                        'roundOff': 0.0,
                        'grandTotal': amt,
                        'paymentMode': 'credit' if is_debit else 'receipt',
                        'cashPaid': 0.0 if is_debit else amt,
                        'upiPaid': 0.0,
                        'cardPaid': 0.0,
                        'creditGiven': amt if is_debit else 0.0,
                        'amountPaid': 0.0 if is_debit else amt,
                        'amountDue': amt if is_debit else 0.0,
                        'itemsCount': 1,
                        'payments': [{'method': 'cash', 'amount': amt}] if not is_debit else [],
                        'invoiceCost': 0.0,
                        'invoiceProfit': 0.0,
                        'createdAt': created_iso,
                    })

                # 3. VoucherLines (Receipts / Payments)
                vlines = VoucherLine.objects.filter(ledger=ledger).select_related('voucher')
                for vl in vlines:
                    v = vl.voucher
                    is_debit = (vl.debit > 0)
                    amt = float(vl.debit if is_debit else vl.credit)
                    if amt == 0:
                        continue
                    dt_str = v.date.isoformat() if v.date else (v.created_at.date().isoformat() if v.created_at else '2026-04-01')
                    dt_iso = f"{dt_str}T12:00:00"
                    created_iso = v.created_at.isoformat() if v.created_at else dt_iso

                    ledger_entries.append({
                        'id': str(v.id),
                        'outletId': str(ledger.outlet_id),
                        'invoiceNo': v.voucher_no or f"VCH-{str(v.id)[:8]}",
                        'invoiceDate': dt_iso,
                        'saleType': 'RETAIL',
                        'customerId': str(customer_obj.id),
                        'customer': {
                            'id': str(customer_obj.id),
                            'name': customer_obj.name,
                            'phone': getattr(customer_obj, 'phone', ''),
                            'gstin': getattr(customer_obj, 'gstin', ''),
                            'address': getattr(customer_obj, 'address', ''),
                        },
                        'doctorName': None,
                        'hospitalName': None,
                        'prescriptionNo': None,
                        'subtotal': amt,
                        'discountAmount': 0.0,
                        'taxableAmount': amt,
                        'cgstAmount': 0.0,
                        'sgstAmount': 0.0,
                        'igstAmount': 0.0,
                        'cgst': 0.0,
                        'sgst': 0.0,
                        'igst': 0.0,
                        'roundOff': 0.0,
                        'grandTotal': amt,
                        'paymentMode': v.voucher_type,
                        'cashPaid': amt if not is_debit else 0.0,
                        'upiPaid': 0.0,
                        'cardPaid': 0.0,
                        'creditGiven': amt if is_debit else 0.0,
                        'amountPaid': amt if not is_debit else 0.0,
                        'amountDue': amt if is_debit else 0.0,
                        'itemsCount': 1,
                        'payments': [{'method': v.voucher_type, 'amount': amt}] if not is_debit else [],
                        'invoiceCost': 0.0,
                        'invoiceProfit': 0.0,
                        'createdAt': created_iso,
                    })

                # Sort by invoiceDate descending
                ledger_entries.sort(key=lambda x: x['invoiceDate'], reverse=True)
                total_records = len(ledger_entries)
                total_pages = (total_records + page_size - 1) // page_size if total_records > 0 else 1
                start_idx = (page - 1) * page_size
                end_idx = start_idx + page_size
                results = ledger_entries[start_idx:end_idx]
                analytics['totalRecords'] = total_records

        logger.info(f"Returning page {page} of {total_pages} ({len(results)} invoices) | date={start_date_str}→{end_date_str}")

        return Response({
            'data': results,
            'analytics': analytics,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records
            }
        }, status=status.HTTP_200_OK)

    def _get_sale_modified_status_bulk(self, sale_ids):
        if not sale_ids:
            return {}
        from apps.audit.models import DocumentRevisionV2, DocumentRevision
        from apps.billing.models import BillRevision
        from django.contrib.contenttypes.models import ContentType
        from django.db.models import Q
        from collections import defaultdict

        si_ct = ContentType.objects.get_for_model(SaleInvoice)
        results = defaultdict(lambda: {'isModified': False, 'revisionCount': 0})

        v2_revs = DocumentRevisionV2.objects.filter(
            content_type=si_ct,
            object_id__in=sale_ids
        ).filter(
            Q(action__in=['UPDATE', 'update', 'correction', 'standard_correction', 'direct_revise', 'financial_change', 'cancel_reissue', 'paid_bill_correction', 'return_aware_correction']) |
            Q(revision_no__gt=1) |
            ~Q(action__iexact='create')
        ).values_list('object_id', flat=True)
        for oid in v2_revs:
            s_oid = str(oid)
            results[s_oid]['isModified'] = True
            results[s_oid]['revisionCount'] += 1

        v1_revs = DocumentRevision.objects.filter(
            content_type=si_ct,
            object_id__in=sale_ids
        ).values_list('object_id', flat=True)
        for oid in v1_revs:
            s_oid = str(oid)
            results[s_oid]['isModified'] = True
            results[s_oid]['revisionCount'] += 1

        br_revs = BillRevision.objects.filter(
            original_invoice_id__in=sale_ids
        ).values_list('original_invoice_id', flat=True)
        for oid in br_revs:
            s_oid = str(oid)
            results[s_oid]['isModified'] = True
            results[s_oid]['revisionCount'] += 1

        return results



class SaleItemsView(APIView):
    """
    GET /api/v1/sales/{id}/items/

    Returns the full line-item list for a single sale invoice.
    Used by the customer invoice history expandable rows.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id, *args, **kwargs):
        try:
            invoice = SaleInvoice.objects.get(id=sale_id)
        except (SaleInvoice.DoesNotExist, ValueError):
            # Check if this sale_id is a JournalEntry / JournalLine or Voucher
            from apps.accounts.models import JournalLine, JournalEntry, Voucher
            je = JournalEntry.objects.filter(id=sale_id).first() or JournalEntry.objects.filter(source_id=sale_id).first()
            if je:
                jline = je.lines.filter(debit_amount__gt=0).first() or je.lines.first()
                amt = float(jline.debit_amount if jline and jline.debit_amount > 0 else (jline.credit_amount if jline else 0))
                return Response({'data': [{
                    'id': str(je.id),
                    'productName': je.narration or 'Historical Sale Entry',
                    'qtyStrips': 1,
                    'qtyLoose': 0,
                    'totalQty': 1,
                    'rate': amt,
                    'discountPct': 0.0,
                    'totalAmount': amt,
                    'packSize': 1,
                    'packUnit': 'units',
                    'batchNo': '',
                    'expiryDate': None,
                    'gstRate': 0.0,
                    'landingCost': amt,
                }]}, status=status.HTTP_200_OK)

            v = Voucher.objects.filter(id=sale_id).first()
            if v:
                vline = v.lines.first()
                amt = float(vline.debit if vline and vline.debit > 0 else (vline.credit if vline else 0))
                return Response({'data': [{
                    'id': str(v.id),
                    'productName': f"{v.voucher_no} {v.narration or v.voucher_type}".strip(),
                    'qtyStrips': 1,
                    'qtyLoose': 0,
                    'totalQty': 1,
                    'rate': amt,
                    'discountPct': 0.0,
                    'totalAmount': amt,
                    'packSize': 1,
                    'packUnit': 'units',
                    'batchNo': '',
                    'expiryDate': None,
                    'gstRate': 0.0,
                    'landingCost': amt,
                }]}, status=status.HTTP_200_OK)

            if str(sale_id).startswith('ob-'):
                return Response({'data': [{
                    'id': str(sale_id),
                    'productName': 'Opening Balance',
                    'qtyStrips': 1,
                    'qtyLoose': 0,
                    'totalQty': 1,
                    'rate': 0.0,
                    'discountPct': 0.0,
                    'totalAmount': 0.0,
                    'packSize': 1,
                    'packUnit': 'units',
                    'batchNo': '',
                    'expiryDate': None,
                    'gstRate': 0.0,
                    'landingCost': 0.0,
                }]}, status=status.HTTP_200_OK)

            return Response({'detail': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        items = invoice.items.select_related('batch').order_by('created_at')
        results = []
        from apps.billing.utils.pricing import get_landing_cost_for_batch
        outlet_id = str(invoice.outlet_id)
        for item in items:
            pack_size = item.pack_size or 1
            # totalQty = total loose units = (strips × pack_size) + loose
            # NOT strips + loose (those are different units!)
            total_qty = (item.qty_strips * pack_size) + item.qty_loose
            # Landing cost per strip so the return screen can warn below-cost refunds
            landing_cost = None
            if item.batch:
                try:
                    landing_cost = float(get_landing_cost_for_batch(item.batch, outlet_id))
                except Exception:
                    landing_cost = None
            results.append({
                'id': str(item.id),
                'productName': item.product_name,
                'qtyStrips': item.qty_strips,
                'qtyLoose': item.qty_loose,
                'totalQty': total_qty,
                'rate': float(item.rate),
                'discountPct': float(item.discount_pct),
                'totalAmount': float(item.total_amount),
                'packSize': pack_size,
                'packUnit': item.pack_unit,
                'batchNo': item.batch_no,
                'expiryDate': item.expiry_date.isoformat() if item.expiry_date else None,
                'gstRate': float(item.gst_rate),
                'landingCost': landing_cost,
            })
        return Response({'data': results}, status=status.HTTP_200_OK)


class CustomerCreditPaymentView(APIView):
    """
    POST /api/v1/credit/payment/

    Record a customer credit repayment (Udhari collection).
    Updates CreditAccount.total_outstanding, creates CreditTransaction and LedgerEntry.
    All operations wrapped in transaction.atomic().

    Request body: RecordCreditPaymentPayload
    Response: CreditAccount (201 Created) or error (400/404/500)
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Record a customer credit repayment.

        Request body:
        {
            "creditAccountId": "...",
            "amount": 1000,
            "mode": "cash",
            "reference": "CHQ12345",
            "notes": "Payment received",
            "paymentDate": "2026-03-17"
        }

        Returns:
        {
            "id": "...",
            "customerId": "...",
            "customer": {...},
            "outletId": "...",
            "creditLimit": 5000,
            "totalOutstanding": 500,
            "totalBorrowed": 2000,
            "totalRepaid": 1500,
            "status": "partial",
            "lastTransactionDate": "2026-03-17T...",
            "createdAt": "2026-03-17T..."
        }
        """

        try:
            payload = request.data
            credit_account_id = payload.get('creditAccountId')
            outlet_id = request.query_params.get('outletId') or payload.get('outletId')
            created_by_id = request.user.id  # From JWT token
            amount = Decimal(str(payload.get('amount', 0)))
            payment_mode = payload.get('mode') or payload.get('paymentMode')
            reference_no = payload.get('reference')
            notes = payload.get('notes')
            payment_date = payload.get('paymentDate')

            # Validate outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Validate credit account
            try:
                credit_account = CreditAccount.objects.get(id=credit_account_id, outlet=outlet)
            except CreditAccount.DoesNotExist:
                logger.warning(f"Credit account {credit_account_id} not found for outlet {outlet_id}")
                return Response(
                    {'error': {'code': 'ACCOUNT_NOT_FOUND', 'message': 'Credit account not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Validate amount
            if amount <= 0:
                return Response(
                    {'error': {'code': 'INVALID_AMOUNT', 'message': 'Amount must be greater than 0'}},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if amount > credit_account.total_outstanding:
                logger.warning(f"Overpayment: trying to pay {amount}, outstanding is {credit_account.total_outstanding}")
                return Response(
                    {'error': {'code': 'OVERPAYMENT', 'message': f'Amount exceeds outstanding ₹{credit_account.total_outstanding}'}},
                    status=status.HTTP_400_BAD_REQUEST
                )

            logger.info(f"Recording credit payment from {credit_account.customer.name}: ₹{amount}")

            # Use VoucherService to create a proper receipt voucher
            # This automatically updates CreditAccount and Ledger via the new hooks in VoucherService
            try:
                from apps.accounts.services import VoucherService
                from apps.accounts.models import Ledger
                
                # Resolve customer ledger
                customer_ledger = Ledger.objects.filter(
                    linked_customer=credit_account.customer, 
                    outlet=outlet
                ).first()
                if not customer_ledger:
                    return Response(
                        {'error': {'code': 'LEDGER_NOT_FOUND', 'message': 'Customer ledger not found'}},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Resolve payment mode ledger
                mode = (payment_mode or 'cash').lower()
                if mode in ('upi', 'upi_transfer', 'phonepe', 'gpay', 'paytm', 'neft', 'imps'):
                    collection_ledger = _get_ledger(outlet, 'UPI Collections')
                elif mode in ('card', 'pos', 'swipe', 'credit_card', 'debit_card'):
                    collection_ledger = _get_ledger(outlet, 'Card/POS Settlement')
                else:
                    collection_ledger = _get_ledger(outlet, 'Cash')

                if not collection_ledger:
                    return Response(
                        {'error': {'code': 'LEDGER_NOT_FOUND', 'message': f'Collection ledger for {mode} not found'}},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                voucher_data = {
                    'voucher_type': 'receipt',
                    'date': payment_date if payment_date else datetime.now().date().isoformat(),
                    'narration': notes or f"Credit payment received from {credit_account.customer.name}",
                    'total_amount': amount,
                    'payment_mode': mode,
                    'lines': [
                        {
                            'ledger_id': str(collection_ledger.id),
                            'debit': amount,
                            'credit': 0,
                            'description': f"Collection via {mode}"
                        },
                        {
                            'ledger_id': str(customer_ledger.id),
                            'debit': 0,
                            'credit': amount,
                            'description': reference_no or "Credit payment"
                        }
                    ]
                }

                voucher = VoucherService.create_voucher(
                    outlet_id=outlet.id,
                    staff_id=created_by_id,
                    data=voucher_data
                )
                logger.info(f"Created Voucher {voucher.voucher_no} for credit payment")
                
                # Refresh credit account to get updated balances
                credit_account.refresh_from_db()
                
            except Exception as e:
                logger.error(f"Failed to create voucher for credit payment: {e}")
                return Response(
                    {'error': {'code': 'VOUCHER_ERROR', 'message': str(e)}},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Serialize response matching CreditAccount shape
            result = self._serialize_credit_account(credit_account)
            result['voucher_no'] = voucher.voucher_no
            return Response(result, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Unexpected error recording credit payment: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to record payment'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_credit_account(self, credit_account):
        """Serialize CreditAccount to response shape."""
        return {
            'id': str(credit_account.id),
            'customerId': str(credit_account.customer_id),
            'customer': {
                'id': str(credit_account.customer.id),
                'name': credit_account.customer.name,
                'phone': credit_account.customer.phone,
                'address': credit_account.customer.address,
            },
            'outletId': str(credit_account.outlet_id),
            'creditLimit': float(credit_account.credit_limit),
            'totalOutstanding': float(credit_account.total_outstanding),
            'totalBorrowed': float(credit_account.total_borrowed),
            'totalRepaid': float(credit_account.total_repaid),
            'status': credit_account.status,
            'lastTransactionDate': credit_account.last_transaction_date.isoformat() if credit_account.last_transaction_date else None,
            'createdAt': credit_account.created_at.isoformat(),
        }


class DashboardDailyView(APIView):
    """
    GET /api/v1/dashboard/daily/?outletId=xxx&date=2026-03-17

    Get aggregated daily KPIs and alerts for an outlet.
    Includes sales totals, payment breakdown, top selling items, hourly sales, and alerts.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Get daily dashboard KPIs and alerts.

        Query parameters:
        - outletId: Outlet UUID (required)
        - date: Date in yyyy-MM-dd format (default: today)

        Returns:
        {
            "date": "2026-03-17",
            "totalSales": 15000,
            "totalBills": 25,
            "cashCollected": 10000,
            "upiCollected": 3000,
            "cardCollected": 2000,
            "creditGiven": 0,
            "topSellingItems": [
                {
                    "productId": "...",
                    "name": "Dolo 650",
                    "totalQty": 150,
                    "totalRevenue": 3000
                }
            ],
            "hourlySales": [
                {
                    "hour": "09:00",
                    "bills": 5,
                    "sales": 2000
                }
            ],
            "paymentBreakdown": {
                "cash": 10000,
                "upi": 3000,
                "card": 2000,
                "credit": 0
            },
            "alerts": {
                "lowStock": [...],
                "expiringSoon": [...],
                "overdueAccounts": [...]
            }
        }
        """

        try:
            outlet_id = request.query_params.get('outletId')
            start_date_str = request.query_params.get('startDate')
            end_date_str = request.query_params.get('endDate')
            date_str = request.query_params.get('date', datetime.now().date().isoformat())

            # Validate outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': 'Outlet not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Parse dates
            try:
                if start_date_str and end_date_str:
                    target_start = datetime.fromisoformat(start_date_str).date()
                    target_end = datetime.fromisoformat(end_date_str).date()
                else:
                    target_start = datetime.fromisoformat(date_str).date()
                    target_end = target_start
            except (ValueError, TypeError):
                target_start = datetime.now().date()
                target_end = target_start

            logger.info(f"Fetching dashboard for {outlet.name} from {target_start} to {target_end}")

            # Get sales for the date (using date() extraction from DateTimeField)
            # Get sales for the date range
            sales = SaleInvoice.objects.filter(
                outlet=outlet,
                invoice_date__date__gte=target_start,
                invoice_date__date__lte=target_end,
                is_return=False
            )

            # Aggregate base KPIs
            aggregates = sales.aggregate(
                total_sales=Sum('grand_total'),
                total_bills=Count('id'),
                inv_upi=Sum('upi_paid'),
                inv_card=Sum('card_paid'),
            )

            total_sales = float(aggregates['total_sales'] or 0)
            total_bills = aggregates['total_bills'] or 0
            
            # Sales Returns
            from apps.billing.models import SalesReturn
            legacy_return_sales = SaleInvoice.objects.filter(
                outlet=outlet,
                invoice_date__date__gte=target_start,
                invoice_date__date__lte=target_end,
                is_return=True
            )
            legacy_return_aggregates = legacy_return_sales.aggregate(
                total_returns=Sum('grand_total'),
                return_count=Count('id')
            )

            new_return_sales = SalesReturn.objects.filter(
                outlet=outlet,
                return_date__gte=target_start,
                return_date__lte=target_end
            )
            new_return_aggregates = new_return_sales.aggregate(
                total_returns=Sum('total_amount'),
                return_count=Count('id')
            )

            total_returns = float(legacy_return_aggregates['total_returns'] or 0) + float(new_return_aggregates['total_returns'] or 0)
            return_count = (legacy_return_aggregates['return_count'] or 0) + (new_return_aggregates['return_count'] or 0)
            
            # Derive cash and bank net flows strictly from JournalLine
            from apps.accounts.models import JournalLine, Ledger
            from django.db.models.functions import Coalesce
            
            cash_agg = JournalLine.objects.filter(
                journal_entry__outlet=outlet,
                journal_entry__date__gte=target_start,
                journal_entry__date__lte=target_end,
                ledger__group__name='Cash in Hand'
            ).aggregate(
                tot_collected=Coalesce(Sum('debit_amount'), Decimal('0'))
            )
            cash_collected = float(cash_agg['tot_collected'])

            bank_agg = JournalLine.objects.filter(
                journal_entry__outlet=outlet,
                journal_entry__date__gte=target_start,
                journal_entry__date__lte=target_end,
                ledger__group__name='Bank Accounts'
            ).aggregate(
                tot_collected=Coalesce(Sum('debit_amount'), Decimal('0'))
            )
            bank_collected = float(bank_agg['tot_collected'])
            
            # Apportion the bank collected amount between UPI and Card based on invoice ratios
            inv_upi = float(aggregates['inv_upi'] or 0)
            inv_card = float(aggregates['inv_card'] or 0)
            inv_bank_total = inv_upi + inv_card
            
            if inv_bank_total > 0:
                upi_collected = (inv_upi / inv_bank_total) * bank_collected
                card_collected = (inv_card / inv_bank_total) * bank_collected
            else:
                upi_collected = bank_collected
                card_collected = 0.0
                
            # Derive exact credit pending from Sundry Debtors
            credit_given_decimal = Ledger.objects.filter(
                outlet=outlet,
                group__name='Sundry Debtors'
            ).aggregate(tot=Sum('current_balance'))['tot'] or Decimal('0')
            credit_given = float(credit_given_decimal)

            logger.info(f"Daily totals: Sales={total_sales}, Bills={total_bills}")

            # Top selling items (by quantity)
            top_items = SaleItem.objects.filter(
                invoice__outlet=outlet,
                invoice__invoice_date__date__gte=target_start,
                invoice__invoice_date__date__lte=target_end,
                invoice__is_return=False
            ).values('batch__product_id', 'product_name').annotate(
                total_qty=Sum('qty_strips'),
                total_revenue=Sum('total_amount')
            ).order_by('-total_qty')[:5]

            top_selling = [
                {
                    'productId': str(item['batch__product_id']) if item['batch__product_id'] else 'custom',
                    'name': item['product_name'],
                    'totalQty': int(item['total_qty'] or 0),
                    'totalRevenue': float(item['total_revenue'] or 0),
                }
                for item in top_items
            ]

            # Hourly sales aggregation (by hour)
            from django.db.models.functions import ExtractHour
            hourly = sales.annotate(
                hour=ExtractHour('invoice_date')
            ).values('hour').annotate(
                bills=Count('id'),
                sales=Sum('grand_total')
            ).order_by('hour')

            hourly_sales = [
                {
                    'hour': f"{item['hour']:02d}:00",
                    'bills': item['bills'],
                    'sales': float(item['sales'] or 0),
                }
                for item in hourly
            ]

            # Payment breakdown
            payment_breakdown = {
                'cash': cash_collected,
                'upi': upi_collected,
                'card': card_collected,
                'credit': credit_given,
            }

            # Top Staff Leaderboard
            staff_qs = sales.values('billed_by__id', 'billed_by__name', 'billed_by__role', 'billed_by__avatar_url').annotate(
                billsCount=Count('id'),
                totalSales=Sum('grand_total')
            ).order_by('-totalSales')[:5]

            staff_leaderboard = [
                {
                    'staffId': str(s['billed_by__id']) if s['billed_by__id'] else '',
                    'name': s['billed_by__name'] or 'Unknown',
                    'role': s['billed_by__role'] or 'billing_staff',
                    'avatarUrl': s['billed_by__avatar_url'],
                    'billsCount': s['billsCount'],
                    'totalSales': float(s['totalSales'] or 0)
                }
                for s in staff_qs if s['billed_by__id']
            ]

            # Overall Discounts & GST
            total_discount = float(sales.aggregate(v=Sum('discount_amount'))['v'] or 0)
            gst_agg = sales.aggregate(
                c=Sum('cgst_amount'), 
                s=Sum('sgst_amount'), 
                i=Sum('igst_amount')
            )
            total_gst = float((gst_agg['c'] or 0) + (gst_agg['s'] or 0) + (gst_agg['i'] or 0))

            # Alerts
            alerts = self._get_daily_alerts(outlet, target_end)

            result = {
                'date': target_end.isoformat(),
                'startDate': target_start.isoformat(),
                'endDate': target_end.isoformat(),
                'totalSales': total_sales,
                'totalBills': total_bills,
                'salesReturnAmount': total_returns,
                'salesReturnCount': return_count,
                'cashCollected': cash_collected,
                'upiCollected': upi_collected,
                'cardCollected': card_collected,
                'creditGiven': credit_given,
                'totalDiscount': total_discount,
                'totalGst': total_gst,
                'topSellingItems': top_selling,
                'staffLeaderboard': staff_leaderboard,
                'hourlySales': hourly_sales,
                'paymentBreakdown': payment_breakdown,
                'alerts': alerts,
            }

            return Response(result, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error fetching dashboard: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to fetch dashboard'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _get_daily_alerts(self, outlet, target_date):
        """Get alerts: low stock, expiring soon, overdue accounts."""
        alerts = {
            'lowStock': [],
            'expiringSoon': [],
            'overdueAccounts': [],
        }

        # Low stock: batches with qty_strips < 10
        low_stock_batches = Batch.objects.filter(
            outlet=outlet,
            qty_strips__lt=10,
            is_active=True,
        ).select_related('product')

        for batch in low_stock_batches:
            if batch.product is None:
                continue
            alerts['lowStock'].append({
                'batch': {
                    'productName': batch.product.name,
                    'batchNumber': batch.batch_no,
                    'expiryDate': batch.expiry_date.isoformat(),
                },
                'currentStock': batch.qty_strips,
                'reorderLevel': 10,
            })

        # Expiring soon: batches expiring within 90 days
        expiry_cutoff = target_date + timedelta(days=90)
        expiring_batches = Batch.objects.filter(
            outlet=outlet,
            expiry_date__lte=expiry_cutoff,
            expiry_date__gt=target_date,
            is_active=True,
        ).select_related('product')

        for batch in expiring_batches:
            if batch.product is None:
                continue
            days_until = (batch.expiry_date - target_date).days
            alerts['expiringSoon'].append({
                'batch': {
                    'productName': batch.product.name,
                    'batchNumber': batch.batch_no,
                    'expiryDate': batch.expiry_date.isoformat(),
                },
                'daysUntilExpiry': days_until,
            })

        # Overdue accounts: credit accounts with outstanding > 0 and due date passed
        # This requires CreditAccount to have a due_date field or calculation from invoice dates
        # For now, we'll check accounts with status 'overdue'
        overdue_accounts = CreditAccount.objects.filter(
            outlet=outlet,
            status='overdue',
            total_outstanding__gt=0,
        ).select_related('customer')

        for account in overdue_accounts:
            # Calculate days overdue (estimate from last transaction)
            days_overdue = 0
            if account.last_transaction_date:
                tx_date = account.last_transaction_date.date() if hasattr(account.last_transaction_date, 'date') else account.last_transaction_date
                days_overdue = max(0, (timezone.now().date() - tx_date).days)

            alerts['overdueAccounts'].append({
                'customerId': str(account.customer_id),
                'customerName': account.customer.name,
                'outstandingAmount': float(account.total_outstanding),
                'daysOverdue': days_overdue,
            })

        return alerts


class CreditAccountListView(APIView):
    """
    GET /api/v1/credit/accounts/?outletId=xxx

    List all credit accounts for an outlet with customer details.
    Returns paginated list of CreditAccount objects with customer information.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """List credit accounts for outlet."""
        outlet_id = request.query_params.get('outletId')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 50))
        search = request.query_params.get('search', '').strip()

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Auto-sync if no credit accounts exist yet for this outlet
        if not CreditAccount.objects.filter(outlet=outlet).exists():
            try:
                from apps.billing.management.commands.sync_credit_accounts import sync_all_credit_accounts
                sync_all_credit_accounts()
            except Exception as e:
                logger.error(f"Error during auto-sync of credit accounts: {e}")

        # Query credit accounts
        accounts = CreditAccount.objects.filter(outlet=outlet).select_related('customer')

        # Status filter
        status_param = request.query_params.get('status')
        if status_param and status_param != 'all':
            accounts = accounts.filter(status=status_param)

        # Apply search filter (by customer name or phone)
        if search:
            query_lower = search.lower()
            accounts = accounts.filter(
                Q(customer__name__icontains=query_lower) |
                Q(customer__phone__icontains=query_lower)
            )

        # Apply pagination
        total_records = accounts.count()
        start = (page - 1) * page_size
        end = start + page_size
        accounts_page = accounts[start:end]

        # Serialize accounts
        results = []
        for account in accounts_page:
            result = {
                'id': str(account.id),
                'customerId': str(account.customer_id),
                'customer': {
                    'id': str(account.customer.id),
                    'name': account.customer.name,
                    'phone': account.customer.phone,
                    'address': account.customer.address,
                    'isChronic': account.customer.is_chronic,
                    'totalPurchases': float(account.customer.total_purchases),
                },
                'outletId': str(account.outlet_id),
                'creditLimit': float(account.credit_limit),
                'totalOutstanding': float(account.total_outstanding),
                'totalBorrowed': float(account.total_borrowed),
                'totalRepaid': float(account.total_repaid),
                'status': account.status,
                'lastTransactionDate': account.last_transaction_date.isoformat() if account.last_transaction_date else None,
                'createdAt': account.created_at.isoformat(),
            }
            results.append(result)

        total_pages = (total_records + page_size - 1) // page_size

        response_data = {
            'data': results,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records,
            }
        }

        logger.info(f"Listed {len(results)} credit accounts for outlet {outlet.name}")
        return Response(response_data, status=status.HTTP_200_OK)


class CreditAccountDetailView(APIView):
    """
    GET /api/v1/credit/accounts/{id}/

    Get details of a specific credit account with customer information.
    Returns full CreditAccount object with linked customer profile.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, account_id, *args, **kwargs):
        """Get credit account details."""
        try:
            account = CreditAccount.objects.get(id=account_id)
        except CreditAccount.DoesNotExist:
            return Response(
                {'detail': f'Credit account {account_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = {
            'id': str(account.id),
            'customerId': str(account.customer_id),
            'customer': {
                'id': str(account.customer.id),
                'name': account.customer.name,
                'phone': account.customer.phone,
                'address': account.customer.address,
                'isChronic': account.customer.is_chronic,
                'totalPurchases': float(account.customer.total_purchases),
            },
            'outletId': str(account.outlet_id),
            'creditLimit': float(account.credit_limit),
            'totalOutstanding': float(account.total_outstanding),
            'totalBorrowed': float(account.total_borrowed),
            'totalRepaid': float(account.total_repaid),
            'status': account.status,
            'lastTransactionDate': account.last_transaction_date.isoformat() if account.last_transaction_date else None,
            'createdAt': account.created_at.isoformat(),
        }

        logger.info(f"Retrieved credit account {account_id}")
        return Response(result, status=status.HTTP_200_OK)


class SalePrintView(APIView):
    """
    GET /api/v1/sales/{id}/print/

    Get sale invoice details for printing.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id, *args, **kwargs):
        """
        Get sale invoice for printing.

        Query parameters:
        - outletId: Outlet UUID to filter invoices

        Returns:
        {
            "id": "...",
            "invoiceNo": "...",
            "invoiceDate": "...",
            "grandTotal": ...,
            "paymentMode": "...",
            "customer": { "name", "phone", "address" } | null,
            "outlet": { "name", "address", "phone", "gstin", "drugLicenseNo" },
            "billedBy": "staff name",
            "items": [{ "productName", "composition", "batchNo", "expiryDate", "qty", "mrp", "saleRate", "discountPct", "gstRate", "totalAmount" }]
        }
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Fetch sale invoice
        try:
            invoice = SaleInvoice.objects.select_related(
                'customer', 'billed_by', 'outlet'
            ).get(id=sale_id, outlet=outlet)
        except SaleInvoice.DoesNotExist:
            return Response(
                {'detail': f'Sale {sale_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Fetch sale items
        items = SaleItem.objects.filter(invoice=invoice).select_related('batch', 'batch__product')

        # Build items list
        items_list = []
        for item in items:
            items_list.append({
                'productName': item.product_name,
                'composition': item.composition,
                'batchNo': item.batch_no,
                'expiryDate': item.expiry_date.isoformat(),
                'qty': item.qty_strips,
                'mrp': float(item.mrp),
                'saleRate': float(item.sale_rate),
                'discountPct': float(item.discount_pct),
                'gstRate': float(item.gst_rate),
                'totalAmount': float(item.total_amount),
            })

        # Build response
        result = {
            'id': str(invoice.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat(),
            'grandTotal': float(invoice.grand_total),
            'paymentMode': invoice.payment_mode,
            'customer': {
                'name': invoice.customer.name,
                'phone': invoice.customer.phone,
                'address': invoice.customer.address,
            } if invoice.customer else None,
            'outlet': {
                'name': outlet.name,
                'address': outlet.address,
                'phone': outlet.phone,
                'gstin': outlet.gstin,
                'drugLicenseNo': outlet.drug_license_no,
            },
            'billedBy': invoice.billed_by.name if invoice.billed_by else 'Unknown',
            'items': items_list,
        }

        logger.info(f"Retrieved sale {sale_id} for printing")

        log_activity(
            action="PRINT",
            module="billing",
            entity_type="SaleInvoice",
            entity_id=invoice.id,
            entity_label=invoice.invoice_no,
            description=f"Printed sales invoice {invoice.invoice_no}",
            user=request.user,
            outlet=outlet,
        )

        return Response(result, status=status.HTTP_200_OK)

class SaleDetailView(APIView):
    """
    GET /api/v1/sales/{id}/
    
    Get details of a specific sale invoice.
    """
    
    def get_permissions(self):
        if self.request.method == 'PUT':
            return [CanEditSalesInvoice()]
        return [IsAuthenticated()]

    def get(self, request, sale_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            if outlet_id:
                # Filter by outlet if provided (stricter security)
                outlet = Outlet.objects.get(id=outlet_id)
                invoice = SaleInvoice.objects.select_related('customer', 'billed_by', 'outlet').get(id=sale_id, outlet=outlet)
            else:
                # Fetch by ID only — used by billing detail page which doesn't pass outletId
                invoice = SaleInvoice.objects.select_related('customer', 'billed_by', 'outlet').get(id=sale_id)
        except (Outlet.DoesNotExist, SaleInvoice.DoesNotExist):
            invoice = None
            try:
                import os, redis
                r = redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379/0'))
                mapped_id = r.get(f'legacy_sale_map:{sale_id}')
                if mapped_id:
                    real_sale_id = mapped_id.decode()
                    if outlet_id:
                        outlet = Outlet.objects.get(id=outlet_id)
                        invoice = SaleInvoice.objects.select_related('customer', 'billed_by', 'outlet').get(id=real_sale_id, outlet=outlet)
                    else:
                        invoice = SaleInvoice.objects.select_related('customer', 'billed_by', 'outlet').get(id=real_sale_id)
            except Exception:
                invoice = None

            if not invoice:
                return Response(
                    {'detail': f'Sale {sale_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
        items = SaleItem.objects.filter(invoice=invoice).select_related('batch', 'batch__product', 'schedule_h_register')
        
        items_list = []
        for item in items:
            batch = item.batch
            landing_rate = float(batch.landing_rate or batch.purchase_rate or 0) if batch else 0.0
            purchase_rate = float(batch.purchase_rate or 0) if batch else 0.0
            ptr = float(batch.ptr or 0) if batch else 0.0
            pts = float(batch.pts or 0) if batch else 0.0
            items_list.append({
                'batchId': str(item.batch_id) if item.batch_id else '',
                'productId': str(item.batch.product_id) if item.batch and item.batch.product_id else '',
                'name': item.product_name,
                'composition': item.composition,
                'manufacturer': item.batch.product.manufacturer if item.batch and item.batch.product else None,
                'packSize': item.pack_size,
                'packUnit': item.pack_unit,
                'batchNo': item.batch_no,
                'expiryDate': item.expiry_date.isoformat(),
                'scheduleType': item.schedule_type,
                'mrp': float(item.mrp),
                'saleRate': float(item.sale_rate),
                'rate': float(item.rate),
                'qtyStrips': item.qty_strips,
                'qtyLoose': item.qty_loose,
                'qtyReturned': item.qty_returned,
                'saleItemId': str(item.id),
                # totalQty = total loose units = (strips × pack_size) + loose
                'totalQty': (item.qty_strips * (item.pack_size or 1)) + item.qty_loose,
                'saleMode': item.sale_mode,
                'discountPct': float(item.discount_pct),
                'gstRate': float(item.gst_rate),
                'taxableAmount': float(item.taxable_amount),
                'gstAmount': float(item.gst_amount),
                'totalAmount': float(item.total_amount),
                'purchaseRate': purchase_rate,
                'landingRate': landing_rate,
                'ptr': ptr,
                'pts': pts,
            })

        # Check if this sale has any returns against it
        from apps.billing.models import SalesReturn
        sale_returns = SalesReturn.objects.filter(original_sale=invoice).order_by('return_date')
        return_count = sale_returns.count()
        return_total = float(sale_returns.aggregate(t=Sum('total_amount'))['t'] or 0)
        return_summary = [
            {
                'returnNo': r.return_no,
                'returnDate': r.return_date.isoformat(),
                'totalAmount': float(r.total_amount),
                'reason': r.reason or '',
            }
            for r in sale_returns
        ]
            
        schedule_h_record = None
        for item in items:
            if hasattr(item, 'schedule_h_register'):
                schedule_h_record = item.schedule_h_register
                break

        result = {
            'id': str(invoice.id),
            'outletId': str(invoice.outlet_id),
            'outlet': {
                'id': str(invoice.outlet.id),
                'name': invoice.outlet.name,
                'address': invoice.outlet.address,
                'city': invoice.outlet.city,
                'state': invoice.outlet.state,
                'pincode': invoice.outlet.pincode,
                'phone': invoice.outlet.phone,
                'gstin': invoice.outlet.gstin,
                'drugLicenseNo': invoice.outlet.drug_license_no,
                'invoiceFooter': invoice.outlet.invoice_footer,
                'logoUrl': invoice.outlet.logo_url,
            } if invoice.outlet else None,
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat(),
            'saleType': invoice.sale_type,
            'customerId': str(invoice.customer.id) if invoice.customer else None,
            'customer': {
                'id': str(invoice.customer.id),
                'name': invoice.customer.name,
                'phone': invoice.customer.phone,
                'address': invoice.customer.address,
            } if invoice.customer else None,
            'subtotal': float(invoice.subtotal),
            'discountAmount': float(invoice.discount_amount),
            'extraDiscountPct': float(invoice.extra_discount_pct or 0.0),
            'taxableAmount': float(invoice.taxable_amount),
            'cgstAmount': float(invoice.cgst_amount),
            'sgstAmount': float(invoice.sgst_amount),
            'igstAmount': float(invoice.igst_amount),
            'cgst': float(invoice.cgst),
            'sgst': float(invoice.sgst),
            'igst': float(invoice.igst),
            'roundOff': float(invoice.round_off),
            'grandTotal': float(invoice.grand_total),
            'paymentMode': invoice.payment_mode,
            'cashPaid': float(invoice.cash_paid),
            'upiPaid': float(invoice.upi_paid),
            'cardPaid': float(invoice.card_paid),
            'creditGiven': float(invoice.credit_given),
            'amountPaid': float(invoice.amount_paid),
            'amountDue': float(invoice.amount_due),
            'isReturn': invoice.is_return,
            'billedBy': str(invoice.billed_by.id) if invoice.billed_by else None,
            'billedByName': invoice.billed_by.name if invoice.billed_by else 'Unknown',
            'doctorId': str(invoice.doctor.id) if invoice.doctor else None,
            'doctorName': schedule_h_record.doctor_name if schedule_h_record else (invoice.doctor.name if invoice.doctor else None),
            'doctorRegNo': schedule_h_record.doctor_reg_no if schedule_h_record else (invoice.doctor.registration_no if invoice.doctor else None),
            'hospitalName': invoice.hospital_name,
            'prescriptionNo': schedule_h_record.prescription_no if schedule_h_record else invoice.prescription_no,
            'scheduleHData': {
                'doctorId': str(invoice.doctor.id) if invoice.doctor else None,
                'doctorName': schedule_h_record.doctor_name,
                'doctorRegNo': schedule_h_record.doctor_reg_no,
                'patientName': schedule_h_record.patient_name,
                'patientAddress': schedule_h_record.patient_address,
                'patientAge': schedule_h_record.patient_age,
                'prescriptionNo': schedule_h_record.prescription_no,
                'hospitalName': invoice.hospital_name,
            } if schedule_h_record else None,
            'items': items_list,
            # Return metadata — used by billing page to show edit warning
            'hasReturns': return_count > 0,
            'returnCount': return_count,
            'returnTotal': return_total,
            'returnSummary': return_summary,
            'hasLaterPayments': hasattr(invoice, 'receipt_allocations') and invoice.receipt_allocations.exists(),
            'createdAt': invoice.created_at.isoformat(),
        }
        
        return Response(result, status=status.HTTP_200_OK)


    def put(self, request, sale_id, *args, **kwargs):
        """Update a sale invoice."""
        outlet_id = request.data.get('outletId')
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=status.HTTP_400_BAD_REQUEST)

        updated_by_id = str(request.user.id)
        from apps.billing.sale_update_service import atomic_sale_update, SaleServiceError
        from apps.audit.core import orchestrator
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from django.db import transaction

        try:
            with transaction.atomic():
                # 1. Take pre-update snapshot
                from apps.billing.models import SaleInvoice
                invoice_obj = SaleInvoice.objects.select_for_update().get(id=sale_id, outlet_id=outlet_id)
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice_obj)

                # 2. Perform business logic update
                invoice = atomic_sale_update(sale_id, request.data, outlet_id, updated_by_id)
                invoice.refresh_from_db()

                # 3. Take post-update snapshot
                new_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)
                
                # Fetch original revision context if passed, else default to standard PUT update
                action = request.data.get('revisionAction', 'standard_correction')
                reason_code = request.data.get('revisionReasonCode', 'correction')
                reason_text = request.data.get('revisionReasonText', 'Standard update')

                revision = orchestrator.record_revision(
                    entity=invoice,
                    action=action,
                    old_snapshot=old_snapshot,
                    new_snapshot=new_snapshot,
                    reason_code=reason_code,
                    reason_text=reason_text
                )
                
                rev_id_str = str(revision.id) if revision else ''
                orchestrator.record_activity(
                    module="billing",
                    entity=invoice,
                    action=action,
                    reason_code=reason_code,
                    reason_text=reason_text,
                    metadata={"revision_id": rev_id_str}
                )

            response_data = build_sale_response_payload(
                invoice,
                message='Sale invoice updated successfully',
                revision_id=rev_id_str
            )
            return Response(response_data, status=status.HTTP_200_OK)
        except SaleServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error updating sale invoice: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SaleReviseView(APIView):
    """
    POST /api/v1/billing/sales/<id>/revise/
    Direct revision of a sale invoice. Takes pre-snapshot, performs update, takes post-snapshot,
    and records it in the BillRevision and ActivityLog.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, sale_id, *args, **kwargs):
        outlet_id = request.data.get('outletId') or request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            invoice = SaleInvoice.objects.get(id=sale_id, outlet_id=outlet_id)
        except SaleInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        if invoice.is_cancelled:
            return Response({'detail': 'Cannot modify a cancelled invoice.'}, status=status.HTTP_400_BAD_REQUEST)

        action = request.data.get('revisionAction')
        reason_code = request.data.get('revisionReasonCode')
        reason_text = request.data.get('revisionReasonText')
        items_data = request.data.get('items', [])

        if not action or not reason_code or not reason_text:
            return Response({'detail': 'Revision context (action, reasonCode, reasonText) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not items_data and action != 'header_correction':
            return Response(
                {'detail': 'Invoice must contain at least one item.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.core.permissions import has_bill_revision_permission
        
        if action == 'direct_revise':
            if not has_bill_revision_permission(request.user, 'can_modify_draft_bill'):
                return Response({'detail': 'Permission denied: Missing can_modify_draft_bill.'}, status=status.HTTP_403_FORBIDDEN)
            if invoice.amount_paid > 0:
                return Response({'detail': 'Cannot direct revise a paid bill.'}, status=status.HTTP_400_BAD_REQUEST)
        elif action == 'commercial_correction':
            if not has_bill_revision_permission(request.user, 'can_modify_unpaid_bill'):
                return Response({'detail': 'Permission denied: Missing can_modify_unpaid_bill.'}, status=status.HTTP_403_FORBIDDEN)
            if invoice.amount_paid > 0:
                return Response({'detail': 'Cannot commercially correct a paid bill.'}, status=status.HTTP_400_BAD_REQUEST)
        elif action == 'paid_bill_correction':
            if not has_bill_revision_permission(request.user, 'can_modify_paid_bill'):
                return Response({'detail': 'Permission denied: Missing can_modify_paid_bill.'}, status=status.HTTP_403_FORBIDDEN)
        elif action == 'return_aware_correction':
            if not has_bill_revision_permission(request.user, 'can_modify_bill_with_return'):
                return Response({'detail': 'Permission denied: Missing can_modify_bill_with_return.'}, status=status.HTTP_403_FORBIDDEN)
        elif action == 'header_correction':
            if not has_bill_revision_permission(request.user, 'can_correct_header_fields'):
                return Response({'detail': 'Permission denied: Missing can_correct_header_fields.'}, status=status.HTTP_403_FORBIDDEN)
        elif action == 'cancel_and_reissue':
            if not has_bill_revision_permission(request.user, 'can_cancel_and_reissue_bill'):
                return Response({'detail': 'Permission denied: Missing can_cancel_and_reissue_bill.'}, status=status.HTTP_403_FORBIDDEN)
        elif action == 'standard_correction':
            # Added for test coverage and general fallback if needed
            pass
        else:
            return Response({'detail': 'Invalid revisionAction.'}, status=status.HTTP_400_BAD_REQUEST)

        # Eligibility check
        if invoice.returns.exists() and action not in ['return_aware_correction', 'header_correction']:
            return Response({'detail': f'Cannot {action.replace("_", " ")} a bill with returns.'}, status=status.HTTP_400_BAD_REQUEST)
        if hasattr(invoice, 'receipt_allocations') and invoice.receipt_allocations.exists() and action not in ['paid_bill_correction', 'header_correction']:
            return Response({'detail': f'Cannot {action.replace("_", " ")} a bill with later payments.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.billing.sale_update_service import atomic_sale_update, cancel_invoice, SaleServiceError
        from apps.audit.core import orchestrator
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from django.db import transaction

        try:
            with transaction.atomic():
                # 1. Take pre-update snapshot
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)

                if action == 'cancel_and_reissue':
                    # 2a. Cancel the old invoice
                    cancel_invoice(str(invoice.id), str(request.user.id), reason_text)
                    invoice.refresh_from_db()

                    # 3a. Create the replacement invoice via the creation view logic
                    from apps.billing.views import SaleCreateView
                    data_copy = request.data.copy()
                    data_copy.pop('revisionAction', None)
                    data_copy.pop('revisionReasonCode', None)
                    data_copy.pop('revisionReasonText', None)

                    create_view_instance = SaleCreateView()
                    create_view_instance.request = request
                    create_view_instance.format_kwarg = None

                    original_data = request._full_data
                    request._full_data = data_copy
                    try:
                        create_response = create_view_instance.post(request)
                    finally:
                        request._full_data = original_data

                    if create_response.status_code != 200 and create_response.status_code != 201:
                        raise SaleServiceError(f"Failed to create replacement invoice: {create_response.data}")

                    new_invoice_id = create_response.data.get('id')
                    updated_invoice = SaleInvoice.objects.get(id=new_invoice_id)
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)
                    
                    # Embed the resulting_invoice_id into the metadata so the UI/history can link them
                    new_snapshot['_resulting_invoice_id'] = str(updated_invoice.id)
                    
                    revision = orchestrator.record_revision(
                        entity=invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                    rev_id_str = str(revision.id) if revision else ''
                    orchestrator.record_activity(
                        module="billing",
                        entity=invoice,
                        action=action,
                        reason_code=reason_code,
                        reason_text=reason_text,
                        metadata={"resulting_invoice_id": str(updated_invoice.id), "revision_id": rev_id_str}
                    )

                else:
                    # 2b. Perform the actual update using existing robust method
                    updated_invoice = atomic_sale_update(sale_id, request.data, outlet_id, str(request.user.id))

                    # 3b. Refresh and take post-update snapshot
                    updated_invoice.refresh_from_db()
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)

                    # 4b. Create revision record
                    revision = orchestrator.record_revision(
                        entity=updated_invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                    rev_id_str = str(revision.id) if revision else ''
                    orchestrator.record_activity(
                        module="billing",
                        entity=updated_invoice,
                        action=action,
                        reason_code=reason_code,
                        reason_text=reason_text,
                        metadata={"revision_id": rev_id_str}
                    )

            response_data = build_sale_response_payload(
                updated_invoice,
                message='Sale invoice revised successfully',
                revision_id=rev_id_str
            )
            return Response(response_data, status=status.HTTP_200_OK)

        except SaleServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error revising sale invoice: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CreditTransactionListView(APIView):
    """
    GET /api/v1/credit/{id}/transactions/ 
    """
    
    permission_classes = [IsAuthenticated]

    def get(self, request, account_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
            
        try:
            account = CreditAccount.objects.get(id=account_id, outlet=outlet)
        except CreditAccount.DoesNotExist:
            return Response({'detail': f'Credit Account {account_id} not found'}, status=404)
            
        transactions = CreditTransaction.objects.filter(credit_account=account).order_by('-created_at')
        
        result = []
        for tx in transactions:
            result.append({
                'id': str(tx.id),
                'creditAccountId': str(tx.credit_account_id),
                'customerId': str(tx.customer_id),
                'invoiceId': str(tx.invoice_id) if tx.invoice_id else None,
                'type': tx.type,
                'amount': float(tx.amount),
                'description': tx.description,
                'balanceAfter': float(tx.balance_after),
                'recordedBy': str(tx.recorded_by_id) if tx.recorded_by else None,
                'createdAt': tx.created_at.isoformat(),
                'date': tx.date.isoformat() if tx.date else None,
            })
            
        return Response(result, status=status.HTTP_200_OK)


class CreditLedgerView(APIView):
    """
    GET /api/v1/credit/{id}/ledger/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
            
        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            print(f"404 ERROR: Customer {customer_id} not found")
            return Response({'detail': f'Customer {customer_id} not found'}, status=404)
            
        ledger_entries = LedgerEntry.objects.filter(
            outlet=outlet,
            customer=customer,
            entity_type='customer'
        ).order_by('date', 'created_at')
        
        result = []
        for entry in ledger_entries:
            result.append({
                'id': str(entry.id),
                'date': entry.date.isoformat(),
                'entryType': entry.entry_type,
                'referenceNo': entry.reference_no,
                'description': entry.description,
                'debit': float(entry.debit),
                'credit': float(entry.credit),
                'runningBalance': float(entry.running_balance),
                'createdAt': entry.created_at.isoformat(),
            })
            
        return Response(result, status=status.HTTP_200_OK)


# ─── Phase 2 Batch 1 Views ────────────────────────────────────────────────────

class ReceiptListCreateView(APIView):
    """
    GET /api/v1/receipts/?customerId=&from=&to=
    POST /api/v1/receipts/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = ReceiptEntry.objects.filter(outlet=outlet)

        customer_id = request.query_params.get('customerId')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        if from_str:
            try:
                qs = qs.filter(date__gte=datetime.fromisoformat(from_str).date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(date__lte=datetime.fromisoformat(to_str).date())
            except ValueError:
                pass

        data = []
        for r in qs.order_by('-date', '-created_at'):
            data.append({
                'id': str(r.id),
                'customerId': str(r.customer_id),
                'customerName': r.customer.name,
                'date': r.date.isoformat(),
                'totalAmount': float(r.total_amount),
                'paymentMode': r.payment_mode,
                'referenceNo': r.reference_no,
                'notes': r.notes,
                'createdAt': r.created_at.isoformat(),
            })

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        created_by_id = request.user.id
        try:
            receipt = create_receipt_payment(request.data, outlet_id, created_by_id)
        except ReceiptServiceError as e:
            return Response({'error': {'code': 'RECEIPT_ERROR', 'message': str(e)}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected error creating receipt: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'success': True,
            'data': {
                'id': str(receipt.id),
                'referenceNo': receipt.reference_no,
                'totalAmount': float(receipt.total_amount),
                'date': receipt.date.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


class DistributorOutstandingSummaryView(APIView):
    """GET /api/v1/outstanding/distributors/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.purchases.models import Distributor, PurchaseInvoice
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        today = datetime.now().date()
        distributors = Distributor.objects.filter(outlet=outlet, is_active=True)

        data = []
        for dist in distributors:
            invoices = PurchaseInvoice.objects.filter(
                outlet=outlet, distributor=dist, outstanding__gt=0
            )
            total_outstanding = float(invoices.aggregate(t=Sum('outstanding'))['t'] or 0)
            if total_outstanding <= 0:
                continue

            overdue_invoices = invoices.filter(due_date__lt=today)
            overdue_amount = float(overdue_invoices.aggregate(t=Sum('outstanding'))['t'] or 0)
            oldest = invoices.order_by('due_date').values_list('due_date', flat=True).first()

            data.append({
                'distributorId': str(dist.id),
                'distributorName': dist.name,
                'totalOutstanding': total_outstanding,
                'overdueAmount': overdue_amount,
                'invoiceCount': invoices.count(),
                'oldestDueDate': oldest.isoformat() if oldest else None,
            })

        data.sort(key=lambda x: x['overdueAmount'], reverse=True)
        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class CustomerOutstandingSummaryView(APIView):
    """GET /api/v1/outstanding/customers/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        customers = Customer.objects.filter(outlet=outlet, is_active=True, outstanding__gt=0)

        data = []
        for cust in customers:
            oldest_unpaid = SaleInvoice.objects.filter(
                outlet=outlet, customer=cust, amount_due__gt=0
            ).order_by('invoice_date').first()

            last_receipt = ReceiptEntry.objects.filter(
                outlet=outlet, customer=cust
            ).order_by('-date').values_list('date', flat=True).first()

            data.append({
                'customerId': str(cust.id),
                'customerName': cust.name,
                'phone': cust.phone,
                'totalOutstanding': float(cust.outstanding),
                'overdueAmount': float(oldest_unpaid.amount_due) if oldest_unpaid else 0,
                'creditLimit': float(cust.credit_limit),
                'lastPaymentDate': last_receipt.isoformat() if last_receipt else None,
            })

        data.sort(key=lambda x: x['totalOutstanding'], reverse=True)
        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class ExpenseListCreateView(APIView):
    """
    GET /api/v1/expenses/?from=&to=&head=
    POST /api/v1/expenses/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = ExpenseEntry.objects.filter(outlet=outlet)
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        head = request.query_params.get('head')
        if from_str:
            try:
                qs = qs.filter(date__gte=datetime.fromisoformat(from_str).date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(date__lte=datetime.fromisoformat(to_str).date())
            except ValueError:
                pass
        if head:
            qs = qs.filter(expense_head=head)

        data = []
        breakdown = {}
        total_amount = 0
        for exp in qs.order_by('-date', '-created_at'):
            data.append({
                'id': str(exp.id),
                'date': exp.date.isoformat(),
                'expenseHead': exp.expense_head,
                'customHead': exp.custom_head,
                'amount': float(exp.amount),
                'paymentMode': exp.payment_mode,
                'referenceNo': exp.reference_no,
                'notes': exp.notes,
                'createdAt': exp.created_at.isoformat(),
            })
            breakdown[exp.expense_head] = breakdown.get(exp.expense_head, 0) + float(exp.amount)
            total_amount += float(exp.amount)

        return Response({
            'success': True,
            'data': data,
            'meta': {'total': len(data), 'totalAmount': total_amount, 'breakdown': breakdown},
        }, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        created_by_id = request.user.id
        try:
            expense = create_expense_entry(request.data, outlet_id, created_by_id)
        except ExpenseServiceError as e:
            return Response({'error': {'code': 'EXPENSE_ERROR', 'message': str(e)}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error creating expense: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'success': True,
            'data': {
                'id': str(expense.id),
                'date': expense.date.isoformat(),
                'expenseHead': expense.expense_head,
                'customHead': expense.custom_head,
                'amount': float(expense.amount),
                'paymentMode': expense.payment_mode,
                'referenceNo': expense.reference_no,
                'notes': expense.notes,
                'createdAt': expense.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


class CustomerLedgerView(APIView):
    """GET /api/v1/customers/{id}/ledger/?from=&to="""
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = LedgerEntry.objects.filter(outlet=outlet, customer=customer, entity_type='customer')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        if from_str:
            try:
                qs = qs.filter(date__gte=datetime.fromisoformat(from_str).date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(date__lte=datetime.fromisoformat(to_str).date())
            except ValueError:
                pass

        qs = qs.order_by('date', 'created_at')
        entries = list(qs)

        opening_balance = float(entries[0].running_balance - entries[0].credit + entries[0].debit) if entries else 0
        closing_balance = float(entries[-1].running_balance) if entries else 0

        data = [{
            'id': str(e.id),
            'date': e.date.isoformat(),
            'entryType': e.entry_type,
            'referenceNo': e.reference_no,
            'description': e.description,
            'debit': float(e.debit),
            'credit': float(e.credit),
            'balance': float(e.running_balance),
        } for e in entries]

        return Response({
            'success': True,
            'data': data,
            'meta': {'openingBalance': opening_balance, 'closingBalance': closing_balance, 'total': len(data)},
        }, status=status.HTTP_200_OK)


class UpdateCreditLimitView(APIView):
    """PATCH /api/v1/credit/{id}/limit/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, *args, **kwargs):
        outlet_id = request.data.get('outletId') or request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            customer = Customer.objects.get(id=pk, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        credit_limit = request.data.get('creditLimit')
        if credit_limit is None:
            return Response({'error': 'creditLimit is required'}, status=status.HTTP_400_BAD_REQUEST)

        customer.credit_limit = Decimal(str(credit_limit))
        customer.save(update_fields=['credit_limit'])

        return Response({
            'success': True,
            'data': {
                'id': str(customer.id),
                'creditLimit': float(customer.credit_limit),
                'outstandingBalance': float(customer.outstanding_balance),
            }
        }, status=status.HTTP_200_OK)


class CreateSalesReturnView(APIView):
    """POST /api/v1/sales/return/"""
    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        created_by_id = request.user.id
        try:
            logger.debug(f"PAYLOAD: {request.data}")
            sales_return = create_sales_return(request.data, outlet_id, created_by_id)
        except ReturnServiceError as e:
            logger.error(f"ERROR: {e}")
            return Response({'error': {'code': 'RETURN_ERROR', 'message': str(e)}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error creating sales return: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'success': True,
            'data': {
                'id': str(sales_return.id),
                'returnNo': sales_return.return_no,
                'totalAmount': float(sales_return.total_amount),
                'returnDate': sales_return.return_date.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


class SalesReturnListView(APIView):
    """GET /api/v1/sales/returns/"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = SalesReturn.objects.filter(outlet=outlet)
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        customer_id = request.query_params.get('customerId')
        if from_str:
            try:
                qs = qs.filter(return_date__gte=datetime.fromisoformat(from_str).date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(return_date__lte=datetime.fromisoformat(to_str).date())
            except ValueError:
                pass
        if customer_id:
            qs = qs.filter(original_sale__customer_id=customer_id)

        total_amount = 0
        data = []
        for r in qs.select_related('original_sale__customer').order_by('-return_date', '-created_at'):
            data.append({
                'id': str(r.id),
                'returnNo': r.return_no,
                'returnDate': r.return_date.isoformat(),
                'originalInvoiceNo': r.original_sale.invoice_no if r.original_sale else None,
                'customerName': r.original_sale.customer.name if (r.original_sale and r.original_sale.customer) else None,
                'totalAmount': float(r.total_amount),
                'deductionAmount': float(r.deduction_amount or 0),
                'refundMode': r.refund_mode,
                'reason': r.reason,
                'createdAt': r.created_at.isoformat(),
            })
            total_amount += float(r.total_amount)

        return Response({
            'success': True,
            'data': data,
            'meta': {'total': len(data), 'totalAmount': total_amount},
        }, status=status.HTTP_200_OK)


class SalesReturnDetailView(APIView):
    """GET /api/v1/sales/returns/{id}/"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            r = SalesReturn.objects.select_related(
                'original_sale__customer', 'outlet'
            ).prefetch_related('items').get(id=pk, outlet=outlet)
        except SalesReturn.DoesNotExist:
            return Response({'detail': 'Return not found'}, status=status.HTTP_404_NOT_FOUND)

        items = [{
            'id': str(item.id),
            'saleItemId': str(item.original_sale_item_id) if item.original_sale_item_id else '',
            'originalSaleItemId': str(item.original_sale_item_id) if item.original_sale_item_id else '',
            'batchId': str(item.batch_id) if item.batch_id else '',
            'productName': item.product_name,
            'batchNo': item.batch_no,
            'qtyReturned': item.qty_returned,
            'qtyStrips': item.qty_returned_strips if item.qty_returned_strips else (item.qty_returned // (item.original_sale_item.pack_size if item.original_sale_item_id and item.original_sale_item.pack_size else 1)),
            'qtyLoose': item.qty_returned_loose if item.qty_returned_loose else (item.qty_returned % (item.original_sale_item.pack_size if item.original_sale_item_id and item.original_sale_item.pack_size else 1)),
            'packSize': item.original_sale_item.pack_size if item.original_sale_item_id and item.original_sale_item.pack_size else 1,
            'rate': float(item.return_rate),
            'returnRate': float(item.return_rate),
            'gstRate': float(item.original_sale_item.gst_rate) if item.original_sale_item_id and hasattr(item.original_sale_item, 'gst_rate') and item.original_sale_item.gst_rate is not None else 0.0,
            'totalAmount': float(item.total_amount),
            'total': float(item.total_amount),
        } for item in r.items.select_related('original_sale_item').all()]

        data = {
            'id': str(r.id),
            'returnNo': r.return_no,
            'returnDate': r.return_date.isoformat(),
            'originalInvoiceNo': r.original_sale.invoice_no if r.original_sale else None,
            'originalSaleId': str(r.original_sale_id) if r.original_sale_id else None,
            'customerId': str(r.original_sale.customer_id) if r.original_sale and r.original_sale.customer_id else None,
            'customerName': r.original_sale.customer.name if r.original_sale and r.original_sale.customer else None,
            'totalAmount': float(r.total_amount),
            'deductionAmount': float(r.deduction_amount or 0),
            'grossAmount': float(sum(item.total_amount for item in r.items.all())),
            'refundMode': r.refund_mode,
            'reason': r.reason,
            'items': items,
            'createdAt': r.created_at.isoformat(),
            'updatedAt': r.updated_at.isoformat() if r.updated_at else None,
        }

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)

    def put(self, request, pk, *args, **kwargs):
        outlet_id = request.data.get('outletId') or request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        updated_by_id = request.user.id
        try:
            from .sale_return_update_service import atomic_sale_return_update
            sales_return = atomic_sale_return_update(str(pk), request.data, str(outlet_id), str(updated_by_id))
            return Response({
                'success': True,
                'data': {
                    'id': str(sales_return.id),
                    'returnNo': sales_return.return_no,
                    'totalAmount': float(sales_return.total_amount),
                    'refundMode': sales_return.refund_mode,
                    'reason': sales_return.reason,
                    'updatedAt': sales_return.updated_at.isoformat() if sales_return.updated_at else None,
                }
            }, status=status.HTTP_200_OK)
        except (ValidationError, DjangoValidationError) as e:
            code = getattr(e, 'code', None)
            detail = getattr(e, 'message_dict', getattr(e, 'messages', getattr(e, 'detail', str(e))))
            if code == 'stale_edit_conflict' or (isinstance(detail, dict) and 'stale_edit_conflict' in detail):
                return Response({'error': detail}, status=status.HTTP_409_CONFLICT)
            return Response({'error': detail}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error updating sales return: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SalesReturnPrintView(APIView):
    """GET /api/v1/sales/returns/{id}/print/"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            r = SalesReturn.objects.select_related(
                'original_sale__customer', 'outlet'
            ).prefetch_related('items').get(id=pk, outlet=outlet)
        except SalesReturn.DoesNotExist:
            return Response({'detail': 'Return not found'}, status=status.HTTP_404_NOT_FOUND)

        gross_sum = sum(item.total_amount for item in r.items.all())
        ratio = (float(r.total_amount) / float(gross_sum)) if (r.deduction_amount > 0 and gross_sum > 0) else 1.0

        items = [{
            'productName': item.product_name,
            'batchNo': item.batch_no,
            'qtyReturned': item.qty_returned,
            'packSize': item.original_sale_item.pack_size if (item.original_sale_item_id and item.original_sale_item and item.original_sale_item.pack_size) else 1,
            'returnRate': round(float(item.return_rate) * ratio, 2),
            'totalAmount': round(float(item.total_amount) * ratio, 2),
        } for item in r.items.select_related('original_sale_item').all()]

        data = {
            'returnNo': r.return_no,
            'returnDate': r.return_date.isoformat(),
            'originalInvoiceNo': r.original_sale.invoice_no if r.original_sale else None,
            'customerName': r.original_sale.customer.name if (r.original_sale and r.original_sale.customer) else 'Walk-in',
            'items': items,
            'totalAmount': float(r.total_amount),
            'refundMode': r.refund_mode,
            'reason': r.reason,
            'outletName': outlet.name,
            'outletGSTIN': outlet.gstin or '',
        }

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


# ── Phase 2 Batch 2: Notifications ──────────────────────────────────────────

from apps.billing.models import NotificationLog


class SendReminderView(APIView):
    """POST /api/v1/credit/{id}/reminder/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            credit_account = CreditAccount.objects.get(id=pk, outlet=outlet)
        except CreditAccount.DoesNotExist:
            return Response({'detail': 'Credit account not found'}, status=status.HTTP_404_NOT_FOUND)

        channel = request.data.get('channel', 'whatsapp')
        message = request.data.get('message', '')
        if not message:
            message = (
                f"Dear {credit_account.customer.name}, you have an outstanding balance of "
                f"₹{credit_account.outstanding}. Please clear your dues. - MediFlow"
            )

        log = NotificationLog.objects.create(
            outlet=outlet,
            customer=credit_account.customer,
            channel=channel,
            message=message,
            status='pending',
        )

        # Stub: in production, Celery task would fire here
        # send_whatsapp_reminder.delay(log.id)
        log.status = 'pending'
        log.save(update_fields=['status'])

        return Response({
            'success': True,
            'data': {
                'notificationId': str(log.id),
                'channel': log.channel,
                'status': log.status,
                'message': log.message,
            }
        }, status=status.HTTP_200_OK)


class LowStockAlertView(APIView):
    """POST /api/v1/notifications/low-stock/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        from apps.inventory.models import Batch, MasterProduct
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        # Find all active batches where qty_strips <= product.min_qty
        low_batches = (
            Batch.objects.filter(outlet=outlet, is_active=True)
            .select_related('product')
            .filter(qty_strips__lte=models.F('product__min_qty'))
        )

        alerts = []
        for batch in low_batches:
            alerts.append({
                'productId': str(batch.product.id),
                'productName': batch.product.name,
                'batchNo': batch.batch_no,
                'currentStock': batch.qty_strips,
                'minQty': batch.product.min_qty,
                'reorderQty': batch.product.reorder_qty,
            })

        return Response({
            'success': True,
            'data': alerts,
            'meta': {'total': len(alerts)},
        }, status=status.HTTP_200_OK)


# ── Marg ERP CSV Migration ───────────────────────────────────────────────────

import csv
import io
from django.db import transaction as db_transaction
from apps.inventory.models import MasterProduct, Batch


class MargMigrationView(APIView):
    """POST /api/v1/migrate/marg/ — bulk import CSV from Marg ERP"""
    permission_classes = [IsAuthenticated]

    @db_transaction.atomic
    def post(self, request, *args, **kwargs):
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response({'detail': 'CSV file is required (field: file)'}, status=status.HTTP_400_BAD_REQUEST)

        decoded = csv_file.read().decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(decoded))

        imported, skipped, errors = 0, 0, []

        for row_num, row in enumerate(reader, start=2):
            try:
                product_name = row.get('ProductName', '').strip()
                hsn_code = row.get('HSNCode', '').strip() or f'MARG-{row_num}'
                batch_no = row.get('BatchNo', '').strip() or f'BATCH-{row_num}'
                expiry_str = row.get('ExpiryDate', '').strip()
                mrp = float(row.get('MRP', 0) or 0)
                purchase_rate = float(row.get('PurchaseRate', 0) or 0)
                sale_rate = float(row.get('SaleRate', 0) or purchase_rate)
                qty_strips = int(float(row.get('Qty', 0) or 0))
                pack_size = int(float(row.get('PackSize', 1) or 1))

                if not product_name:
                    skipped += 1
                    continue

                from datetime import datetime, date
                expiry_date = date.today()
                if expiry_str:
                    for fmt in ('%d/%m/%Y', '%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
                        try:
                            parsed = datetime.strptime(expiry_str, fmt)
                            expiry_date = parsed.date()
                            break
                        except ValueError:
                            continue

                product, _ = MasterProduct.objects.get_or_create(
                    hsn_code=hsn_code,
                    defaults={
                        'name': product_name,
                        'composition': '',
                        'manufacturer': row.get('Manufacturer', '').strip() or 'Unknown',
                        'category': row.get('Category', '').strip() or 'General',
                        'drug_type': 'allopathy',
                        'schedule_type': 'OTC',
                        'pack_size': pack_size,
                        'pack_unit': row.get('PackUnit', 'units').strip() or 'units',
                        'pack_type': 'strip',
                    }
                )

                Batch.objects.create(
                    outlet=outlet,
                    product=product,
                    batch_no=batch_no,
                    expiry_date=expiry_date,
                    mrp=mrp,
                    purchase_rate=purchase_rate,
                    sale_rate=sale_rate,
                    qty_strips=qty_strips,
                    is_opening_stock=True,
                )
                imported += 1

            except Exception as e:
                errors.append({'row': row_num, 'error': str(e)})
                if len(errors) >= 10:
                    raise Exception(f'Too many errors ({len(errors)}), aborting import')

        return Response({
            'success': True,
            'data': {
                'imported': imported,
                'skipped': skipped,
                'errors': errors,
            }
        }, status=status.HTTP_200_OK)


class SaleInvoiceSearchView(APIView):
    """GET /api/v1/sales/invoices/search/?outletId=xxx&q=INV-001"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.models import Outlet
        outlet_id = request.query_params.get('outletId')
        q = request.query_params.get('q', '').strip()
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        customer_id = request.query_params.get('customerId')
        qs = SaleInvoice.objects.filter(outlet=outlet, is_return=False).select_related('customer', 'doctor').prefetch_related('items')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        if q:
            import re
            clean_q = q.strip()
            query = (
                Q(invoice_no__icontains=clean_q)
                | Q(customer__name__icontains=clean_q)
                | Q(customer__phone__icontains=clean_q)
                | Q(doctor__name__icontains=clean_q)
                | Q(hospital_name__icontains=clean_q)
            )
            # Smart digit matching (e.g., '606', 'INV-606', 'INV 606' -> match '000606')
            digits = re.findall(r'\d+', clean_q)
            if digits:
                last_num = int(digits[-1])
                padded_6 = f"{last_num:06d}"
                query |= Q(invoice_no__icontains=padded_6)
                query |= Q(invoice_no__icontains=str(last_num))
            qs = qs.filter(query)

        qs = qs.order_by('-invoice_date')[:10]

        results = []
        for inv in qs:
            items = []
            for item in inv.items.all():
                pack_size = item.pack_size or 1
                qty_fractional = float(item.qty_strips) + (float(item.qty_loose) / pack_size)
                # effective_rate: per-strip rate derived from the actual charged total_amount.
                # This guarantees the return form shows the same total as the original invoice
                # regardless of discounts, rounding, or GST adjustments.
                effective_rate = float(item.total_amount) / qty_fractional if qty_fractional > 0 else 0.0
                
                items.append({
                    'id': str(item.id),
                    'batchId': str(item.batch_id) if item.batch_id else '',
                    'productName': item.product_name,
                    'batchNo': item.batch_no,
                    'expiry': str(item.expiry_date),
                    'qtyStrips': item.qty_strips,
                    'qtyLoose': item.qty_loose,
                    'qtyReturned': item.qty_returned,
                    'packSize': item.pack_size,
                    'qty': (item.qty_strips * pack_size) + item.qty_loose,
                    # rate = effective per-strip rate from actual charged total
                    'rate': effective_rate,
                    'saleRate': float(item.sale_rate),
                    'discPercent': float(item.discount_pct),
                    'gstRate': float(item.gst_rate),
                    # totalAmount: canonical item total for return display — avoids
                    # frontend re-multiplying rate × qty and hitting unit mismatch bugs.
                    'totalAmount': float(item.total_amount),
                })
            results.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'date': str(inv.invoice_date.date()) if hasattr(inv.invoice_date, 'date') else str(inv.invoice_date),
                'customerName': inv.customer.name if inv.customer else 'Walk-in',
                'customerId': str(inv.customer.id) if inv.customer else None,
                'doctorName': inv.doctor.name if inv.doctor else None,
                'hospitalName': inv.hospital_name,
                'grandTotal': float(inv.grand_total),
                'items': items,
            })

        if len(results) < 10 and q:
            from apps.accounts.models import JournalEntry

            existing_nos = {r['invoiceNo'].lower() for r in results}
            # Collect all existing SaleInvoice IDs and invoice numbers for this outlet to prevent duplicates
            existing_sale_ids = set(SaleInvoice.objects.filter(outlet=outlet).values_list('id', flat=True))
            all_sale_nos_lower = {no.lower() for no in SaleInvoice.objects.filter(outlet=outlet).values_list('invoice_no', flat=True)}

            je_query = Q(narration__icontains=clean_q)
            if digits:
                last_num = int(digits[-1])
                padded_6 = f"{last_num:06d}"
                je_query |= Q(narration__icontains=padded_6) | Q(narration__icontains=str(last_num))

            # Exclude JournalEntries that are already linked to a real SaleInvoice
            je_qs = JournalEntry.objects.filter(
                outlet=outlet,
                source_type='SALE',
            ).filter(je_query).exclude(source_id__in=existing_sale_ids).prefetch_related('lines__ledger').order_by('-date')

            for je in je_qs:
                narration = (je.narration or '').strip()
                # If narration is formatted like "Sale Invoice <inv_no> ..."
                m = re.match(r'^Sale\s+Invoice\s+([^\s]+)', narration, re.IGNORECASE)
                if m:
                    inv_no = m.group(1)
                    rest = narration[m.end():].strip()
                    cust_name = rest if rest else 'Walk-in / Daybook Customer'
                else:
                    parts = narration.split(' ', 1)
                    inv_no = parts[0] if parts else f"SALE-{str(je.id)[:6]}"
                    cust_name = parts[1].strip() if len(parts) > 1 and parts[1].strip() else 'Walk-in / Daybook Customer'

                # If this invoice number matches an existing SaleInvoice or is already in results, skip it!
                if inv_no.lower() in existing_nos or inv_no.lower() in all_sale_nos_lower:
                    continue
                existing_nos.add(inv_no.lower())

                debit_sum = sum(l.debit_amount for l in je.lines.all() if l.debit_amount > 0)
                credit_sum = sum(l.credit_amount for l in je.lines.all() if l.credit_amount > 0)
                grand_total = float(debit_sum if debit_sum > 0 else credit_sum)

                default_gst_rate = 18.0
                for l in je.lines.all():
                    lname = (l.ledger.name or '').upper()
                    if 'GST' in lname or 'TAX' in lname:
                        match = re.search(r'(\d+(?:\.\d+)?)\s*%', lname)
                        if match:
                            found_pct = float(match.group(1))
                            if 'CGST' in lname or 'SGST' in lname:
                                default_gst_rate = found_pct * 2.0
                            else:
                                default_gst_rate = found_pct
                            break

                results.append({
                    'id': str(je.id),
                    'invoiceNo': inv_no,
                    'date': str(je.date),
                    'customerName': cust_name,
                    'customerId': None,
                    'doctorName': None,
                    'hospitalName': '',
                    'grandTotal': grand_total,
                    'isDaybook': True,
                    'defaultGstRate': default_gst_rate,
                    'items': [],
                })
                if len(results) >= 10:
                    break

        return Response({'data': results[:10]})

from django.shortcuts import get_object_or_404

class SaleModificationOptionsView(APIView):
    """
    GET /api/v1/billing/sales/<id>/modification-options/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
             return Response({'detail': 'outletId is required'}, status=400)
             
        from django.core.exceptions import ValidationError
        try:
            invoice = get_object_or_404(SaleInvoice, id=sale_id, outlet_id=outlet_id)
        except ValidationError:
            return Response({'detail': 'Invalid ID'}, status=404)
        user = request.user
        
        is_paid = invoice.amount_paid > 0
        has_returns = invoice.has_return
        is_draft = invoice.amount_paid == 0 and not has_returns
        
        allowed_actions = []
        block_reason = None
        
        from apps.core.permissions import has_bill_revision_permission
        
        if has_bill_revision_permission(user, 'can_modify_draft_bill') and is_draft:
            allowed_actions.append('direct_revise')
            
        if has_bill_revision_permission(user, 'can_modify_unpaid_bill') and invoice.amount_paid == 0:
             allowed_actions.append('commercial_correction')
             
        if has_bill_revision_permission(user, 'can_modify_paid_bill') and is_paid:
             allowed_actions.append('paid_bill_correction')
             
        if has_bill_revision_permission(user, 'can_modify_bill_with_return') and has_returns:
             allowed_actions.append('return_aware_correction')
             
        if has_bill_revision_permission(user, 'can_cancel_and_reissue_bill'):
             allowed_actions.append('cancel_and_reissue')
             
        if has_bill_revision_permission(user, 'can_correct_header_fields'):
             allowed_actions.append('header_correction')
             
        if not allowed_actions:
             block_reason = "You do not have the required permissions to modify this invoice based on its current state."

        return Response({
            'invoice': {
                'id': str(invoice.id),
                'invoiceNo': invoice.invoice_no,
                'date': invoice.invoice_date,
                'customerName': invoice.customer.name if invoice.customer else 'Walk-in',
                'itemCount': invoice.items.count(),
                'grandTotal': str(invoice.grand_total),
                'amountPaid': str(invoice.amount_paid),
                'balanceDue': str(invoice.amount_due),
                'hasReturns': has_returns,
                'isPaid': is_paid,
            },
            'allowedActions': allowed_actions,
            'blockReason': block_reason
        })

from apps.core.permissions import CanViewBillRevisionHistory

class SaleRevisionListView(APIView):
    """
    GET /api/v1/billing/revisions/
    """
    permission_classes = [IsAuthenticated, CanViewBillRevisionHistory]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.audit.models import DocumentRevisionV2
        from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
        
        from django.core.exceptions import ValidationError
        try:
            revisions = DocumentRevisionV2.objects.filter(tenant_id=outlet_id)
        except ValidationError:
            return Response({'detail': 'Invalid outletId'}, status=400)
        
        # Filters
        user_id = request.query_params.get('userId')
        if user_id:
            revisions = revisions.filter(actor_id=user_id)
            
        action_type = request.query_params.get('actionType')
        if action_type:
            revisions = revisions.filter(action=action_type)
            
        from_date = request.query_params.get('fromDate')
        to_date = request.query_params.get('toDate')
        if from_date:
            revisions = revisions.filter(created_at__date__gte=from_date)
        if to_date:
            revisions = revisions.filter(created_at__date__lte=to_date)
            
        invoice_id = request.query_params.get('invoiceId')
        if invoice_id:
            revisions = revisions.filter(object_id=invoice_id)
            
        customer_id = request.query_params.get('customerId')
        if customer_id:
            pass # Filter removed in V2
            
        invoice_no = request.query_params.get('invoiceNo')
        if invoice_no:
            pass # Filter removed in V2

        revisions = revisions.order_by('-created_at')

        # CSV Export
        if request.query_params.get('export') == 'csv':
            import csv
            from django.http import HttpResponse
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="revision_history.csv"'
            writer = csv.writer(response)
            writer.writerow(['Date', 'Revision Number', 'Invoice Number', 'Type', 'Status', 'Modified By', 'Reason Code', 'Reason Text'])
            for rev in revisions:
                writer.writerow([
                    rev.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                    rev.revision_no,
                    str(rev.object_id),
                    rev.action,
                    'Completed',
                    rev.actor_id or 'System',
                    rev.reason_code,
                    rev.reason_text
                ])
            return response

        # Pagination
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        paginator.page_size = int(request.query_params.get('pageSize', 20))
        paginated_revisions = paginator.paginate_queryset(revisions, request)
        
        serializer = DocumentRevisionV2LegacyAdapterSerializer(paginated_revisions, many=True)
        return paginator.get_paginated_response(serializer.data)

class SaleRevisionDetailView(APIView):
    """
    GET /api/v1/billing/sales/<id>/revisions/
    """
    permission_classes = [IsAuthenticated, CanViewBillRevisionHistory]

    def get(self, request, sale_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.billing.models import SaleInvoice
        from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
        
        from django.core.exceptions import ValidationError
        try:
            invoice = get_object_or_404(SaleInvoice, id=sale_id, outlet_id=outlet_id)
        except ValidationError:
            return Response({'detail': 'Invalid ID'}, status=404)
        
        from django.db.models import Q
        revisions = DocumentRevisionV2.objects.filter(
            Q(object_id=sale_id),
            tenant_id=outlet_id
        ).order_by('-created_at')
        
        serializer = DocumentRevisionV2LegacyAdapterSerializer(revisions, many=True)
        return Response({
            'invoice': {
                'id': str(invoice.id),
                'invoiceNo': invoice.invoice_no,
                'createdAt': invoice.created_at,
                'createdBy': invoice.billed_by.name if invoice.billed_by else 'Unknown',
                'isCancelled': invoice.is_cancelled,
                'cancelledAt': invoice.cancelled_at,
            },
            'revisions': serializer.data
        }, status=200)

class SaleRevisionReportView(APIView):
    """
    GET /api/v1/billing/revisions/report/
    """
    permission_classes = [IsAuthenticated, CanViewBillRevisionHistory]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.audit.models import DocumentRevisionV2
        from django.utils import timezone
        from django.db.models import Count
        from datetime import datetime, time
        
        revisions = DocumentRevisionV2.objects.filter(tenant_id=outlet_id)
        
        # Date filter
        from_date_str = request.query_params.get('fromDate')
        to_date_str = request.query_params.get('toDate')
        
        if from_date_str:
            from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
            revisions = revisions.filter(created_at__gte=datetime.combine(from_date, time.min))
        else:
            # Default to last 30 days if no date provided
            from_date = timezone.now() - timezone.timedelta(days=30)
            revisions = revisions.filter(created_at__gte=from_date)
            
        if to_date_str:
            to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            revisions = revisions.filter(created_at__lte=datetime.combine(to_date, time.max))

        # Overall Stats
        today = timezone.now().date()
        today_start = timezone.make_aware(datetime.combine(today, time.min))
        today_end = timezone.make_aware(datetime.combine(today, time.max))
        
        modified_today = revisions.filter(created_at__range=(today_start, today_end)).count()
        total_modified = revisions.count()
        
        # Breakdown by Type
        by_type_qs = revisions.values('action').annotate(count=Count('id')).order_by('-count')
        breakdown_by_type = {item['action']: item['count'] for item in by_type_qs}
        
        # Top modifiers
        top_modifiers_qs = revisions.values(
            'actor_id'
        ).annotate(count=Count('id')).order_by('-count')[:5]
        
        top_modifiers = [
            {
                'id': item['actor_id'],
                'name': 'User',
                'count': item['count']
            } for item in top_modifiers_qs
        ]
        
        return Response({
            'summary': {
                'modifiedToday': modified_today,
                'totalModified': total_modified,
                'returnLinked': breakdown_by_type.get('return_aware_correction', 0),
                'paidBillCorrections': breakdown_by_type.get('paid_bill_correction', 0),
                'cancelAndReissue': breakdown_by_type.get('cancel_and_reissue', 0),
                'commercialCorrections': breakdown_by_type.get('commercial_correction', 0),
                'directRevise': breakdown_by_type.get('direct_revise', 0),
            },
            'topModifiers': top_modifiers
        })


from rest_framework import generics
from apps.billing.models import DraftInvoice
from apps.billing.serializers import DraftInvoiceSerializer

class DraftInvoiceListCreateView(generics.ListCreateAPIView):
    serializer_class = DraftInvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        outlet_id = self.request.query_params.get('outletId')
        if not outlet_id:
            return DraftInvoice.objects.none()
        return DraftInvoice.objects.filter(outlet_id=outlet_id)

    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

class DraftInvoiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = DraftInvoice.objects.all()
    serializer_class = DraftInvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        outlet_id = self.request.query_params.get('outletId')
        if outlet_id:
            return DraftInvoice.objects.filter(outlet_id=outlet_id)
        return super().get_queryset()
