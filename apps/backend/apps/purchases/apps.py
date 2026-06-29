from django.apps import AppConfig

class PurchasesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.purchases'

    def ready(self):
        from .models import PurchaseInvoice, PurchaseItem, Distributor
        from apps.audit.registry import register_audit
        register_audit(PurchaseInvoice, 'purchases')
        register_audit(PurchaseItem, 'purchases')
        register_audit(Distributor, 'purchases')
