import sys
import os
import django
import json
from django.core.serializers.json import DjangoJSONEncoder

sys.path.append('/home/asta/coding/MDF/apps/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.audit.models import DocumentRevision
from apps.billing.serializers import DocumentRevisionSerializer

rev = DocumentRevision.objects.last()
if rev:
    serializer = DocumentRevisionSerializer(rev)
    print(json.dumps(serializer.data, indent=2, cls=DjangoJSONEncoder))
else:
    print("No revisions found.")
