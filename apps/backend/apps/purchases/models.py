from django.db import models
from decimal import Decimal
import uuid


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class Distributor(models.Model):
    """Distributor/Supplier profile with credit terms."""

    BALANCE_TYPE_CHOICES = [
        ('CR', 'Credit (Distributor Owes Us)'),
        ('DR', 'Debit (We Owe Distributor)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='distributors')
    name = models.CharField(max_length=255)
    gstin = models.CharField(max_length=15, null=True, blank=True)
    drug_license_no = models.CharField(max_length=100, null=True, blank=True,
                                       help_text='Combined DL number for display')
    # Split DL fields for OCR 3-tier matching (20B and 21B licence numbers appear separately on invoices)
    dl_no_20b = models.CharField(max_length=50, null=True, blank=True,
                                 help_text='Drug Licence 20B number (retail)')
    dl_no_21b = models.CharField(max_length=50, null=True, blank=True,
                                 help_text='Drug Licence 21B number (wholesale)')
    food_license_no = models.CharField(max_length=50, null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True, default='')
    mobile = models.CharField(max_length=15, null=True, blank=True,
                              help_text='Mobile number for 3-tier OCR matching')
    contact_person = models.CharField(max_length=100, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    address = models.TextField(blank=True, default='')
    city = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    state_code = models.CharField(max_length=5, null=True, blank=True,
                                  help_text='GST state code e.g. 27 for Maharashtra')

    # Credit terms
    credit_days = models.IntegerField(default=0, help_text='Credit period in days')
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                          help_text='Opening balance for ledger')
    balance_type = models.CharField(max_length=2, choices=BALANCE_TYPE_CHOICES, default='CR',
                                    help_text='CR = distributor owes us, DR = we owe distributor')

    # OCR learning: store distributor-specific column header mappings
    ocr_column_map = models.JSONField(default=dict, blank=True,
                                      help_text='Learned column header synonyms for this distributor')
    # OCR learning: how this distributor's name / GSTIN appeared on scans the
    # user confirmed — {"names": [alias_key, ...], "gstins": [GSTIN, ...]}
    ocr_aliases = models.JSONField(default=dict, blank=True,
                                   help_text='Names / GSTINs learned from confirmed invoice scans')

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'purchases_distributor'
        ordering = ['name']
        # NOTE: GSTIN uniqueness is per outlet but nullable (not all distributors have GSTIN)
        indexes = [
            models.Index(fields=['outlet', 'is_active']),
            models.Index(fields=['gstin']),
            models.Index(fields=['outlet', 'name']),
        ]

    def __str__(self):
        return self.name


class PurchaseOrder(models.Model):
    """Draft or Sent Purchase Order representing reorder plans."""

    STATUS_CHOICES = [
        ('SAVED', 'Saved'),
        ('SENT', 'Sent'),
        ('PARTIAL', 'Partially Received'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
        ('EXPIRED', 'Expired'),
    ]
    # SAVED is the stored value for a Draft (kept so no data has to be rewritten); screens show it as "Draft".
    STATUS_LABELS = {'SAVED': 'Draft', 'SENT': 'Sent', 'PARTIAL': 'Partial', 'COMPLETED': 'Completed',
                     'CANCELLED': 'Cancelled', 'EXPIRED': 'Expired'}
    SEND_CHANNEL_CHOICES = [
        ('whatsapp_link', 'WhatsApp link'), ('pdf_whatsapp', 'PDF via WhatsApp'), ('email', 'Email'), ('manual', 'Ordered by phone'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='purchase_orders')
    distributor = models.ForeignKey(Distributor, on_delete=models.PROTECT, related_name='purchase_orders')
    
    po_number = models.CharField(max_length=50, help_text='Auto-generated PO number')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SAVED')
    order_date = models.DateField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    expected_date = models.DateField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Estimated total cost')
    purchase_bill = models.ForeignKey('PurchaseInvoice', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_pos')    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── Lifecycle (every change of `status` goes through purchases/po_services.transition) ──
    notes = models.TextField(blank=True, default='')
    sent_via = models.CharField(max_length=20, choices=SEND_CHANNEL_CHOICES, blank=True, default='')
    sent_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    expires_at = models.DateTimeField(null=True, blank=True, help_text='A SENT PO with nothing received expires here')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True, default='')
    cancelled_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    closed_at = models.DateTimeField(null=True, blank=True, help_text='When it reached COMPLETED / CANCELLED / EXPIRED')
    closed_short = models.BooleanField(default=False, help_text='Completed by "Close short" (not everything arrived)')
    share_token = models.CharField(max_length=64, unique=True, null=True, blank=True, help_text='Secret of the public read-only link')
    version = models.IntegerField(default=1, help_text='Optimistic lock: an edit must send the version it loaded')

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'purchases_purchaseorder'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['outlet', 'status']),
            models.Index(fields=['po_number']),
        ]
        constraints = [models.UniqueConstraint(fields=['outlet', 'po_number'], name='uniq_po_number_per_outlet')]

    @property
    def status_label(self):
        return self.STATUS_LABELS.get(self.status, self.status)

    def __str__(self):
        return f"PO {self.po_number} - {self.distributor.name}"


class PurchaseOrderItem(models.Model):
    """Line items for a PurchaseOrder."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('inventory.MasterProduct', on_delete=models.PROTECT, related_name='po_items')
    
    qty_strips = models.IntegerField(default=1, help_text='Quantity ordered in strips/packs')
    received_qty = models.IntegerField(default=0, help_text='Quantity received so far')
    last_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text='PTR at time of order')
    unit_ptr_estimated = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text='Estimated PTR per pack')
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Estimated amount')
    pack_size_snapshot = models.CharField(max_length=50, blank=True, default='', help_text='e.g. "10 strip": kept so a reopened PO still shows the pack it was ordered in')
    shortbook_item = models.ForeignKey('ShortbookItem', on_delete=models.SET_NULL, null=True, blank=True, related_name='po_lines')

    class Meta:
        db_table = 'purchases_purchaseorderitem'

    def __str__(self):
        return f"{self.product.name} (Qty: {self.qty_strips})"



class POSequence(models.Model):
    """One counter per outlet per day, read under a row lock so two people saving at once can never get the same PO number."""
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='po_sequences')
    date = models.DateField()
    last_no = models.IntegerField(default=0)

    class Meta:
        db_table = 'purchases_posequence'
        constraints = [models.UniqueConstraint(fields=['outlet', 'date'], name='uniq_po_sequence_outlet_date')]


class POEvent(models.Model):
    """Audit trail of a purchase order: who did what, when. Feeds the activity timeline."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='events')
    action = models.CharField(max_length=30)
    user = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'purchases_poevent'
        ordering = ['created_at']


class ShortbookItem(models.Model):
    """Something the pharmacy needs to order. Items land here from low stock, billing shortages, customer requests or by hand."""
    SOURCE_CHOICES = [('low_stock', 'Low stock'), ('billing', 'Billing'), ('customer', 'Customer request'), ('manual', 'Manual')]
    STATUS_CHOICES = [('PENDING', 'Pending'), ('IN_DRAFT', 'In draft PO'), ('ORDERED', 'Ordered'), ('RECEIVED', 'Received'), ('REMOVED', 'Removed')]
    OPEN_STATUSES = ('PENDING', 'IN_DRAFT', 'ORDERED')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='shortbook_items')
    product = models.ForeignKey('inventory.MasterProduct', on_delete=models.PROTECT, related_name='shortbook_items')
    qty_needed = models.IntegerField(default=1)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')
    suggested_distributor = models.ForeignKey(Distributor, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    note = models.CharField(max_length=255, blank=True, default='')
    customer_name = models.CharField(max_length=255, blank=True, default='')
    customer_phone = models.CharField(max_length=20, blank=True, default='')
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'purchases_shortbookitem'
        ordering = ['-created_at']
        constraints = [
            # one open row per product per outlet: adding a product that is already there raises its quantity instead
            models.UniqueConstraint(fields=['outlet', 'product'], condition=models.Q(status__in=['PENDING', 'IN_DRAFT', 'ORDERED']),
                                    name='uniq_open_shortbook_item'),
        ]


class PurchaseInvoice(models.Model):
    """Purchase GRN (Goods Receipt Note) with multi-godown support and bill-by-bill payment tracking."""

    GODOWN_LOCATION_CHOICES = [
        ('main', 'Main Warehouse'),
        ('cold_storage', 'Cold Storage'),
        ('secondary', 'Secondary Warehouse'),
    ]

    PURCHASE_TYPE_CHOICES = [
        ('cash', 'Cash Purchase'),
        ('credit', 'Credit Purchase'),
    ]

    STATUS_CHOICES = [
        ('SAVED', 'Draft — Scanned, pending human review'),
        ('POSTED', 'Posted — Confirmed, stock updated'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='purchase_invoices')
    # distributor is nullable for SAVED state (may not be matched yet at scan time)
    distributor = models.ForeignKey(Distributor, on_delete=models.PROTECT, related_name='purchase_invoices',
                                    null=True, blank=True)

    # --- Scan Purchase fields ---
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='POSTED',
                              help_text='SAVED = OCR scan pending review; POSTED = confirmed & stock updated')
    invoice_image = models.ImageField(upload_to='purchase_invoices/%Y/%m/', null=True, blank=True,
                                      help_text='Scanned invoice photo')
    # When the bill was scanned. Scan photos are deleted OCR_SCAN_PHOTO_TTL_HOURS
    # (default 24) after this; the purchase data itself is kept.
    scan_uploaded_at = models.DateTimeField(null=True, blank=True, db_index=True,
                                            help_text='When the scan photo was uploaded (photo auto-deleted later)')
    # Raw OCR extraction stored as JSON for the review screen
    ocr_raw_data = models.JSONField(null=True, blank=True,
                                    help_text='OCR extracted data: header, items, totals')
    ocr_confidence = models.FloatField(null=True, blank=True,
                                       help_text='Overall OCR confidence score 0-1')
    # Distributor details extracted by OCR before matching (used for new supplier creation)
    ocr_distributor_name = models.CharField(max_length=255, null=True, blank=True,
                                            help_text='Distributor name as read from invoice')
    ocr_distributor_gstin = models.CharField(max_length=15, null=True, blank=True)
    ocr_distributor_phone = models.CharField(max_length=20, null=True, blank=True)
    ocr_distributor_dl = models.CharField(max_length=100, null=True, blank=True)
    ocr_distributor_address = models.TextField(null=True, blank=True)
    ocr_processing_error = models.TextField(null=True, blank=True,
                                            help_text='Error message if OCR processing failed')

    # Invoice details
    invoice_no = models.CharField(max_length=100, help_text='Distributor invoice number', blank=True, default='')
    invoice_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True, help_text='Credit purchase due date')
    purchase_type = models.CharField(max_length=20, choices=PURCHASE_TYPE_CHOICES, default='credit')
    purchase_order_ref = models.CharField(max_length=100, null=True, blank=True, help_text='PO reference')

    # Godown/Warehouse location (Marg parity)
    godown = models.CharField(max_length=50, choices=GODOWN_LOCATION_CHOICES, default='main',
                              help_text='Physical warehouse location for stock')

    # Bill amounts
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, help_text='Sum of item amounts before discount')
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          help_text='Total trade + cash discount')
    invoice_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                           help_text='Invoice-level cash discount amount applied before GST')
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, help_text='subtotal - discount')

    # GST
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                     help_text='Total SGST+CGST or IGST')
    cess_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='Cess on applicable items')

    freight = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                  help_text='Transport/freight charges')
    round_off = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                    help_text='Penny rounding (±)')
    ledger_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                            help_text='Adjustment amounts (e.g. from Debit Notes)')
    ledger_note = models.CharField(max_length=255, null=True, blank=True,
                                   help_text='Optional note explaining the ledger adjustment')

    # Grand total
    grand_total = models.DecimalField(max_digits=12, decimal_places=2,
                                      help_text='taxable + gst + cess + freight + roundOff - ledgerAdjustment')

    # Payment tracking (for bill-by-bill allocation)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='Amount paid so far')
    outstanding = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='grandTotal - amountPaid (used for payment allocation)')

    # Audit & notes
    # The purchase order this invoice received goods for (one PO can be received over several invoices).
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='receipts')
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True,
                                   related_name='purchase_invoices_created')
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'purchases_purchaseinvoice'
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'invoice_date']),
            models.Index(fields=['outlet', 'distributor']),
            models.Index(fields=['invoice_no', 'outlet']),
            models.Index(fields=['outlet', 'status']),
        ]
        # unique_together only for POSTED invoices (SAVED may have blank invoice_no)
        # Enforced at service level, not DB level, so we can allow SAVED duplicates

    def __str__(self):
        status_label = f"[{self.status}] " if self.status == 'SAVED' else ''
        return f"{status_label}{self.invoice_no} - ₹{self.grand_total if self.grand_total else '?'}"

    @property
    def is_draft(self):
        return self.status == 'SAVED'

    @property
    def is_posted(self):
        return self.status == 'POSTED'

    def scan_image_paths(self) -> list:
        """All scanned pages in order: invoice_image is page 1, extra_pages follow."""
        paths = [self.invoice_image.path] if self.invoice_image else []
        paths += [p.image.path for p in self.extra_pages.all() if p.image]
        return paths


