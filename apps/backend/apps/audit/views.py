# The audit trail screens and API live in apps/audit/api.py. This module keeps only the bill / purchase / voucher REVISION history
# endpoint (old and new snapshots of a document, read by the "History" screens).
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.core.permissions import CanViewAuditHistory

class UnifiedRevisionDetailView(APIView):
    """GET /api/v1/audit/revisions/<record_type>/<record_id>/"""
    permission_classes = [CanViewAuditHistory]

    def get(self, request, record_type, record_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or getattr(request.user, 'outlet_id', None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=status.HTTP_400_BAD_REQUEST)

        MODEL_MAPPING = {
            'purchase': ('purchases', 'PurchaseInvoice', lambda obj: {'invoiceNo': obj.invoice_no}),
            'sale_return': ('billing', 'SalesReturn', lambda obj: {'returnNo': obj.return_no}),
            'voucher': ('accounts', 'Voucher', lambda obj: {'voucherNo': obj.voucher_no, 'voucherType': obj.voucher_type}),
            'sale': ('billing', 'SaleInvoice', lambda obj: {'invoiceNo': obj.invoice_no}),
            'debit_note': ('accounts', 'DebitNote', lambda obj: {'noteNo': obj.debit_note_no}),
        }

        if record_type not in MODEL_MAPPING:
            return Response({'detail': f'Unsupported record type: {record_type}'}, status=status.HTTP_400_BAD_REQUEST)

        app_label, model_name, meta_func = MODEL_MAPPING[record_type]

        from django.apps import apps
        from django.contrib.contenttypes.models import ContentType
        from django.db.models import Q
        from apps.audit.models import DocumentRevision
        from apps.billing.serializers import DocumentRevisionSerializer
        
        try:
            ModelClass = apps.get_model(app_label, model_name)
        except LookupError:
            return Response({'detail': f'Model {model_name} not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            # SalesReturn uses `outlet`, others use `outlet_id`. We'll just do it safely:
            # Wait, Django ORM supports `outlet_id=` even if the foreign key is `outlet`.
            instance = ModelClass.objects.get(id=record_id, outlet_id=outlet_id)
        except ModelClass.DoesNotExist:
            return Response({'detail': f'{model_name} not found'}, status=status.HTTP_404_NOT_FOUND)

        ct = ContentType.objects.get_for_model(ModelClass)
        
        from apps.audit.core import flags
        if flags.is_v2_read_enabled() or record_type in ('purchase', 'sale', 'voucher'):
            from apps.audit.models import DocumentRevisionV2
            from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
            
            revisions_v2 = DocumentRevisionV2.objects.filter(
                content_type=ct, object_id=instance.id, tenant_id=outlet_id
            ).order_by('-created_at')
            
            meta_data = meta_func(instance)
            meta_data['id'] = str(instance.id)
            meta_data['createdAt'] = instance.created_at
            meta_data['createdBy'] = instance.created_by.name if hasattr(instance, 'created_by') and instance.created_by else 'System'

            serializer = DocumentRevisionV2LegacyAdapterSerializer(revisions_v2, many=True)
            return Response({
                'record': meta_data,
                'revisions': serializer.data
            }, status=status.HTTP_200_OK)

        # Check if resulting_document_id applies
        revisions = DocumentRevision.objects.filter(
            Q(content_type=ct, object_id=str(instance.id)) | Q(resulting_document_id=str(instance.id)),
            outlet_id=outlet_id
        ).order_by('-created_at')

        meta_data = meta_func(instance)
        meta_data['id'] = str(instance.id)
        meta_data['createdAt'] = instance.created_at
        meta_data['createdBy'] = instance.created_by.name if hasattr(instance, 'created_by') and instance.created_by else 'System'

        serializer = DocumentRevisionSerializer(revisions, many=True)
        return Response({
            'record': meta_data,
            'revisions': serializer.data
        }, status=status.HTTP_200_OK)
