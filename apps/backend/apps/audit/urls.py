from django.urls import path
from .views import ActivityLogListView, ActivityLogExportView, UnifiedRevisionDetailView

urlpatterns = [
    path('logs/export/', ActivityLogExportView.as_view(), name='activity-log-export'),
    path('logs/', ActivityLogListView.as_view(), name='activity-log-list'),
    path('revisions/<str:record_type>/<uuid:record_id>/', UnifiedRevisionDetailView.as_view(), name='unified-revision-detail'),
]
