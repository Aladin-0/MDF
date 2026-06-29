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
    queryset = ActivityLog.objects.select_related('user', 'outlet')
    serializer_class = ActivityLogSerializer
    permission_classes = [IsSuperAdmin]  # Only super admin
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ActivityLogFilter
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']

class ActivityLogExportView(generics.ListAPIView):
    """
    Export filtered audit logs as CSV.
    """
    queryset = ActivityLog.objects.select_related('user', 'outlet')
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ActivityLogFilter
    ordering = ['-timestamp']

    def get(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_logs.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Timestamp', 'Module', 'Action', 'User', 'Outlet', 'Entity Type', 'Entity ID', 'Entity Label', 'Description'])
        
        for log in queryset.iterator():
            writer.writerow([
                log.timestamp.isoformat() if log.timestamp else '',
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
