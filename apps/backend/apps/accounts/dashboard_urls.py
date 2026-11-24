"""Accounts Dashboard endpoints, mounted at /api/v1/ (see mediflow/urls.py)."""
from django.urls import path
from apps.accounts.views import DashboardKPIView, DashboardAgingView, DashboardUrgentActionsView

urlpatterns = [
    path('dashboard/kpis/', DashboardKPIView.as_view(), name='dashboard-kpis'),
    path('dashboard/aging/', DashboardAgingView.as_view(), name='dashboard-aging'),
    path('dashboard/urgent/', DashboardUrgentActionsView.as_view(), name='dashboard-urgent'),
]
