from django.urls import path
from apps.purchases.po_views import (
    PurchaseOrderListView, PurchaseOrderDetailView, PurchaseOrderSendView, PurchaseOrderCancelView, PurchaseOrderCloseShortView,
    PurchaseOrderDuplicateView, PurchaseOrderOpenView, PurchaseOrderItemsView, PurchaseOrderByDistributorView,
    PurchaseOrderSuggestionsView, PurchaseOrderBulkCreateView, ShortbookListView, ShortbookDetailView, ShortbookBulkView, ShortbookProductInfoView,
    ShortbookCreatePOsView, PurchaseOrderSettingsView, PublicPurchaseOrderView,
)
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
    PurchaseOrderExcelExportView,
    PurchaseOrderPdfExportView,
    InvoiceScanUploadView,
    InvoiceOCRStatusView,
    InvoiceOCRRetryView,
    InvoiceDraftConfirmView,
)
from apps.purchases.models import PurchaseInvoice
from apps.accounts.models import Ledger
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated, MethodPermissionMixin
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
class PurchasesView(MethodPermissionMixin, PurchaseListView, PurchaseCreateView):
    # POST must use CanCreatePurchases (the list view's CanAccessPurchases lets any manager create)
    method_permissions = {
        'GET': PurchaseListView.permission_classes,
        'POST': PurchaseCreateView.permission_classes,
    }

    def get(self, request, *args, **kwargs):
        return PurchaseListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return PurchaseCreateView.post(self, request, *args, **kwargs)


# Combined GET + POST on payments endpoint
class PaymentListCreateView(MethodPermissionMixin, PaymentListView, DistributorPaymentView):
    method_permissions = {
        'GET': PaymentListView.permission_classes,
        'POST': DistributorPaymentView.permission_classes,
    }

    def get(self, request, *args, **kwargs):
        return PaymentListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return DistributorPaymentView.post(self, request, *args, **kwargs)


urlpatterns = [
    # --- Scan Purchase endpoints ---
    path('scan/upload/', InvoiceScanUploadView.as_view(), name='purchase-scan-upload'),
    path('<uuid:purchase_id>/ocr-status/', InvoiceOCRStatusView.as_view(), name='purchase-ocr-status'),
    path('<uuid:purchase_id>/ocr-retry/', InvoiceOCRRetryView.as_view(), name='purchase-ocr-retry'),
    path('<uuid:purchase_id>/confirm/', InvoiceDraftConfirmView.as_view(), name='purchase-draft-confirm'),

    # --- Existing endpoints ---
    path('check-invoice/', CheckPurchaseInvoiceView.as_view(), name='purchase-check-invoice'),
    path('invoices/search/', PurchaseInvoiceSearchView.as_view(), name='purchase-invoice-search'),
    path('orders/', PurchaseOrderListView.as_view(), name='purchase-order-list'),
    path('orders/open/', PurchaseOrderOpenView.as_view(), name='purchase-order-open'),
    path('orders/items/', PurchaseOrderItemsView.as_view(), name='purchase-order-items'),
    path('orders/by-distributor/', PurchaseOrderByDistributorView.as_view(), name='purchase-order-by-distributor'),
    path('orders/<uuid:pk>/send/', PurchaseOrderSendView.as_view(), name='purchase-order-send'),
    path('orders/<uuid:pk>/cancel/', PurchaseOrderCancelView.as_view(), name='purchase-order-cancel'),
    path('orders/<uuid:pk>/close-short/', PurchaseOrderCloseShortView.as_view(), name='purchase-order-close-short'),
    path('orders/<uuid:pk>/duplicate/', PurchaseOrderDuplicateView.as_view(), name='purchase-order-duplicate'),
    path('shortbook/', ShortbookListView.as_view(), name='shortbook-list'),
    path('shortbook/bulk/', ShortbookBulkView.as_view(), name='shortbook-bulk'),
    path('shortbook/product-info/', ShortbookProductInfoView.as_view(), name='shortbook-product-info'),
    path('shortbook/create-pos/', ShortbookCreatePOsView.as_view(), name='shortbook-create-pos'),
    path('shortbook/<uuid:pk>/', ShortbookDetailView.as_view(), name='shortbook-detail'),
    path('settings/po/', PurchaseOrderSettingsView.as_view(), name='po-settings'),
    path('public/po/<str:token>/', PublicPurchaseOrderView.as_view(), name='po-public'),
    path('orders/<uuid:pk>/', PurchaseOrderDetailView.as_view(), name='purchase-order-detail'),
    path('orders/<uuid:pk>/export/excel/', PurchaseOrderExcelExportView.as_view(), name='purchase-order-export-excel'),
    path('orders/<uuid:pk>/export/pdf/', PurchaseOrderPdfExportView.as_view(), name='purchase-order-export-pdf'),
    path('orders/suggestions/', PurchaseOrderSuggestionsView.as_view(), name='purchase-order-suggestions'),
    path('orders/bulk-create/', PurchaseOrderBulkCreateView.as_view(), name='purchase-order-bulk-create'),
    path('', PurchasesView.as_view(), name='purchase-list-create'),
    path('payments/', PaymentListCreateView.as_view(), name='distributor-payment'),
    path('distributors/<uuid:pk>/outstanding/', DistributorOutstandingView.as_view(), name='distributor-outstanding'),
    path('distributors/', DistributorListView.as_view(), name='distributor-list'),
    path('distributors/<uuid:distributor_id>/', DistributorDetailView.as_view(), name='distributor-detail'),
    path('distributors/<uuid:distributor_id>/ledger/', DistributorLedgerView.as_view(), name='distributor-ledger'),
    path('<uuid:purchase_id>/', PurchaseDetailView.as_view(), name='purchase-detail'),
]
