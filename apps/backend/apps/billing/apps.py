from django.apps import AppConfig

class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.billing'

    def ready(self):
        from .models import SaleInvoice, SaleItem, PaymentEntry, SalesReturn, SalesReturnItem, ReceiptEntry, ExpenseEntry
        from .models import SaleInvoice, SaleItem, PaymentEntry, SalesReturn, SalesReturnItem, ReceiptEntry, ExpenseEntry
