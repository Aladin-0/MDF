import re

with open('apps/billing/views.py', 'r') as f:
    content = f.read()

# Replace SaleRevisionListView
old_list = """    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.billing.models import BillRevision
        from apps.billing.serializers import BillRevisionSerializer

        from django.core.exceptions import ValidationError
        try:
            revisions = BillRevision.objects.filter(outlet_id=outlet_id).select_related('original_invoice', 'modified_by')
        except ValidationError:
            return Response({'detail': 'Invalid outletId'}, status=400)"""

new_list = """    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.audit.models import DocumentRevisionV2
        from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer

        from django.core.exceptions import ValidationError
        try:
            revisions = DocumentRevisionV2.objects.filter(tenant_id=outlet_id)
        except ValidationError:
            return Response({'detail': 'Invalid outletId'}, status=400)"""

content = content.replace(old_list, new_list)

# Fix filters
content = content.replace("revisions = revisions.filter(modified_by_id=user_id)", "revisions = revisions.filter(actor_id=user_id)")
content = content.replace("revisions = revisions.filter(revision_type=action_type)", "revisions = revisions.filter(action=action_type)")
content = content.replace("revisions = revisions.filter(original_invoice_id=invoice_id)", "revisions = revisions.filter(object_id=invoice_id)")
content = content.replace("revisions = revisions.filter(original_invoice__customer_id=customer_id)", "pass # Filter removed in V2")
content = content.replace("revisions = revisions.filter(original_invoice__invoice_no__icontains=invoice_no)", "pass # Filter removed in V2")

# Replace serializer call in SaleRevisionListView
old_paginator = """        paginated_revisions = paginator.paginate_queryset(revisions, request)
        serializer = BillRevisionSerializer(paginated_revisions, many=True)
        return paginator.get_paginated_response(serializer.data)"""

new_paginator = """        paginated_revisions = paginator.paginate_queryset(revisions, request)
        serializer = DocumentRevisionV2LegacyAdapterSerializer(paginated_revisions, many=True)
        return paginator.get_paginated_response(serializer.data)"""

content = content.replace(old_paginator, new_paginator)


# Replace SaleRevisionReportView
old_report = """    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.billing.models import BillRevision
        from django.utils import timezone
        from django.db.models import Count
        from datetime import datetime, time

        revisions = BillRevision.objects.filter(outlet_id=outlet_id)"""

new_report = """    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.META.get('HTTP_OUTLETID') or (request.outlet.id if hasattr(request, 'outlet') else None)
        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=400)

        from apps.audit.models import DocumentRevisionV2
        from django.utils import timezone
        from django.db.models import Count
        from datetime import datetime, time

        revisions = DocumentRevisionV2.objects.filter(tenant_id=outlet_id)"""

content = content.replace(old_report, new_report)

# Fix summary fields
content = content.replace("modified_today = revisions.filter(created_at__range=(today_start, today_end)).count()", "modified_today = revisions.filter(created_at__range=(today_start, today_end)).count()")
content = content.replace("revisions.values('revision_type').annotate(count=Count('id'))", "revisions.values('action').annotate(count=Count('id'))")
content = content.replace("item['revision_type']", "item['action']")

with open('apps/billing/views.py', 'w') as f:
    f.write(content)
