import os

file_path = '/home/asta/coding/MDF/apps/backend/apps/billing/views.py'
with open(file_path, 'r') as f:
    content = f.read()

TARGET = """        paginator.page_size = int(request.query_params.get('pageSize', 20))
        paginated_revisions = paginator.paginate_queryset(revisions, request)

        serializer = DocumentRevisionSerializer(paginated_revisions, many=True)
        return paginator.get_paginated_response(serializer.data)"""

REPLACEMENT = """        paginator.page_size = int(request.query_params.get('pageSize', 20))
        
        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.models import DocumentRevisionV2
            from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
            from django.contrib.contenttypes.models import ContentType
            from apps.billing.models import SaleInvoice
            
            ct = ContentType.objects.get_for_model(SaleInvoice)
            revisions_v2 = DocumentRevisionV2.objects.filter(content_type=ct, tenant_id=outlet_id).order_by('-created_at')
            
            # Replicate filters for V2
            if user_id:
                revisions_v2 = revisions_v2.filter(actor_id=user_id)
            if action_type:
                revisions_v2 = revisions_v2.filter(action=action_type)
            if from_date:
                revisions_v2 = revisions_v2.filter(created_at__date__gte=from_date)
            if to_date:
                revisions_v2 = revisions_v2.filter(created_at__date__lte=to_date)
            if invoice_id:
                revisions_v2 = revisions_v2.filter(object_id=invoice_id)
            if customer_id or invoice_no:
                # We already have invoices filtered above
                revisions_v2 = revisions_v2.filter(object_id__in=invoices.values_list('id', flat=True))
                
            paginated_revisions = paginator.paginate_queryset(revisions_v2, request)
            serializer = DocumentRevisionV2LegacyAdapterSerializer(paginated_revisions, many=True)
        else:
            paginated_revisions = paginator.paginate_queryset(revisions, request)
            serializer = DocumentRevisionSerializer(paginated_revisions, many=True)
            
        return paginator.get_paginated_response(serializer.data)"""

content = content.replace(TARGET, REPLACEMENT)

TARGET2 = """        # Date filter
        from_date_str = request.query_params.get('fromDate')
        to_date_str = request.query_params.get('toDate')"""

REPLACEMENT2 = """        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.models import DocumentRevisionV2
            from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
            from django.contrib.contenttypes.models import ContentType
            from apps.billing.models import SaleInvoice
            ct = ContentType.objects.get_for_model(SaleInvoice)
            revisions_v2 = DocumentRevisionV2.objects.filter(content_type=ct, tenant_id=outlet_id)
            revisions = revisions_v2 # The rest of the report view just aggregates by date
        
        # Date filter
        from_date_str = request.query_params.get('fromDate')
        to_date_str = request.query_params.get('toDate')"""

content = content.replace(TARGET2, REPLACEMENT2)

with open(file_path, 'w') as f:
    f.write(content)
print("SaleRevisionListView and ReportView patched manually")
