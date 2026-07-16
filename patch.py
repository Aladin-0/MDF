import re

with open('apps/backend/apps/billing/views.py', 'r') as f:
    content = f.read()

# Fix 500 in SaleRevisionListView (invalid UUID in filter)
old_code = """        revisions = BillRevision.objects.filter(outlet_id=outlet_id).select_related('original_invoice', 'modified_by')"""
new_code = """        from django.core.exceptions import ValidationError
        try:
            revisions = BillRevision.objects.filter(outlet_id=outlet_id).select_related('original_invoice', 'modified_by')
        except ValidationError:
            return Response({'detail': 'Invalid outletId'}, status=400)"""

content = content.replace(old_code, new_code)

# Fix 500 in SaleRevisionDetailView
old_code2 = """        invoice = get_object_or_404(SaleInvoice, id=sale_id, outlet_id=outlet_id)"""
new_code2 = """        from django.core.exceptions import ValidationError
        try:
            invoice = get_object_or_404(SaleInvoice, id=sale_id, outlet_id=outlet_id)
        except ValidationError:
            return Response({'detail': 'Invalid ID'}, status=404)"""

content = content.replace(old_code2, new_code2)

with open('apps/backend/apps/billing/views.py', 'w') as f:
    f.write(content)
