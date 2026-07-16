from django.db import models
from django.conf import settings
import uuid
from django.contrib.contenttypes.models import ContentType

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

class DocumentRevision(models.Model):
    """Generic business-level tracking for transaction modifications and revisions."""
    
    REVISION_TYPE_CHOICES = [
        ('correction', 'Correction (No financial impact)'),
        ('financial_change', 'Financial Change (Rates, Qty, Items)'),
        ('cancel_reissue', 'Cancel & Reissue'),
        ('commercial_correction', 'Commercial Correction'),
        ('paid_bill_correction', 'Paid Bill Correction'),
        ('return_aware_correction', 'Return Aware Correction'),
        ('direct_revise', 'Direct Revise'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft / Pending'),
        ('applied', 'Applied / Completed'),
        ('failed', 'Failed'),
    ]

    import uuid
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='document_revisions')
    
    # Generic relation to the original document (SaleInvoice, PurchaseInvoice, etc.)
    from django.contrib.contenttypes.models import ContentType
    from django.contrib.contenttypes.fields import GenericForeignKey
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField()
    original_document = GenericForeignKey('content_type', 'object_id')
    
    revision_number = models.CharField(max_length=50, help_text='e.g., INV-2026-00123-R1')
    revision_type = models.CharField(max_length=50, choices=REVISION_TYPE_CHOICES)
    revision_status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='applied')
    
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='document_revisions_created')
    modified_at = models.DateTimeField(auto_now_add=True)
    
    reason_code = models.CharField(max_length=50, help_text='Standardized reason code', blank=True)
    reason_text = models.TextField(help_text='Detailed reason or notes provided by the staff', blank=True)
    
    # Snapshots and impact payloads
    old_snapshot_json = models.JSONField(default=dict, help_text='State of the document before modification')
    new_snapshot_json = models.JSONField(default=dict, help_text='Proposed or applied corrected state')
    diff_summary_json = models.JSONField(default=dict, help_text='Computed differences between old and new')
    stock_impact_json = models.JSONField(default=dict, help_text='Summary of items added/removed back to stock')
    payment_impact_json = models.JSONField(default=dict, help_text='Summary of cash/credit adjustments')
    return_impact_json = models.JSONField(default=dict, help_text='Any automatic returns generated')
    
    # Relationships for resulting financial documents
    resulting_document_id = models.UUIDField(null=True, blank=True, help_text='If cancel/reissue, the ID of the new document')
    linked_credit_note_id = models.UUIDField(null=True, blank=True, help_text='Linked credit note if financial values decreased')
    linked_debit_note_id = models.UUIDField(null=True, blank=True, help_text='Linked debit note if financial values increased')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'audit_documentrevision'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['outlet', 'created_at']),
        ]

    def __str__(self):
        return f"{self.revision_number} for {self.content_type} {self.object_id}"

class DocumentRevisionV2(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, null=True, blank=True)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField()
    entity_type = models.CharField(max_length=255, blank=True)
    revision_no = models.IntegerField(default=1)
    action = models.CharField(max_length=50) # create, update, delete, void, correction
    
    old_snapshot_json = models.JSONField(default=dict, blank=True)
    new_snapshot_json = models.JSONField(default=dict, blank=True)
    diff_summary_json = models.JSONField(default=dict, blank=True)
    
    reason_code = models.CharField(max_length=50, blank=True)
    reason_text = models.TextField(blank=True)
    
    actor_id = models.CharField(max_length=255, null=True, blank=True)
    actor_type = models.CharField(max_length=50, default='human')
    request_id = models.CharField(max_length=255, null=True, blank=True)
    source = models.CharField(max_length=50, blank=True) # ui, api, job, import, migration
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'audit_document_revision_v2'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['tenant_id', 'created_at']),
        ]

class ActivityEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    actor_id = models.CharField(max_length=255, null=True, blank=True)
    actor_type = models.CharField(max_length=50, default='human')
    request_id = models.CharField(max_length=255, null=True, blank=True)
    session_id = models.CharField(max_length=255, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    action = models.CharField(max_length=255, db_index=True)
    module = models.CharField(max_length=255, db_index=True)
    
    entity_type = models.CharField(max_length=255, blank=True, db_index=True)
    entity_id = models.CharField(max_length=255, blank=True, db_index=True)
    entity_label = models.CharField(max_length=255, blank=True)
    
    reason_code = models.CharField(max_length=50, blank=True)
    reason_text = models.TextField(blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)
    
    severity = models.CharField(max_length=50, default='info')
    correlation_id = models.CharField(max_length=255, null=True, blank=True)
    
    class Meta:
        db_table = 'audit_activity_event'
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['module', 'action']),
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['tenant_id', 'occurred_at']),
        ]

class SystemEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    event_name = models.CharField(max_length=255, db_index=True)
    component = models.CharField(max_length=255)
    source = models.CharField(max_length=255)
    job_id = models.CharField(max_length=255, null=True, blank=True)
    request_id = models.CharField(max_length=255, null=True, blank=True)
    
    actor_type = models.CharField(max_length=50, default='system')
    
    entity_type = models.CharField(max_length=255, blank=True)
    entity_id = models.CharField(max_length=255, blank=True)
    
    status = models.CharField(max_length=50, default='success')
    payload_json = models.JSONField(default=dict, blank=True)
    severity = models.CharField(max_length=50, default='info')
    
    class Meta:
        db_table = 'audit_system_event'
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['event_name']),
            models.Index(fields=['tenant_id', 'occurred_at']),
        ]
