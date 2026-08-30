import uuid
from django.db import models
from django.conf import settings
from apps.core.models import Outlet

class GSTTransactionSnapshot(models.Model):
    """
    Stores normalized JSON snapshot of a finalized sale or purchase invoice
    for GST reporting (GSTR-1, GSTR-3B) and reconciliation (GSTR-2B).
    """
    TRANSACTION_TYPES = [
        ('sale', 'Sale'),
        ('purchase', 'Purchase'),
        ('sales_return', 'Sales Return'),
        ('purchase_return', 'Purchase Return'),
        ('sales_credit_note', 'Sales Credit Note'),
        ('sales_debit_note', 'Sales Debit Note'),
        ('purchase_credit_note', 'Purchase Credit Note'),
        ('purchase_debit_note', 'Purchase Debit Note'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='gst_snapshots')
    gstin = models.CharField(max_length=15, help_text="GSTIN of the taxpayer (Outlet) at the time of transaction")
    period = models.CharField(max_length=6, help_text="Format: MMYYYY, e.g. 042025")
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    
    # We use CharField for document references to avoid hard circular dependencies, 
    # but still allow fast lookups.
    document_id = models.UUIDField(help_text="UUID of the source invoice/return")
    document_number = models.CharField(max_length=50, help_text="Invoice or return number")
    document_date = models.DateField()
    
    snapshot_json = models.JSONField(help_text="Normalized GST payload (taxable values, igst, cgst, sgst, hsn splits)")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reports_gsttransactionsnapshot'
        ordering = ['-document_date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'period', 'transaction_type']),
            models.Index(fields=['document_number']),
        ]

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.document_number} ({self.period})"

class GSTR2BImportJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='gstr2b_jobs')
    gstin = models.CharField(max_length=15)
    period = models.CharField(max_length=6, help_text="Format: MMYYYY")
    provider = models.CharField(max_length=50, default="Sandbox")
    retrieval_timestamp = models.DateTimeField(auto_now_add=True)
    session_reference_id = models.UUIDField(null=True, blank=True)
    provider_chksum = models.CharField(max_length=64, null=True, blank=True)
    local_payload_sha256 = models.CharField(max_length=64, null=True, blank=True)
    raw_payload_hash = models.CharField(max_length=64, null=True, blank=True)
    page_hash = models.CharField(max_length=64, null=True, blank=True)
    request_metadata = models.JSONField(default=dict, blank=True)
    provider_mode = models.CharField(max_length=20, default='test')
    host = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=30) # IN_PROGRESS, COMPLETED, FAILED, INCOMPLETE, NO_CHANGE, NO_DATA_AVAILABLE
    file_count_expected = models.IntegerField(default=1)
    file_count_fetched = models.IntegerField(default=0)
    record_count = models.IntegerField(default=0)
    error_metadata = models.JSONField(default=dict, blank=True)
    reused_from_job = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'reports_gstr2bimportjob'
        indexes = [
            models.Index(fields=['outlet', 'period', 'gstin']),
        ]

class GSTR2BData(models.Model):
    """
    GST compliance working table to store raw GSTR-2B JSON and parsed header-level info
    fetched from the portal (or manually imported/mocked). Not core accounting.
    """
    DOCUMENT_TYPES = [
        ('B2B', 'B2B'),
        ('B2BA', 'B2BA'),
        ('CDN', 'CDN'),
        ('CDNA', 'CDNA'),
        ('ISD', 'ISD'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE)
    import_job = models.ForeignKey(GSTR2BImportJob, null=True, blank=True, on_delete=models.CASCADE, related_name='documents')
    period = models.CharField(max_length=6, help_text="Format: MMYYYY, e.g. 042025")
    supplier_gstin = models.CharField(max_length=15)
    supplier_name = models.CharField(max_length=255, null=True, blank=True)
    document_type = models.CharField(max_length=10, choices=DOCUMENT_TYPES, null=True, blank=True)
    invoice_number = models.CharField(max_length=50)
    invoice_date = models.DateField()
    original_document_reference = models.CharField(max_length=50, null=True, blank=True)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2)
    igst = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cgst = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sgst = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cess = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    supplier_status = models.CharField(max_length=20, default="Active")
    itc_availability_status = models.CharField(max_length=5, null=True, blank=True)
    itc_ineligible_reason = models.CharField(max_length=255, null=True, blank=True)
    ims_status = models.CharField(max_length=50, null=True, blank=True)
    raw_data = models.JSONField(default=dict) # Kept for legacy support
    
    # Normalizer specific fields
    normalizer_version = models.CharField(max_length=20, default='1.0')
    raw_record_hash = models.CharField(max_length=64, null=True, blank=True)
    source_document_type = models.CharField(max_length=20, null=True, blank=True)
    source_field_map = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'reports_gstr2bdata'
        indexes = [
            models.Index(fields=['outlet', 'period', 'supplier_gstin']),
        ]
        unique_together = ('import_job', 'supplier_gstin', 'document_type', 'invoice_number')

