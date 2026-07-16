from django.urls import path
from apps.accounts.views import (
    LoginView, CustomerSearchView, CustomerDetailView,
    SwitchOutletView, CustomerOutstandingInvoicesView,
    DashboardKPIView, DashboardAgingView, DashboardUrgentActionsView, DashboardAuditAlertsView
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('switch-outlet/', SwitchOutletView.as_view(), name='switch-outlet'),
    path('customers/search/', CustomerSearchView.as_view(), name='customer-search'),
    path('customers/<uuid:customer_id>/', CustomerDetailView.as_view(), name='customer-detail'),
    path('customers/<uuid:pk>/outstanding/', CustomerOutstandingInvoicesView.as_view(), name='customer-outstanding'),
    
    # Dashboard Endpoints
    path('dashboard/kpis/', DashboardKPIView.as_view(), name='dashboard-kpis'),
    path('dashboard/aging/', DashboardAgingView.as_view(), name='dashboard-aging'),
    path('dashboard/urgent/', DashboardUrgentActionsView.as_view(), name='dashboard-urgent'),
    path('dashboard/audit-alerts/', DashboardAuditAlertsView.as_view(), name='dashboard-audit-alerts'),
]
