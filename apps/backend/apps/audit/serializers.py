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

from .models import DocumentRevisionV2
from apps.accounts.models import Staff

class DocumentRevisionV2LegacyAdapterSerializer(serializers.ModelSerializer):
    """
    Adapter that serializes DocumentRevisionV2 into the EXACT shape expected by the frontend
    for the legacy DocumentRevision model.
    """
    id = serializers.UUIDField(read_only=True)
    original_document_id = serializers.UUIDField(source='object_id', read_only=True)
    revision_number = serializers.SerializerMethodField()
    revision_type = serializers.CharField(source='action', read_only=True)
    revision_status = serializers.SerializerMethodField()
    modified_by = serializers.SerializerMethodField()
    modified_at = serializers.DateTimeField(source='created_at', read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    resulting_document_id = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentRevisionV2
        fields = [
            'id', 'original_document_id', 'revision_number', 'revision_type', 
            'revision_status', 'modified_by', 'modified_at', 'created_at', 'reason_code', 
            'reason_text', 'old_snapshot_json', 'new_snapshot_json', 
            'diff_summary_json', 'resulting_document_id'
        ]

    def get_resulting_document_id(self, obj):
        # V2 doesn't store this at the schema level yet. 
        # For cancel & reissue, we will eventually store in diff_summary_json
        return None

    def get_revision_number(self, obj):
        # Fallback format if entity info isn't enough
        # Actually in V2 we have `revision_no`. We can prepend 'REV-'
        return f"REV-{obj.revision_no}"

    def get_revision_status(self, obj):
        return 'applied' # V2 writes are transactional and only happen on success
        
    def get_modified_by(self, obj):
        if not obj.actor_id:
            return None
        try:
            # We fetch Staff (or User) to match the depth=1 structure of legacy
            staff = Staff.objects.get(id=obj.actor_id)
            return {
                "id": str(staff.id),
                "name": staff.name,
                "email": staff.email
            }
        except Exception:
            return None

from .models import ActivityEvent

class ActivityEventLegacyAdapterSerializer(serializers.ModelSerializer):
    """
    Adapter that serializes ActivityEvent into the EXACT shape expected by the frontend
    for the legacy ActivityLog model.
    """
    timestamp = serializers.DateTimeField(source='occurred_at', read_only=True)
    user = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    outlet = serializers.SerializerMethodField()
    outlet_name = serializers.SerializerMethodField()
    
    # Legacy fields not inherently present in new event, defaulting safely
    changes_json = serializers.JSONField(source='payload_json', default=dict)
    metadata_json = serializers.SerializerMethodField()
    endpoint = serializers.CharField(default='')
    http_method = serializers.CharField(default='')
    status_code = serializers.IntegerField(default=200)
    ip_is_routable = serializers.BooleanField(default=True)
    description = serializers.CharField(source='reason_text', default='')

    class Meta:
        model = ActivityEvent
        fields = [
            'id', 'timestamp', 'user', 'user_email', 'outlet', 'outlet_name',
            'action', 'module', 'entity_type', 'entity_id', 'entity_label',
            'description', 'changes_json', 'metadata_json', 'endpoint',
            'http_method', 'status_code', 'ip_address', 'ip_is_routable', 'user_agent', 'request_id'
        ]

    def get_user(self, obj):
        return obj.actor_id

    def get_user_email(self, obj):
        if not obj.actor_id:
            return ""
        try:
            return Staff.objects.get(id=obj.actor_id).email
        except Exception:
            return ""

    def get_outlet(self, obj):
        return obj.tenant_id

    def get_outlet_name(self, obj):
        if not obj.tenant_id:
            return ""
        try:
            from apps.core.models import Outlet
            return Outlet.objects.get(id=obj.tenant_id).name
        except Exception:
            return ""

    def get_metadata_json(self, obj):
        return {
            "reason_code": obj.reason_code,
            "severity": obj.severity
        }
