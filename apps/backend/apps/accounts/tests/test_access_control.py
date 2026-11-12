"""
Access-control regression tests: login, role escalation, per-method permissions, outlet isolation,
PIN handling, and the server-computed permission list the frontend relies on.

Every test here pins down a bug that was found in the user/role system; see the docstrings.
"""
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from apps.accounts.models import Staff
from apps.core import permissions as perms
from apps.core.models import Organization, Outlet
from apps.accounts.tests.factories import OutletFactory


def make_staff(outlet, role='billing_staff', phone=None, password='RealPass#1', pin='4321', **flags):
    return Staff.objects.create(
        phone=phone or f'9{uuid.uuid4().int % 10**9:09d}',
        name=f'{role}-user',
        outlet=outlet,
        role=role,
        password=make_password(password),
        staff_pin=make_password(pin),
        **flags,
    )


class AccessControlBase(TestCase):
    def setUp(self):
        cache.clear()  # rate-limit counters live in the cache
        self.org = Organization.objects.create(name='Org A', slug='org-a')
        self.outlet = OutletFactory(name='Outlet A1', organization=self.org)
        self.other_outlet = OutletFactory(name='Outlet A2', organization=self.org)
        self.foreign_org = Organization.objects.create(name='Org B', slug='org-b')
        self.foreign_outlet = OutletFactory(name='Outlet B1', organization=self.foreign_org)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client


# ─── Login ───────────────────────────────────────────────────────────────────

class LoginTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.staff = make_staff(self.outlet, 'manager', phone='9000000001', password='RealPass#1', pin='4321')

    def login(self, phone, password):
        return self.client.post(reverse('login'), {'phone': phone, 'password': password}, format='json')

    def test_real_password_and_real_pin_work(self):
        self.assertEqual(self.login('9000000001', 'RealPass#1').status_code, 200)
        self.assertEqual(self.login('9000000001', '4321').status_code, 200)

    def test_literal_word_password_is_rejected(self):
        """Back door: any account could be entered with the password 'password'."""
        self.assertEqual(self.login('9000000001', 'password').status_code, 401)

    def test_phone_number_as_password_is_rejected(self):
        """Back door: knowing someone's phone number was enough to log in as them."""
        self.assertEqual(self.login('9000000001', '9000000001').status_code, 401)

    def test_hardcoded_phone_remap_is_gone(self):
        """Back door: logging in as 8999205205 silently opened the 8999205207 account."""
        make_staff(self.outlet, 'admin', phone='8999205207', password='AdminPass#9')
        self.assertEqual(self.login('8999205205', 'AdminPass#9').status_code, 401)
        self.assertEqual(self.login('8999205205', 'password').status_code, 401)

    def test_inactive_account_cannot_log_in(self):
        self.staff.is_active = False
        self.staff.save()
        self.assertEqual(self.login('9000000001', 'RealPass#1').status_code, 401)

    def test_five_wrong_attempts_lock_the_account_even_for_the_right_password(self):
        """No limit existed, so a 4-digit PIN (10,000 values) could be brute-forced."""
        for _ in range(5):
            self.assertEqual(self.login('9000000001', '0000').status_code, 401)
        locked = self.login('9000000001', 'RealPass#1')
        self.assertEqual(locked.status_code, 429)
        self.assertIn('Retry-After', locked)

    def test_lockout_is_per_account_and_a_good_login_resets_the_counter(self):
        other = make_staff(self.outlet, 'admin', phone='9000000002', password='OtherPass#2')
        for _ in range(4):
            self.login('9000000001', '0000')
        self.assertEqual(self.login('9000000001', 'RealPass#1').status_code, 200)  # resets
        for _ in range(4):
            self.login('9000000001', '0000')
        self.assertEqual(self.login('9000000001', 'RealPass#1').status_code, 200)  # still not locked
        self.assertEqual(self.login(other.phone, 'OtherPass#2').status_code, 200)  # unaffected

    def test_login_payload_carries_every_flag_and_the_permission_list(self):
        r = self.login('9000000001', 'RealPass#1')
        user = r.data['user']
        for key in ('canEditSales', 'canEditPurchases', 'canExportGst', 'canModifyPaidBill',
                    'canViewBillRevisionHistory', 'canManagePartners', 'permissions'):
            self.assertIn(key, user, key)
        self.assertIsInstance(user['permissions'], list)
        self.assertEqual(user['outlet']['id'], str(self.outlet.id))

    def test_login_me_and_switch_outlet_return_the_same_shape(self):
        """They were three hand-copied dicts that had drifted (switch-outlet returned a cut-down outlet)."""
        sa = make_staff(self.outlet, 'super_admin', phone='9000000003', password='SuperPass#3')
        login_user = self.login('9000000003', 'SuperPass#3').data['user']
        self.client.force_authenticate(user=sa)
        me = self.client.get(reverse('staff-me')).data
        switched = self.client.post(reverse('switch-outlet'), {'outletId': str(self.other_outlet.id)}, format='json').data['user']
        self.assertEqual(set(login_user), set(me))
        self.assertEqual(set(login_user), set(switched))
        self.assertEqual(set(login_user['outlet']), set(switched['outlet']))


