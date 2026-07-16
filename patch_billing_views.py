import re

file_path = '/home/asta/coding/MDF/apps/backend/apps/billing/views.py'
with open(file_path, 'r') as f:
    content = f.read()

# Replace BillRevision with DocumentRevision globally
content = content.replace('BillRevision', 'DocumentRevision')
content = content.replace('BillRevisionSerializer', 'DocumentRevisionSerializer')

with open(file_path, 'w') as f:
    f.write(content)
print("Replaced BillRevision with DocumentRevision")
