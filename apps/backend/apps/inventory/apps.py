from django.apps import AppConfig

class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.inventory'

    def ready(self):
        from .models import MasterProduct, Batch
        from apps.audit.registry import register_audit
        register_audit(MasterProduct, 'inventory')
        register_audit(Batch, 'inventory')