# ─── Role escalation ─────────────────────────────────────────────────────────

class RoleEscalationTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.admin = make_staff(self.outlet, 'admin', phone='9100000001')
        self.super_admin = make_staff(self.outlet, 'super_admin', phone='9100000002')
        self.worker = make_staff(self.outlet, 'billing_staff', phone='9100000003')

    def create(self, caller, **extra):
        body = {'name': 'New', 'phone': f'9{uuid.uuid4().int % 10**9:09d}', 'password': 'Pw#12345', 'pin': f'{uuid.uuid4().int % 9000 + 1000}'}
        body.update(extra)
        return self.as_user(caller).post(reverse('staff-create'), body, format='json')

    def patch(self, caller, target, **body):
        return self.as_user(caller).patch(reverse('staff-detail', kwargs={'pk': target.id}), body, format='json')

    def test_admin_cannot_create_a_super_admin(self):
        r = self.create(self.admin, role='super_admin')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Staff.objects.filter(role='super_admin').exclude(id=self.super_admin.id).exists())

    def test_admin_can_create_lower_roles_and_super_admin_can_create_anyone(self):
        self.assertEqual(self.create(self.admin, role='manager').status_code, 201)
        self.assertEqual(self.create(self.super_admin, role='super_admin').status_code, 201)

    def test_admin_cannot_promote_anyone_to_super_admin(self):
        self.assertEqual(self.patch(self.admin, self.worker, role='super_admin').status_code, 403)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.role, 'billing_staff')

    def test_invalid_role_string_is_rejected_instead_of_stored(self):
        """The role used to be written with a blind setattr, so any string went in and broke permissions."""
        self.assertEqual(self.patch(self.admin, self.worker, role='owner').status_code, 400)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.role, 'billing_staff')

    def test_nobody_can_change_their_own_role(self):
        self.assertEqual(self.patch(self.admin, self.admin, role='manager').status_code, 403)
        self.assertEqual(self.patch(self.super_admin, self.super_admin, role='admin').status_code, 403)

    def test_admin_cannot_touch_a_super_admin_account(self):
        """An admin could reset a super_admin's password and then take the account over."""
        before = self.super_admin.password
        self.assertEqual(self.patch(self.admin, self.super_admin, password='Hacked#123').status_code, 403)
        self.assertEqual(self.as_user(self.admin).delete(reverse('staff-detail', kwargs={'pk': self.super_admin.id})).status_code, 403)
        self.super_admin.refresh_from_db()
        self.assertEqual(self.super_admin.password, before)
        self.assertTrue(self.super_admin.is_active)

    def test_nobody_can_deactivate_themselves(self):
        self.assertEqual(self.patch(self.admin, self.admin, isActive=False).status_code, 403)
        self.assertEqual(self.as_user(self.admin).delete(reverse('staff-detail', kwargs={'pk': self.admin.id})).status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_normal_admin_edits_still_work(self):
        r = self.patch(self.admin, self.worker, name='Renamed', role='manager', canEditSales=True)
        self.assertEqual(r.status_code, 200)
        self.worker.refresh_from_db()
        self.assertEqual((self.worker.name, self.worker.role, self.worker.can_edit_sales), ('Renamed', 'manager', True))

    def test_staff_endpoints_never_expose_the_pin_hash(self):
        r = self.as_user(self.admin).get(reverse('staff-list'), {'outletId': str(self.outlet.id)})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all('staffPin' not in row for row in r.data))
        created = self.create(self.admin, role='manager')
        self.assertNotIn('staffPin', created.data['data'])


