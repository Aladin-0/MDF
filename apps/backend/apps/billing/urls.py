from apps.billing.views import (
    SaleCreateView, SaleListView,
    CustomerCreditPaymentView,
    CreditAccountListView, CreditAccountDetailView,
    DashboardDailyView, SalePrintView,
    SaleDetailView, SaleItemsView, CreditTransactionListView, CreditLedgerView,
    # Phase 2
    ReceiptListCreateView,
    UpdateCreditLimitView,
    CreateSalesReturnView,
    SalesReturnListView,
    SalesReturnDetailView,
    SalesReturnPrintView,
    CustomerLedgerView,
    SendReminderView,
    NextInvoiceNumberView,
    SaleInvoiceSearchView,
    SaleModificationOptionsView,
    SaleReviseView,
    SaleRevisionListView,
    SaleRevisionReportView,
    DraftInvoiceListCreateView,
    DraftInvoiceDetailView,
)
from .quotation_views import QuotationListCreateView, QuotationDetailView, QuotationConvertView

# Create a combined view that handles both GET and POST
class SalesView(SaleListView, SaleCreateView):
    def get(self, request, *args, **kwargs):
        return SaleListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return SaleCreateView.post(self, request, *args, **kwargs)

urlpatterns = [
    path('invoice-number/', NextInvoiceNumberView.as_view(), name='invoice-number'),
    # Invoice search (must be before generic sales/<uuid>/)
    path('sales/invoices/search/', SaleInvoiceSearchView.as_view(), name='sale-invoice-search'),
    # Sales returns (specific paths before generic sales/)
    path('sales/returns/<uuid:pk>/print/', SalesReturnPrintView.as_view(), name='sales-return-print'),
    path('sales/returns/<uuid:pk>/', SalesReturnDetailView.as_view(), name='sales-return-detail'),
    path('sales/returns/', SalesReturnListView.as_view(), name='sales-return-list'),
    path('sales/return/', CreateSalesReturnView.as_view(), name='sales-return-create'),
    path('sales/<uuid:sale_id>/print/', SalePrintView.as_view(), name='sale-print'),
    path('sales/<uuid:sale_id>/items/', SaleItemsView.as_view(), name='sale-items'),
    path('sales/<uuid:sale_id>/', SaleDetailView.as_view(), name='sale-detail'),
    path('sales/<uuid:sale_id>/modification-options/', SaleModificationOptionsView.as_view(), name='sale-modification-options'),
    path('sales/<uuid:sale_id>/revise/', SaleReviseView.as_view(), name='sale-revise'),
    path('sales/revisions/report/', SaleRevisionReportView.as_view(), name='sale-revisions-report'),
    path('sales/', SalesView.as_view(), name='sale-list-create'),
    path('sales/drafts/', DraftInvoiceListCreateView.as_view(), name='draft-list-create'),
    path('sales/drafts/<uuid:pk>/', DraftInvoiceDetailView.as_view(), name='draft-detail'),
    path('revisions/', SaleRevisionListView.as_view(), name='sale-revisions-list'),
    # Credit
    path('credit/', CreditAccountListView.as_view(), name='credit-account-list'),
    path('credit/accounts/<uuid:account_id>/', CreditAccountDetailView.as_view(), name='credit-account-detail'),
    path('credit/<uuid:account_id>/transactions/', CreditTransactionListView.as_view(), name='credit-transactions'),
    path('credit/<uuid:customer_id>/ledger/', CreditLedgerView.as_view(), name='credit-ledger'),
    path('credit/<uuid:pk>/limit/', UpdateCreditLimitView.as_view(), name='credit-limit-update'),
    path('credit/payment/', CustomerCreditPaymentView.as_view(), name='credit-payment'),
    # Receipts
    path('receipts/', ReceiptListCreateView.as_view(), name='receipt-list-create'),
    # Credit reminder
    path('credit/<uuid:id>/reminder/', SendReminderView.as_view(), name='credit-reminder'),
    # Dashboard
    path('dashboard/daily/', DashboardDailyView.as_view(), name='dashboard-daily'),
    # Quotations
    path('quotations/', QuotationListCreateView.as_view(), name='quotation-list-create'),
    path('quotations/<uuid:pk>/', QuotationDetailView.as_view(), name='quotation-detail'),
    path('quotations/<uuid:pk>/convert/', QuotationConvertView.as_view(), name='quotation-convert'),
]
