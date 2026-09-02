from django.urls import path
from apps.gst.views import (
    SandboxStatusView, 
    SandboxRequestOTPView, 
    SandboxVerifyOTPView, 
    GSTR2BSyncView,
    GSTR2BStatusView,
    GSTR2BReconciliationRunView,
    GSTExportAuditView,
    GSTR1InvoicesView,
    GSTR2BReconciliationDataView,
    GSTR2AWarningView
)

urlpatterns = [
    path('sandbox/status/', SandboxStatusView.as_view(), name='sandbox-status'),
    path('sandbox/request-otp/', SandboxRequestOTPView.as_view(), name='sandbox-request-otp'),
    path('sandbox/verify-otp/', SandboxVerifyOTPView.as_view(), name='sandbox-verify-otp'),
    path('sandbox/gstr2b/sync/', GSTR2BSyncView.as_view(), name='gstr2b-sync'),
    path('sandbox/gstr2b/status/', GSTR2BStatusView.as_view(), name='gstr2b-status'),
    path('sandbox/reconciliation/run/', GSTR2BReconciliationRunView.as_view(), name='reconciliation-run'),
    path('audit/', GSTExportAuditView.as_view(), name='gst-export-audit'),
    path('gstr1-invoices/', GSTR1InvoicesView.as_view(), name='gstr1-invoices'),
    path('periods/<str:fp>/gstr2b-reconciliation/', GSTR2BReconciliationDataView.as_view(), name='gstr2b-reconciliation'),
    path('periods/<str:fp>/gstr2a-warning/', GSTR2AWarningView.as_view(), name='gstr2a-warning'),
]
