from django.contrib import admin
from .models import ActivityLog

@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'user', 'outlet', 'module', 'action', 'entity_type', 'status_code', 'ip_is_routable')
    list_filter = ('module', 'action', 'entity_type', 'status_code', 'timestamp', 'ip_is_routable')
    search_fields = ('user__username', 'user__email', 'action', 'module', 'entity_id', 'entity_label', 'description')
    readonly_fields = [f.name for f in ActivityLog._meta.fields]
    date_hierarchy = 'timestamp'
    
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def _is_super_admin(self, user):
        if not user or not user.is_authenticated:
            return False
        return getattr(user, 'role', None) == 'super_admin'

    def has_module_perms(self, request):
        return self._is_super_admin(request.user)

    def has_view_permission(self, request, obj=None):
        return self._is_super_admin(request.user)
