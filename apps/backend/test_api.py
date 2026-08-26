import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.local_sqlite')
django.setup()

from django.test import RequestFactory
from apps.reports.dashboard_views import GSTPeriodsView, GSTSummaryView, GSTReconciliationView

factory = RequestFactory()
request = factory.get('/')
view = GSTPeriodsView.as_view()
response = view(request)
print("Periods:", response.data)

view_summary = GSTSummaryView.as_view()
res_summary = view_summary(request, fp='052026')
print("Summary 052026:", res_summary.data)
