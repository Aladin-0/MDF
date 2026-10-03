from django.db import models
import uuid


class AttendanceRecord(models.Model):
    """Staff attendance check-in/check-out records with selfie photo support."""

    ATTENDANCE_STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('half_day', 'Half Day'),
        ('holiday', 'Holiday'),
        ('weekly_off', 'Weekly Off'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='attendance_records')
    staff = models.ForeignKey('accounts.Staff', on_delete=models.CASCADE, related_name='attendance_records')

    # Date and time
    date = models.DateField()
    check_in_time = models.TimeField(null=True, blank=True)
    check_out_time = models.TimeField(null=True, blank=True)

    # Status
    status = models.CharField(max_length=20, choices=ATTENDANCE_STATUS_CHOICES, default='present')
    is_late = models.BooleanField(default=False)
    late_by_minutes = models.IntegerField(null=True, blank=True)
    early_leave_minutes = models.IntegerField(default=0, help_text='Minutes left before end of shift')

    # Computation
    working_hours = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                       help_text='Calculated from check-in and check-out times')

    # Photos (base64 or URL)
    check_in_photo = models.TextField(null=True, blank=True, help_text='Base64 encoded photo from selfie')
    check_in_photo_url = models.URLField(max_length=500, null=True, blank=True,
                                        help_text='URL to stored check-in photo (S3, GCS, etc.)')
    check_out_photo = models.TextField(null=True, blank=True, help_text='Base64 encoded photo from selfie')
    check_out_photo_url = models.URLField(max_length=500, null=True, blank=True,
                                         help_text='URL to stored check-out photo (S3, GCS, etc.)')

    # Security & Audit
    check_in_ip = models.CharField(max_length=45, null=True, blank=True)
    check_out_ip = models.CharField(max_length=45, null=True, blank=True)
    check_in_lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_in_lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_out_lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_out_lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_in_device = models.CharField(max_length=255, null=True, blank=True)
    check_out_device = models.CharField(max_length=255, null=True, blank=True)
    
    marked_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='marked_attendance', help_text='Who manually marked this attendance')
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'attendance_attendancerecord'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'staff', 'date']),
            models.Index(fields=['outlet', 'date']),
            models.Index(fields=['staff', 'date']),
        ]
        unique_together = [['outlet', 'staff', 'date']]

    def __str__(self):
        return f"{self.staff.name} - {self.date} ({self.status})"
