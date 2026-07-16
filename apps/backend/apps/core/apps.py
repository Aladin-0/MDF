from django.apps import AppConfig

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        from .models import Organization, Outlet, OutletSettings
        from .models import Organization, Outlet, OutletSettings
