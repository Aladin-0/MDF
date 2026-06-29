from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone
from .models import Quotation, QuotationItem
from .serializers import QuotationSerializer
from apps.core.permissions import IsAuthenticated, IsBillingStaffOrAbove
from apps.billing.camel_case_helper import convert_dict_to_camel_case
from .views import SaleCreateView

class QuotationListCreateView(generics.ListCreateAPIView):
    serializer_class = QuotationSerializer
    permission_classes = [IsBillingStaffOrAbove]

    # Disable DRF pagination for this view — return a plain list the frontend can use directly
    pagination_class = None

    def get_queryset(self):
        outlet_id = self.request.query_params.get('outletId')
        # select_related to avoid N+1 when expanding customer in the list
        qs = Quotation.objects.select_related('customer').prefetch_related('items').all().order_by('-created_at')
        if outlet_id:
            qs = qs.filter(outlet_id=outlet_id)
        return qs

    def list(self, request, *args, **kwargs):
        """Return camelCase so the frontend Quotation type aligns."""
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        results = [convert_dict_to_camel_case(item) for item in serializer.data]
        # Expand customer FK from UUID to a proper dict the frontend can use
        for i, q in enumerate(queryset):
            if q.customer_id:
                results[i]['customer'] = {
                    'id': str(q.customer.id),
                    'name': q.customer.name,
                    'phone': q.customer.phone or '',
                }
            else:
                results[i]['customer'] = None
        return Response(results)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        from apps.billing.services import generate_quotation_number
        from apps.inventory.models import Batch
        from apps.core.models import Outlet
        
        # Clone request data to make it mutable
        data = request.data.copy()
        
        outlet_id = data.get('outletId')
        if not outlet_id:
            return Response({'outletId': 'Required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'outletId': 'Invalid outlet.'}, status=status.HTTP_400_BAD_REQUEST)

        # Map top-level camelCase fields to snake_case
        field_mapping = {
            'customerId': 'customer',
            'doctorName': 'doctor_name',
            'hospitalName': 'hospital_name',
            'discountAmount': 'discount_amount',
            'extraDiscountPct': 'extra_discount_pct',
            'taxableAmount': 'taxable_amount',
            'cgstAmount': 'cgst_amount',
            'sgstAmount': 'sgst_amount',
            'igstAmount': 'igst_amount',
            'grandTotal': 'grand_total',
        }
        for camel, snake in field_mapping.items():
            if camel in data:
                data[snake] = data.pop(camel)
                
        if 'partyLedgerId' in data:
            party_ledger_id = data.pop('partyLedgerId')
            if party_ledger_id:
                try:
                    from apps.accounts.models import Ledger, Customer
                    party_ledger = Ledger.objects.select_related('linked_customer').get(
                        id=party_ledger_id, outlet=outlet
                    )
                    if party_ledger.linked_customer:
                        data['customer'] = party_ledger.linked_customer.id
                    else:
                        phone_number = party_ledger.phone or '0000000000'
                        customer, _ = Customer.objects.get_or_create(
                            outlet=outlet,
                            phone=phone_number,
                            defaults={
                                'name': party_ledger.name or 'Walk-in Customer',
                                'address': party_ledger.address or '',
                            }
                        )
                        party_ledger.linked_customer = customer
                        party_ledger.save(update_fields=['linked_customer'])
                        data['customer'] = customer.id
                except Ledger.DoesNotExist:
                    pass
        # Generate quotation number if not provided
        if not data.get('quotation_no'):
            data['quotation_no'] = generate_quotation_number(outlet_id)
            
        data['outlet'] = outlet.id
        
        # Prepare items snapshot
        items = data.get('items', [])
        for item in items:
            # Map item camelCase fields to snake_case
            item_mapping = {
                'qtyStrips': 'qty_strips',
                'qtyLoose': 'qty_loose',
                'discountPct': 'discount_pct',
                'gstRate': 'gst_rate',
                'taxableAmount': 'taxable_amount',
                'gstAmount': 'gst_amount',
                'totalAmount': 'total_amount',
            }
            for camel, snake in item_mapping.items():
                if camel in item:
                    item[snake] = item.pop(camel)

            batch_id = item.get('batch') or item.get('batchId')
            if batch_id:
                try:
                    from django.core.exceptions import ValidationError
                    batch = Batch.objects.get(id=batch_id)
                    item['medicine_name'] = batch.product.name
                    item['batch_no'] = batch.batch_no
                    item['expiry_date'] = batch.expiry_date  # snapshot for display
                    item['pack_size'] = batch.pack_size or 1
                    item['mrp'] = float(batch.mrp) if batch.mrp else 0
                    item['sale_rate'] = float(batch.sale_rate or batch.mrp or 0)
                    item['batch'] = batch.id
                except (Batch.DoesNotExist, ValidationError):
                    # If batch doesn't exist or is invalid UUID (like 'mock'), populate defaults
                    item['medicine_name'] = item.get('name') or 'Custom Item'
                    item['batch_no'] = item.get('batchNo') or 'N/A'
                    item['mrp'] = float(item.get('mrp', 0))
                    item['sale_rate'] = float(item.get('saleRate', 0))
                    item['batch'] = None

        serializer = self.get_serializer(data=data)
        if not serializer.is_valid():
            print("Quotation Error:", serializer.errors)
            serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        # Convert response to camelCase for the frontend
        response_data = convert_dict_to_camel_case(serializer.data)
        # Manually set fields that frontend expects from SalesInvoice response
        response_data['invoiceNo'] = response_data.get('quotationNo')
        
        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)


class QuotationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Quotation.objects.all()
    serializer_class = QuotationSerializer
    permission_classes = [IsBillingStaffOrAbove]

    def retrieve(self, request, *args, **kwargs):
        """Return camelCase so the frontend Quotation type aligns."""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        response_data = convert_dict_to_camel_case(serializer.data)
        # Expand customer FK from UUID to a proper dict the frontend can use
        if instance.customer_id:
            response_data['customer'] = {
                'id': str(instance.customer.id),
                'name': instance.customer.name,
                'phone': instance.customer.phone or '',
            }
        else:
            response_data['customer'] = None
        return Response(response_data)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'converted':
            return Response({'detail': 'Cannot edit a converted quotation.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.inventory.models import Batch
        data = request.data.copy()
        
        if 'outletId' in data:
            data['outlet'] = data.pop('outletId')
        if 'partyLedgerId' in data:
            data['customer'] = data.pop('partyLedgerId')
        elif 'customerId' in data:
            data['customer'] = data.pop('customerId')

        # Map top-level camelCase fields to snake_case
        field_mapping = {
            'doctorName': 'doctor_name',
            'hospitalName': 'hospital_name',
            'discountAmount': 'discount_amount',
            'extraDiscountPct': 'extra_discount_pct',
            'taxableAmount': 'taxable_amount',
            'cgstAmount': 'cgst_amount',
            'sgstAmount': 'sgst_amount',
            'igstAmount': 'igst_amount',
            'grandTotal': 'grand_total',
        }
        for camel, snake in field_mapping.items():
            if camel in data:
                data[snake] = data.pop(camel)
            
        items = data.get('items', [])
        for item in items:
            # Map item camelCase fields to snake_case
            item_mapping = {
                'qtyStrips': 'qty_strips',
                'qtyLoose': 'qty_loose',
                'discountPct': 'discount_pct',
                'gstRate': 'gst_rate',
                'taxableAmount': 'taxable_amount',
                'gstAmount': 'gst_amount',
                'totalAmount': 'total_amount',
            }
            for camel, snake in item_mapping.items():
                if camel in item:
                    item[snake] = item.pop(camel)

            batch_id = item.get('batch') or item.get('batchId')
            if batch_id:
                try:
                    batch = Batch.objects.get(id=batch_id)
                    item['medicine_name'] = batch.product.name
                    item['batch_no'] = batch.batch_no
                    item['expiry_date'] = batch.expiry_date  # snapshot for display
                    item['pack_size'] = batch.pack_size or 1
                    item['mrp'] = float(batch.mrp) if batch.mrp else 0
                    item['sale_rate'] = float(batch.sale_rate or batch.mrp or 0)
                    item['batch'] = batch.id
                except Batch.DoesNotExist:
                    pass
                    
        partial = True
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Convert response to camelCase for the frontend
        response_data = convert_dict_to_camel_case(serializer.data)
        # Manually set fields that frontend expects from SalesInvoice response
        response_data['invoiceNo'] = response_data.get('quotationNo')

        return Response(response_data)


class QuotationConvertView(APIView):
    permission_classes = [IsBillingStaffOrAbove]

    @transaction.atomic
    def post(self, request, pk, *args, **kwargs):
        try:
            quotation = Quotation.objects.get(pk=pk)
        except Quotation.DoesNotExist:
            return Response({'detail': 'Quotation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if quotation.status == 'converted':
            return Response({'detail': 'Already converted.'}, status=status.HTTP_400_BAD_REQUEST)

        # To convert a quotation to an invoice, we use the same SaleCreate logic, 
        # but we construct the payload from the quotation.
        payload = {
            "outletId": str(quotation.outlet_id),
            "customerId": str(quotation.customer_id) if quotation.customer_id else None,
            "doctorName": quotation.doctor_name,
            "hospitalName": quotation.hospital_name,
            "subtotal": quotation.subtotal,
            "discountAmount": quotation.discount_amount,
            "extraDiscountPct": quotation.extra_discount_pct,
            "taxableAmount": quotation.taxable_amount,
            "cgstAmount": quotation.cgst_amount,
            "sgstAmount": quotation.sgst_amount,
            "igstAmount": quotation.igst_amount,
            "grandTotal": quotation.grand_total,
            "paymentMode": request.data.get("paymentMode", "cash"),
            "cashPaid": request.data.get("cashPaid", quotation.grand_total),
            "upiPaid": request.data.get("upiPaid", 0),
            "cardPaid": request.data.get("cardPaid", 0),
            "creditGiven": request.data.get("creditGiven", 0),
            "amountPaid": request.data.get("amountPaid", quotation.grand_total),
            "amountDue": request.data.get("amountDue", 0),
            "items": []
        }

        for item in quotation.items.all():
            payload["items"].append({
                "batchId": str(item.batch_id) if item.batch_id else None,
                "productId": str(item.batch.product_id) if item.batch_id and hasattr(item, 'batch') and getattr(item, 'batch') else None,
                "qtyStrips": item.qty_strips,
                "qtyLoose": item.qty_loose,
                "rate": item.rate,
                "discountPct": item.discount_pct,
                "gstRate": item.gst_rate,
                "taxableAmount": item.taxable_amount,
                "gstAmount": item.gst_amount,
                "totalAmount": item.total_amount
            })

        # Inject the synthesized payload into the DRF request
        request._full_data = payload
        request._data = payload
        
        # Call SaleCreateView's post method directly with the existing DRF request
        sale_view = SaleCreateView()
        sale_view.request = request
        sale_view.format_kwarg = None
        sale_view.args = ()
        sale_view.kwargs = {}
        
        try:
            response = sale_view.post(request)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if response.status_code == 201:
            quotation.status = 'converted'
            quotation.converted_at = timezone.now()
            quotation.converted_to_invoice_id = response.data['id']
            quotation.save()
            return Response(response.data, status=status.HTTP_201_CREATED)

        return Response(response.data, status=response.status_code)

