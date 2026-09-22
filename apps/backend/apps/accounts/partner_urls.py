from django.urls import path
from apps.accounts.partner_views import PartnerListCreateView, PartnerDetailView

urlpatterns = [
    path('', PartnerListCreateView.as_view(), name='partner-list-create'),
    path('<uuid:pk>/', PartnerDetailView.as_view(), name='partner-detail'),
]
