import re

line1 = "revisions = DocumentRevision.objects.filter(content_type=sale_invoice_ct, object_id=invoice_id)"
line2 = "Q(content_type=purchase_invoice_ct, object_id=purchase_id) | Q(resulting_document_id=purchase_id),"

m1 = re.search(r'content_type=([\w_]+),\s*object_id=(?:str\()?([\w_]+)\)?', line1)
m2 = re.search(r'content_type=([\w_]+),\s*object_id=(?:str\()?([\w_]+)\)?', line2)

print("m1:", m1.groups() if m1 else None)
print("m2:", m2.groups() if m2 else None)
