import logging
from decimal import Decimal
from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated, IsManagerOrAbove, CanCreatePurchases, CanEditPurchaseInvoice, CanAccessPurchases
from rest_framework import status
from django.db.models import Q
from django.db import transaction

from apps.purchases.models import Distributor, PurchaseInvoice
from apps.billing.models import LedgerEntry, PaymentEntry, PaymentAllocation
from apps.accounts.models import Ledger, JournalLine
from apps.core.models import Outlet
from apps.purchases.services import atomic_purchase_save, PurchaseServiceError, bill_by_bill_payment_allocate, OverpaymentError

logger = logging.getLogger(__name__)


class DistributorListView(APIView):
    """
    GET /api/v1/purchases/distributors/?outletId=xxx

    List all active distributors for an outlet.
    Returns list of distributor profiles with credit terms.
    """

    permission_classes = [CanAccessPurchases]

    def get(self, request, *args, **kwargs):
        """
        Get list of distributors.

        Query parameters:
        - outletId: Outlet UUID to filter distributors

        Returns:
        [
            {
                "id": "...",
                "name": "...",
                "gstin": "...",
                "phone": "...",
                "email": "...",
                "address": "...",
                "city": "...",
                "state": "...",
                "creditDays": 30,
                "openingBalance": 0,
                "balanceType": "CR",
                "isActive": true,
                "createdAt": "2026-03-17T..."
            }
        ]
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

        logger.info(f"Fetching distributors for outlet: {outlet.name}")

        # Get all active distributors for this outlet
        distributors = Distributor.objects.filter(
            outlet=outlet,
            is_active=True
        ).order_by('name')

        logger.info(f"Found {distributors.count()} active distributors")

        # Pre-fetch linked ledger balances in one query
        ledger_map = {
            ledger.linked_distributor_id: ledger
            for ledger in Ledger.objects.filter(
                outlet=outlet,
                linked_distributor__in=distributors,
            )
        }

        # Serialize distributors
        results = []
        for distributor in distributors:
            linked_ledger = ledger_map.get(distributor.id)
            current_balance = float(linked_ledger.current_balance) if linked_ledger else float(distributor.opening_balance or 0)
            result = {
                'id': str(distributor.id),
                'name': distributor.name,
                'gstin': distributor.gstin,
                'drugLicenseNo': distributor.drug_license_no,
                'foodLicenseNo': distributor.food_license_no,
                'phone': distributor.phone,
                'email': distributor.email,
                'address': distributor.address,
                'city': distributor.city,
                'state': distributor.state,
                'creditDays': distributor.credit_days,
                'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
                'currentBalance': current_balance,
                'balanceType': distributor.balance_type,
                'isActive': distributor.is_active,
                'createdAt': distributor.created_at.isoformat(),
            }
            results.append(result)

        return Response(results, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        """Create a new distributor."""
        outlet_id = request.data.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        try:
            with transaction.atomic():
                distributor = Distributor.objects.create(
                    outlet=outlet,
                    name=request.data.get('name'),
                    gstin=request.data.get('gstin'),
                    drug_license_no=request.data.get('drugLicenseNo'),
                    food_license_no=request.data.get('foodLicenseNo'),
                    phone=request.data.get('phone', ''),
                    email=request.data.get('email'),
                    address=request.data.get('address', ''),
                    city=request.data.get('city', ''),
                    state=request.data.get('state', ''),
                    credit_days=request.data.get('creditDays', 0),
                    opening_balance=Decimal(str(request.data.get('openingBalance', 0))),
                    balance_type=request.data.get('balanceType', 'CR'),
                    is_active=True,
                )

                # Auto-create the linked Sundry Creditor ledger so the distributor
                # appears in LedgerPicker immediately and ledger.state is synced.
                from apps.accounts.models import LedgerGroup
                sc_group = LedgerGroup.objects.filter(outlet=outlet, name='Sundry Creditors').first()
                if sc_group:
                    Ledger.objects.get_or_create(
                        outlet=outlet,
                        linked_distributor=distributor,
                        defaults={
                            'name': distributor.name,
                            'group': sc_group,
                            'phone': distributor.phone or '',
                            'gstin': distributor.gstin or '',
                            'address': distributor.address or '',
                            'state': distributor.state or '',
                        },
                    )
        except Exception as e:
            logger.warning('Could not auto-create ledger for distributor: %s', e)
            return Response(
                {'error': {'code': 'LEDGER_CREATION_FAILED', 'message': f'Failed to setup distributor ledger: {str(e)}'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info(f"Created distributor {distributor.id} ({distributor.name})")

        result = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'drugLicenseNo': distributor.drug_license_no,
            'foodLicenseNo': distributor.food_license_no,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
            'createdAt': distributor.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_201_CREATED)

class DistributorDetailView(APIView):
    """
    GET /api/v1/purchases/distributors/{id}/?outletId=xxx

    Get distributor details by ID.
    """

    permission_classes = [CanAccessPurchases]

    def get(self, request, distributor_id, *args, **kwargs):
        """Get distributor details."""
        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response(
                {'detail': f'Distributor {distributor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'drugLicenseNo': distributor.drug_license_no,
            'foodLicenseNo': distributor.food_license_no,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
            'createdAt': distributor.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)

    def put(self, request, distributor_id, *args, **kwargs):
        """Update distributor details."""
        outlet_id = request.data.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response(
                {'detail': f'Distributor {distributor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update allowed fields
        allowed_fields = [
            'name', 'gstin', 'drug_license_no', 'food_license_no', 'phone', 'email',
            'address', 'city', 'state', 'credit_days', 'opening_balance', 'balance_type', 'is_active'
        ]

        for field in allowed_fields:
            camel_field = {
                'drug_license_no': 'drugLicenseNo',
                'food_license_no': 'foodLicenseNo',
                'credit_days': 'creditDays',
                'opening_balance': 'openingBalance',
                'balance_type': 'balanceType',
                'is_active': 'isActive'
            }.get(field, field)

            if camel_field in request.data:
                val = request.data[camel_field]
                if field == 'opening_balance':
                    val = Decimal(str(val))
                setattr(distributor, field, val)

        distributor.save()

        # Sync state to the linked Ledger so LedgerPicker always has fresh state
        Ledger.objects.filter(outlet=outlet, linked_distributor=distributor).update(
            state=distributor.state or ''
        )

        logger.info(f"Updated distributor {distributor_id}")

        result = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'drugLicenseNo': distributor.drug_license_no,
            'foodLicenseNo': distributor.food_license_no,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
            'createdAt': distributor.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)


class DistributorLedgerView(APIView):
    """
    GET /api/v1/purchases/distributors/{id}/ledger/?outletId=xxx

    Get distributor ledger entries with running balance.
    Returns list of all debit/credit entries for the distributor.
    """

    permission_classes = [CanAccessPurchases]

    def get(self, request, distributor_id, *args, **kwargs):
        """
        Get distributor ledger.

        Query parameters:
        - outletId: Outlet UUID to filter ledger

        Returns:
        {
            "distributor": {...},
            "ledger": [
                {
                    "id": "...",
                    "date": "2026-03-17",
                    "entryType": "purchase",
                    "referenceNo": "PU-001",
                    "description": "Purchase invoice",
                    "debit": 5000.0,
                    "credit": 0,
                    "runningBalance": 5000.0,
                    "createdAt": "2026-03-17T..."
                }
            ],
            "summary": {
                "totalDebit": 50000.0,
                "totalCredit": 10000.0,
                "runningBalance": 40000.0
            }
        }
        """

        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response(
                {'detail': f'Distributor {distributor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching ledger for distributor: {distributor.name}")

        # Find the accounts.Ledger linked to this distributor (created by partyLedgerId flow)
        linked_ledger = Ledger.objects.filter(
            outlet=outlet,
            linked_distributor=distributor
        ).first()

        entries = []
        opening_balance = 0.0
        closing_balance = 0.0

        if linked_ledger:
            opening_balance = float(linked_ledger.opening_balance)
            closing_balance = float(linked_ledger.current_balance)

            SOURCE_TYPE_MAP = {
                'PURCHASE': 'purchase',
                'VOUCHER': 'payment',
                'SALE': 'sale',
                'RETURN': 'debit_note',
                'CREDIT_PAYMENT': 'payment',
            }

            lines = (
                JournalLine.objects
                .filter(ledger=linked_ledger)
                .select_related('journal_entry')
                .order_by('journal_entry__date', 'journal_entry__created_at')
            )

            running = opening_balance
            for line in lines:
                je = line.journal_entry
                debit = float(line.debit_amount)
                credit = float(line.credit_amount)
                running = running + credit - debit  # creditor: credit ↑ balance, debit ↓ balance
                entries.append({
                    'id': str(line.id),
                    'date': str(je.date),
                    'entryType': SOURCE_TYPE_MAP.get(je.source_type, 'purchase'),
                    'referenceNo': '',
                    'description': je.narration,
                    'debit': debit,
                    'credit': credit,
                    'balance': round(running, 2),
                })

        distributor_data = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
        }

        result = {
            'distributor': distributor_data,
            'entries': entries,
            'openingBalance': opening_balance,
            'closingBalance': closing_balance,
        }

        return Response(result, status=status.HTTP_200_OK)


class PurchaseCreateView(APIView):
    """
    POST /api/v1/purchases/

    Create a new purchase invoice with items, batch creation/merging, and ledger entry.
    All operations are wrapped in transaction.atomic() — full rollback on any failure.

    Request body: CreatePurchasePayload
    Response: PurchaseInvoiceFull (201 Created) or error (400/404/500)
    """

    permission_classes = [CanCreatePurchases]

    def post(self, request, *args, **kwargs):
        """
        Create a new purchase invoice.

        Request body:
        {
            "outletId": "...",
            "distributorId": "...",
            "purchaseType": "cash" | "credit",
            "invoiceNo": "...",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "purchaseOrderRef": "...",
            "godown": "main",
            "freight": 0,
            "notes": "...",
            "subtotal": 10000,
            "discountAmount": 0,
            "taxableAmount": 10000,
            "gstAmount": 1800,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 11800,
            "items": [
                {
                    "masterProductId": "...",
                    "customProductName": null,
                    "isCustomProduct": false,
                    "hsnCode": "...",
                    "batchNo": "...",
                    "expiryDate": "2026-12-31",
                    "pkg": 10,
                    "qty": 10,
                    "actualQty": 100,
                    "freeQty": 0,
                    "purchaseRate": 100,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 18,
                    "cess": 0,
                    "mrp": 150,
                    "ptr": 125,
                    "pts": 110,
                    "saleRate": 140,
                    "taxableAmount": 1000,
                    "gstAmount": 180,
                    "cessAmount": 0,
                    "totalAmount": 1180
                }
            ]
        }

        Returns:
        {
            "id": "...",
            "outletId": "...",
            "distributorId": "...",
            "distributor": {...},
            "invoiceNo": "...",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "purchaseType": "credit",
            "purchaseOrderRef": "...",
            "godown": "main",
            "subtotal": 10000,
            "discountAmount": 0,
            "taxableAmount": 10000,
            "gstAmount": 1800,
            "cessAmount": 0,
            "freight": 0,
            "roundOff": 0,
            "grandTotal": 11800,
            "amountPaid": 0,
            "outstanding": 11800,
            "items": [...],
            "createdByName": "...",
            "createdAt": "2026-03-17T..."
        }
        """

        try:
            payload = request.data
            outlet_id = payload.get('outletId')
            created_by_id = request.user.id  # From JWT token

            # Validate outlet exists
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Incoming Purchase Payload: {payload}")
            logger.info(f"Creating purchase for outlet {outlet.name}")

            # Call atomic_purchase_save service (wraps entire transaction)
            purchase_invoice = atomic_purchase_save(payload, outlet_id, created_by_id)

            logger.info(f"Created PurchaseInvoice {purchase_invoice.invoice_no}")

            # Serialize response matching PurchaseInvoiceFull shape
            result = self._serialize_purchase_full(purchase_invoice)
            return Response(result, status=status.HTTP_201_CREATED)

        except PurchaseServiceError as e:
            logger.warning(f"Purchase service error: {str(e)}")
            return Response(
                {'error': {'code': 'PURCHASE_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error creating purchase: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to create purchase'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_purchase_full(self, purchase_invoice):
        """Serialize PurchaseInvoice to PurchaseInvoiceFull response shape."""
        dist_data = None
        if purchase_invoice.distributor:
            dist_data = {
                'id': str(purchase_invoice.distributor.id),
                'name': purchase_invoice.distributor.name,
                'gstin': purchase_invoice.distributor.gstin,
                'drugLicenseNo': purchase_invoice.distributor.drug_license_no,
                'phone': purchase_invoice.distributor.phone,
                'email': purchase_invoice.distributor.email,
                'address': purchase_invoice.distributor.address,
                'city': purchase_invoice.distributor.city,
                'state': purchase_invoice.distributor.state,
                'creditDays': purchase_invoice.distributor.credit_days,
                'openingBalance': float(purchase_invoice.distributor.opening_balance) if purchase_invoice.distributor.opening_balance else 0,
                'balanceType': purchase_invoice.distributor.balance_type,
                'isActive': purchase_invoice.distributor.is_active,
                'createdAt': purchase_invoice.distributor.created_at.isoformat(),
            }

        return {
            'id': str(purchase_invoice.id),
            'outletId': str(purchase_invoice.outlet_id),
            'distributorId': str(purchase_invoice.distributor_id) if purchase_invoice.distributor_id else None,
            'distributor': dist_data,
            'invoiceNo': purchase_invoice.invoice_no,
            'invoiceDate': purchase_invoice.invoice_date.isoformat() if purchase_invoice.invoice_date else None,
            'dueDate': purchase_invoice.due_date.isoformat() if purchase_invoice.due_date else None,
            'purchaseType': purchase_invoice.purchase_type,
            'purchaseOrderRef': purchase_invoice.purchase_order_ref,
            'godown': purchase_invoice.godown,
            'subtotal': float(purchase_invoice.subtotal),
            'discountAmount': float(purchase_invoice.discount_amount),
            'invoiceDiscount': float(purchase_invoice.invoice_discount),
            'taxableAmount': float(purchase_invoice.taxable_amount),
            'gstAmount': float(purchase_invoice.gst_amount),
            'cessAmount': float(purchase_invoice.cess_amount),
            'freight': float(purchase_invoice.freight),
            'roundOff': float(purchase_invoice.round_off),
            'ledgerAdjustment': float(purchase_invoice.ledger_adjustment),
            'ledgerNote': purchase_invoice.ledger_note or '',
            'grandTotal': float(purchase_invoice.grand_total),
            'amountPaid': float(purchase_invoice.amount_paid),
            'outstanding': float(purchase_invoice.outstanding),
            'items': [self._serialize_purchase_item(item) for item in purchase_invoice.items.all()],
            'createdByName': purchase_invoice.created_by.name if purchase_invoice.created_by else 'Unknown',
            'notes': purchase_invoice.notes,
            'status': purchase_invoice.status,
            'createdAt': purchase_invoice.created_at.isoformat(),
        }

    def _serialize_purchase_item(self, item):
        """Serialize PurchaseItem to response shape."""
        return {
            'id': str(item.id),
            'purchaseId': str(item.invoice_id),
            'masterProductId': str(item.master_product_id) if item.master_product_id else None,
            'customProductName': item.custom_product_name,
            'isCustomProduct': item.is_custom_product,
            'hsnCode': item.hsn_code,
            'batchNo': item.batch_no,
            'expiryDate': item.expiry_date.isoformat(),
            # Use item.pkg (frozen at purchase time) NOT master_product.pack_size
            # which changes when the master product template is edited later.
            'pkg': item.pkg or 1,
            'packUnitLabel': item.master_product.pack_unit if item.master_product else '',
            'qty': item.qty,
            'actualQty': item.actual_qty,
            'freeQty': item.free_qty,
            'purchaseRate': float(item.purchase_rate),
            'discountPct': float(item.discount_pct),
            'cashDiscountPct': float(item.cash_discount_pct),
            'gstRate': float(item.gst_rate),
            'cess': float(item.cess),
            'mrp': float(item.mrp),
            'ptr': float(item.ptr),
            'pts': float(item.pts),
            'taxableAmount': float(item.taxable_amount),
            'gstAmount': float(item.gst_amount),
            'cessAmount': float(item.cess_amount),
            'totalAmount': float(item.total_amount),
        }


class PurchaseListView(APIView):
    """
    GET /api/v1/purchases/?outletId=xxx

    List purchase invoices for an outlet with pagination and filtering.
    Ordered newest first (-invoice_date, -created_at).

    Query parameters:
    - outletId: Outlet UUID (required)
    - distributorId: Filter by distributor (optional)
    - startDate: Filter purchases >= startDate (yyyy-MM-dd, optional)
    - endDate: Filter purchases <= endDate (yyyy-MM-dd, optional)
    - page: Page number (default 1)
    - pageSize: Items per page (default 50, max 100)

    Response: PaginatedResponse<PurchaseInvoice>
    """

    permission_classes = [CanAccessPurchases]

    def get(self, request, *args, **kwargs):
        """
        Get paginated list of purchase invoices.

        Query parameters:
        - outletId: Required
        - distributorId: Optional
        - startDate: Optional (yyyy-MM-dd)
        - endDate: Optional (yyyy-MM-dd)
        - page: Default 1
        - pageSize: Default 50, max 100

        Returns:
        {
            "data": [
                {
                    "id": "...",
                    "outletId": "...",
                    "distributorId": "...",
                    "distributor": {...},
                    "invoiceNo": "...",
                    "invoiceDate": "2026-03-17",
                    "dueDate": "2026-04-16",
                    "subtotal": 10000,
                    "discountAmount": 0,
                    "taxableAmount": 10000,
                    "gstAmount": 1800,
                    "cessAmount": 0,
                    "freight": 0,
                    "roundOff": 0,
                    "grandTotal": 11800,
                    "amountPaid": 0,
                    "outstanding": 11800,
                    "createdAt": "2026-03-17T..."
                }
            ],
            "pagination": {
                "page": 1,
                "pageSize": 50,
                "totalPages": 1,
                "totalRecords": 5
            }
        }
        """

        try:
            outlet_id = request.query_params.get('outletId')

            # Validate outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Fetching purchases for outlet {outlet.name}")

            # Start with all invoices for this outlet
            queryset = PurchaseInvoice.objects.filter(outlet=outlet).select_related('distributor')

            # Filter by distributor if provided
            distributor_id = request.query_params.get('distributorId')
            if distributor_id:
                queryset = queryset.filter(distributor_id=distributor_id)
                logger.info(f"Filtered by distributor {distributor_id}")

            # Filter by date range if provided
            start_date = request.query_params.get('startDate')
            end_date = request.query_params.get('endDate')

            if start_date:
                try:
                    start_dt = datetime.fromisoformat(start_date).date()
                    queryset = queryset.filter(invoice_date__gte=start_dt)
                    logger.info(f"Filtered from {start_date}")
                except (ValueError, TypeError):
                    logger.warning(f"Invalid startDate format: {start_date}")

            if end_date:
                try:
                    end_dt = datetime.fromisoformat(end_date).date()
                    queryset = queryset.filter(invoice_date__lte=end_dt)
                    logger.info(f"Filtered to {end_date}")
                except (ValueError, TypeError):
                    logger.warning(f"Invalid endDate format: {end_date}")

            # Filter by status if provided
            status_filter = request.query_params.get('status')
            if status_filter == 'draft':
                queryset = queryset.filter(status='SAVED')
            else:
                # Exclude drafts from all other views
                queryset = queryset.exclude(status='SAVED')
                
                if status_filter and status_filter != 'all':
                    today = datetime.now().date()
                    if status_filter == 'paid':
                        queryset = queryset.filter(outstanding__lte=0, status='POSTED')
                    elif status_filter == 'overdue':
                        queryset = queryset.filter(outstanding__gt=0, due_date__lt=today, status='POSTED')
                    elif status_filter == 'partial':
                        # Not paid, not overdue, has some amount paid
                        queryset = queryset.filter(outstanding__gt=0, amount_paid__gt=0, status='POSTED').filter(
                            Q(due_date__isnull=True) | Q(due_date__gte=today)
                        )
                    elif status_filter == 'unpaid':
                        # Not paid, not overdue, zero amount paid
                        queryset = queryset.filter(outstanding__gt=0, amount_paid__lte=0, status='POSTED').filter(
                            Q(due_date__isnull=True) | Q(due_date__gte=today)
                        )
                    logger.info(f"Filtered by status {status_filter}")

            # Filter by search if provided
            search_query = request.query_params.get('search')
            if search_query:
                queryset = queryset.filter(
                    Q(invoice_no__icontains=search_query) |
                    Q(distributor__name__icontains=search_query)
                )

            # Order by newest first
            queryset = queryset.order_by('-invoice_date', '-created_at')

            # Pagination
            page = int(request.query_params.get('page', 1))
            page_size = min(int(request.query_params.get('pageSize', 50)), 100)

            total_records = queryset.count()
            total_pages = (total_records + page_size - 1) // page_size
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            invoices = queryset[start_idx:end_idx]

            logger.info(f"Returning {len(invoices)} invoices (page {page}/{total_pages}, total {total_records})")

            # Serialize invoices
            data = [self._serialize_purchase(inv) for inv in invoices]

            result = {
                'data': data,
                'pagination': {
                    'page': page,
                    'pageSize': page_size,
                    'totalPages': total_pages,
                    'totalRecords': total_records,
                }
            }

            return Response(result, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error fetching purchase list: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to fetch purchase list'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_purchase(self, purchase_invoice):
        """Serialize PurchaseInvoice (without items) to response shape."""
        dist_data = None
        if purchase_invoice.distributor:
            dist_data = {
                'id': str(purchase_invoice.distributor.id),
                'name': purchase_invoice.distributor.name,
                'gstin': purchase_invoice.distributor.gstin,
                'phone': purchase_invoice.distributor.phone,
                'email': purchase_invoice.distributor.email,
                'address': purchase_invoice.distributor.address,
                'city': purchase_invoice.distributor.city,
                'state': purchase_invoice.distributor.state,
                'creditDays': purchase_invoice.distributor.credit_days,
                'openingBalance': float(purchase_invoice.distributor.opening_balance) if purchase_invoice.distributor.opening_balance else 0,
                'balanceType': purchase_invoice.distributor.balance_type,
                'isActive': purchase_invoice.distributor.is_active,
                'createdAt': purchase_invoice.distributor.created_at.isoformat(),
            }

        data = {
            'id': str(purchase_invoice.id),
            'outletId': str(purchase_invoice.outlet_id),
            'distributorId': str(purchase_invoice.distributor_id) if purchase_invoice.distributor_id else None,
            'distributor': dist_data,
            'invoiceNo': purchase_invoice.invoice_no,
            'invoiceDate': purchase_invoice.invoice_date.isoformat() if purchase_invoice.invoice_date else None,
            'dueDate': purchase_invoice.due_date.isoformat() if purchase_invoice.due_date else None,
            'subtotal': float(purchase_invoice.subtotal),
            'discountAmount': float(purchase_invoice.discount_amount),
            'invoiceDiscount': float(purchase_invoice.invoice_discount),
            'taxableAmount': float(purchase_invoice.taxable_amount),
            'gstAmount': float(purchase_invoice.gst_amount),
            'cessAmount': float(purchase_invoice.cess_amount),
            'freight': float(purchase_invoice.freight),
            'roundOff': float(purchase_invoice.round_off),
            'ledgerAdjustment': float(purchase_invoice.ledger_adjustment),
            'ledgerNote': purchase_invoice.ledger_note or '',
            'grandTotal': float(purchase_invoice.grand_total),
            'amountPaid': float(purchase_invoice.amount_paid),
            'outstanding': float(purchase_invoice.outstanding),
            'status': purchase_invoice.status,
            'createdAt': purchase_invoice.created_at.isoformat(),
        }
        
        if purchase_invoice.status == 'SAVED' and hasattr(purchase_invoice, 'ocr_data') and purchase_invoice.ocr_data:
            data['ocrData'] = purchase_invoice.ocr_data
            
        return data


class DistributorPaymentView(APIView):
    """
    POST /api/v1/purchases/payments/but 

    Record a payment to a distributor with bill-by-bill allocation.
    All operations wrapped in transaction.atomic() — full rollback on any failure.

    Request body: CreatePaymentPayload
    Response: PaymentEntry (201 Created) or error (400/404/500)
    """

    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data
            outlet_id = request.query_params.get('outletId') or payload.get('outletId')
            created_by_id = request.user.id  # From JWT token

            # Validate outlet exists
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Recording payment for outlet {outlet.name}")

            # Call bill_by_bill_payment_allocate service (wraps entire transaction)
            payment_entry = bill_by_bill_payment_allocate(payload, outlet_id, created_by_id)

            logger.info(f"Created PaymentEntry {payment_entry.id}")

            # Serialize response matching PaymentEntry shape
            result = self._serialize_payment_entry(payment_entry)
            return Response(result, status=status.HTTP_201_CREATED)

        except OverpaymentError as e:
            logger.warning(f"Overpayment error: {str(e)}")
            return Response(
                {'error': {'code': 'OVERPAYMENT_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except PurchaseServiceError as e:
            logger.warning(f"Purchase service error: {str(e)}")
            return Response(
                {'error': {'code': 'PAYMENT_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error recording payment: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to record payment'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_payment_entry(self, payment_entry):
        """Serialize PaymentEntry to response shape."""
        return {
            'id': str(payment_entry.id),
            'outletId': str(payment_entry.outlet_id),
            'distributorId': str(payment_entry.distributor_id),
            'distributor': {
                'id': str(payment_entry.distributor.id),
                'name': payment_entry.distributor.name,
                'gstin': payment_entry.distributor.gstin,
                'drugLicenseNo': payment_entry.distributor.drug_license_no,
                'phone': payment_entry.distributor.phone,
                'email': payment_entry.distributor.email,
                'address': payment_entry.distributor.address,
                'city': payment_entry.distributor.city,
                'state': payment_entry.distributor.state,
                'creditDays': payment_entry.distributor.credit_days,
                'openingBalance': float(payment_entry.distributor.opening_balance) if payment_entry.distributor.opening_balance else 0,
                'balanceType': payment_entry.distributor.balance_type,
                'isActive': payment_entry.distributor.is_active,
                'createdAt': payment_entry.distributor.created_at.isoformat(),
            },
            'date': payment_entry.date.isoformat(),
            'totalAmount': float(payment_entry.total_amount),
            'paymentMode': payment_entry.payment_mode,
            'referenceNo': payment_entry.reference_no,
            'notes': payment_entry.notes,
            'allocations': [self._serialize_allocation(alloc) for alloc in payment_entry.allocations.all()],
            'createdBy': payment_entry.created_by.id if payment_entry.created_by else None,
            'createdAt': payment_entry.created_at.isoformat(),
        }

    def _serialize_allocation(self, allocation):
        """Serialize PaymentAllocation to response shape."""
        return {
            'purchaseInvoiceId': str(allocation.invoice_id),
            'invoiceNo': allocation.invoice_no,
            'invoiceDate': allocation.invoice_date.isoformat(),
            'invoiceTotal': float(allocation.invoice_total),
            'currentOutstanding': float(allocation.current_outstanding),
            'allocatedAmount': float(allocation.allocated_amount),
        }

class PurchaseDetailView(APIView):
    """
    GET /api/v1/purchases/{id}/
    
    Get details of a specific purchase invoice, including its items.
    """
    
    def get_permissions(self):
        if self.request.method == 'PUT':
            return [CanEditPurchaseInvoice()]
        return [IsAuthenticated()]

    def get(self, request, purchase_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        try:
            # Prefetch distributor for full response shape
            invoice = PurchaseInvoice.objects.select_related('distributor', 'created_by').prefetch_related('items', 'items__master_product').get(id=purchase_id, outlet=outlet)
        except PurchaseInvoice.DoesNotExist:
            return Response(
                {'detail': f'Purchase invoice {purchase_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Resolve the party ledger linked to this distributor
        from apps.accounts.models import Ledger as AccountsLedger
        party_ledger = AccountsLedger.objects.filter(
            outlet=outlet,
            linked_distributor=invoice.distributor
        ).first()
            
        result = {
            'id': str(invoice.id),
            'outletId': str(invoice.outlet_id),
            'distributorId': str(invoice.distributor_id),
            'partyLedgerId': str(party_ledger.id) if party_ledger else None,
            'partyLedger': {
                'id': str(party_ledger.id),
                'name': party_ledger.name,
                'group': party_ledger.group.name if party_ledger.group else None,
                'currentBalance': float(party_ledger.current_balance),
                'state': party_ledger.state or '',
            } if party_ledger else None,
            'distributor': {
                'id': str(invoice.distributor.id),
                'name': invoice.distributor.name,
                'gstin': invoice.distributor.gstin,
                'drugLicenseNo': invoice.distributor.drug_license_no,
                'phone': invoice.distributor.phone,
                'email': invoice.distributor.email,
                'address': invoice.distributor.address,
                'city': invoice.distributor.city,
                'state': invoice.distributor.state,
                'creditDays': invoice.distributor.credit_days,
                'openingBalance': float(invoice.distributor.opening_balance) if invoice.distributor.opening_balance else 0,
                'balanceType': invoice.distributor.balance_type,
                'isActive': invoice.distributor.is_active,
                'createdAt': invoice.distributor.created_at.isoformat(),
            },
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat(),
            'dueDate': invoice.due_date.isoformat() if invoice.due_date else None,
            'purchaseType': invoice.purchase_type,
            'purchaseOrderRef': invoice.purchase_order_ref,
            'godown': invoice.godown,
            'subtotal': float(invoice.subtotal),
            'discountAmount': float(invoice.discount_amount),
            'invoiceDiscount': float(invoice.invoice_discount),
            'taxableAmount': float(invoice.taxable_amount),
            'gstAmount': float(invoice.gst_amount),
            'cessAmount': float(invoice.cess_amount),
            'freight': float(invoice.freight),
            'roundOff': float(invoice.round_off),
            'ledgerAdjustment': float(invoice.ledger_adjustment),
            'ledgerNote': invoice.ledger_note or '',
            'grandTotal': float(invoice.grand_total),
            'amountPaid': float(invoice.amount_paid),
            'outstanding': float(invoice.outstanding),
            'items': [
                {
                    'id': str(item.id),
                    'purchaseId': str(item.invoice_id),
                    'masterProductId': str(item.master_product_id) if item.master_product_id else None,
                    'product': {
                        'id': str(item.master_product.id),
                        'name': item.master_product.name,
                        'packSize': item.master_product.pack_size,
                        'packUnit': item.master_product.pack_unit,
                    } if item.master_product else None,
                    'customProductName': item.custom_product_name,
                    'isCustomProduct': item.is_custom_product,
                    'hsnCode': item.hsn_code,
                    'batchNo': item.batch_no,
                    'expiryDate': item.expiry_date.isoformat(),
                    'pkg': item.pkg,
                    'qty': item.qty,
                    'actualQty': item.actual_qty,
                    'freeQty': item.free_qty,
                    'purchaseRate': float(item.purchase_rate),
                    'discountPct': float(item.discount_pct),
                    'cashDiscountPct': float(item.cash_discount_pct),
                    'gstRate': float(item.gst_rate),
                    'cess': float(item.cess),
                    'mrp': float(item.mrp),
                    'ptr': float(item.ptr),
                    'pts': float(item.pts),
                    'taxableAmount': float(item.taxable_amount),
                    'gstAmount': float(item.gst_amount),
                    'cessAmount': float(item.cess_amount),
                    'totalAmount': float(item.total_amount),
                } for item in invoice.items.all()
            ],
            'createdByName': invoice.created_by.name if invoice.created_by else 'Unknown',
            'notes': invoice.notes,
            'createdAt': invoice.created_at.isoformat(),
        }
        
        return Response(result, status=status.HTTP_200_OK)

    def put(self, request, purchase_id, *args, **kwargs):
        """Update an existing purchase invoice."""
        if request.user.role not in ('super_admin', 'admin') and not getattr(request.user, 'can_edit_purchases', False):
            return Response({'error': {'code': 'FORBIDDEN', 'message': 'You do not have permission to edit purchases.'}}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            payload = request.data
            outlet_id = payload.get('outletId')
            created_by_id = request.user.id

            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Updating purchase {purchase_id} for outlet {outlet.name}")

            from apps.purchases.services import atomic_purchase_update, PurchaseServiceError
            purchase_invoice = atomic_purchase_update(purchase_id, payload, outlet_id, created_by_id)

            logger.info(f"Updated PurchaseInvoice {purchase_invoice.invoice_no}")
            
            return Response({'message': 'Purchase invoice updated successfully', 'id': str(purchase_invoice.id)}, status=status.HTTP_200_OK)

        except PurchaseServiceError as e:
            logger.warning(f"Purchase service error: {str(e)}")
            return Response(
                {'error': {'code': 'PURCHASE_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error updating purchase: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to update purchase'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def delete(self, request, purchase_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            invoice = PurchaseInvoice.objects.get(id=purchase_id, outlet_id=outlet_id)
        except PurchaseInvoice.DoesNotExist:
            return Response({'error': {'message': 'Purchase invoice not found'}}, status=status.HTTP_404_NOT_FOUND)

        if invoice.status != 'SAVED':
            return Response({'error': {'message': 'Only draft invoices can be deleted'}}, status=status.HTTP_400_BAD_REQUEST)

        invoice.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PaymentListView(APIView):
    """
    GET /api/v1/purchases/payments/?distributorId=&from=&to=
    Lists PaymentEntry records for an outlet with optional filters.
    """
    permission_classes = [CanAccessPurchases]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = PaymentEntry.objects.filter(outlet=outlet)

        distributor_id = request.query_params.get('distributorId')
        if distributor_id:
            qs = qs.filter(distributor_id=distributor_id)

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
        for p in qs.select_related('distributor').order_by('-date', '-created_at'):
            data.append({
                'id': str(p.id),
                'distributorId': str(p.distributor_id),
                'distributorName': p.distributor.name,
                'date': p.date.isoformat(),
                'totalAmount': float(p.total_amount),
                'paymentMode': p.payment_mode,
                'referenceNo': p.reference_no,
                'notes': p.notes,
                'createdAt': p.created_at.isoformat(),
            })

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class DistributorOutstandingView(APIView):
    """
    GET /api/v1/purchases/distributors/{pk}/outstanding/
    Returns all unpaid PurchaseInvoices for a distributor.
    """
    permission_classes = [CanAccessPurchases]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            distributor = Distributor.objects.get(id=pk, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response({'detail': 'Distributor not found'}, status=status.HTTP_404_NOT_FOUND)

        today = datetime.now().date()
        invoices = PurchaseInvoice.objects.filter(
            outlet=outlet, distributor=distributor, outstanding__gt=0
        ).order_by('due_date')

        data = []
        for inv in invoices:
            days_past = (today - inv.due_date).days if inv.due_date and inv.due_date < today else 0
            data.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'invoiceDate': inv.invoice_date.isoformat(),
                'dueDate': inv.due_date.isoformat() if inv.due_date else None,
                'grandTotal': float(inv.grand_total),
                'amountPaid': float(inv.amount_paid),
                'outstanding': float(inv.outstanding),
                'isOverdue': inv.due_date is not None and inv.due_date < today,
                'daysPastDue': max(0, days_past),
            })

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class PurchaseInvoiceSearchView(APIView):
    """GET /api/v1/purchases/invoices/search/?outletId=xxx&q=INV-001"""
    permission_classes = [CanAccessPurchases]

    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        q = request.query_params.get('q', '').strip()
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        qs = PurchaseInvoice.objects.filter(outlet=outlet).select_related('distributor').prefetch_related('items')
        if q:
            qs = qs.filter(
                Q(invoice_no__icontains=q) | Q(distributor__name__icontains=q)
            )
        qs = qs.order_by('-invoice_date')[:20]

        results = []
        for inv in qs:
            items = []
            # Calculate total of all items' exact amounts
            raw_items_total = sum(float(item.total_amount) for item in inv.items.all())
            grand_total = float(inv.grand_total)
            ratio = grand_total / raw_items_total if raw_items_total > 0 else 1.0

            for item in inv.items.all():
                product_name = item.master_product.name if item.master_product else (item.custom_product_name or 'Unknown')
                
                # Apportion bill-level adjustments (freight, ledger_adjustment, round_off) to item rate
                effective_taxable = float(item.taxable_amount) * ratio
                effective_rate = effective_taxable / item.qty if item.qty > 0 else 0.0
                
                items.append({
                    'productName': product_name,
                    'batchId': str(item.batch_id),
                    'batchNo': item.batch_no,
                    'expiry': str(item.expiry_date),
                    'qty': item.qty,
                    'availableQty': item.batch.qty_strips if item.batch else 0,
                    'rate': effective_rate,
                    'purchaseRate': float(item.purchase_rate),
                    'gstRate': float(item.gst_rate),
                })
            results.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'date': str(inv.invoice_date),
                'distributorName': inv.distributor.name,
                'distributorId': str(inv.distributor.id),
                'grandTotal': float(inv.grand_total),
                'items': items,
            })
        return Response({'data': results})

class PurchaseOrderSuggestionsView(APIView):
    """
    GET /api/v1/purchases/orders/suggestions/?outletId=xxx
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        distributor_id = request.query_params.get('distributorId')
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from django.db.models import Sum, OuterRef, Subquery, IntegerField, F, FloatField, ExpressionWrapper, Q, CharField
        from django.db.models.functions import Coalesce, Cast, NullIf
        from apps.inventory.models import MasterProduct, Batch, OutletProductConfig
        from apps.purchases.models import PurchaseOrderItem, PurchaseItem, Distributor
        
        # 1. Effective strips (from active batches)
        active_batch_product_ids = Batch.objects.filter(
            outlet_id=outlet_id,
            is_active=True,
        ).values('product_id')
        
        config_product_ids = OutletProductConfig.objects.filter(
            outlet_id=outlet_id,
            min_qty__gt=0
        ).values('product_id')

        products = MasterProduct.objects.filter(
            Q(id__in=active_batch_product_ids) | Q(id__in=config_product_ids)
        ).distinct()

        config_sq = OutletProductConfig.objects.filter(
            outlet_id=outlet_id,
            product_id=OuterRef('pk')
        )

        all_active_sq = Batch.objects.filter(
            outlet_id=outlet_id,
            is_active=True,
            product_id=OuterRef('pk'),
        )

        po_items_sq = PurchaseOrderItem.objects.filter(
            product_id=OuterRef('pk'),
            purchase_order__outlet_id=outlet_id,
            purchase_order__status__in=['SENT', 'PARTIAL']
        ).values('product_id').annotate(
            s=Sum(F('qty_strips') - F('received_qty'))
        ).values('s')[:1]
        
        last_dist_sq = PurchaseItem.objects.filter(
            invoice__outlet_id=outlet_id,
            master_product_id=OuterRef('pk')
        ).order_by('-invoice__invoice_date', '-invoice__created_at').values('invoice__distributor_id')[:1]
        
        last_dist_name_sq = PurchaseItem.objects.filter(
            invoice__outlet_id=outlet_id,
            master_product_id=OuterRef('pk')
        ).order_by('-invoice__invoice_date', '-invoice__created_at').values('invoice__distributor__name')[:1]

        products = products.annotate(
            total_strips=Coalesce(
                Subquery(
                    all_active_sq.values('product_id')
                        .annotate(s=Sum('qty_strips')).values('s')[:1],
                    output_field=IntegerField()
                ),
                0
            ),
            total_loose=Coalesce(
                Subquery(
                    all_active_sq.values('product_id')
                        .annotate(s=Sum('qty_loose')).values('s')[:1],
                    output_field=IntegerField()
                ),
                0
            ),
        )

        products = products.annotate(
            effective_strips=ExpressionWrapper(
                F('total_strips') + (Cast(F('total_loose'), FloatField()) / Cast(Coalesce(NullIf(F('pack_size'), 0), 1), FloatField())),
                output_field=FloatField()
            ),
            on_order=Coalesce(Subquery(po_items_sq, output_field=IntegerField()), 0),
            outlet_min_qty=Coalesce(Subquery(config_sq.values('min_qty')[:1]), 0.0, output_field=FloatField()),
            outlet_reorder_qty=Coalesce(Subquery(config_sq.values('reorder_qty')[:1]), 0.0, output_field=FloatField()),
            last_dist_id=Subquery(last_dist_sq),
            last_dist_name=Subquery(last_dist_name_sq),
            estimated_ptr=Coalesce(Subquery(
                Batch.objects.filter(outlet_id=outlet_id, product_id=OuterRef('pk')).order_by('-created_at').values('ptr')[:1]
            ), 0.0, output_field=FloatField())
        )
        
        products = products.annotate(
            available=ExpressionWrapper(F('effective_strips') + Cast(F('on_order'), FloatField()), output_field=FloatField())
        )
        
        low_stock_products = products.filter(available__lte=F('outlet_min_qty'))
        if distributor_id:
            low_stock_products = low_stock_products.filter(last_dist_id=distributor_id)
        low_stock_products = low_stock_products[:200]
        
        results = []
        for p in low_stock_products:
            last_ptr = float(p.estimated_ptr)
            if last_ptr == 0.0:
                last_ptr = float(p.mrp) * 0.8 if p.mrp else 0.0
                
            deficit = float(p.outlet_reorder_qty) - float(p.available)
            if deficit <= 0:
                deficit = float(p.outlet_reorder_qty)
                if deficit <= 0:
                    deficit = float(p.outlet_min_qty) - float(p.available)
            if deficit <= 0:
                deficit = 1
                
            results.append({
                'productId': str(p.id),
                'productName': p.name,
                'manufacturer': p.manufacturer,
                'minQty': p.outlet_min_qty,
                'reorderQty': p.outlet_reorder_qty,
                'currentStock': float(p.effective_strips) if p.effective_strips is not None else 0.0,
                'onOrder': p.on_order,
                'available': float(p.available),
                'deficit': float(deficit),
                'lastDistributorId': str(p.last_dist_id) if p.last_dist_id else None,
                'lastDistributorName': p.last_dist_name if p.last_dist_name else None,
                'estimatedPtr': last_ptr
            })
            
        return Response({'data': results})