class ITCReconciliationRun(models.Model):
    """
    GST compliance working table tracking a specific reconciliation attempt.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE)
    import_job = models.ForeignKey(GSTR2BImportJob, null=True, blank=True, on_delete=models.CASCADE)
    period = models.CharField(max_length=6, help_text="Format: MMYYYY")
    run_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20) # Pending, Completed, Failed
    summary = models.JSONField(default=dict)

    class Meta:
        db_table = 'reports_itcreconciliationrun'

class ITCReconciliationResult(models.Model):
    """
    GST compliance working table for granular invoice-level match status.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(ITCReconciliationRun, related_name='results', on_delete=models.CASCADE)
    purchase_snapshot = models.ForeignKey(GSTTransactionSnapshot, null=True, on_delete=models.SET_NULL)
    gstr2b_record = models.ForeignKey(GSTR2BData, null=True, on_delete=models.SET_NULL)
    match_status = models.CharField(max_length=30)
    mismatch_reasons = models.JSONField(default=list)

    class Meta:
        db_table = 'reports_itcreconciliationresult'
        indexes = [
            models.Index(fields=['run', 'match_status']),
            models.Index(fields=['purchase_snapshot', 'gstr2b_record']),
        ]

class DeferredITCEntry(models.Model):
    """
    Tracks ITC that is withheld from GSTR-3B due to missing in GSTR-2B.
    """
    STATUS_CHOICES = [
        ('DEFERRED', 'Deferred'),
        ('CLAIMED', 'Claimed'),
        ('WRITTEN_OFF', 'Written Off')
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_invoice = models.ForeignKey('purchases.PurchaseInvoice', on_delete=models.CASCADE, related_name='deferred_itc_entries')
    original_period = models.CharField(max_length=6, help_text="Format: MMYYYY")
    iamt = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    camt = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    samt = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    csamt = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DEFERRED')
    claimed_period = models.CharField(max_length=6, null=True, blank=True, help_text="Format: MMYYYY")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reports_deferreditcentry'
        unique_together = ('purchase_invoice', 'original_period')

class GSTExportAudit(models.Model):
    EXPORT_TYPE_CHOICES = [
        ('GSTR1_EXCEL', 'GSTR-1 Excel Utility'),
        ('GSTR3B_OFFLINE_UTILITY', 'GSTR-3B Offline Utility'),
        ('WORKING_PAPER_PDF', 'CA Working Paper PDF'),
        ('RECONCILIATION_EXCEL', 'Reconciliation Workbook'),
    ]
    
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='gst_exports')
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE)
    period = models.CharField(max_length=6, help_text="Format: MMYYYY")
    export_type = models.CharField(max_length=50, choices=EXPORT_TYPE_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    template_checksum = models.CharField(max_length=64, null=True, blank=True)
    template_version = models.CharField(max_length=50, null=True, blank=True)
    
    source_json_hash = models.CharField(max_length=64, null=True, blank=True)
    output_file_hash = models.CharField(max_length=64)
    
    validation_state = models.JSONField(default=dict)
    
    class Meta:
        db_table = 'reports_gstexportaudit'
        ordering = ['-timestamp']
