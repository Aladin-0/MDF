from django.urls import path
from apps.reports.exports.gstr1_excel import GSTR1ExcelExportView
from apps.reports.exports.gstr3b_excel import GSTR3BExcelExportView
from apps.reports.exports.ca_working_paper import CAWorkingPaperPDFExportView
from apps.reports.exports.reconciliation_excel import ReconciliationExcelExportView
from apps.reports.exports.gstr2b_json import GSTR2BJsonExportView
from apps.reports import dashboard_views

urlpatterns = [
    path('periods/', dashboard_views.GSTPeriodsView.as_view(), name='gst-periods'),
    path('summary/<str:fp>/', dashboard_views.GSTSummaryView.as_view(), name='gst-summary'),
    path('reconciliation/<str:fp>/', dashboard_views.GSTReconciliationView.as_view(), name='gst-reconciliation'),
    path('export/<str:fp>/gstr1_excel/', GSTR1ExcelExportView.as_view(), name='gst-export-gstr1-excel'),
    path('export/<str:fp>/gstr3b_excel/', GSTR3BExcelExportView.as_view(), name='gst-export-gstr3b-excel'),
    path('export/<str:fp>/ca_working_paper/', CAWorkingPaperPDFExportView.as_view(), name='gst-export-ca-working-paper'),
    path('periods/<str:fp>/export/reconciliation/', ReconciliationExcelExportView.as_view(), name='gst-export-reconciliation-excel'),
    path('export/<str:fp>/gstr2b_json/', GSTR2BJsonExportView.as_view(), name='gst-export-gstr2b-json'),
    path('export/<str:fp>/<str:export_type>/', dashboard_views.GSTExportView.as_view(), name='gst-export'),
]
