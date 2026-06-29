from django.apps import AppConfig

class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.billing'

    def ready(self):
        from .models import SaleInvoice, SaleItem, PaymentEntry, SalesReturn, SalesReturnItem, ReceiptEntry, ExpenseEntry
        from apps.audit.registry import register_audit
        register_audit(SaleInvoice, 'billing')
        register_audit(SaleItem, 'billing')
        register_audit(PaymentEntry, 'payments')
        register_audit(SalesReturn, 'billing')
        register_audit(SalesReturnItem, 'billing')
        register_audit(ReceiptEntry, 'payments')
        register_audit(ExpenseEntry, 'billing')
