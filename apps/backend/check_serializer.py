import sys
import os
import django
from rest_framework.renderers import JSONRenderer

sys.path.append('/home/asta/coding/MDF/apps/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.billing.serializers import DocumentRevisionSerializer
from apps.billing.models import DocumentRevision

rev = DocumentRevision.objects.last()
if rev:
    serializer = DocumentRevisionSerializer(rev)
    print(JSONRenderer().render(serializer.data).decode('utf-8'))
else:
    print("No revisions found.")
