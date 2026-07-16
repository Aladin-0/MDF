import os

file_path = '/home/asta/coding/MDF/apps/backend/apps/billing/views.py'
with open(file_path, 'r') as f:
    content = f.read()

TARGET = """        # Get all revisions related to this invoice
        # Could be original_invoice or resulting_invoice
        from django.db.models import Q
        revisions = DocumentRevision.objects.filter(
            Q(original_invoice_id=sale_id) | Q(resulting_invoice_id=sale_id),
            outlet_id=outlet_id
        ).order_by('-created_at')
        
        serializer = DocumentRevisionSerializer(revisions, many=True)"""

REPLACEMENT = """        # Get all revisions related to this invoice
        from django.db.models import Q
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(SaleInvoice)
        
        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.models import DocumentRevisionV2
            from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
            
            revisions_v2 = DocumentRevisionV2.objects.filter(
                content_type=ct, object_id=str(sale_id), tenant_id=outlet_id
            ).order_by('-created_at')
            serializer = DocumentRevisionV2LegacyAdapterSerializer(revisions_v2, many=True)
        else:
            revisions = DocumentRevision.objects.filter(
                Q(object_id=str(sale_id)) | Q(resulting_document_id=str(sale_id)),
                content_type=ct,
                outlet_id=outlet_id
            ).order_by('-created_at')
            serializer = DocumentRevisionSerializer(revisions, many=True)"""

content = content.replace(TARGET, REPLACEMENT)

with open(file_path, 'w') as f:
    f.write(content)
print("SaleRevisionDetailView patched manually")