class PurchaseOrderBulkCreateView(APIView):
    """
    POST /api/v1/purchases/orders/bulk-create/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        items = request.data.get('items', [])
        
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from collections import defaultdict
        distributor_orders = defaultdict(list)
        for item in items:
            dist_id = item.get('distributorId') or item.get('lastDistributorId')
            if not dist_id:
                return Response({'detail': 'Missing distributorId for product ' + str(item.get('productId'))}, status=status.HTTP_400_BAD_REQUEST)
            distributor_orders[dist_id].append(item)
            
        from apps.purchases.models import PurchaseOrder, PurchaseOrderItem
        from apps.core.models import Outlet
        from django.db import transaction
        from datetime import datetime
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        
        created_pos = []
        with transaction.atomic():
            for dist_id, dist_items in distributor_orders.items():
                today_str = datetime.now().strftime("%Y%m%d")
                count = PurchaseOrder.objects.filter(outlet=outlet, order_date=datetime.now().date()).count() + 1
                po_num = f"PO-{today_str}-{count:03d}"
                
                po = PurchaseOrder.objects.create(
                    outlet=outlet,
                    distributor_id=dist_id,
                    po_number=po_num,
                    status='SAVED'
                )
                
                total_amount = 0
                for item in dist_items:
                    qty = int(item.get('orderQty', item.get('deficit', 0)))
                    if qty <= 0:
                        continue
                    ptr = float(item.get('estimatedPtr', 0.0))
                    amt = qty * ptr
                    total_amount += amt
                    
                    PurchaseOrderItem.objects.create(
                        purchase_order=po,
                        product_id=item.get('productId'),
                        qty_strips=qty,
                        unit_ptr_estimated=ptr,
                        last_rate=ptr,
                        taxable_amount=amt
                    )
                
                po.total_amount = total_amount
                po.save()
                created_pos.append(po.po_number)
                
        return Response({'detail': 'Orders generated', 'pos': created_pos}, status=status.HTTP_201_CREATED)


class PurchaseOrderListView(APIView):
    """
    GET /api/v1/purchases/orders/?outletId=xxx
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.purchases.models import PurchaseOrder
        
        orders = PurchaseOrder.objects.filter(outlet_id=outlet_id).select_related('distributor').order_by('-created_at')
        
        results = []
        for po in orders:
            results.append({
                'id': str(po.id),
                'poNumber': po.po_number,
                'status': po.status,
                'distributorName': po.distributor.name,
                'orderDate': po.order_date.isoformat(),
                'totalAmount': float(po.total_amount),
            })
            
        return Response({'results': results}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        distributor_id = request.data.get('distributorId')
        
        if not outlet_id or not distributor_id:
            return Response({'detail': 'outletId and distributorId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.purchases.models import PurchaseOrder
        from apps.core.models import Outlet
        from datetime import datetime
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
            
        today_str = datetime.now().strftime("%Y%m%d")
        count = PurchaseOrder.objects.filter(outlet=outlet, order_date=datetime.now().date()).count() + 1
        po_num = f"PO-{today_str}-{count:03d}"
        
        items_data = request.data.get('items', [])
        from apps.purchases.models import PurchaseOrderItem
        from django.db import transaction
        
        with transaction.atomic():
            po = PurchaseOrder.objects.create(
                outlet=outlet,
                distributor_id=distributor_id,
                po_number=po_num,
                status='SAVED'
            )
            
            total_amount = 0
            for item in items_data:
                qty = int(item.get('orderQty', item.get('deficit', 0)))
                if qty <= 0:
                    continue
                ptr = float(item.get('estimatedPtr', item.get('lastRate', 0.0)))
                amt = qty * ptr
                total_amount += amt
                
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product_id=item.get('productId'),
                    qty_strips=qty,
                    unit_ptr_estimated=ptr,
                    last_rate=ptr,
                    taxable_amount=amt
                )
            
            po.total_amount = total_amount
            po.save()
        
        return Response({'id': str(po.id), 'poNumber': po.po_number}, status=status.HTTP_201_CREATED)

class PurchaseOrderDetailView(APIView):
    """
    GET /api/v1/purchases/orders/{id}/?outletId=xxx
    PUT /api/v1/purchases/orders/{id}/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.purchases.models import PurchaseOrder
        try:
            po = PurchaseOrder.objects.prefetch_related('items', 'items__product').get(id=pk, outlet_id=outlet_id)
        except PurchaseOrder.DoesNotExist:
            return Response({'detail': 'PO not found'}, status=status.HTTP_404_NOT_FOUND)
            
        items = []
        for item in po.items.all():
            items.append({
                'id': str(item.id),
                'productId': str(item.product.id),
                'productName': item.product.name,
                'qtyStrips': item.qty_strips,
                'receivedQty': item.received_qty,
                'lastRate': float(item.last_rate) if item.last_rate else 0.0,
                'taxableAmount': float(item.taxable_amount) if item.taxable_amount else 0.0,
            })
            
        result = {
            'id': str(po.id),
            'poNumber': po.po_number,
            'status': po.status,
            'distributorId': str(po.distributor.id),
            'distributorName': po.distributor.name,
            'orderDate': po.order_date.isoformat(),
            'totalAmount': float(po.total_amount),
            'items': items,
        }
        
        return Response(result, status=status.HTTP_200_OK)

    def put(self, request, pk, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        items_data = request.data.get('items', [])
        
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.purchases.models import PurchaseOrder, PurchaseOrderItem
        from django.db import transaction
        
        try:
            po = PurchaseOrder.objects.get(id=pk, outlet_id=outlet_id)
        except PurchaseOrder.DoesNotExist:
            return Response({'detail': 'PO not found'}, status=status.HTTP_404_NOT_FOUND)
            
        with transaction.atomic():
            # Drop existing items
            po.items.all().delete()
            
            total_amount = 0
            for item in items_data:
                qty = int(item.get('orderQty', item.get('deficit', 0)))
                if qty <= 0:
                    continue
                ptr = float(item.get('estimatedPtr', item.get('lastRate', 0.0)))
                amt = qty * ptr
                total_amount += amt
                
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product_id=item.get('productId'),
                    qty_strips=qty,
                    unit_ptr_estimated=ptr,
                    last_rate=ptr,
                    taxable_amount=amt
                )
            
            po.total_amount = total_amount
            po.save()
            
        return Response({'detail': 'PO updated successfully'})

class PurchaseOrderExcelExportView(APIView):
    """
    GET /api/v1/purchases/orders/{id}/export/excel/?outletId=xxx
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.purchases.models import PurchaseOrder
        try:
            po = PurchaseOrder.objects.prefetch_related('items', 'items__product').get(id=pk, outlet_id=outlet_id)
        except PurchaseOrder.DoesNotExist:
            return Response({'detail': 'PO not found'}, status=status.HTTP_404_NOT_FOUND)
            
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
        from django.http import HttpResponse
        import io
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Purchase Order"
        
        # Header Metadata
        ws.merge_cells('A1:F1')
        title_cell = ws['A1']
        title_cell.value = "PURCHASE ORDER"
        title_cell.font = Font(bold=True, size=16)
        title_cell.alignment = Alignment(horizontal='center')
        
        ws['A2'] = f"PO Number: {po.po_number}"
        ws['A3'] = f"Date: {po.order_date}"
        ws['A4'] = f"Distributor: {po.distributor.name}"
        ws['A2'].font = Font(bold=True)
        ws['A3'].font = Font(bold=True)
        ws['A4'].font = Font(bold=True)
        
        # Table Styling & Headers
        headers = ['S.No', 'Product Name', 'Pack', 'Order Qty', 'Rate', 'Amount']
        ws.append(headers)
        
        header_row = ws.max_row
        fill = PatternFill(start_color="EEEEEE", end_color="EEEEEE", fill_type="solid")
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
        
        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=header_row, column=col_num)
            cell.font = Font(bold=True)
            cell.fill = fill
            cell.border = thin_border
        
        # Data Rows & Formatting
        for i, item in enumerate(po.items.all(), 1):
            row_data = [
                i,
                item.product.name,
                item.product.pack_size or 1,
                item.qty_strips,
                float(item.last_rate) if item.last_rate else 0.0,
                float(item.taxable_amount) if item.taxable_amount else 0.0,
            ]
            ws.append(row_data)
            current_row = ws.max_row
            
            for col_num in range(1, len(row_data) + 1):
                cell = ws.cell(row=current_row, column=col_num)
                cell.border = thin_border
                if col_num in [5, 6]:
                    cell.number_format = '#,##0.00'
                    
        # Column Widths
        ws.column_dimensions['A'].width = 8
        ws.column_dimensions['B'].width = 45
        ws.column_dimensions['C'].width = 12
        ws.column_dimensions['D'].width = 12
        ws.column_dimensions['E'].width = 15
        ws.column_dimensions['F'].width = 15
            
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="PO_{po.po_number}.xlsx"'
        return response

class PurchaseOrderPdfExportView(APIView):
    """
    GET /api/v1/purchases/orders/{id}/export/pdf/?outletId=xxx
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.purchases.models import PurchaseOrder
        try:
            po = PurchaseOrder.objects.prefetch_related('items', 'items__product').get(id=pk, outlet_id=outlet_id)
        except PurchaseOrder.DoesNotExist:
            return Response({'detail': 'PO not found'}, status=status.HTTP_404_NOT_FOUND)
            
        from django.http import HttpResponse
        import io
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
        elements = []
        styles = getSampleStyleSheet()
        
        # Header Table
        header_data = [
            [
                Paragraph(f"<b>Distributor:</b> {po.distributor.name}<br/><b>PO Number:</b> {po.po_number}<br/><b>Date:</b> {po.order_date}", styles['Normal']),
                Paragraph("<font size=16><b>PURCHASE ORDER</b></font>", ParagraphStyle(name='RightAlign', parent=styles['Normal'], alignment=2))
            ]
        ]
        header_table = Table(header_data, colWidths=[300, 240])
        elements.append(header_table)
        elements.append(Spacer(1, 20))
        
        # Items Table
        table_data = [['S.No', 'Product Name', 'Pack', 'Order Qty', 'Rate', 'Amount']]
        for i, item in enumerate(po.items.all(), 1):
            table_data.append([
                str(i),
                Paragraph(item.product.name, styles['Normal']),
                str(item.product.pack_size or 1),
                str(item.qty_strips),
                f"{float(item.last_rate or 0):.2f}",
                f"{float(item.taxable_amount or 0):.2f}"
            ])
            
        t = Table(table_data, colWidths=[40, 220, 50, 70, 70, 90])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('ALIGN', (3, 1), (5, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 20))
        
        # Footer
        footer_data = [
            ["", "", Paragraph(f"<b>Total Amount: Rs {float(po.total_amount or 0):.2f}</b>", ParagraphStyle(name='RightBold', parent=styles['Normal'], alignment=2))]
        ]
        footer_table = Table(footer_data, colWidths=[300, 100, 140])
        elements.append(footer_table)
        
        elements.append(Spacer(1, 40))
        sign_data = [["", "--------------------------------------\nAuthorized Signatory"]]
        sign_table = Table(sign_data, colWidths=[340, 200])
        sign_table.setStyle(TableStyle([('ALIGN', (1, 0), (1, 0), 'RIGHT')]))
        elements.append(sign_table)
        
        doc.build(elements)
        
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="PO_{po.po_number}.pdf"'
        return response


# =============================================================================
# SCAN PURCHASE VIEWS
# =============================================================================

class InvoiceScanUploadView(APIView):
    """
    POST /api/v1/purchases/scan/upload/

    Accept a scanned invoice image from mobile. Creates a SAVED PurchaseInvoice
    immediately and dispatches background OCR task. Returns 202 Accepted instantly
    so mobile doesn't wait for heavy OCR processing.

    Form data:
        - outletId: UUID (required)
        - image: file (required) — JPG/PNG of the invoice

    Response 202:
    {
        "draftId": "uuid",
        "status": "processing",
        "message": "Invoice uploaded. OCR analysis in progress..."
    }
    """
    permission_classes = [CanCreatePurchases]

    def post(self, request, *args, **kwargs):
        from apps.purchases.tasks import process_invoice_ocr

        outlet_id = request.data.get('outletId')
        image_file = request.FILES.get('image')

        if not outlet_id:
            return Response(
                {'error': {'code': 'MISSING_OUTLET', 'message': 'outletId is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not image_file:
            return Response(
                {'error': {'code': 'MISSING_IMAGE', 'message': 'image file is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                status=status.HTTP_404_NOT_FOUND
            )

        # Create a minimal SAVED invoice (no distributor yet, no amounts)
        # OCR task will populate all fields asynchronously
        draft = PurchaseInvoice.objects.create(
            outlet=outlet,
            status='SAVED',
            invoice_image=image_file,
            created_by=request.user,
            # Placeholder values — will be overwritten by OCR
            invoice_no='',
            grand_total=0,
            subtotal=0,
            discount_amount=0,
            taxable_amount=0,
            gst_amount=0,
            cess_amount=0,
            freight=0,
            round_off=0,
            amount_paid=0,
            outstanding=0,
        )

        logger.info(f"Created SAVED invoice {draft.id} for outlet {outlet.name}, dispatching OCR task")

        # Fire background OCR task — non-blocking
        process_invoice_ocr.delay(str(draft.id))

        return Response(
            {
                'draftId': str(draft.id),
                'status': 'processing',
                'message': 'Invoice uploaded successfully. OCR analysis is running in the background.',
            },
            status=status.HTTP_202_ACCEPTED
        )


class InvoiceOCRStatusView(APIView):
    """
    GET /api/v1/purchases/<purchase_id>/ocr-status/?outletId=xxx

    Poll the OCR processing status and get the full extracted data for the review screen.
    Frontend polls this endpoint until status is 'ready' or 'error'.

    Response when processing:
    { "status": "processing" }

    Response when ready:
    {
        "status": "ready",
        "draftId": "uuid",
        "invoiceImageUrl": "/media/purchase_invoices/...",
        "confidence": 0.87,
        "warnings": [...],
        "header": {
            "distributorName": "Manavta Pharma",
            "distributorId": "uuid or null",
            "distributorIsNew": false,
            "matchTier": 1,
            "invoiceNo": "AMS26/41609",
            "invoiceDate": "2026-09-26",
            "gstin": "27AAPCM1753L2ZX",
            "phone": "8999381254",
            "dlNo": "20B-612209, 21B-612210",
            "address": "Shop No. 1, Ghati Road, Jubipark"
        },
        "items": [
            {
                "name": "PARACETAMOL 500MG TAB",
                "batchNo": "PC2609",
                "expiry": "2027-12-01",
                "qty": 10,
                "freeQty": 2,
                "mrp": 12.50,
                "rate": 9.80,
                "discount": 5,
                "gstPct": 12,
                "amount": 93.10,
                "hsnCode": "30049099",
                "medicineMatch": { "matched": true, "productId": "uuid", "confidence": 0.95 },
                "validationOk": true
            }
        ],
        "totals": {
            "subtotal": 1000,
            "cgst": 60,
            "sgst": 60,
            "grandTotal": 1120
        }
    }
    """
    permission_classes = [CanAccessPurchases]

    def get(self, request, purchase_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')

        try:
            invoice = PurchaseInvoice.objects.get(id=purchase_id, outlet_id=outlet_id, status='SAVED')
        except PurchaseInvoice.DoesNotExist:
            return Response(
                {'error': {'code': 'NOT_FOUND', 'message': 'Draft invoice not found'}},
                status=status.HTTP_404_NOT_FOUND
            )

        # Still processing: OCR task hasn't written back yet
        if invoice.ocr_raw_data is None and invoice.ocr_processing_error is None:
            return Response({'status': 'processing'})

        # OCR failed
        if invoice.ocr_processing_error and invoice.ocr_raw_data is None:
            return Response({
                'status': 'error',
                'message': invoice.ocr_processing_error,
            })

        # OCR complete — build review payload
        ocr = invoice.ocr_raw_data or {}
        header = ocr.get('header', {})
        dist_match = ocr.get('distributor_match', {})
        items_raw = ocr.get('items', [])
        totals = ocr.get('totals', {})

        # Serialize items for review screen
        items_serialized = []
        for item in items_raw:
            med_match = item.get('_medicine_match', {})
            items_serialized.append({
                'name': item.get('name', ''),
                'batchNo': item.get('batch_no', ''),
                'expiry': item.get('expiry', ''),
                'qty': item.get('qty', ''),
                'freeQty': item.get('free_qty', 0),
                'mrp': item.get('mrp', ''),
                'rate': item.get('rate', ''),
                'discount': item.get('discount', 0),
                'gstPct': item.get('gst_pct', ''),
                'amount': item.get('amount', ''),
                'hsnCode': item.get('hsn_code', '') or (med_match.get('hsn_code') or ''),
                'packSize': item.get('pack_size', ''),
                'medicineMatch': {
                    'matched': med_match.get('matched', False),
                    'productId': med_match.get('product_id'),
                    'productName': med_match.get('product_name', item.get('name', '')),
                    'confidence': round(med_match.get('confidence', 0), 2),
                    'gstRate': med_match.get('gst_rate'),
                    'packSize': med_match.get('pack_size'),
                },
                'validationOk': item.get('_validation_ok', True),
                # Unknown columns flagged for review
                'unknownColumns': {k: v for k, v in item.items() if k.startswith('_col_')},
            })

        image_url = invoice.invoice_image.url if invoice.invoice_image else None

        # Resolve the party ledger linked to this distributor
        from apps.accounts.models import Ledger as AccountsLedger
        import logging
        logger = logging.getLogger(__name__)
        party_ledger = None
        if invoice.distributor:
            party_ledger = AccountsLedger.objects.filter(
                outlet_id=outlet_id,
                linked_distributor=invoice.distributor
            ).first()
            logger.info(f"DEBUG OCR: outlet_id={outlet_id}, distributor={invoice.distributor.id}, party_ledger={party_ledger}")
        else:
            logger.info(f"DEBUG OCR: invoice.distributor is None")

        return Response({
            'status': 'ready',
            'draftId': str(invoice.id),
            'invoiceImageUrl': image_url,
            'confidence': invoice.ocr_confidence,
            'warnings': ocr.get('warnings', []),
            'header': {
                'distributorName': invoice.ocr_distributor_name or header.get('distributor_name', ''),
                'distributorId': str(invoice.distributor_id) if invoice.distributor_id else None,
                'distributor': {
                    'id': str(invoice.distributor.id),
                    'name': invoice.distributor.name,
                    'gstin': invoice.distributor.gstin,
                    'phone': invoice.distributor.phone,
                    'email': invoice.distributor.email,
                    'address': invoice.distributor.address,
                    'city': invoice.distributor.city,
                } if invoice.distributor else None,
                'partyLedgerId': str(party_ledger.id) if party_ledger else None,
                'partyLedger': {
                    'id': str(party_ledger.id),
                    'name': party_ledger.name,
                    'group': party_ledger.group.name if party_ledger.group else None,
                    'currentBalance': float(party_ledger.current_balance),
                    'state': party_ledger.state or '',
                } if party_ledger else None,
                'distributorIsNew': dist_match.get('is_new', True),
                'matchTier': dist_match.get('match_tier'),
                'matchConfidence': dist_match.get('confidence'),
                'invoiceNo': invoice.invoice_no or header.get('invoice_no', ''),
                'invoiceDate': str(invoice.invoice_date) if invoice.invoice_date else header.get('invoice_date', ''),
                'gstin': invoice.ocr_distributor_gstin or header.get('gstin', ''),
                'phone': invoice.ocr_distributor_phone or header.get('mobile', '') or header.get('phone', ''),
                'dlNo': invoice.ocr_distributor_dl or header.get('dl_no', ''),
                'dl20b': header.get('dl_20b', ''),
                'dl21b': header.get('dl_21b', ''),
                'address': invoice.ocr_distributor_address or header.get('address', ''),
                'stateCode': header.get('state_code', ''),
            },
            'items': items_serialized,
            'totals': {
                'subtotal': totals.get('subtotal'),
                'cgst': totals.get('cgst'),
                'sgst': totals.get('sgst'),
                'igst': totals.get('igst'),
                'grandTotal': totals.get('grand_total'),
                'roundOff': totals.get('round_off'),
            },
        })


class InvoiceDraftConfirmView(APIView):
    """
    POST /api/v1/purchases/<purchase_id>/confirm/

    Confirm a SAVED purchase after human review on the review screen.
    Receives the corrected/verified payload and calls atomic_purchase_save
    (same as regular purchase creation) to post to stock and ledger.

    On success: SAVED is deleted and a new POSTED PurchaseInvoice is created.
    Returns the full POSTED invoice in the same shape as PurchaseCreateView.
    """
    permission_classes = [CanCreatePurchases]

    def post(self, request, purchase_id, *args, **kwargs):
        outlet_id = request.data.get('outletId')

        try:
            draft = PurchaseInvoice.objects.get(id=purchase_id, outlet_id=outlet_id, status='SAVED')
        except PurchaseInvoice.DoesNotExist:
            return Response(
                {'error': {'code': 'NOT_FOUND', 'message': 'Draft invoice not found'}},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            payload = request.data

            # Learn column map for this distributor (if provided by review screen)
            learned_col_map = payload.pop('_learnedColumnMap', None)
            distributor_id = payload.get('distributorId')

            if learned_col_map and distributor_id:
                try:
                    from apps.purchases.models import Distributor
                    dist = Distributor.objects.get(id=distributor_id, outlet_id=outlet_id)
                    # Merge new learned synonyms into existing map
                    existing = dist.ocr_column_map or {}
                    existing.update(learned_col_map)
                    dist.ocr_column_map = existing
                    dist.save(update_fields=['ocr_column_map'])
                    logger.info(f"Updated OCR column map for distributor {distributor_id}")
                except Exception as e:
                    logger.warning(f"Could not save learned column map: {e}")

            # Call the same atomic purchase save as manual purchase
            purchase_invoice = atomic_purchase_save(payload, outlet_id, request.user.id)

            # Transfer the invoice image from draft to the new posted invoice
            if draft.invoice_image:
                purchase_invoice.invoice_image = draft.invoice_image
                purchase_invoice.save(update_fields=['invoice_image'])

            # Delete the draft now that it's confirmed
            draft_image = draft.invoice_image.name if draft.invoice_image else None
            draft.invoice_image = None  # Detach before delete to preserve the file
            draft.save(update_fields=['invoice_image'])
            draft.delete()

            logger.info(f"SAVED {purchase_id} confirmed → POSTED as {purchase_invoice.id}")

            # Serialize using same shape as PurchaseCreateView
            serializer = PurchaseCreateView()
            result = serializer._serialize_purchase_full(purchase_invoice)
            result['invoiceImageUrl'] = purchase_invoice.invoice_image.url if purchase_invoice.invoice_image else None

            return Response(result, status=status.HTTP_201_CREATED)

        except PurchaseServiceError as e:
            logger.warning(f"Purchase service error confirming draft {purchase_id}: {e}")
            return Response(
                {'error': {'code': 'PURCHASE_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error confirming draft {purchase_id}: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to confirm purchase'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
