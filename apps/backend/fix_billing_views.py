import os

file_path = '/home/asta/coding/MDF/apps/backend/apps/billing/views.py'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Fix the permissions import
content = content.replace('CanViewDocumentRevisionHistory', 'CanViewBillRevisionHistory')

# 2. Fix the models import for DocumentRevision
content = content.replace(
    'from apps.billing.models import DocumentRevision\n',
    'from apps.audit.models import DocumentRevision\n'
)
content = content.replace(
    'from apps.billing.models import DocumentRevision, SaleInvoice\n',
    'from apps.audit.models import DocumentRevision\n        from apps.billing.models import SaleInvoice\n'
)

with open(file_path, 'w') as f:
    f.write(content)
print("Fixes applied.")
