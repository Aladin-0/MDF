from django.urls import path
from apps.accounts.views import (
    CustomerListView, CustomerSearchView, CustomerDetailView, CustomerPurchaseHistoryView,
    ChronicMedicinesView, RefillAlertsView, CustomerOutstandingInvoicesView, CustomerMembersView, CustomerAccountView,
)
from apps.billing.views import CustomerLedgerView

urlpatterns = [
    path('', CustomerListView.as_view(), name='customer-list'),
    path('search/', CustomerSearchView.as_view(), name='customer-search'),
    path('refill-alerts/', RefillAlertsView.as_view(), name='customer-refill-alerts'),
    path('<uuid:customer_id>/', CustomerDetailView.as_view(), name='customer-detail'),
    path('<uuid:customer_id>/purchase-history/', CustomerPurchaseHistoryView.as_view(), name='customer-purchase-history'),
    path('<uuid:customer_id>/members/', CustomerMembersView.as_view(), name='customer-members'),
    path('<uuid:customer_id>/account/', CustomerAccountView.as_view(), name='customer-account'),
    path('<uuid:customer_id>/ledger/', CustomerLedgerView.as_view(), name='customer-ledger'),
    path('<uuid:customer_id>/chronic-medicines/', ChronicMedicinesView.as_view(), name='customer-chronic-medicines'),
    path('<uuid:pk>/outstanding/', CustomerOutstandingInvoicesView.as_view(), name='customer-outstanding'),
]
