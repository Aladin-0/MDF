import os
import glob
import re

test_dir = 'apps/billing/tests'
files = glob.glob(os.path.join(test_dir, '*.py'))

for f in files:
    with open(f, 'r') as file:
        content = file.read()
        
    original = content
    
    # Fix imports
    content = re.sub(r'from apps\.billing\.models import (.*?)BillRevision(.*)', 
                     lambda m: f"from apps.billing.models import {m.group(1)}{m.group(2)}\nfrom apps.audit.models import DocumentRevision\nfrom django.contrib.contenttypes.models import ContentType", 
                     content)
    
    content = content.replace("from apps.billing.models import ,", "from apps.billing.models import ")
    content = content.replace("from apps.billing.models import \n", "")
    content = content.replace("from apps.billing.models import  Sale", "from apps.billing.models import Sale")
    
    if "from apps.audit.models import DocumentRevision" not in content and "BillRevision" in content:
        content = content.replace("from apps.billing.models import ", "from apps.billing.models import ")
        content = "from apps.audit.models import DocumentRevision\nfrom django.contrib.contenttypes.models import ContentType\n" + content
    
    # Fix usages
    content = content.replace("BillRevision.objects", "DocumentRevision.objects")
    content = content.replace("original_invoice=invoice", "object_id=invoice.id")
    content = content.replace("original_invoice=self.invoice", "object_id=self.invoice.id")
    
    # For create
    content = content.replace("DocumentRevision.objects.create(\n", "DocumentRevision.objects.create(\n            content_type=ContentType.objects.get_for_model(SaleInvoice),\n            object_id=self.invoice.id if 'self.invoice' in locals() or 'self.invoice' in globals() else invoice.id,\n")

    if content != original:
        with open(f, 'w') as file:
            file.write(content)
        print(f"Updated {f}")