class PurchaseInvoicePage(models.Model):
    """
    Page 2..N of a scanned multi-page bill. Page 1 stays in
    PurchaseInvoice.invoice_image so single-page code paths are unchanged.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='extra_pages')
    page_no = models.PositiveSmallIntegerField(help_text='2 for the second page, 3 for the third, ...')
    image = models.ImageField(upload_to='purchase_invoices/%Y/%m/')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'purchases_purchaseinvoicepage'
        ordering = ['page_no']
        unique_together = [('invoice', 'page_no')]

    def __str__(self):
        return f'{self.invoice_id} page {self.page_no}'


class PurchaseItem(models.Model):
    """Individual line item in a purchase GRN (with batch & stock injection)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='items')
    batch = models.ForeignKey('inventory.Batch', on_delete=models.PROTECT, related_name='purchase_items',
                              help_text='FK to Batch for stock injection on purchase save')

    # Product (can be custom if masterProductId is null)
    master_product = models.ForeignKey('inventory.MasterProduct', on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name='purchase_items')
    custom_product_name = models.CharField(max_length=255, null=True, blank=True,
                                           help_text='For custom/unregistered products')
    is_custom_product = models.BooleanField(default=False)

    # Identification
    hsn_code = models.CharField(max_length=20, null=True, blank=True,
                                help_text='GST/GSTR-2 compliance code')
    batch_no = models.CharField(max_length=100)
    expiry_date = models.DateField()

    # Quantity structure (packs + loose units)
    pkg = models.IntegerField(help_text='Pack size (e.g., 10 tabs/strip)')
    qty = models.IntegerField(help_text='Number of packs purchased')
    actual_qty = models.IntegerField(help_text='pkg × qty — units added to inventory')
    free_qty = models.IntegerField(default=0, help_text='Free units from distributor')

    # Pricing (Marg tri-level pricing: MRP, PTR, PTS)
    purchase_rate = models.DecimalField(max_digits=10, decimal_places=2, help_text='Cost per pack')
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                       help_text='Trade discount %')
    cash_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                            help_text='Cash discount %')
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='GST rate %')
    cess = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                               help_text='Cess % (special category items)')

    # Tri-level pricing
    mrp = models.DecimalField(max_digits=10, decimal_places=2, help_text='Maximum Retail Price')
    ptr = models.DecimalField(max_digits=10, decimal_places=2,
                              help_text='Price to Retailer (distributor margin)')
    pts = models.DecimalField(max_digits=10, decimal_places=2,
                              help_text='Price to Stockist (wholesaler margin)')

    # Inward landing costs
    freight_per_unit = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text="Freight/transport cost apportioned per unit for this batch")
    other_cost_per_unit = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text="Any other inward cost per unit (loading, unloading, etc.)")
    gst_per_unit = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text="GST amount apportioned per unit")
    landing_rate = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text="Landing rate per unit")
    def get_landing_cost(self, include_gst: bool = False) -> Decimal:
        """
        Compute the minimum price floor for this batch.
        include_gst: True if pharmacy does not claim ITC (GST is added to cost).
                     False if pharmacy claims ITC (GST is recovered as credit, not a cost).
        """
        base = self.purchase_rate
        if include_gst:
            gst_amount = base * (self.gst_rate / Decimal('100'))
            base = base + gst_amount
        base = base + self.freight_per_unit + self.other_cost_per_unit
        return base.quantize(Decimal('0.0001'))

    # Computed amounts (stored for reporting/audit)
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2)
    cess_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'purchases_purchaseitem'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['invoice', 'batch']),
        ]

    def __str__(self):
        product_name = self.master_product.name if self.master_product else self.custom_product_name
        return f"{product_name} - {self.batch_no}"

