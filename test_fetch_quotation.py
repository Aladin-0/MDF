import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from apps.billing.models import Quotation
from apps.billing.serializers import QuotationSerializer

q = Quotation.objects.last()
print("Quotation:", q.id)
serializer = QuotationSerializer(q)
import json
print(json.dumps(serializer.data, indent=2))
