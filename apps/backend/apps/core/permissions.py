from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError

# Role hierarchy (highest to lowest):
#   super_admin → admin → manager → billing_staff → view_only

ADMIN_ROLES = {'super_admin', 'admin'}
MANAGER_ROLES = {'super_admin', 'admin', 'manager'}
ALL_ROLES = {'super_admin', 'admin', 'manager', 'billing_staff', 'view_only'}
BILLING_ROLES = {'super_admin', 'admin', 'manager', 'billing_staff', 'cashier', 'custom'}

# LEGACY role strings. They are not in Staff.ROLE_CHOICES and can no longer be created or assigned
# (see can_assign_role), but rows that carry them exist and must not be locked out of billing:
#   'cashier' : older data / test factories; the frontend always treated it as a billing role.
#   'custom'  : written by an old bug in the staff form, which turned the role into 'custom' whenever
#               the permission toggles did not match a preset. Such a user's real rights are their
#               per-user flags, on top of the lowest billing tier.
# Both behave as billing_staff. `manage.py normalize_staff_roles --apply` rewrites the rows.
ROLE_ALIASES = {'cashier': 'billing_staff', 'custom': 'billing_staff'}


def canonical_role(role):
    return ROLE_ALIASES.get(role, role)

# Numeric rank used to stop people granting or modifying roles above their own.
ROLE_RANK = {'view_only': 0, 'billing_staff': 1, 'manager': 2, 'admin': 3, 'super_admin': 4}

# Every spelling of "which outlet is this request about" that views read. The outlet guard must
# look at all of them: guarding only `outletId` left `outlet_id` endpoints (trial balance, GST
# summary, balance sheet, P&L, ...) open to other outlets.
OUTLET_PARAM_KEYS = ('outletId', 'outlet_id')


def _get_requested_outlet_ids(request):
    """
    Every outlet id the request names, from the query string AND the body, in every spelling.
    (`request.data` may be a list for bulk endpoints; those carry no top-level outlet key.)
    """
    ids = []
    for key in OUTLET_PARAM_KEYS:
        value = request.query_params.get(key)
        if value:
            ids.append(str(value))
    data = getattr(request, 'data', None)
    if hasattr(data, 'get'):
        for key in OUTLET_PARAM_KEYS:
            value = data.get(key)
            if value and not isinstance(value, (dict, list)):
                ids.append(str(value))
    # Several views (billing revision history/reports, audit) fall back to the `OutletId` header when no
    # outletId is given. It was never checked, so a user of outlet A could send OutletId: <outlet B> and read
    # B's revisions and snapshots. It is an outlet selector like the others.
    header = request.META.get('HTTP_OUTLETID')
    if header:
        ids.append(str(header))
    return ids


def _get_requested_outlet_id(request):
    """First outlet id named by the request (kept for callers that only need one)."""
    ids = _get_requested_outlet_ids(request)
    return ids[0] if ids else None


def _same_organization(user, outlet_id):
    """
    True if `outlet_id` belongs to the same organization as the user's home outlet.
    A super_admin may switch between the outlets of THEIR organization, never another one.
    If the home outlet has no organization we cannot tell, so we keep the historical behaviour.
    """
    home = getattr(user, 'outlet', None)
    org_id = getattr(home, 'organization_id', None) if home else None
    if org_id is None:
        return True
    from apps.core.models import Outlet
    try:
        return Outlet.objects.filter(id=outlet_id, organization_id=org_id).exists()
    except (DjangoValidationError, ValueError):
        # `outletId` comes straight from the query string / body: text that is not a UUID is simply
        # "not one of your outlets" (403), not a crash (500) on every outlet-scoped endpoint.
        return False


