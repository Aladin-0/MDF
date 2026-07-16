import sys
import os
import django

sys.path.append('/home/asta/coding/MDF/apps/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.audit.models import DocumentRevision

rev = DocumentRevision.objects.last()
if rev:
    print("Content type:", rev.content_type)
    print("Object ID:", rev.object_id)
    print("Original document:", getattr(rev, 'original_document', None))
else:
    print("No revisions found.")
