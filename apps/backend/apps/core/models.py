from django.db import models
import uuid

# GST state codes per GSTN portal — mirrors packages/constants/index.ts STATE_CODES.
# Always derive state_code from state using this map; never store it independently.
_STATE_CODES: dict[str, str] = {
    'Jammu & Kashmir': '01',
    'Himachal Pradesh': '02',
    'Punjab': '03',
    'Chandigarh': '04',
    'Uttarakhand': '05',
    'Haryana': '06',
    'Delhi': '07',
    'Rajasthan': '08',
    'Uttar Pradesh': '09',
    'Bihar': '10',
    'Sikkim': '11',
    'Arunachal Pradesh': '12',
    'Nagaland': '13',
    'Manipur': '14',
    'Mizoram': '15',
    'Tripura': '16',
    'Meghalaya': '17',
    'Assam': '18',
    'West Bengal': '19',
    'Jharkhand': '20',
    'Odisha': '21',
    'Chhattisgarh': '22',
    'Madhya Pradesh': '23',
    'Gujarat': '24',
    'Dadra & Nagar Haveli and Daman & Diu': '26',
    'Maharashtra': '27',
    'Karnataka': '29',
    'Goa': '30',
    'Lakshadweep': '31',
    'Kerala': '32',
    'Tamil Nadu': '33',
    'Puducherry': '34',
    'Andaman & Nicobar Islands': '35',
    'Telangana': '36',
    'Andhra Pradesh': '37',
    'Ladakh': '38',
}


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class Organization(models.Model):
    """Represents a multitenancy organization (e.g., pharmacy chain)."""

    PLAN_CHOICES = [
        ('starter', 'Starter'),
        ('pro', 'Pro'),
        ('enterprise', 'Enterprise'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='starter')
    master_gstin = models.CharField(max_length=15, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'core_organization'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class Outlet(models.Model):
    """Represents a specific pharmacy branch/outlet."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='outlets')
    name = models.CharField(max_length=255)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    state_code = models.CharField(max_length=2, blank=True, default='',
                                  help_text='2-digit GST state code, derived from state on save')
    pincode = models.CharField(max_length=10)
    gstin = models.CharField(max_length=15, unique=True)
    drug_license_no = models.CharField(max_length=100, unique=True)
    phone = models.CharField(max_length=20)
    gst_username = models.CharField(max_length=50, blank=True, help_text="GST portal username for API access")
    logo_url = models.URLField(null=True, blank=True)
    invoice_footer = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'core_outlet'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        # M9: always derive state_code from state so they never drift.
        self.state_code = _STATE_CODES.get(self.state, '')
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class OutletSettings(models.Model):
    """Per-outlet configuration (get_or_create, never crash if missing)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.OneToOneField(Outlet, on_delete=models.CASCADE, related_name='settings')

    opening_time = models.TimeField(default='09:00')
    closing_time = models.TimeField(default='21:00')
    grace_period_minutes = models.IntegerField(default=15)
    default_credit_days = models.IntegerField(default=30)
    invoice_prefix = models.CharField(max_length=10, default='INV')
    gst_registered = models.BooleanField(default=True)
    print_logo = models.BooleanField(default=True)
    thermal_print = models.BooleanField(default=False)
    printer_width = models.IntegerField(default=80)
    low_stock_alert_days = models.IntegerField(default=7)
    expiry_alert_days = models.IntegerField(default=30)
    enable_whatsapp = models.BooleanField(default=False)
    whatsapp_api_key = models.CharField(max_length=200, null=True, blank=True)
    currency_symbol = models.CharField(max_length=5, default='₹')
    gstr2b_tolerance = models.DecimalField(max_digits=5, decimal_places=2, default=1.00, help_text="Tolerance for GSTR-2B reconciliation in INR")
    
    # Landing Cost & Margin Settings
    landing_cost_include_gst = models.BooleanField(
        default=False,
        help_text="ON = Include purchase GST in landing cost floor (for pharmacies that do NOT claim ITC). OFF = Exclude GST from landing cost (for ITC-registered pharmacies — GST is recovered as credit)."
    )
    landing_cost_include_freight = models.BooleanField(
        default=True,
        help_text="Include per-unit freight in landing cost floor calculation."
    )
    min_margin_warning_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text="Optional: Show a soft warning if margin falls below this percentage. Set 0 to disable."
    )
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_outletsettings'

    def __str__(self):
        return f"Settings for {self.outlet.name}"


# --- Sandbox Configuration ---
import base64
from django.conf import settings
from cryptography.fernet import Fernet

def _get_fernet():
    key = settings.SECRET_KEY.encode('utf-8')[:32].ljust(32, b'0')
    return Fernet(base64.urlsafe_b64encode(key))

class SandboxConfiguration(models.Model):
    """Stores Sandbox GSP credentials and metadata."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, null=True, blank=True, help_text="Null for global config")
    
    _api_key_encrypted = models.CharField(max_length=255, blank=True, default='')
    _api_secret_encrypted = models.CharField(max_length=255, blank=True, default='')
    
    base_url = models.CharField(max_length=255, default='https://api.sandbox.co.in')
    active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_sandboxconfiguration'
        ordering = ['-created_at']

    @property
    def api_key(self):
        if not self._api_key_encrypted:
            return ''
        try:
            return _get_fernet().decrypt(self._api_key_encrypted.encode()).decode()
        except Exception:
            return ''

    @api_key.setter
    def api_key(self, value):
        if not value:
            self._api_key_encrypted = ''
        else:
            self._api_key_encrypted = _get_fernet().encrypt(value.encode()).decode()

    @property
    def api_secret(self):
        if not self._api_secret_encrypted:
            return ''
        try:
            return _get_fernet().decrypt(self._api_secret_encrypted.encode()).decode()
        except Exception:
            return ''

    @api_secret.setter
    def api_secret(self, value):
        if not value:
            self._api_secret_encrypted = ''
        else:
            self._api_secret_encrypted = _get_fernet().encrypt(value.encode()).decode()

    def __str__(self):
        scope = self.outlet.name if self.outlet else "Global"
        status = "Active" if self.active else "Inactive"
        return f"Sandbox Config ({scope}) - {status}"


class GstTaxpayerAuth(models.Model):
    """Stores Taxpayer Session info (OTP session) per outlet."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.OneToOneField(Outlet, on_delete=models.CASCADE, help_text="One auth record per Outlet")
    gstin = models.CharField(max_length=15, help_text="Mirror of outlet.gstin")
    gst_username = models.CharField(max_length=50)
    
    _session_token_encrypted = models.TextField(blank=True, default='')
    session_expires_at = models.DateTimeField(null=True, blank=True)
    last_otp_requested_at = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_gsttaxpayerauth'

    @property
    def session_token(self):
        if not self._session_token_encrypted:
            return ''
        try:
            return _get_fernet().decrypt(self._session_token_encrypted.encode()).decode()
        except Exception:
            return ''

    @session_token.setter
    def session_token(self, value):
        if not value:
            self._session_token_encrypted = ''
        else:
            self._session_token_encrypted = _get_fernet().encrypt(value.encode()).decode()

    def is_session_valid(self):
        from django.utils import timezone
        if not self.active or not self.session_expires_at:
            return False
        return self.session_expires_at > timezone.now()

    def __str__(self):
        return f"Taxpayer Auth for {self.outlet.name} - {'Valid' if self.is_session_valid() else 'Invalid'}"
