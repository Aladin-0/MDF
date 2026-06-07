from django.urls import path
from apps.purchases.views import (
    DistributorListView,
    DistributorDetailView,
    DistributorLedgerView,
    PurchaseCreateView,
    PurchaseListView,
    DistributorPaymentView,
    PurchaseDetailView,
    PaymentListView,
    DistributorOutstandingView,
    PurchaseInvoiceSearchView,
)
from apps.purchases.models import PurchaseInvoice
from apps.accounts.models import Ledger
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from apps.core.models import Outlet

class CheckPurchaseInvoiceView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        invoice_no = request.query_params.get('invoiceNo')
        party_ledger_id = request.query_params.get('partyLedgerId')
        
        if not outlet_id or not invoice_no or not party_ledger_id:
            return Response({'exists': False}, status=status.HTTP_200_OK)
            
        try:
            outlet = Outlet.objects.get(id=outlet_id)
            ledger = Ledger.objects.get(id=party_ledger_id, outlet=outlet)
            distributor = ledger.linked_distributor
            
            if not distributor:
                return Response({'exists': False}, status=status.HTTP_200_OK)
                
            exists = PurchaseInvoice.objects.filter(
                outlet=outlet,
                distributor=distributor,
                invoice_no__iexact=invoice_no
            ).exists()
            
            return Response({'exists': exists}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'exists': False}, status=status.HTTP_200_OK)


# Create a combined view that handles both GET and POST on root purchases/ endpoint
class PurchasesView(PurchaseListView, PurchaseCreateView):
    def get(self, request, *args, **kwargs):
        return PurchaseListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return PurchaseCreateView.post(self, request, *args, **kwargs)


# Combined GET + POST on payments endpoint
class PaymentListCreateView(PaymentListView, DistributorPaymentView):
    def get(self, request, *args, **kwargs):
        return PaymentListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return DistributorPaymentView.post(self, request, *args, **kwargs)


urlpatterns = [
    path('check-invoice/', CheckPurchaseInvoiceView.as_view(), name='purchase-check-invoice'),
    path('invoices/search/', PurchaseInvoiceSearchView.as_view(), name='purchase-invoice-search'),
    path('', PurchasesView.as_view(), name='purchase-list-create'),
    path('payments/', PaymentListCreateView.as_view(), name='distributor-payment'),
    path('distributors/<uuid:pk>/outstanding/', DistributorOutstandingView.as_view(), name='distributor-outstanding'),
    path('distributors/', DistributorListView.as_view(), name='distributor-list'),
    path('distributors/<uuid:distributor_id>/', DistributorDetailView.as_view(), name='distributor-detail'),
    path('distributors/<uuid:distributor_id>/ledger/', DistributorLedgerView.as_view(), name='distributor-ledger'),
    path('<uuid:purchase_id>/', PurchaseDetailView.as_view(), name='purchase-detail'),
]
