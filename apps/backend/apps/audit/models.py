from django.db import models
from django.conf import settings
import uuid
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

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
    """
    THE audit trail: one row per thing somebody did, written when it happens (inside the transaction for money, stock and staff
    changes). A row answers who / what / when / where / why in plain words (`summary`) and keeps the exact before and after
    (`changes_json`). The person and the outlet are SNAPSHOTS (name, role), not links, so history survives a deletion.
    See docs/AUDIT_IMPROVEMENT_PLAN.md and apps/audit/vocabulary.py (the controlled list of `code`s).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, null=True, blank=True)          # the OUTLET id
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)       # the real event time (was auto_now_add: a backfill would be stamped "now")

    actor_id = models.CharField(max_length=255, null=True, blank=True)
    actor_type = models.CharField(max_length=50, default='human')
    actor_name = models.CharField(max_length=255, blank=True, default='')
    actor_role = models.CharField(max_length=50, blank=True, default='')
    outlet_name = models.CharField(max_length=255, blank=True, default='')
    request_id = models.CharField(max_length=255, null=True, blank=True)
    session_id = models.CharField(max_length=255, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    device = models.CharField(max_length=160, blank=True, default='')            # "Chrome on Android"
    inside_network = models.BooleanField(null=True, blank=True)                  # from the shop's allowed IP list; null = no list set
    source = models.CharField(max_length=30, blank=True, default='web')          # web, api, job, import

    action = models.CharField(max_length=255, db_index=True)                     # legacy verb ('CREATE', 'paid_bill_correction'...)
    module = models.CharField(max_length=255, db_index=True)
    code = models.CharField(max_length=64, blank=True, default='', db_index=True)  # the controlled vocabulary ('bill.cancelled')
    category = models.CharField(max_length=20, blank=True, default='', db_index=True)  # money / stock / people / settings / data / documents / other

    entity_type = models.CharField(max_length=255, blank=True, db_index=True)
    entity_id = models.CharField(max_length=255, blank=True, db_index=True)
    entity_label = models.CharField(max_length=255, blank=True)

    summary = models.TextField(blank=True, default='')                           # "Asha cancelled bill INV-... (₹1,240)"
    changes_json = models.JSONField(default=list, blank=True)                    # [{field, label, before, after}]
    amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    reason_code = models.CharField(max_length=50, blank=True)
    reason_text = models.TextField(blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    severity = models.CharField(max_length=50, default='info')                   # info / notice / warning / critical
    flag_count = models.IntegerField(default=0)                                  # rules that flagged this event (for "flagged only")
    correlation_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'audit_activity_event'
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['module', 'action']),
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['tenant_id', 'occurred_at']),
            models.Index(fields=['actor_id', 'occurred_at']),
            models.Index(fields=['category', 'occurred_at']),
        ]


class AuditFlag(models.Model):
    """A rule noticed something worth a look. It says WHY in words, links the evidence, and is reviewed by a person."""
    STATUS = [('new', 'New'), ('reviewed', 'Reviewed'), ('dismissed', 'Not a problem')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(ActivityEvent, on_delete=models.CASCADE, related_name='flags')
    tenant_id = models.CharField(max_length=255, null=True, blank=True)
    rule_code = models.CharField(max_length=64, db_index=True)
    severity = models.CharField(max_length=20, default='notice')                 # notice / warning / critical
    title = models.CharField(max_length=255)                                     # the sentence
    why = models.TextField(blank=True, default='')                               # why it matters (shown small)
    evidence_json = models.JSONField(default=dict, blank=True)
    subject_actor_id = models.CharField(max_length=255, blank=True, default='')
    subject_name = models.CharField(max_length=255, blank=True, default='')
    dedupe_key = models.CharField(max_length=255, unique=True)                   # one flag per rule + person + day (a spike is ONE flag, not fifty)
    status = models.CharField(max_length=20, choices=STATUS, default='new')
    reviewed_by_id = models.CharField(max_length=255, blank=True, default='')
    reviewed_by_name = models.CharField(max_length=255, blank=True, default='')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'audit_flag'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'created_at']), models.Index(fields=['tenant_id', 'status'])]


class AuditPolicy(models.Model):
    """How long to keep the trail and how sensitive the rules are. One row per organisation (`organization_id`)."""
    organization_id = models.CharField(max_length=64, unique=True)
    retention_days = models.IntegerField(default=365)
    rules_json = models.JSONField(default=dict, blank=True)                      # {"rule_code": {"enabled": true, "threshold": 3}}
    last_purge_at = models.DateTimeField(null=True, blank=True)
    last_purge_count = models.IntegerField(default=0)
    updated_by_name = models.CharField(max_length=255, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'audit_policy'


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
