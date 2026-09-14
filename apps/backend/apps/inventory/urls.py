from django.urls import path
from apps.inventory.views import (
    ProductSearchView, InventoryListView, InventoryAlertsView, InventoryAdjustView,
    ProductListView, ProductDetailView, ProductBatchesView, InventoryExportExcelView,
    BatchLandingCostView, StockLedgerView, StockLedgerBatchesView, BatchAvailabilityCheckView
)

urlpatterns = [
    path('batches/<uuid:batch_id>/landing-cost/', BatchLandingCostView.as_view(), name='batch-landing-cost'),
    path('products/', ProductListView.as_view(), name='product-list'),
    path('products/search/', ProductSearchView.as_view(), name='product-search'),
    path('products/<uuid:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('products/<uuid:pk>/batches/', ProductBatchesView.as_view(), name='product-batches'),
    path('inventory/', InventoryListView.as_view(), name='inventory-list'),
    path('inventory/alerts/', InventoryAlertsView.as_view(), name='inventory-alerts'),
    path('inventory/adjust/', InventoryAdjustView.as_view(), name='inventory-adjust'),
    path('inventory/export/excel/', InventoryExportExcelView.as_view(), name='inventory-export-excel'),
    path('inventory/stockledger/batches/', StockLedgerBatchesView.as_view(), name='stockledger-batches'),
    path('inventory/stockledger/', StockLedgerView.as_view(), name='stockledger'),
    path('inventory/batches/availability-check/', BatchAvailabilityCheckView.as_view(), name='batch-availability-check'),
]
