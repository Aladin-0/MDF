from django.urls import path
from apps.reports.views import (
    SalesDailyReportView, GSTR1ReportView,
    SalesSummaryReportView, GSTR2ReportView, GSTR3BReportView, InventoryValuationView,
    InventoryMovementReportView, ExpiryReportView, StaffPerformanceReportView,
    BalanceSheetView, GSTR2AReconciliationView, ScheduleReportView,
    BatchWiseReportView, BatchWiseReportExportView
)
from apps.reports import dashboard_views

from apps.reports.daily_snapshot_views import DailySnapshotView, DailySnapshotExportView, DailyCashReportView, FixedMonthlyExpenseView, BankDepositView
from apps.reports.erp_views import (
    ConsolidatedSalesBookView,
    ConsolidatedSalesBookExportView,
    GrossProfitReportView,
    GrossProfitReportExportView,
    SalesReturnBookView,
    SalesReturnBookExportView,
    GrossLossOnReturnView,
    GrossLossOnReturnExportView,
    PurchaseBookView,
    PurchaseBookExportView,
    PurchaseReturnBookView,
    PurchaseReturnBookExportView,
)

urlpatterns = [
    # Marg ERP-Style Reports (Phase 1 Engine & Phase 2 Exporter)
    path('erp/sales-book/', ConsolidatedSalesBookView.as_view(), name='erp-sales-book'),
    path('erp/sales-book/export/', ConsolidatedSalesBookExportView.as_view(), name='erp-sales-book-export'),
    path('erp/gross-profit/', GrossProfitReportView.as_view(), name='erp-gross-profit'),
    path('erp/gross-profit/export/', GrossProfitReportExportView.as_view(), name='erp-gross-profit-export'),
    path('erp/sales-return-book/', SalesReturnBookView.as_view(), name='erp-sales-return-book'),
    path('erp/sales-return-book/export/', SalesReturnBookExportView.as_view(), name='erp-sales-return-book-export'),
    path('erp/gross-loss-return/', GrossLossOnReturnView.as_view(), name='erp-gross-loss-return'),
    path('erp/gross-loss-return/export/', GrossLossOnReturnExportView.as_view(), name='erp-gross-loss-return-export'),
    path('erp/purchase-book/', PurchaseBookView.as_view(), name='erp-purchase-book'),
    path('erp/purchase-book/export/', PurchaseBookExportView.as_view(), name='erp-purchase-book-export'),
    path('erp/purchase-return-book/', PurchaseReturnBookView.as_view(), name='erp-purchase-return-book'),
    path('erp/purchase-return-book/export/', PurchaseReturnBookExportView.as_view(), name='erp-purchase-return-book-export'),

    path('daily-snapshot/', DailySnapshotView.as_view(), name='daily-snapshot'),
    path('daily-snapshot/export/', DailySnapshotExportView.as_view(), name='daily-snapshot-export'),
    path('daily-snapshot/cash/', DailyCashReportView.as_view(), name='daily-snapshot-cash'),
    path('daily-snapshot/fixed-expenses/', FixedMonthlyExpenseView.as_view(), name='daily-snapshot-fixed-expenses'),
    path('daily-snapshot/bank-deposit/', BankDepositView.as_view(), name='daily-snapshot-bank-deposit'),
    path('sales/daily/', SalesDailyReportView.as_view(), name='sales-daily-report'),
    path('sales/summary/', SalesSummaryReportView.as_view(), name='sales-summary-report'),
    path('gst/gstr1/', GSTR1ReportView.as_view(), name='gst-gstr1-report'),
    path('gst/gstr2/', GSTR2ReportView.as_view(), name='gst-gstr2-report'),
    path('gst/gstr3b/', GSTR3BReportView.as_view(), name='gst-gstr3b-report'),
    path('inventory/valuation/', InventoryValuationView.as_view(), name='inventory-valuation'),
    path('inventory/movement/', InventoryMovementReportView.as_view(), name='inventory-movement'),
    path('expiry/', ExpiryReportView.as_view(), name='expiry-report'),
    path('staff/performance/', StaffPerformanceReportView.as_view(), name='staff-performance-report'),
    path('balance-sheet/', BalanceSheetView.as_view(), name='balance-sheet'),
    path('gstr2a/', GSTR2AReconciliationView.as_view(), name='gstr2a-reconciliation'),
    path('schedule/', ScheduleReportView.as_view(), name='schedule-report'),
    path('batch-wise/', BatchWiseReportView.as_view(), name='batch-wise-report'),
    path('batch-wise/export/', BatchWiseReportExportView.as_view(), name='batch-wise-report-export'),

    # GST Dashboard MVP endpoints removed to gst_urls.py
]
