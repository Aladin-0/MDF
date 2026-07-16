from django.apps import AppConfig

class PurchasesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.purchases'

    def ready(self):
        from .models import PurchaseInvoice, PurchaseItem, Distributor
        from .models import PurchaseInvoice, PurchaseItem, Distributor
