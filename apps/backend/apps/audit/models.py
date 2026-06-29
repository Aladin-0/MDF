from django.db import models
from django.conf import settings

class ActivityLog(models.Model):
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='activity_logs')
    outlet = models.ForeignKey('core.Outlet', null=True, blank=True, on_delete=models.SET_NULL, related_name='activity_logs')
    
    action = models.CharField(max_length=255, db_index=True)
    module = models.CharField(max_length=255, db_index=True)
    
    entity_type = models.CharField(max_length=255, blank=True, db_index=True)
    entity_id = models.CharField(max_length=255, blank=True, db_index=True)
    entity_label = models.CharField(max_length=255, blank=True)
    
    description = models.TextField(blank=True)
    
    changes_json = models.JSONField(default=dict, blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)
    
    endpoint = models.CharField(max_length=512, blank=True)
    http_method = models.CharField(max_length=20, blank=True)
    status_code = models.IntegerField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    ip_is_routable = models.BooleanField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    request_id = models.CharField(max_length=255, blank=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['module', 'action']),
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['timestamp', 'outlet']),
        ]

    def __str__(self):
        return f"{self.timestamp} - {self.user} - {self.action} on {self.module}"
