from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.urls import reverse
from .models import ActivityLog
from .services import log_activity
from .middleware import AuditContextMiddleware, get_audit_context
from apps.core.models import Outlet, Organization

User = get_user_model()

class AuditLogTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(name='Test Outlet', address='123 Test St', organization=self.org)
        self.user = User.objects.create_user(
            email='test@example.com',
            phone='1234567890',
            password='testpassword',
            outlet=self.outlet
        )
        # Using a dummy email/password, as the custom user model requires email
        self.admin = User.objects.create_superuser(
            email='admin@example.com',
            phone='0987654321',
            password='adminpassword',
            outlet=self.outlet
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()

    def test_activity_log_creation(self):
        log = ActivityLog.objects.create(
            action='create',
            module='inventory',
            user=self.user,
            entity_type='item',
            entity_id='1',
            entity_label='Test Item'
        )
        self.assertEqual(ActivityLog.objects.count(), 1)
        self.assertEqual(str(log), f"{log.timestamp} - {self.user} - create on inventory")

    def test_log_activity_helper_no_context(self):
        log_activity(
            action='update',
            module='billing',
            user=self.user,
            description='Test description'
        )
        self.assertEqual(ActivityLog.objects.count(), 1)
        log = ActivityLog.objects.first()
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.module, 'billing')
        self.assertEqual(log.action, 'update')
        
    def test_middleware_context_capture(self):
        request = self.factory.get('/api/v1/test/', HTTP_X_FORWARDED_FOR='8.8.8.8')
        request.user = self.user
        
        def dummy_get_response(request):
            # Check context inside view
            context = get_audit_context()
            self.assertEqual(context['ip_address'], '8.8.8.8')
            self.assertEqual(context['ip_is_routable'], True)
            self.assertEqual(context['endpoint'], '/api/v1/test/')
            self.assertEqual(context['http_method'], 'GET')
            
            # Log something using helper
            log_activity(action='read', module='test')
            return None
            
        middleware = AuditContextMiddleware(dummy_get_response)
        middleware(request)
        
        self.assertEqual(ActivityLog.objects.count(), 1)
        log = ActivityLog.objects.first()
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.ip_address, '8.8.8.8')
        self.assertEqual(log.ip_is_routable, True)

    def test_audit_api_unauthorized(self):
        from rest_framework.test import APIClient
        client = APIClient()
        
        # API requires admin/staff
        url = reverse('activity-log-list')
        
        # Unauthenticated
        response = client.get(url)
        self.assertEqual(response.status_code, 401)
        
        # Normal user
        client.force_authenticate(user=self.user)
        response = client.get(url)
        self.assertEqual(response.status_code, 403)
        
        # Admin user
        client.force_authenticate(user=self.admin)
        response = client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_login_success(self):
        from rest_framework.test import APIClient
        client = APIClient()
        url = reverse('login')
        response = client.post(url, {'phone': '1234567890', 'password': 'testpassword'})
        self.assertEqual(response.status_code, 200)
        
        log = ActivityLog.objects.filter(action='LOGIN').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.ip_is_routable, False) # Test client IP is 127.0.0.1 by default

    def test_login_failed(self):
        from rest_framework.test import APIClient
        client = APIClient()
        url = reverse('login')
        response = client.post(url, {'phone': '1234567890', 'password': 'wrongpassword'})
        self.assertEqual(response.status_code, 401)
        
        log = ActivityLog.objects.filter(action='LOGIN_FAILED').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.user)

    def test_logout(self):
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        client.force_authenticate(user=self.user)
        url = reverse('auth-logout')
        response = client.post(url, {'refresh': str(refresh)})
        self.assertEqual(response.status_code, 200)
        
        log = ActivityLog.objects.filter(action='LOGOUT').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.user)

    def test_purchase_create_audit_log(self):
        log_activity(
            action="CREATE",
            module="purchases",
            entity_type="PurchaseInvoice",
            entity_id="12345",
            entity_label="PI-001",
            description="Created purchase invoice PI-001 from Dist A for ₹1000",
            user=self.user,
            outlet=self.outlet,
        )
        self.assertEqual(ActivityLog.objects.filter(action="CREATE", module="purchases").count(), 1)
        
    def test_purchase_update_diff_audit_log(self):
        changes = {
            'grand_total': {'old': 1000.0, 'new': 1200.0},
            'items_count': {'old': 5, 'new': 6}
        }
        log_activity(
            action="UPDATE",
            module="purchases",
            entity_type="PurchaseInvoice",
            entity_id="12345",
            entity_label="PI-001",
            description="Updated purchase invoice PI-001",
            user=self.user,
            outlet=self.outlet,
            changes=changes
        )
        log = ActivityLog.objects.filter(action="UPDATE", module="purchases").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.changes_json['grand_total']['old'], 1000.0)
        self.assertEqual(log.changes_json['grand_total']['new'], 1200.0)

    def test_billing_create_audit_log(self):
        log_activity(
            action="CREATE",
            module="billing",
            entity_type="SaleInvoice",
            entity_id="67890",
            entity_label="SI-001",
            description="Created sales invoice SI-001 for ₹500",
            user=self.user,
            outlet=self.outlet,
        )
        self.assertEqual(ActivityLog.objects.filter(action="CREATE", module="billing").count(), 1)
        
    def test_billing_update_diff_audit_log(self):
        changes = {
            'discount_amount': {'old': 0.0, 'new': 50.0},
            'grand_total': {'old': 500.0, 'new': 450.0}
        }
        log_activity(
            action="UPDATE",
            module="billing",
            entity_type="SaleInvoice",
            entity_id="67890",
            entity_label="SI-001",
            description="Updated sales invoice SI-001",
            user=self.user,
            outlet=self.outlet,
            changes=changes
        )
        log = ActivityLog.objects.filter(action="UPDATE", module="billing").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.changes_json['discount_amount']['new'], 50.0)

    def test_inventory_adjust_audit_log(self):
        changes = {
            'qty_strips': {'old': 10, 'new': 5},
            'qty_loose': {'old': 0, 'new': 0}
        }
        log_activity(
            action="ADJUST",
            module="inventory",
            entity_type="Batch",
            entity_id="batch-123",
            entity_label="BATCH001",
            description="Adjusted stock for batch BATCH001 by -5 (strips). Reason: Damage",
            user=self.user,
            outlet=self.outlet,
            changes=changes
        )
        log = ActivityLog.objects.filter(action="ADJUST", module="inventory").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.changes_json['qty_strips']['new'], 5)

    def test_payment_create_audit_log(self):
        log_activity(
            action="CREATE",
            module="payments",
            entity_type="PaymentEntry",
            entity_id="pay-123",
            entity_label="PAY-pay-123",
            description="Recorded payment of ₹1000 to distributor ABC",
            user=self.user,
            outlet=self.outlet
        )
        self.assertEqual(ActivityLog.objects.filter(action="CREATE", module="payments").count(), 1)

    def test_payment_update_diff_audit_log(self):
        changes = {
            'total_amount': {'old': 1000.0, 'new': 1200.0},
            'payment_mode': {'old': 'cash', 'new': 'upi'}
        }
        log_activity(
            action="UPDATE",
            module="payments",
            entity_type="PaymentEntry",
            entity_id="pay-123",
            entity_label="PAY-pay-123",
            description="Updated payment entry PAY-pay-123",
            user=self.user,
            outlet=self.outlet,
            changes=changes
        )
        log = ActivityLog.objects.filter(action="UPDATE", module="payments").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.changes_json['total_amount']['new'], 1200.0)

    def test_patient_create_audit_log(self):
        log_activity(
            action="CREATE",
            module="patient",
            entity_type="Customer",
            entity_id="cust-123",
            entity_label="John Doe",
            description="Registered new patient John Doe",
            user=self.user,
            outlet=self.outlet
        )
        self.assertEqual(ActivityLog.objects.filter(action="CREATE", module="patient").count(), 1)

    def test_patient_update_diff_audit_log(self):
        changes = {
            'phone': {'old': '9876543210', 'new': '9999999999'},
            'is_chronic': {'old': False, 'new': True}
        }
        log_activity(
            action="UPDATE",
            module="patient",
            entity_type="Customer",
            entity_id="cust-123",
            entity_label="John Doe",
            description="Updated patient details for John Doe",
            user=self.user,
            outlet=self.outlet,
            changes=changes
        )
        log = ActivityLog.objects.filter(action="UPDATE", module="patient").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.changes_json['phone']['new'], '9999999999')
        # Ensure sensitive fields like dob are excluded (handled in view)
        self.assertNotIn('dob', log.changes_json)

    def test_staff_create_audit_log(self):
        log_activity(
            action="CREATE",
            module="staff",
            entity_type="Staff",
            entity_id="staff-456",
            entity_label="Jane Smith",
            description="Created staff account for Jane Smith (admin)",
            user=self.user,
            outlet=self.outlet
        )
        self.assertEqual(ActivityLog.objects.filter(action="CREATE", module="staff").count(), 1)

    def test_staff_role_change_audit_log(self):
        changes = {
            'role': {'old': 'billing_staff', 'new': 'manager'},
            'can_edit_rate': {'old': False, 'new': True}
        }
        log_activity(
            action="UPDATE",
            module="staff",
            entity_type="Staff",
            entity_id="staff-456",
            entity_label="Jane Smith",
            description="Updated staff details for Jane Smith",
            user=self.user,
            outlet=self.outlet,
            changes=changes
        )
        log = ActivityLog.objects.filter(action="UPDATE", module="staff").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.changes_json['role']['new'], 'manager')
        self.assertNotIn('password', log.changes_json)

    def test_audit_list_search_filter(self):
        log_activity(
            action="CREATE",
            module="patient",
            entity_type="Customer",
            entity_id="cust-search-test",
            entity_label="Unique Searchable Label",
            description="Created something highly specific keyword123",
            user=self.user,
            outlet=self.outlet
        )
        url = reverse('activity-log-list')
        response = self.client.get(f"{url}?search=keyword123")
        self.assertEqual(response.status_code, 200)
        # Verify it found the correct log
        found = any(item['entity_id'] == "cust-search-test" for item in response.data['results'])
        self.assertTrue(found)

    def test_audit_export_permission_and_content(self):
        url = reverse('activity-log-export')
        
        # Unauthorized check
        self.client.credentials() # clear token
        resp_unauth = self.client.get(url)
        self.assertEqual(resp_unauth.status_code, 401)
        
        # Normal user check
        from apps.accounts.models import Staff
        normal_user = Staff.objects.create_user(
            phone="8888888888",
            password="testpassword",
            name="Normal User",
            role="billing_staff",
            outlet=self.outlet,
            is_active=True
        )
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(normal_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        resp_normal = self.client.get(url)
        self.assertEqual(resp_normal.status_code, 403)
        
        # Admin check
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access}')
        resp_admin = self.client.get(url)
        self.assertEqual(resp_admin.status_code, 200)
        self.assertEqual(resp_admin['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="audit_logs.csv"', resp_admin['Content-Disposition'])

    def test_serializer_contains_ip_is_routable(self):
        from .serializers import ActivityLogSerializer
        log = ActivityLog.objects.create(
            action='create',
            module='inventory',
            user=self.user,
            ip_address='10.0.0.1',
            ip_is_routable=False
        )
        serializer = ActivityLogSerializer(log)
        self.assertIn('ip_is_routable', serializer.data)
        self.assertEqual(serializer.data['ip_is_routable'], False)
