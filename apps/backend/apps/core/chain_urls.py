from django.urls import path
from apps.core.chain_views import (
    OrganizationListView, OrganizationDetailView,
    ChainDashboardView, OrganizationOutletListView,
    AllOutletsView,
)

urlpatterns = [
    path('', OrganizationListView.as_view(), name='organization-list'),
    path('dashboard/', ChainDashboardView.as_view(), name='chain-dashboard'),
    path('outlets/all/', AllOutletsView.as_view(), name='all-outlets'),
    path('<uuid:pk>/', OrganizationDetailView.as_view(), name='organization-detail'),
    path('<uuid:org_id>/outlets/', OrganizationOutletListView.as_view(), name='organization-outlets'),
]

