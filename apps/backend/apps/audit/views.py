# ACTIVITY TRACKING — ACCESS POLICY
# ====================================
# Activity logs are visible ONLY to super administrators.
# This is intentional and must not be weakened without a
# security review.
#
# Super admin = user.is_superuser == True or role == 'super_admin'
#
# Regular staff: cannot view logs
# Outlet admins: cannot view logs
# Organization admins: cannot view logs (unless they are super admin)
# Super admins: full read-only access to all logs
#
# The logs themselves are written for ALL users and ALL actions.
# Restricting read access does not affect log completeness.

from rest_framework import generics, permissions, filters
from django.http import HttpResponse
import csv
from django.db.models import Q
from .models import ActivityLog
from .serializers import ActivityLogSerializer
from .permissions import IsSuperAdmin
import django_filters
from django_filters.rest_framework import DjangoFilterBackend

class ActivityLogFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search')
    
    class Meta:
        model = ActivityLog
        fields = {
            'module': ['exact'],
            'action': ['exact'],
            'entity_type': ['exact'],
            'entity_id': ['exact'],
            'user': ['exact'],
            'outlet': ['exact'],
            'timestamp': ['gte', 'lte'],
        }

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(description__icontains=value) | 
            Q(entity_label__icontains=value)
        )

class ActivityLogListView(generics.ListAPIView):
    """
    Secure audit log list endpoint.
    Restricted to admin or authorized staff only.
    """
    permission_classes = [IsSuperAdmin]  # Only super admin
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ActivityLogFilter
    ordering_fields = ['timestamp', 'occurred_at']
    ordering = ['-timestamp']

    def get_queryset(self):
        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.models import ActivityEvent
            return ActivityEvent.objects.all().order_by('-occurred_at')
        return ActivityLog.objects.select_related('user', 'outlet').order_by('-timestamp')
        
    def get_serializer_class(self):
        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.serializers import ActivityEventLegacyAdapterSerializer
            return ActivityEventLegacyAdapterSerializer
        return ActivityLogSerializer

class ActivityLogExportView(generics.ListAPIView):
    """
    Export filtered audit logs as CSV.
    """
    queryset = ActivityLog.objects.select_related('user', 'outlet')
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ActivityLogFilter
    ordering = ['-timestamp']

    def get_queryset(self):
        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.models import ActivityEvent
            return ActivityEvent.objects.all().order_by('-occurred_at')
        return ActivityLog.objects.select_related('user', 'outlet').order_by('-timestamp')

    def get(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_logs.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Timestamp', 'Module', 'Action', 'User', 'Outlet', 'Entity Type', 'Entity ID', 'Entity Label', 'Description'])
        
        from apps.audit.core import flags
        is_v2 = flags.is_v2_read_enabled()
        
        for log in queryset.iterator():
            if is_v2:
                # Fetch related info dynamically or loosely
                user_name = log.actor_id # Or fetch Staff.objects.get(id=log.actor_id).name if needed
                outlet_name = log.tenant_id
                writer.writerow([
                    log.occurred_at.isoformat() if log.occurred_at else '',
                    log.module,
                    log.action,
                    user_name,
                    outlet_name,
                    log.entity_type,
                    log.entity_id,
                    log.entity_label,
                    log.reason_text
                ])
            else:
                writer.writerow([
                    log.timestamp.isoformat() if getattr(log, 'timestamp', None) else '',
                    log.module,
                    log.action,
                    log.user.name if getattr(log, 'user', None) else '',
                    log.outlet.name if getattr(log, 'outlet', None) else '',
                    log.entity_type,
                    log.entity_id,
                    log.entity_label,
                    log.description
                ])
            
        return response

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
