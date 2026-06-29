from rest_framework import serializers
from .models import ActivityLog

class ActivityLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default='')

    class Meta:
        model = ActivityLog
        fields = [
            'id', 'timestamp', 'user', 'user_email', 'outlet', 'outlet_name',
            'action', 'module', 'entity_type', 'entity_id', 'entity_label',
            'description', 'changes_json', 'metadata_json', 'endpoint',
            'http_method', 'status_code', 'ip_address', 'ip_is_routable', 'user_agent', 'request_id'
        ]
        read_only_fields = fields
