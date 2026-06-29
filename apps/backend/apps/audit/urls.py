from django.urls import path
from .views import ActivityLogListView, ActivityLogExportView

urlpatterns = [
    path('logs/', ActivityLogListView.as_view(), name='activity-log-list'),
    path('logs/export/', ActivityLogExportView.as_view(), name='activity-log-export'),
]