class Rule37Adjustment(models.Model):
    """
    Rule 37 Unpaid Supplier Invoice ITC Risk Tracker.
    Tracks 180-day ITC reversals and subsequent re-availments.
    """
    STATUS_CHOICES = [
        ('PROPOSED', 'Proposed'),
        ('NEEDS_REVIEW', 'Needs Review (Missing Allocation)'),
        ('APPROVED', 'Approved'),
        ('INCLUDED_IN_EXPORT', 'Included in Export'),
    ]
    ACTION_CHOICES = [
        ('REVERSAL_DUE', 'Reversal Due (Unpaid > 180 Days)'),
        ('REAVAILMENT_ELIGIBLE', 'Re-availment Eligible (Subsequent Payment)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='rule37_adjustments')
    
    # Core state
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PROPOSED')
    action_type = models.CharField(max_length=30, choices=ACTION_CHOICES)
    
    # Rule 37 specific timing
    rule37_due_date = models.DateField(help_text="invoice_date + 180 days")
    days_outstanding_at_evaluation = models.IntegerField()
    calculation_date = models.DateTimeField(auto_now_add=True)
    
    # Reclaim fields
    payment_date = models.DateField(null=True, blank=True)
    reclaim_period = models.CharField(max_length=6, null=True, blank=True, help_text="Format: MMYYYY")
    reclaimed_igst = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reclaimed_cgst = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reclaimed_sgst = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # Snapshot state at evaluation
    invoice_total_at_evaluation = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid_at_evaluation = models.DecimalField(max_digits=12, decimal_places=2)
    unpaid_amount_at_evaluation = models.DecimalField(max_digits=12, decimal_places=2)
    unpaid_ratio = models.DecimalField(max_digits=5, decimal_places=4, help_text="Proportion of unpaid invoice value (0.0 to 1.0)")
    
    # Calculated ITC amounts
    reversed_igst = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reversed_cgst = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reversed_sgst = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reversed_cess = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # GSTR mapping configuration
    gstr_reason_code = models.CharField(max_length=50, default='RULE_37')
    target_gstr3b_table = models.CharField(max_length=50, default='4(B)(2)')
    
    # Audit trail & linked re-availments
    source_reversal = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='reavailments', help_text="Links a REAVAILMENT_ELIGIBLE back to its REVERSAL_DUE")
    metadata = models.JSONField(default=dict, help_text="Immutable calculation metadata/payment references")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'purchases_rule37adjustment'
        ordering = ['-calculation_date']

    def __str__(self):
        return f"{self.action_type} for {self.invoice.invoice_no} ({self.status})"


class ScanTrainingSample(models.Model):
    """
    One confirmed scanned bill kept as training data for a future in-house
    reader: what the AI read, what staff finally saved (the correct answer),
    and which fields staff had to correct. Written when a scan draft is
    confirmed; never used by the app itself. Export with
    `python manage.py export_scan_training`.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='scan_training_samples')
    purchase_invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='scan_training_samples')
    distributor = models.ForeignKey(Distributor, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='scan_training_samples')
    ocr_result = models.JSONField(default=dict, help_text='What the AI read: header, items, totals, meta')
    confirmed = models.JSONField(default=dict, help_text='What staff saved: header + items (the correct answer)')
    corrections = models.JSONField(default=list, help_text='Fields staff changed: [{row, field, ai, final}]')
    image_files = models.JSONField(default=list, help_text='Stored training copies of the page photos (if kept)')
    rows = models.PositiveIntegerField(default=0)
    corrected_fields = models.PositiveIntegerField(default=0)
    model_name = models.CharField(max_length=100, blank=True, default='')
    prompt_version = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'purchases_scantrainingsample'
        ordering = ['-created_at']

    def __str__(self):
        return f'Training sample {self.id} ({self.rows} rows, {self.corrected_fields} corrected)'