# ─── Per-method permissions on merged list+create views ──────────────────────

class MergedViewPermissionTests(AccessControlBase):
    def test_view_only_cannot_create_a_bill(self):
        """POST /sales/ ran with the list view's IsAuthenticated, so IsBillingStaffOrAbove never applied."""
        viewer = make_staff(self.outlet, 'view_only', phone='9200000001')
        r = self.as_user(viewer).post('/api/v1/sales/', {'outletId': str(self.outlet.id)}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_billing_staff_passes_the_permission_gate_on_sales(self):
        cashier = make_staff(self.outlet, 'billing_staff', phone='9200000002')
        r = self.as_user(cashier).post('/api/v1/sales/', {'outletId': str(self.outlet.id)}, format='json')
        self.assertNotEqual(r.status_code, 403)  # reaches validation (400), is not turned away

    def test_everyone_can_still_list_sales(self):
        viewer = make_staff(self.outlet, 'view_only', phone='9200000003')
        r = self.as_user(viewer).get('/api/v1/sales/', {'outletId': str(self.outlet.id)})
        self.assertNotEqual(r.status_code, 403)

    def test_manager_without_the_flag_cannot_create_a_purchase(self):
        """POST /purchases/ ran with CanAccessPurchases (any manager) instead of CanCreatePurchases."""
        manager = make_staff(self.outlet, 'manager', phone='9200000004')
        r = self.as_user(manager).post('/api/v1/purchases/', {'outletId': str(self.outlet.id)}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_manager_with_the_flag_can_reach_purchase_validation(self):
        manager = make_staff(self.outlet, 'manager', phone='9200000005', can_create_purchases=True)
        r = self.as_user(manager).post('/api/v1/purchases/', {'outletId': str(self.outlet.id)}, format='json')
        self.assertNotEqual(r.status_code, 403)

    def test_manager_can_still_list_purchases(self):
        manager = make_staff(self.outlet, 'manager', phone='9200000006')
        r = self.as_user(manager).get('/api/v1/purchases/', {'outletId': str(self.outlet.id)})
        self.assertNotEqual(r.status_code, 403)


class UnprotectedWriteEndpointTests(AccessControlBase):
    def test_patch_ewb_requires_login(self):
        """permission_classes = [] meant NO authentication: anyone could rewrite an invoice's e-way bill."""
        r = APIClient().post(reverse('sale-patch-ewb', kwargs={'sale_id': uuid.uuid4()}), {'eway_bill_no': '1'}, format='json')
        self.assertIn(r.status_code, (401, 403))

    def test_patch_ewb_is_admin_only(self):
        cashier = make_staff(self.outlet, 'billing_staff', phone='9300000001')
        r = self.as_user(cashier).post(reverse('sale-patch-ewb', kwargs={'sale_id': uuid.uuid4()}), {'eway_bill_no': '1'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_credit_limit_needs_manager(self):
        cashier = make_staff(self.outlet, 'billing_staff', phone='9300000002')
        r = self.as_user(cashier).patch(reverse('credit-limit-update', kwargs={'pk': uuid.uuid4()}), {'creditLimit': 999999}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_marg_migration_needs_admin(self):
        manager = make_staff(self.outlet, 'manager', phone='9300000003')
        self.assertEqual(self.as_user(manager).post('/api/v1/migrate/marg/', {}, format='json').status_code, 403)

    def test_creating_products_needs_manager_or_purchase_rights(self):
        cashier = make_staff(self.outlet, 'billing_staff', phone='9300000004')
        self.assertEqual(self.as_user(cashier).post('/api/v1/products/', {'name': 'X'}, format='json').status_code, 403)
        buyer = make_staff(self.outlet, 'billing_staff', phone='9300000005', can_create_purchases=True)
        self.assertNotEqual(self.as_user(buyer).post('/api/v1/products/', {'name': 'X'}, format='json').status_code, 403)

    def test_purchase_orders_need_purchase_rights(self):
        cashier = make_staff(self.outlet, 'billing_staff', phone='9300000006')
        self.assertEqual(self.as_user(cashier).post('/api/v1/purchases/orders/', {'outletId': str(self.outlet.id)}, format='json').status_code, 403)
        self.assertEqual(self.as_user(cashier).post('/api/v1/purchases/orders/bulk-create/', {}, format='json').status_code, 403)

    def test_gst_portal_actions_need_report_rights(self):
        """Any logged-in user (even view_only) could request GST OTPs and trigger GSTR-2B sync."""
        viewer = make_staff(self.outlet, 'view_only', phone='9300000007')
        self.assertEqual(self.as_user(viewer).post('/api/v1/gst/sandbox/otp/request/', {}, format='json').status_code in (403, 404), True)
        self.assertEqual(self.as_user(viewer).post('/api/v1/gst/gstr2b/sync/', {}, format='json').status_code in (403, 404), True)


# ─── Outlet isolation ────────────────────────────────────────────────────────

class OutletIsolationTests(AccessControlBase):
    def test_admin_cannot_read_another_outlet_through_snake_case_outlet_id(self):
        """The guard only looked at `outletId`; trial balance / GST summary / P&L read `outlet_id`."""
        admin = make_staff(self.outlet, 'admin', phone='9400000001')
        c = self.as_user(admin)
        self.assertEqual(c.get(reverse('trial-balance'), {'outlet_id': str(self.other_outlet.id)}).status_code, 403)
        self.assertEqual(c.get(reverse('gst-summary'), {'outlet_id': str(self.other_outlet.id)}).status_code, 403)

    def test_admin_can_still_read_their_own_outlet(self):
        admin = make_staff(self.outlet, 'admin', phone='9400000002')
        r = self.as_user(admin).get(reverse('trial-balance'), {'outlet_id': str(self.outlet.id)})
        self.assertNotEqual(r.status_code, 403)

    def test_body_outlet_is_checked_as_well(self):
        manager = make_staff(self.outlet, 'manager', phone='9400000003', can_create_purchases=True)
        r = self.as_user(manager).post('/api/v1/purchases/', {'outlet_id': str(self.other_outlet.id)}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_super_admin_may_use_any_outlet_of_their_own_organization(self):
        sa = make_staff(self.outlet, 'super_admin', phone='9400000004')
        r = self.as_user(sa).get(reverse('trial-balance'), {'outlet_id': str(self.other_outlet.id)})
        self.assertNotEqual(r.status_code, 403)

    def test_super_admin_cannot_cross_into_another_organization(self):
        """super_admin used to bypass the outlet check for ANY outlet id, including other tenants."""
        sa = make_staff(self.outlet, 'super_admin', phone='9400000005')
        r = self.as_user(sa).get(reverse('trial-balance'), {'outlet_id': str(self.foreign_outlet.id)})
        self.assertEqual(r.status_code, 403)

    def test_object_level_helper(self):
        staff = make_staff(self.outlet, 'manager', phone='9400000006')
        sa = make_staff(self.outlet, 'super_admin', phone='9400000007')
        self.assertTrue(perms.user_can_access_outlet(staff, self.outlet.id))
        self.assertFalse(perms.user_can_access_outlet(staff, self.other_outlet.id))
        self.assertTrue(perms.user_can_access_outlet(sa, self.other_outlet.id))
        self.assertFalse(perms.user_can_access_outlet(sa, self.foreign_outlet.id))
        self.assertFalse(perms.user_can_access_outlet(staff, None))


# ─── PIN handling ────────────────────────────────────────────────────────────

class PinTests(AccessControlBase):
    def setUp(self):
        super().setUp()
        self.admin = make_staff(self.outlet, 'admin', phone='9500000001', pin='0000')
        self.cashier = make_staff(self.outlet, 'billing_staff', phone='9500000002', pin='1234')

    def lookup(self, pin, user=None):
        return self.as_user(user or self.admin).post(
            reverse('staff-lookup-by-pin'), {'pin': pin, 'outletId': str(self.outlet.id)}, format='json')

    def test_pin_responses_never_contain_the_pin_hash(self):
        r = self.lookup('1234')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('staffPin', r.data)
        v = self.as_user(self.admin).post(
            reverse('staff-verify-pin', kwargs={'staff_id': self.cashier.id}) + f'?outletId={self.outlet.id}', {'pin': '1234'}, format='json')
        self.assertEqual(v.status_code, 200)
        self.assertNotIn('staffPin', v.data)

    def test_too_many_wrong_guesses_are_blocked(self):
        for _ in range(10):
            self.assertEqual(self.lookup('9999').status_code, 400)
        self.assertEqual(self.lookup('9999').status_code, 429)
        self.assertEqual(self.lookup('1234').status_code, 429)  # even the right one, until the window passes

    def test_deactivated_staff_pin_no_longer_verifies(self):
        self.cashier.is_active = False
        self.cashier.save()
        v = self.as_user(self.admin).post(
            reverse('staff-verify-pin', kwargs={'staff_id': self.cashier.id}) + f'?outletId={self.outlet.id}', {'pin': '1234'}, format='json')
        self.assertEqual(v.status_code, 404)

    def test_plaintext_pin_is_not_stored_in_cache_keys(self):
        self.lookup('1234')
        from django.core.cache import cache as c
        keys = list(getattr(c, '_cache', {}).keys())
        self.assertFalse([k for k in keys if '1234' in str(k)], keys)

    def test_changing_the_pin_keeps_the_login_password(self):
        """ChangePinView used to overwrite the real password with a hash of the PIN."""
        r = self.as_user(self.cashier).patch(reverse('change-pin'), {'currentPin': '1234', 'newPin': '5678'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.cashier.refresh_from_db()
        self.assertTrue(check_password('RealPass#1', self.cashier.password))
        self.assertTrue(check_password('5678', self.cashier.staff_pin))


# ─── effective_permissions must agree with the DRF classes that enforce the API ──

class EffectivePermissionsMatchTheApi(TestCase):
    """
    The frontend hides/shows UI from `permissions`. If that list ever disagrees with the DRF
    permission class guarding the matching endpoint the UI lies. This test makes drift impossible.
    """
    CLASS_FOR = {
        'view_outlet': perms.IsAuthenticated,
        'create_bills': perms.IsBillingStaffOrAbove,
        'create_purchases': perms.CanCreatePurchases,
        'view_purchases': perms.CanAccessPurchases,
        'edit_purchases': perms.CanEditPurchaseInvoice,
        'edit_sales': perms.CanEditSalesInvoice,
        'view_purchase_rates': perms.CanViewPurchaseRates,
        'view_reports': perms.CanAccessReports,
        'view_audit_history': perms.CanViewAuditHistory,
        'manage_partners': perms.CanManagePartners,
        'edit_vouchers': perms.CanEditVouchers,
        'view_accounts': perms.IsManagerOrAbove,
        'override_credit': perms.IsManagerOrAbove,
        'manage_products': perms.CanManageProducts,
        'manage_staff': perms.IsAdminStaff,
        'manage_settings': perms.IsAdminStaff,
        'send_purchase_orders': perms.CanSendPurchaseOrders,
        'cancel_purchase_orders': perms.CanCancelPurchaseOrders,
        'manage_po_settings': perms.IsAdminStaff,
    }
    FLAGS = ('can_create_purchases', 'can_edit_purchases', 'can_edit_sales', 'can_view_purchase_rates',
             'can_access_reports', 'can_view_audit_history', 'can_manage_partners', 'can_export_gst', 'can_edit_vouchers')

    def _request_for(self, user):
        request = Request(APIRequestFactory().get('/'))
        request.user = user
        return request

    def test_every_role_and_flag_combination_agrees_with_the_enforcing_class(self):
        org = Organization.objects.create(name='O', slug='o')
        outlet = OutletFactory(name='X', organization=org)
        checked = 0
        for role in ('super_admin', 'admin', 'manager', 'billing_staff', 'view_only'):
            # all flags off, each flag alone on, all on
            combos = [{}] + [{f: True} for f in self.FLAGS] + [{f: True for f in self.FLAGS}]
            for combo in combos:
                user = Staff(phone=f'9{checked:09d}', name='t', outlet=outlet, role=role, **combo)
                granted = set(perms.effective_permissions(user))
                request = self._request_for(user)
                for name, cls in self.CLASS_FOR.items():
                    allowed = bool(cls().has_permission(request, None))
                    self.assertEqual(name in granted, allowed, f'{role} {combo}: "{name}" list={name in granted} api={allowed}')
                    checked += 1
        self.assertGreater(checked, 500)

    def test_unknown_role_gets_nothing(self):
        org = Organization.objects.create(name='O2', slug='o2')
        outlet = OutletFactory(name='Y', organization=org)
        for role in ('owner', 'whatever', ''):
            user = Staff(phone='9000000000', name='t', outlet=outlet, role=role)
            self.assertEqual(perms.effective_permissions(user), [], role)

    def test_legacy_cashier_role_keeps_working_as_billing_staff_but_cannot_be_assigned(self):
        """Old rows / fixtures carry role='cashier'. They must not be locked out of billing."""
        org = Organization.objects.create(name='O4', slug='o4')
        outlet = OutletFactory(name='W', organization=org)
        cashier = Staff(phone='9000000003', name='t', outlet=outlet, role='cashier')
        biller = Staff(phone='9000000004', name='t', outlet=outlet, role='billing_staff')
        self.assertEqual(perms.effective_permissions(cashier), perms.effective_permissions(biller))
        self.assertIn('create_bills', perms.effective_permissions(cashier))
        admin = Staff(phone='9000000005', name='t', outlet=outlet, role='admin')
        self.assertFalse(perms.can_assign_role(admin, 'cashier'))  # never hand it out again

    def test_super_admin_alone_has_the_outlet_bypass_permissions(self):
        org = Organization.objects.create(name='O3', slug='o3')
        outlet = OutletFactory(name='Z', organization=org)
        admin = Staff(phone='9000000001', name='t', outlet=outlet, role='admin')
        sa = Staff(phone='9000000002', name='t', outlet=outlet, role='super_admin')
        self.assertNotIn('view_all_outlets', perms.effective_permissions(admin))
        self.assertIn('view_all_outlets', perms.effective_permissions(sa))


class PermissionMatrixFixtureTests(TestCase):
    def test_frontend_fixture_matches_the_server_rules(self):
        """
        The frontend tests its fallback rules against lib/permission-matrix.fixture.json.
        If the server rules change, regenerate it:  python manage.py dump_permission_matrix
        """
        import json
        from pathlib import Path
        from django.conf import settings
        from apps.core.permission_matrix import build_permission_matrix

        path = Path(settings.BASE_DIR).parent / 'frontend' / 'lib' / 'permission-matrix.fixture.json'
        if not path.exists():
            self.skipTest('frontend sources are not present (backend-only checkout/image)')
        self.assertEqual(json.loads(path.read_text()), build_permission_matrix(),
                         'permission-matrix.fixture.json is stale: run `python manage.py dump_permission_matrix`')


# ─── The old staff form turned the role into 'custom' ────────────────────────

class LegacyCustomRoleTests(AccessControlBase):
    """
    The staff form used to set role='custom' whenever its toggles differed from a preset and sent it
    to the API. 'custom' is not a role, so such users ended up with an unknown role.
    """

    def setUp(self):
        super().setUp()
        self.admin = make_staff(self.outlet, 'admin', phone='9600000001')
        self.worker = make_staff(self.outlet, 'billing_staff', phone='9600000002')

    def test_a_user_already_stored_as_custom_keeps_billing_and_their_flags(self):
        legacy = Staff(phone='9600000003', name='t', outlet=self.outlet, role='custom', can_edit_sales=True)
        granted = perms.effective_permissions(legacy)
        self.assertIn('create_bills', granted)
        self.assertIn('edit_sales', granted)
        self.assertNotIn('manage_staff', granted)           # an alias, never a promotion
        self.assertNotIn('view_accounts', granted)

    def test_custom_user_can_still_reach_the_sales_endpoint(self):
        legacy = make_staff(self.outlet, 'custom', phone='9600000004')
        r = self.as_user(legacy).post('/api/v1/sales/', {'outletId': str(self.outlet.id)}, format='json')
        self.assertNotEqual(r.status_code, 403)

    def test_an_old_browser_sending_role_custom_saves_everything_else_and_keeps_the_role(self):
        """A stale tab running the old form must not fail the save, and must never store 'custom'."""
        r = self.as_user(self.admin).patch(reverse('staff-detail', kwargs={'pk': self.worker.id}),
                                           {'role': 'custom', 'name': 'Renamed', 'canEditSales': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.worker.refresh_from_db()
        self.assertEqual((self.worker.role, self.worker.name, self.worker.can_edit_sales), ('billing_staff', 'Renamed', True))

    def test_creating_with_role_custom_makes_a_billing_staff_member(self):
        r = self.as_user(self.admin).post(reverse('staff-create'), {
            'name': 'N', 'phone': '9600000009', 'password': 'Pw#12345', 'pin': '7777', 'role': 'custom', 'canEditSales': True}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Staff.objects.get(phone='9600000009').role, 'billing_staff')

    def test_a_flag_only_patch_leaves_every_other_flag_alone(self):
        """The API is partial: only the keys sent change (the form now relies on this)."""
        self.worker.can_view_bill_revision_history = True
        self.worker.can_edit_rate = True
        self.worker.save()
        self.as_user(self.admin).patch(reverse('staff-detail', kwargs={'pk': self.worker.id}), {'name': 'Only name'}, format='json')
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.can_view_bill_revision_history)
        self.assertTrue(self.worker.can_edit_rate)

    def test_normalize_command_dry_run_then_apply(self):
        from io import StringIO
        from django.core.management import call_command
        make_staff(self.outlet, 'custom', phone='9600000005')
        make_staff(self.outlet, 'cashier', phone='9600000006', can_edit_sales=True)
        make_staff(self.outlet, 'owner', phone='9600000007')

        out = StringIO()
        call_command('normalize_staff_roles', stdout=out)
        self.assertIn('Dry run: 2 row(s) would change', out.getvalue())
        self.assertIn("UNKNOWN ROLE 'owner'", out.getvalue())
        self.assertEqual(Staff.objects.filter(role__in=['custom', 'cashier']).count(), 2)   # nothing written yet

        call_command('normalize_staff_roles', '--apply', stdout=StringIO())
        self.assertEqual(Staff.objects.filter(role__in=['custom', 'cashier']).count(), 0)
        self.assertTrue(Staff.objects.get(phone='9600000006').can_edit_sales)               # flags untouched
        self.assertEqual(Staff.objects.get(phone='9600000007').role, 'owner')               # unknown ones are never guessed