def user_can_access_outlet(user, outlet_id):
    """
    Object-level outlet rule, for views that load a record by id and must check it belongs
    to an outlet the caller may use:
      - regular staff: only their own outlet
      - super_admin: any outlet of their own organization
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if outlet_id is None or str(outlet_id) == '':
        return False
    own = str(getattr(user, 'outlet_id', '') or '')
    if str(outlet_id) == own:
        return True
    if getattr(user, 'role', None) == 'super_admin':
        return _same_organization(user, outlet_id)
    return False


def assert_outlet_access(user, outlet_id, message=None):
    """Raise PermissionDenied unless `user` may use `outlet_id` (see user_can_access_outlet)."""
    if not user_can_access_outlet(user, outlet_id):
        raise PermissionDenied(
            message or 'You do not have access to this outlet. Staff can only access data from their own outlet.'
        )


def check_outlet_access(request):
    """
    Enforces outlet isolation for every outlet id the request names (query + body, any spelling):
    - regular staff can ONLY use their own outlet;
    - super_admin can use any outlet of their own organization.
    Returns True if allowed, raises PermissionDenied if not.
    """
    if not request.user or not request.user.is_authenticated:
        return True  # Let the IsAuthenticated permission handle unauthenticated requests

    requested = _get_requested_outlet_ids(request)

    # No outlet named: nothing to check here (the view reports the missing parameter itself).
    if not requested:
        return True

    own = str(getattr(request.user, 'outlet_id', '') or '')
    for outlet_id in requested:
        if outlet_id == own:
            continue
        if getattr(request.user, 'role', None) == 'super_admin' and _same_organization(request.user, outlet_id):
            continue
        raise PermissionDenied(
            'You do not have access to this outlet. '
            'Staff can only access data from their own outlet.'
        )

    return True


def _is_admin(user):
    """Returns True if user is super_admin or admin — they bypass all flag checks."""
    return getattr(user, 'role', None) in ADMIN_ROLES


class IsAdminStaff(BasePermission):
    """
    Allows access only to super_admin and admin roles.
    Used for: staff CRUD, reports, outlet settings, ledger management.
    Also enforces outlet isolation.
    """

    message = 'You do not have permission to perform this action. Admin role required.'

    def has_permission(self, request, view):
        if not (
            request.user.is_authenticated
            and hasattr(request.user, 'role')
            and request.user.role in ADMIN_ROLES
        ):
            return False
        check_outlet_access(request)
        return True


class IsManagerOrAbove(BasePermission):
    """
    Allows access to super_admin, admin, and manager roles.
    Used for: purchases, sales returns, inventory adjustments.
    Also enforces outlet isolation.
    """

    message = 'You do not have permission to perform this action. Manager role or above required.'

    def has_permission(self, request, view):
        if not (
            request.user.is_authenticated
            and hasattr(request.user, 'role')
            and request.user.role in MANAGER_ROLES
        ):
            return False
        check_outlet_access(request)
        return True


class IsAuthenticated(BasePermission):
    """
    Standard authenticated access with outlet isolation.
    Used for: billing, inventory read, customer access.
    """

    message = 'Authentication required.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        check_outlet_access(request)
        return True


class IsBillingStaffOrAbove(BasePermission):
    """
    Allows all authenticated roles (billing_staff and above).
    Used for: creating sale invoices, viewing inventory, customer lookups.
    Also enforces outlet isolation.
    """

    message = 'Authentication required.'

    def has_permission(self, request, view):
        if not (
            request.user.is_authenticated
            and hasattr(request.user, 'role')
            and request.user.role in BILLING_ROLES
        ):
            return False
        check_outlet_access(request)
        return True


# ─── Granular Flag-Based Permissions ──────────────────────────────────────────
# These check BOTH the role AND the specific permission flag on the Staff model.
# super_admin and admin ALWAYS bypass the flag check (they have all permissions).

class CanAccessReports(BasePermission):
    """
    Allows access to reports if:
    - User is super_admin or admin (always allowed), OR
    - User has can_access_reports = True
    """
    message = 'You do not have permission to access reports. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_access_reports', False):
            return False
        check_outlet_access(request)
        return True


class CanViewPurchaseRates(BasePermission):
    """
    Allows viewing purchase/cost rates in the API response if:
    - User is super_admin or admin, OR
    - User has can_view_purchase_rates = True
    """
    message = 'You do not have permission to view purchase rates. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_view_purchase_rates', False):
            return False
        check_outlet_access(request)
        return True


class CanEditSalesInvoice(BasePermission):
    """
    Allows editing (PUT) of sale invoices if:
    - User is super_admin or admin, OR
    - User has can_edit_sales = True
    """
    message = 'You do not have permission to edit sales invoices. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_sales', False):
            return False
        check_outlet_access(request)
        return True


class CanEditPurchaseInvoice(BasePermission):
    """
    Allows editing (PUT) of purchase invoices if:
    - User is super_admin or admin, OR
    - User has can_edit_purchases = True
    """
    message = 'You do not have permission to edit purchase invoices. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_purchases', False):
            return False
        check_outlet_access(request)
        return True


class CanCreatePurchases(BasePermission):
    """
    Allows creating purchase invoices if:
    - User is super_admin or admin, OR
    - User has can_create_purchases = True
    """
    message = 'You do not have permission to create purchases. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_create_purchases', False):
            return False
        check_outlet_access(request)
        return True


class CanSendPurchaseOrders(CanCreatePurchases):
    """Send / resend / mark a purchase order as ordered. Today it follows `can_create_purchases`; a separate flag can be split off later."""
    message = 'You do not have permission to send purchase orders. Contact your admin to enable this.'


class CanCancelPurchaseOrders(CanEditPurchaseInvoice):
    """Cancel a purchase order or close it short. Follows `can_edit_purchases`."""
    message = 'You do not have permission to cancel purchase orders. Contact your admin to enable this.'


class CanAccessPurchases(BasePermission):
    """
    Allows general access to purchase-related GET views (lists, distributors) if:
    - User is super_admin, admin, or manager, OR
    - User has ANY purchase permission (can_create_purchases, can_edit_purchases, can_view_purchase_rates)
    """
    message = 'You do not have permission to access purchases. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, 'role', None) in MANAGER_ROLES:
            check_outlet_access(request)
            return True
        if getattr(request.user, 'can_create_purchases', False) or \
           getattr(request.user, 'can_edit_purchases', False) or \
           getattr(request.user, 'can_view_purchase_rates', False):
            check_outlet_access(request)
            return True
        return False

class CanEditSaleReturns(BasePermission):
    message = 'You do not have permission to edit sale returns. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_sale_returns', False):
            return False
        check_outlet_access(request)
        return True

class CanEditPurchaseReturns(BasePermission):
    message = 'You do not have permission to edit purchase returns. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_purchase_returns', False):
            return False
        check_outlet_access(request)
        return True

class CanEditVouchers(BasePermission):
    message = 'You do not have permission to edit vouchers. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_vouchers', False):
            return False
        check_outlet_access(request)
        return True

class CanViewAuditHistory(BasePermission):
    message = 'You do not have permission to view revision history. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_view_audit_history', False):
            return False
        check_outlet_access(request)
        return True

class CanVoidRecords(BasePermission):
    message = 'You do not have permission to void/cancel records. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_void_records', False):
            return False
        check_outlet_access(request)
        return True

# ─── Sales Bill Revision Permissions ─────────────────────────────────────────

def has_bill_revision_permission(user, permission_flag: str) -> bool:
    """
    Helper function to check if a user has a specific bill revision permission.
    Admins (super_admin, admin) bypass the check and always return True.
    """
    if not user or not user.is_authenticated:
        return False
    if _is_admin(user):
        return True
    return getattr(user, permission_flag, False)

class HasBillRevisionPermission(BasePermission):
    """
    Generic permission class for bill revisions.
    Views using this should set `required_revision_permission` attribute.
    """
    message = 'You do not have permission to perform this bill revision action.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        required_perm = getattr(view, 'required_revision_permission', None)
        if not required_perm:
            # If no specific permission is required by the view, deny by default
            return False
            
        if not has_bill_revision_permission(request.user, required_perm):
            return False
            
        check_outlet_access(request)
        return True

class CanViewBillRevisionHistory(BasePermission):
    """
    Allows viewing the bill revision history timeline and reports if:
    - User is admin, OR
    - User has can_view_bill_revision_history = True
    """
    message = 'You do not have permission to view bill revision history.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if has_bill_revision_permission(request.user, 'can_view_bill_revision_history'):
            check_outlet_access(request)
            return True
        return False


# ─── Additional flag-based permission classes ────────────────────────────────

class CanManageProducts(BasePermission):
    """
    Creating products in the master catalogue.
    Managers and above, or anyone who is allowed to enter purchases (new products are added
    from the purchase screen).
    """
    message = 'You do not have permission to create products. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'role', None) in MANAGER_ROLES or \
           getattr(user, 'can_create_purchases', False) or \
           getattr(user, 'can_edit_purchases', False):
            check_outlet_access(request)
            return True
        return False


class CanManagePartners(BasePermission):
    """Profit-split partners and fixed monthly expenses: admins, or users with can_manage_partners."""
    message = 'You do not have permission to manage partners or fixed expenses.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user) or getattr(request.user, 'can_manage_partners', False):
            check_outlet_access(request)
            return True
        return False


# ─── Role management rules (who may create / change whom) ────────────────────

def can_assign_role(caller, new_role):
    """
    A caller may only hand out roles that are not above their own, and ONLY a super_admin
    may create or promote another super_admin. Without this an admin could make themselves
    (or anyone) a super_admin, which bypasses outlet isolation entirely.
    """
    if new_role not in ROLE_RANK:
        return False
    caller_role = getattr(caller, 'role', None)
    if caller_role == 'super_admin':
        return True
    if caller_role == 'admin':
        return ROLE_RANK[new_role] <= ROLE_RANK['admin'] and new_role != 'super_admin'
    return False


def can_manage_staff_member(caller, target):
    """
    May `caller` edit/deactivate `target`? A super_admin account can only be managed by a
    super_admin (an admin could otherwise reset a super_admin's password and take the account).
    """
    caller_role = getattr(caller, 'role', None)
    if caller_role == 'super_admin':
        return True
    if caller_role == 'admin':
        return getattr(target, 'role', None) != 'super_admin'
    return False


# ─── Effective permissions (single source of truth sent to the frontend) ────

# The names below are the frontend's vocabulary (hooks/usePermissions.ts). Each rule mirrors
# the DRF permission class that actually protects the matching API, so the UI can never offer
# something the API will refuse (or hide something the API allows).
def effective_permissions(user):
    """
    The list of permission names this user actually holds. Computed from the same role sets and
    flags the API classes above use, and sent with login / me / switch-outlet. The frontend
    checks membership in this list instead of re-implementing the rules.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    role = canonical_role(getattr(user, 'role', None))
    if role not in ALL_ROLES:
        return []  # unknown role string: grant nothing rather than guess

    admin = role in ADMIN_ROLES
    manager = role in MANAGER_ROLES

    def flag(name):
        return admin or bool(getattr(user, name, False))

    perms = {'view_outlet'}                                        # IsAuthenticated
    if role in BILLING_ROLES:
        perms.add('create_bills')                                  # IsBillingStaffOrAbove
    if flag('can_create_purchases'):
        perms.add('create_purchases')                              # CanCreatePurchases
    if manager or any(getattr(user, f, False) for f in
                      ('can_create_purchases', 'can_edit_purchases', 'can_view_purchase_rates')):
        perms.add('view_purchases')                                # CanAccessPurchases
    if flag('can_edit_purchases'):
        perms.add('edit_purchases')                                # CanEditPurchaseInvoice
        perms.add('cancel_purchase_orders')                        # CanCancelPurchaseOrders
    if flag('can_create_purchases'):
        perms.add('send_purchase_orders')                          # CanSendPurchaseOrders
    if flag('can_edit_sales'):
        perms.add('edit_sales')                                    # CanEditSalesInvoice
    if flag('can_view_purchase_rates'):
        perms.add('view_purchase_rates')                           # CanViewPurchaseRates
    if flag('can_access_reports'):
        perms.add('view_reports')                                  # CanAccessReports
    if flag('can_export_gst'):
        perms.add('export_reports')                                # GST export views
    if flag('can_view_audit_history'):
        perms.add('view_audit_history')                            # CanViewAuditHistory
    if flag('can_manage_partners'):
        perms.add('manage_partners')                               # CanManagePartners
    if flag('can_edit_vouchers'):
        perms.add('edit_vouchers')                                 # CanEditVouchers (create / change vouchers, e.g. a bank deposit)
    if manager:
        perms.update({'view_accounts', 'override_credit', 'adjust_stock', 'edit_inventory'})   # IsManagerOrAbove (InventoryAdjustView; batch + product PUT)
    if manager or flag('can_create_purchases') or flag('can_edit_purchases'):
        perms.add('manage_products')                               # CanManageProducts
    if admin:
        perms.update({'manage_staff', 'manage_settings', 'manage_po_settings'})   # IsAdminStaff
    if role == 'super_admin':
        perms.update({'view_all_outlets', 'manage_outlets'})       # outlet-isolation bypass
    return sorted(perms)


class MethodPermissionMixin:
    """
    For views that merge a list view and a create view into one URL:

        class SalesView(MethodPermissionMixin, SaleListView, SaleCreateView):
            method_permissions = {'GET': SaleListView.permission_classes,
                                  'POST': SaleCreateView.permission_classes}

    Python takes `permission_classes` from the FIRST base class only, so a merged view silently
    used the list view's (weaker) permission for creates: a view_only user could POST a bill and
    a manager without can_create_purchases could create purchases. This enforces each method's
    own permission instead.
    """
    method_permissions = {}

    def get_permissions(self):
        classes = self.method_permissions.get(self.request.method, self.permission_classes)
        return [permission() for permission in classes]
