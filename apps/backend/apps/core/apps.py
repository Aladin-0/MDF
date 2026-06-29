from django.apps import AppConfig

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        from .models import Organization, Outlet, OutletSettings
        from apps.audit.registry import register_audit
        register_audit(Organization, 'core')
        register_audit(Outlet, 'core')
        register_audit(OutletSettings, 'core')
