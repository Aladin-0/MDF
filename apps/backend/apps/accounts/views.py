import logging
import re
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from apps.core.permissions import (
    IsAdminStaff, IsAuthenticated, effective_permissions,
    can_assign_role, can_manage_staff_member, assert_outlet_access,
)
from apps.core.ratelimit import FailureLimiter, client_ip
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status
from django.db.models import Q, Sum
from django.core.exceptions import ValidationError
from datetime import datetime
from datetime import date

from apps.accounts.models import Staff, Customer, Ledger
from apps.core.models import Outlet
from apps.audit.services import log_activity
from django.contrib.auth.hashers import check_password

logger = logging.getLogger(__name__)

# Failed-attempt limits (see apps.core.ratelimit). Phone: one account being guessed.
# IP: one machine trying many accounts. Cleared for a phone number on a successful login.
LOGIN_PHONE_LIMITER = FailureLimiter('login:phone', limit=5, window=15 * 60)
LOGIN_IP_LIMITER = FailureLimiter('login:ip', limit=30, window=15 * 60)
# PIN guessing by an already logged-in user (cashier switch on the billing terminal).
PIN_USER_LIMITER = FailureLimiter('pin:user', limit=10, window=5 * 60)


def serialize_outlet_data(outlet):
    if not outlet:
        return None
    return {
        'id': str(outlet.id),
        'organizationId': str(outlet.organization_id) if outlet.organization_id else None,
        'name': outlet.name,
        'address': outlet.address,
        'city': outlet.city,
        'state': outlet.state,
        'stateCode': outlet.state_code,
        'pincode': outlet.pincode,
        'phone': outlet.phone,
        'gstin': outlet.gstin,
        'drugLicenseNo': outlet.drug_license_no,
        'logoUrl': outlet.logo_url,
        'invoiceFooter': outlet.invoice_footer,
    }


# Staff permission flags exposed to the client: (JSON key, Staff attribute).
_USER_FLAG_FIELDS = (
    ('canEditRate', 'can_edit_rate'),
    ('canViewPurchaseRates', 'can_view_purchase_rates'),
    ('canCreatePurchases', 'can_create_purchases'),
    ('canAccessReports', 'can_access_reports'),
    ('canEditSales', 'can_edit_sales'),
    ('canEditPurchases', 'can_edit_purchases'),
    ('canExportGst', 'can_export_gst'),
    ('canModifyPaidPurchases', 'can_modify_paid_purchases'),
    ('canModifySettledVouchers', 'can_modify_settled_vouchers'),
    ('canModifySettledReturns', 'can_modify_settled_returns'),
    ('canEditSaleReturns', 'can_edit_sale_returns'),
    ('canEditPurchaseReturns', 'can_edit_purchase_returns'),
    ('canEditVouchers', 'can_edit_vouchers'),
    ('canViewAuditHistory', 'can_view_audit_history'),
    ('canVoidRecords', 'can_void_records'),
    ('canModifyDraftBill', 'can_modify_draft_bill'),
    ('canModifyUnpaidBill', 'can_modify_unpaid_bill'),
    ('canCorrectHeaderFields', 'can_correct_header_fields'),
    ('canCorrectRatesDiscounts', 'can_correct_rates_discounts'),
    ('canCorrectQuantities', 'can_correct_quantities'),
    ('canCorrectCustomer', 'can_correct_customer'),
    ('canModifyBillWithReturn', 'can_modify_bill_with_return'),
    ('canModifyPaidBill', 'can_modify_paid_bill'),
    ('canCancelAndReissueBill', 'can_cancel_and_reissue_bill'),
    ('canViewBillRevisionHistory', 'can_view_bill_revision_history'),
    ('canManagePartners', 'can_manage_partners'),
)


def build_user_payload(staff):
    """
    The one place that turns a Staff row into the user object the frontend stores.
    login, me and switch-outlet all use it, so they can never disagree again (switch-outlet
    used to return a cut-down outlet and /me used to be mapped differently by the client).
    Includes `permissions`: what this user may actually do, computed by the same rules the
    API enforces (see apps.core.permissions.effective_permissions).
    """
    outlet = staff.outlet
    org = outlet.organization
    payload = {
        'id': str(staff.id),
        'name': staff.name,
        'phone': staff.phone,
        'role': staff.role,
        'outletId': str(outlet.id),
        'organizationId': str(org.id) if org else None,
        'isSuperAdmin': staff.role == 'super_admin',
        'outlet': serialize_outlet_data(outlet),
        'avatarUrl': staff.avatar_url,
        'maxDiscount': float(staff.max_discount),
        'permissions': effective_permissions(staff),
    }
    for json_key, attr in _USER_FLAG_FIELDS:
        payload[json_key] = bool(getattr(staff, attr, False))
    return payload



class LoginView(APIView):
    """
    POST /api/v1/auth/login/

    Authenticate staff member with phone + PIN.
    Returns JWT access + refresh tokens + user details.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """
        Login with phone and staff PIN.

        Request body:
        {
            "phone": "9876543210",
            "password": "1234"  # staff_pin
        }

        Response:
        {
            "access": "<jwt_access_token>",
            "refresh": "<jwt_refresh_token>",
            "user": {
                "id": "...",
                "name": "...",
                "phone": "...",
                "role": "...",
                "outletId": "...",
                "outlet": {...},
                "maxDiscount": 0,
                ...
            }
        }
        """

        phone = str(request.data.get('phone') or '').strip()
        password = str(request.data.get('password') or '')

        if not phone or not password:
            return Response(
                {'detail': 'Phone and password are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Brute-force protection. The staff PIN is accepted as a password and has only 10,000
        # possible values, so unlimited guessing would eventually get into any account.
        ip = client_ip(request)
        wait = max(LOGIN_PHONE_LIMITER.blocked_for(phone), LOGIN_IP_LIMITER.blocked_for(ip))
        if wait:
            response = Response(
                {'detail': f'Too many failed login attempts. Try again in {max(wait // 60, 1)} minute(s).'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            response['Retry-After'] = str(wait)
            return response

        logger.info(f"Login attempt for phone: {phone}")

        staff = Staff.objects.filter(phone=phone).first()

        # Only the account's real password or its real staff PIN are accepted. (This used to also
        # accept the literal word "password", the phone number itself, and silently remapped one
        # hard-coded phone number to another account: all of those were back doors.)
        is_pw_valid = bool(staff) and (
            staff.check_password(password)
            or bool(staff.staff_pin and check_password(password, staff.staff_pin))
        )

        if not is_pw_valid:
            LOGIN_PHONE_LIMITER.record_failure(phone)
            LOGIN_IP_LIMITER.record_failure(ip)
            logger.warning(f"Login failed for phone {phone}")
            log_activity(
                action='LOGIN_FAILED',
                module='auth',
                user=staff,
                description=f"Failed login attempt for phone {phone}",
            )
            return Response(
                {'detail': 'Invalid phone or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Validate staff is active (only after the credentials were right, so an inactive
        # account cannot be used to test whether a guess was correct)
        if not staff.is_active:
            logger.warning(f"Login failed: staff {staff.id} is inactive")
            return Response(
                {'detail': 'Staff account is inactive'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        LOGIN_PHONE_LIMITER.reset(phone)

        logger.info(f"Login successful for staff {staff.id} ({staff.name})")
        log_activity(
            action='LOGIN',
            module='auth',
            user=staff,
            description=f"Successful login for staff {staff.name}",
        )

        # Generate JWT tokens
        refresh = RefreshToken.for_user(staff)
        access = refresh.access_token

        response_data = {
            'access': str(access),
            'refresh': str(refresh),
            'user': build_user_payload(staff),
        }

        return Response(response_data, status=status.HTTP_200_OK)


class SwitchOutletView(APIView):
    """
    POST /api/v1/auth/switch-outlet/

    Switch the active outlet context for a Super Admin.
    Validates organization constraints and updates the default Session outlet.
    Returns a new set of JWT access + refresh tokens.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        staff = request.user
        new_outlet_id = request.data.get('outletId')

        if not new_outlet_id:
            return Response(
                {'detail': 'outletId is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if staff.role != 'super_admin':
            return Response(
                {'detail': 'Only Super Admins can switch global outlet contexts'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            # Must belong to the exact same organization as the staff's current default
            org_id = staff.outlet.organization_id
            new_outlet = Outlet.objects.get(id=new_outlet_id, organization_id=org_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': 'Requested outlet not found within your organization'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update staff active outlet context and issue new token
        staff.outlet = new_outlet
        staff.save(update_fields=['outlet'])

        logger.info(f"Staff {staff.id} switched context to Outlet {new_outlet.name}")

        refresh = RefreshToken.for_user(staff)
        access = refresh.access_token

        response_data = {
            'access': str(access),
            'refresh': str(refresh),
            'user': build_user_payload(staff),
        }

        return Response(response_data, status=status.HTTP_200_OK)


class StaffMeView(APIView):
    """
    GET /api/v1/auth/me/

    Get authenticated staff's own details.
    Returns the same user dict shape as LoginView.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """Get current authenticated staff details."""
        staff = request.user

        if not staff.is_active:
            return Response(
                {'detail': 'Staff account is inactive'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        return Response(build_user_payload(staff), status=status.HTTP_200_OK)



class CustomerSearchView(APIView):
    """
    GET /api/v1/customers/search/?q=name&outletId=xxx

    Search customers by name or phone.
    Returns list of customer profiles with credit details.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Search for customers by query string.

        Query parameters:
        - q: Search query (minimum 2 characters) for name or phone
        - outletId: Outlet UUID to filter customers

        Returns:
        [
            {
                "id": "...",
                "name": "...",
                "phone": "...",
                "address": "...",
                "dob": "...",
                "gstin": "...",
                "fixedDiscount": 0,
                "creditLimit": 5000,
                "outstanding": 1200,
                "totalPurchases": 15000,
                "isChronic": false,
                "isActive": true,
                "createdAt": "2026-03-17T..."
            }
        ]
        """

        query = request.query_params.get('q', '').strip()
        outlet_id = request.query_params.get('outletId')

        # Validate query length
        if len(query) < 2:
            logger.debug(f"Search query too short: {len(query)} chars")
            return Response([], status=status.HTTP_200_OK)

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Searching customers for: {query} (outlet: {outlet.name})")

        # Search Customers by name or phone (case-insensitive)
        query_lower = query.lower()
        if request.query_params.get('accountOwners') or request.query_params.get('familyAccounts'):
            # "Who can this person bill under?" Any customer who is not themselves a member of someone else's account, plus the
            # purely shared family records. Used by the Add Customer form, the customer page and the add-person popup.
            owners = Customer.objects.filter(outlet=outlet, is_active=True, account_holder__isnull=True).filter(
                Q(name__icontains=query_lower) | Q(phone__icontains=query_lower))
            exclude = request.query_params.get('excludeId')
            if exclude:
                owners = owners.exclude(pk=exclude)
            owners = owners.order_by('-is_family_account', 'name').distinct()[:20]
            return Response([{'id': str(a.id), 'name': a.name, 'phone': a.phone, 'memberCount': a.members.count(),
                              'isFamilyAccount': a.is_family_account, 'outstanding': float(a.outstanding_balance)} for a in owners])

        # Shared accounts are not patients: they never appear as a row, their MEMBERS do (found by their own name / phone or
        # by the account's name / phone), so typing a family's mobile number lists everyone who shares it.
        customers = Customer.objects.filter(
            outlet=outlet,
            is_active=True,
            is_family_account=False,
        ).filter(
            Q(name__icontains=query_lower) | Q(phone__icontains=query_lower)
            | Q(account_holder__name__icontains=query_lower) | Q(account_holder__phone__icontains=query_lower)
        ).select_related('account_holder').distinct()

        logger.info(f"Found {customers.count()} customers matching: {query}")

        # Serialize customers
        results = []
        from apps.accounts.family_accounts import account_ledger
        for customer in customers:
            owner = customer.financial_customer          # who owns the money: their family account, else themselves
            owner_ledger = account_ledger(customer)
            result = {
                'id': str(customer.id),
                'name': customer.name,
                'relationship': customer.relationship,
                'gender': customer.gender,
                'age': customer.age,
                'isFamilyMember': bool(customer.account_holder_id),
                'accountId': str(owner.id),
                'accountName': owner.name if customer.account_holder_id else None,
                'ledgerId': str(owner_ledger.id) if owner_ledger else None,
                'phone': customer.phone,
                'address': customer.address,
                'state': customer.state or '',
                'dob': customer.dob.isoformat() if customer.dob else None,
                'gstin': customer.gstin,
                'email': customer.email,
                'fixedDiscount': float(customer.fixed_discount),
                'creditLimit': float(owner.credit_limit),
                'dlNo20b': customer.dl_no_20b,
                'dlNo21b': customer.dl_no_21b,
                'dlExpiry': customer.dl_expiry.isoformat() if customer.dl_expiry else None,
                'customerType': customer.customer_type,
                'stateCode': customer.state_code,
                'outstanding': float(owner.outstanding_balance),
                'totalPurchases': float(customer.total_purchases),
                'isChronic': customer.is_chronic,
                'isActive': customer.is_active,
                'createdAt': customer.created_at.isoformat(),
            }
            results.append(result)

        logger.info(f"Returning {len(results)} customers with credit details")
        return Response(results, status=status.HTTP_200_OK)


class CustomerDetailView(APIView):
    """
    GET /api/v1/customers/{id}/ - Get customer details
    PUT /api/v1/customers/{id}/ - Update customer
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        """Get customer details by ID."""
        outlet_id = request.query_params.get('outletId')

        if outlet_id:
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                return Response(
                    {'detail': f'Outlet {outlet_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Fall back to the outlet from the authenticated user's JWT
            outlet = getattr(request.user, 'outlet', None)
            if outlet is None:
                return Response(
                    {'detail': 'outletId is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            customer = Customer.objects.select_related('account_holder').get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response(
                {'detail': f'Customer {customer_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        from apps.accounts.family_accounts import account_ledger

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state or '',
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'email': customer.email,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.financial_customer.credit_limit),
            'dlNo20b': customer.dl_no_20b,
            'dlNo21b': customer.dl_no_21b,
            'dlExpiry': customer.dl_expiry.isoformat() if customer.dl_expiry else None,
            'customerType': customer.customer_type,
            'stateCode': customer.state_code,
            'outstanding': float(customer.outstanding_balance),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
            'ledgerId': (lambda l: str(l.id) if l else None)(account_ledger(customer)),
            **_family_fields(customer),
        }

        return Response(result, status=status.HTTP_200_OK)

    def put(self, request, customer_id, *args, **kwargs):
        """Update customer details."""
        outlet_id = request.data.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response(
                {'detail': f'Customer {customer_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Safe fields for diff
        old_state = {
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state,
            'gstin': customer.gstin,
            'is_chronic': customer.is_chronic,
            'fixed_discount': float(customer.fixed_discount),
            'credit_limit': float(customer.credit_limit),
        }

        # Validate and apply fields
        if 'name' in request.data:
            name = (request.data['name'] or '').strip()
            if not name:
                return Response({'detail': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)
            customer.name = name

        if 'phone' in request.data:
            phone = (request.data['phone'] or '').strip()
            if not re.match(r'^[6-9]\d{9}$', phone):
                return Response(
                    {'detail': 'phone must be a valid 10-digit Indian mobile number starting with 6-9'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            customer.phone = phone

        if 'gstin' in request.data:
            gstin = (request.data['gstin'] or '').strip().upper() or None
            if gstin and not re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', gstin):
                return Response({'detail': 'gstin format is invalid'}, status=status.HTTP_400_BAD_REQUEST)
            customer.gstin = gstin

        if 'dlNo20b' in request.data:
            customer.dl_no_20b = request.data['dlNo20b'] or None
        if 'dlNo21b' in request.data:
            customer.dl_no_21b = request.data['dlNo21b'] or None
        if 'dlExpiry' in request.data:
            customer.dl_expiry = request.data['dlExpiry'] or None
        if 'customerType' in request.data:
            customer.customer_type = request.data['customerType'] or 'RETAIL'
        if 'stateCode' in request.data:
            customer.state_code = request.data['stateCode'] or '27'
        if 'email' in request.data:
            customer.email = (request.data['email'] or '').strip()[:254]
        # Family details (joining / leaving an account goes through customers/<id>/account/, which checks balances)
        if 'gender' in request.data:
            customer.gender = (request.data['gender'] or '').strip()[:10]
        if 'relationship' in request.data:
            customer.relationship = (request.data['relationship'] or '').strip()[:30]

        if 'creditLimit' in request.data:
            try:
                credit_limit = float(request.data['creditLimit'])
                if credit_limit < 0:
                    raise ValueError
                customer.credit_limit = credit_limit
            except (TypeError, ValueError):
                return Response({'detail': 'creditLimit must be a non-negative number'}, status=status.HTTP_400_BAD_REQUEST)

        if 'fixedDiscount' in request.data:
            try:
                fixed_discount = float(request.data['fixedDiscount'])
                if not (0 <= fixed_discount <= 100):
                    raise ValueError
                customer.fixed_discount = fixed_discount
            except (TypeError, ValueError):
                return Response({'detail': 'fixedDiscount must be between 0 and 100'}, status=status.HTTP_400_BAD_REQUEST)

        if 'address' in request.data:
            customer.address = request.data['address'] or None

        if 'dob' in request.data:
            customer.dob = request.data['dob'] or None

        if 'isChronic' in request.data:
            customer.is_chronic = bool(request.data['isChronic'])

        if 'state' in request.data:
            customer.state = (request.data['state'] or '').strip()[:100]

        customer.save()
        logger.info(f"Updated customer {customer_id}")

        new_state = {
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state,
            'gstin': customer.gstin,
            'is_chronic': customer.is_chronic,
            'fixed_discount': float(customer.fixed_discount),
            'credit_limit': float(customer.credit_limit),
        }
        
        changes = {}
        for key in old_state:
            if old_state[key] != new_state[key]:
                changes[key] = {'old': old_state[key], 'new': new_state[key]}

        pass

        # Keep linked Ledger in sync
        from apps.accounts.models import Ledger
        Ledger.objects.filter(linked_customer=customer).update(
            phone=customer.phone or '',
            gstin=customer.gstin or '',
        )

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state or '',
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'email': customer.email,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'dlNo20b': customer.dl_no_20b,
            'dlNo21b': customer.dl_no_21b,
            'dlExpiry': customer.dl_expiry.isoformat() if customer.dl_expiry else None,
            'customerType': customer.customer_type,
            'stateCode': customer.state_code,
            'outstanding': float(customer.outstanding_balance),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)


def _family_fields(customer):
    """The family-account facts every customer response carries (a member's money is their account's)."""
    owner = customer.financial_customer
    return {
        # "has a family": a shared record, or a person with members under them
        'isFamilyAccount': customer.is_family_account or customer.members.exists(),
        'isSharedAccountRecord': customer.is_family_account,
        'isFamilyMember': bool(customer.account_holder_id),
        'accountId': str(owner.id) if customer.account_holder_id else None,
        'accountName': owner.name if customer.account_holder_id else None,
        'relationship': customer.relationship,
        'gender': customer.gender,
        'age': customer.age,
        'memberCount': customer.members.count(),
    }


def _member_row(member):
    from apps.accounts.family_accounts import account_ledger
    owner = member.financial_customer
    ledger = account_ledger(member)
    is_holder = owner.pk == member.pk and not member.is_family_account and member.members.exists()
    return {
        'isAccountHolder': is_holder,
        'id': str(member.id), 'name': member.name, 'phone': member.phone,
        'relationship': member.relationship or ('Account holder' if is_holder else ''),
        'gender': member.gender, 'age': member.age, 'dob': member.dob.isoformat() if member.dob else None,
        'isChronic': member.is_chronic, 'isFamilyMember': bool(member.account_holder_id),
        'accountId': str(owner.id), 'accountName': owner.name if member.account_holder_id else None,
        'ledgerId': str(ledger.id) if ledger else None,
        'outstanding': float(owner.outstanding_balance), 'creditLimit': float(owner.credit_limit),
    }


class CustomerMembersView(APIView):
    """
    GET /api/v1/customers/<id>/members/?outletId=
    Who can this bill be for? For a family account (or any of its members) it is everyone on the account; for an
    individual it is just that person. The billing screen uses it to ask "who is this for?".
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            customer = Customer.objects.select_related('account_holder').get(id=customer_id, outlet_id=outlet_id)
        except (Customer.DoesNotExist, ValueError, ValidationError):
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)
        from apps.accounts.family_accounts import account_people
        account = customer.financial_customer
        people = account_people(account)
        return Response({
            'accountId': str(account.id), 'accountName': account.name,
            'isSharedAccountRecord': account.is_family_account,
            'isFamilyAccount': account.is_family_account or len(people) > 1,
            'members': [_member_row(m) for m in people],
        })


class CustomerAccountView(APIView):
    """
    POST /api/v1/customers/<id>/account/
      {"accountHolderId": "<family account id>", "relationship": "Mother", "gender": "F"}  -> put this person on the account
      {"accountHolderId": null}                                                           -> take them off (own ledger again)
    Refused while the person has a balance of their own (it would be stranded on a ledger that stops receiving their bills).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, customer_id, *args, **kwargs):
        from apps.accounts.family_accounts import attach_member, detach_member, FamilyAccountError
        outlet_id = request.data.get('outletId') or request.query_params.get('outletId')
        try:
            member = Customer.objects.get(id=customer_id, outlet_id=outlet_id)
        except (Customer.DoesNotExist, ValueError, ValidationError):
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)
        account_id = request.data.get('accountHolderId')
        try:
            if account_id:
                account = Customer.objects.filter(id=account_id, outlet_id=outlet_id).first()
                if account is None:
                    return Response({'detail': 'Family account not found'}, status=status.HTTP_404_NOT_FOUND)
                attach_member(member, account, (request.data.get('relationship') or '').strip()[:30],
                              (request.data.get('gender') or '').strip()[:10])
            else:
                detach_member(member)
        except FamilyAccountError as err:
            return Response({'detail': str(err), 'code': 'FAMILY_ACCOUNT'}, status=status.HTTP_400_BAD_REQUEST)
        member.refresh_from_db()
        return Response(_member_row(member))


class CustomerListView(APIView):
    """
    GET /api/v1/customers/ - List customers for outlet
    POST /api/v1/customers/ - Create new customer
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """List customers for outlet with pagination and optional search."""
        outlet_id = request.query_params.get('outletId')
        search_query = request.query_params.get('search', '').strip()
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 50))

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Query customers
        customers = Customer.objects.filter(outlet=outlet, is_active=True).select_related('account_holder')

        # Apply search filter
        if search_query:
            query_lower = search_query.lower()
            customers = customers.filter(
                Q(name__icontains=query_lower) | Q(phone__icontains=query_lower)
            )

        # Apply isChronic filter
        is_chronic_param = request.query_params.get('isChronic', '').lower()
        if is_chronic_param == 'true':
            customers = customers.filter(is_chronic=True)
        elif is_chronic_param == 'false':
            customers = customers.filter(is_chronic=False)

        # Apply hasOutstanding filter (use 'outstanding' - the actual DB field)
        has_outstanding_param = request.query_params.get('hasOutstanding', '').lower()
        if has_outstanding_param == 'true':
            customers = customers.filter(outstanding__gt=0)
        elif has_outstanding_param == 'false':
            customers = customers.filter(outstanding__lte=0)

        # Apply pagination
        total_records = customers.count()
        start = (page - 1) * page_size
        end = start + page_size
        customers_page = list(customers[start:end])

        # OPTIMIZED: Bulk-prefetch Ledger balances for all page customers in ONE query.
        # Before: outstanding_balance @property fires a Ledger query per customer (N extra queries).
        # After:  1 extra query total, looked up via dict.
        customer_ids = [c.account_holder_id or c.id for c in customers_page]      # a member's money is their account's
        ledger_balances = {
            str(l.linked_customer_id): float(l.current_balance)
            for l in Ledger.objects.filter(
                linked_customer_id__in=customer_ids,
                group__name='Sundry Debtors',
            ).only('linked_customer_id', 'current_balance')
        }

        # Serialize customers
        results = []
        for customer in customers_page:
            cid = str(customer.id)
            owner_key = str(customer.account_holder_id or customer.id)
            outstanding = ledger_balances.get(owner_key, float(customer.financial_customer.outstanding))
            result = {
                'id': cid,
                'name': customer.name,
                'phone': customer.phone,
                'address': customer.address,
                'state': customer.state or '',
                'dob': customer.dob.isoformat() if customer.dob else None,
                'gstin': customer.gstin,
                'email': customer.email,
                'fixedDiscount': float(customer.fixed_discount),
                'creditLimit': float(customer.financial_customer.credit_limit),
                'dlNo20b': customer.dl_no_20b,
                'dlNo21b': customer.dl_no_21b,
                'dlExpiry': customer.dl_expiry.isoformat() if customer.dl_expiry else None,
                'customerType': customer.customer_type,
                'stateCode': customer.state_code,
                'outstanding': outstanding,
                'totalPurchases': float(customer.total_purchases),
                'isChronic': customer.is_chronic,
                'isActive': customer.is_active,
                'createdAt': customer.created_at.isoformat(),
                **_family_fields(customer),
            }
            results.append(result)

        total_pages = (total_records + page_size - 1) // page_size

        response_data = {
            'data': results,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records,
            }
        }

        logger.info(f"Listed {len(results)} customers for outlet {outlet.name}")
        return Response(response_data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        """Create a new customer."""
        outlet_id = request.data.get('outletId')
        name = (request.data.get('name') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        address = request.data.get('address') or None
        state = (request.data.get('state') or '').strip()[:100]
        dob = request.data.get('dob') or None
        gstin = (request.data.get('gstin') or '').strip().upper() or None
        is_chronic = bool(request.data.get('isChronic', False))
        fixed_discount = request.data.get('fixedDiscount', 0)
        credit_limit = request.data.get('creditLimit', 0)
        email = (request.data.get('email') or '').strip()[:254]
        is_family_account = bool(request.data.get('isFamilyAccount', False))
        account_holder_id = request.data.get('accountHolderId') or None
        relationship = (request.data.get('relationship') or '').strip()[:30]
        gender = (request.data.get('gender') or '').strip()[:10]

        dl_no_20b = request.data.get('dlNo20b') or None
        dl_no_21b = request.data.get('dlNo21b') or None
        dl_expiry = request.data.get('dlExpiry') or None
        customer_type = request.data.get('customerType') or 'RETAIL'
        state_code = request.data.get('stateCode') or '27'

        # Validate required fields
        if not name:
            return Response({'detail': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

        # A family member's own mobile is optional: without one they share the account owner's number.
        if not phone and not account_holder_id:
            return Response({'detail': 'phone is required'}, status=status.HTTP_400_BAD_REQUEST)

        if phone and not re.match(r'^[6-9]\d{9}$', phone):
            return Response(
                {'detail': 'phone must be a valid 10-digit Indian mobile number starting with 6-9'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if gstin and not re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', gstin):
            return Response({'detail': 'gstin format is invalid'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            credit_limit = float(credit_limit)
            if credit_limit < 0:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'detail': 'creditLimit must be a non-negative number'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            fixed_discount = float(fixed_discount)
            if not (0 <= fixed_discount <= 100):
                raise ValueError
        except (TypeError, ValueError):
            return Response({'detail': 'fixedDiscount must be between 0 and 100'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Soft uniqueness check to prevent exact clones
        if Customer.objects.filter(outlet=outlet, phone=phone, name__iexact=name).exists():
            return Response(
                {'detail': 'A customer with this exact name and phone number already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # dob arrives as text: parse it up front (a bad value is a 400, not a crash after the record was already saved)
        if dob:
            from django.utils.dateparse import parse_date
            dob = parse_date(str(dob)[:10])
            if dob is None:
                return Response({'detail': 'dob must be a date (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

        if is_family_account and account_holder_id:
            return Response({'detail': 'A shared family account cannot itself belong to another account.'}, status=status.HTTP_400_BAD_REQUEST)
        account_holder = None
        if account_holder_id:
            account_holder = Customer.objects.filter(pk=account_holder_id, outlet=outlet).first()
            if account_holder is None:
                return Response({'detail': 'The account owner was not found.'}, status=status.HTTP_404_NOT_FOUND)
            if account_holder.account_holder_id:
                return Response({'detail': f'"{account_holder.name}" is a member of another account; choose that account\'s owner.'},
                                status=status.HTTP_400_BAD_REQUEST)

        if not phone:
            phone = account_holder.phone

        if email and '@' not in email:
            return Response({'detail': 'email is not valid'}, status=status.HTTP_400_BAD_REQUEST)

        # Create customer
        customer = Customer.objects.create(
            outlet=outlet,
            email=email,
            account_holder=account_holder,
            is_family_account=is_family_account,
            relationship=relationship,
            gender=gender,
            name=name,
            phone=phone,
            address=address,
            state=state,
            dob=dob,
            gstin=gstin,
            is_chronic=is_chronic,
            fixed_discount=fixed_discount,
            credit_limit=credit_limit,
            dl_no_20b=dl_no_20b,
            dl_no_21b=dl_no_21b,
            dl_expiry=dl_expiry,
            customer_type=customer_type,
            state_code=state_code,
            is_active=True,
        )

        # A ledger in Sundry Debtors for everyone EXCEPT a family member: members share their account's ledger.
        from apps.accounts.family_accounts import ensure_customer_ledger, account_ledger
        if not account_holder:
            ensure_customer_ledger(customer)

        logger.info(f"Created customer {customer.id} ({customer.name}) and Ledger for outlet {outlet.name}")

        pass

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state or '',
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'email': customer.email,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'dlNo20b': customer.dl_no_20b,
            'dlNo21b': customer.dl_no_21b,
            'dlExpiry': customer.dl_expiry.isoformat() if customer.dl_expiry else None,
            'customerType': customer.customer_type,
            'stateCode': customer.state_code,
            'outstanding': float(customer.outstanding_balance),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
            # the ledger bills to (the billing screen selects the new customer straight away)
            'ledgerId': (lambda l: str(l.id) if l else None)(account_ledger(customer)),
            **_family_fields(customer),
        }

        return Response(result, status=status.HTTP_201_CREATED)


def _pin_matches(staff, pin):
    """
    True if `pin` is this staff member's PIN. Hashing is slow on purpose, so results are cached,
    but the cache key is a digest: the old key embedded the plaintext PIN in Redis.
    """
    import hashlib
    from django.core.cache import cache
    digest = hashlib.sha256(f'{staff.staff_pin}:{pin}'.encode('utf-8')).hexdigest()[:40]
    cache_key = f'pin_check:{digest}'
    cached = cache.get(cache_key)
    if cached is None:
        cached = bool(staff.staff_pin) and check_password(pin, staff.staff_pin)
        cache.set(cache_key, cached, timeout=3600)
    return cached


def _pin_blocked_response(user):
    """429 response when this logged-in user has made too many wrong PIN guesses, else None."""
    wait = PIN_USER_LIMITER.blocked_for(user.id)
    if not wait:
        return None
    response = Response(
        {'error': {'code': 'TOO_MANY_ATTEMPTS',
                   'message': f'Too many wrong PIN attempts. Try again in {max(wait // 60, 1)} minute(s).'}},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    response['Retry-After'] = str(wait)
    return response


class StaffLookupByPinView(APIView):
    """
    POST /api/v1/staff/lookup-by-pin/

    Look up a staff member by their PIN for kiosk check-in/out.
    No staffId required — just the PIN and outletId.

    Request body:
    {
        "pin": "1234",
        "outletId": "uuid"
    }

    Response: same shape as StaffPinVerifyView on success.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        pin = request.data.get('pin')
        outlet_id = request.data.get('outletId')

        if not pin:
            return Response(
                {'error': {'code': 'MISSING_PIN', 'message': 'PIN is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        blocked = _pin_blocked_response(request.user)
        if blocked:
            return blocked

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except (Outlet.DoesNotExist, ValueError, ValidationError):
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        matched_staff = [s for s in Staff.objects.filter(outlet=outlet, is_active=True) if _pin_matches(s, str(pin))]

        if not matched_staff:
            PIN_USER_LIMITER.record_failure(request.user.id)
            return Response(
                {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(matched_staff) > 1:
            return Response(
                {'error': {'code': 'AMBIGUOUS_PIN', 'message': 'PIN matches multiple staff members. Please contact admin.'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        staff = matched_staff[0]

        from apps.billing.models import SaleInvoice
        today = date.today()
        bills_today = SaleInvoice.objects.filter(
            billed_by=staff, invoice_date__date=today
        ).count()
        total_sales_today = SaleInvoice.objects.filter(
            billed_by=staff, invoice_date__date=today
        ).aggregate(total=Sum('grand_total'))['total'] or 0

        result = {
            'id': str(staff.id),
            'name': staff.name,
            'role': staff.role,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'canEditSales': staff.can_edit_sales,
            'canEditPurchases': staff.can_edit_purchases,
            'billsToday': bills_today,
            'totalSalesToday': float(total_sales_today),
        }

        logger.info(f"PIN lookup successful for staff {staff.id} ({staff.name})")
        return Response(result, status=status.HTTP_200_OK)


class StaffListView(APIView):

    """
    GET /api/v1/staff/?outletId=xxx

    List all active staff members for an outlet.
    Used by attendance components to display staff roster.
    """

    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        staff_members = Staff.objects.filter(outlet=outlet, is_active=True).order_by('name')

        results = [
            {
                'id': str(s.id),
                'name': s.name,
                'phone': s.phone,
                'role': s.role,
                'outletId': str(s.outlet.id),
                'avatarUrl': s.avatar_url,
                'maxDiscount': float(s.max_discount),
                'canEditRate': s.can_edit_rate,
                'canViewPurchaseRates': s.can_view_purchase_rates,
                'canCreatePurchases': s.can_create_purchases,
                'canAccessReports': s.can_access_reports,
                'canEditSales': s.can_edit_sales,
                'canEditPurchases': s.can_edit_purchases,
                'canExportGst': s.can_export_gst,
                'canModifyPaidPurchases': s.can_modify_paid_purchases,
                'canModifySettledVouchers': s.can_modify_settled_vouchers,
                'canModifySettledReturns': s.can_modify_settled_returns,
                'canEditSaleReturns': s.can_edit_sale_returns,
                'canEditPurchaseReturns': s.can_edit_purchase_returns,
                'canEditVouchers': s.can_edit_vouchers,
                'canViewAuditHistory': s.can_view_audit_history,
                'canVoidRecords': s.can_void_records,
                'canModifyDraftBill': s.can_modify_draft_bill,
                'canModifyUnpaidBill': s.can_modify_unpaid_bill,
                'canCorrectHeaderFields': s.can_correct_header_fields,
                'canCorrectRatesDiscounts': s.can_correct_rates_discounts,
                'canCorrectQuantities': s.can_correct_quantities,
                'canCorrectCustomer': s.can_correct_customer,
                'canModifyBillWithReturn': s.can_modify_bill_with_return,
                'canModifyPaidBill': s.can_modify_paid_bill,
                'canCancelAndReissueBill': s.can_cancel_and_reissue_bill,
                'canViewBillRevisionHistory': s.can_view_bill_revision_history,
                'canManagePartners': getattr(s, 'can_manage_partners', False),
                'shiftStartTime': s.shift_start_time.isoformat() if s.shift_start_time else None,
                'shiftEndTime': s.shift_end_time.isoformat() if s.shift_end_time else None,
                'weeklyOffDay': s.weekly_off_day,
                'isActive': s.is_active,
                'joiningDate': s.joining_date.isoformat() if s.joining_date else None,
                'lastLogin': s.last_login.isoformat() if s.last_login else None,
            }
            for s in staff_members
        ]

        logger.info(f"Listed {len(results)} staff for outlet {outlet.name}")
        return Response(results, status=status.HTTP_200_OK)


class StaffPinVerifyView(APIView):

    """
    POST /api/v1/staff/{id}/verify-pin/

    Verify staff PIN and return staff details with today's bill count and sales total.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, staff_id, *args, **kwargs):
        """
        Verify staff PIN.

        Request body:
        {
            "pin": "1234"
        }

        Response:
        {
            "id": "...",
            "name": "...",
            "role": "...",
            "maxDiscount": 0,
            "canEditRate": false,
            "billsToday": 0,
            "totalSalesToday": 0
        }
        """

        outlet_id = request.query_params.get('outletId')
        pin = request.data.get('pin')

        if not pin:
            return Response(
                {'error': {'code': 'MISSING_PIN', 'message': 'PIN is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        blocked = _pin_blocked_response(request.user)
        if blocked:
            return blocked

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except (Outlet.DoesNotExist, ValueError, ValidationError):
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Fetch staff by id and outlet (a deactivated account's PIN must stop working)
        try:
            staff = Staff.objects.get(id=staff_id, outlet=outlet, is_active=True)
        except Staff.DoesNotExist:
            return Response(
                {'detail': f'Staff {staff_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verify PIN
        if not _pin_matches(staff, str(pin)):
            PIN_USER_LIMITER.record_failure(request.user.id)
            return Response(
                {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get today's bill count and total sales
        from apps.billing.models import SaleInvoice
        today = date.today()
        bills_today = SaleInvoice.objects.filter(
            billed_by=staff,
            invoice_date__date=today
        ).count()

        total_sales_today = SaleInvoice.objects.filter(
            billed_by=staff,
            invoice_date__date=today
        ).aggregate(total=Sum('grand_total'))['total'] or 0

        result = {
            'id': str(staff.id),
            'name': staff.name,
            'role': staff.role,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'canEditSales': staff.can_edit_sales,
            'canEditPurchases': staff.can_edit_purchases,
            'billsToday': bills_today,
            'totalSalesToday': float(total_sales_today),
        }

        return Response(result, status=status.HTTP_200_OK)


class CustomerPurchaseHistoryView(APIView):
    """
    GET /api/v1/customers/{id}/purchase-history/

    Get customer's purchase history - list of recent invoices.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        """
        Get customer's purchase history.

        Query parameters:
        - outletId: Outlet UUID to filter invoices

        Returns:
        [
            {
                "invoiceId": "INV-...",
                "date": "2026-03-15",
                "total": 450.00,
                "items": 3,
                "billedBy": "Rajesh",
                "paymentMode": "cash"
            }
        ]
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verify customer exists in outlet
        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response(
                {'detail': f'Customer {customer_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get purchase history (last 50 invoices)
        from apps.billing.models import SaleInvoice, SaleItem
        # A person's history is the bills made FOR them (patient), plus their own bills with no patient; a family account's
        # history is every bill on the account.
        history_filter = Q(customer=customer) if customer.is_family_account else (
            Q(patient=customer) | Q(customer=customer, patient__isnull=True))
        invoices = SaleInvoice.objects.filter(
            history_filter,
            outlet=outlet
        ).select_related('billed_by').order_by('-invoice_date')[:50]

        # Build response
        results = []
        for invoice in invoices:
            item_count = invoice.items.count()      # (was SaleItem.objects.filter(sale_invoice=...): that field does not exist)
            result = {
                'invoiceId': invoice.invoice_no,
                'date': invoice.invoice_date.date().isoformat(),
                'total': float(invoice.grand_total),
                'items': item_count,
                'billedBy': invoice.billed_by.name if invoice.billed_by else 'Unknown',
                'paymentMode': invoice.payment_mode,
            }
            results.append(result)

        logger.info(f"Returning {len(results)} invoices for customer {customer_id}")
        return Response(results, status=status.HTTP_200_OK)


# ─── Phase 2 Batch 2 Views ────────────────────────────────────────────────────

def _format_time_safe(t):
    if not t:
        return None
    if hasattr(t, 'isoformat'):
        return t.isoformat()
    return str(t)

def _serialize_staff(s):
    return {
        'id': str(s.id),
        'name': s.name,
        'phone': s.phone,
        'role': s.role,
        'outletId': str(s.outlet_id),
        'shiftStartTime': _format_time_safe(s.shift_start_time),
        'shiftEndTime': _format_time_safe(s.shift_end_time),
        'weeklyOffDay': s.weekly_off_day,
        'avatarUrl': s.avatar_url,
        'maxDiscount': float(s.max_discount),
        'canEditRate': s.can_edit_rate,
        'canViewPurchaseRates': s.can_view_purchase_rates,
        'canCreatePurchases': s.can_create_purchases,
        'canAccessReports': s.can_access_reports,
        'canEditSales': s.can_edit_sales,
        'canEditPurchases': s.can_edit_purchases,
        'canExportGst': s.can_export_gst,
        'canModifyPaidPurchases': s.can_modify_paid_purchases,
        'canModifySettledVouchers': s.can_modify_settled_vouchers,
        'canModifySettledReturns': s.can_modify_settled_returns,
        'canEditSaleReturns': s.can_edit_sale_returns,
        'canEditPurchaseReturns': s.can_edit_purchase_returns,
        'canEditVouchers': s.can_edit_vouchers,
        'canViewAuditHistory': s.can_view_audit_history,
        'canVoidRecords': s.can_void_records,
        'canModifyDraftBill': s.can_modify_draft_bill,
        'canModifyUnpaidBill': s.can_modify_unpaid_bill,
        'canCorrectHeaderFields': s.can_correct_header_fields,
        'canCorrectRatesDiscounts': s.can_correct_rates_discounts,
        'canCorrectQuantities': s.can_correct_quantities,
        'canCorrectCustomer': s.can_correct_customer,
        'canModifyBillWithReturn': s.can_modify_bill_with_return,
        'canModifyPaidBill': s.can_modify_paid_bill,
        'canCancelAndReissueBill': s.can_cancel_and_reissue_bill,
        'canViewBillRevisionHistory': s.can_view_bill_revision_history,
                'canManagePartners': getattr(s, 'can_manage_partners', False),
        'isActive': s.is_active,
        'joiningDate': s.joining_date.isoformat() if s.joining_date else None,
        'lastLogin': s.last_login.isoformat() if s.last_login else None,
    }


class StaffCreateView(APIView):
    """POST /api/v1/staff/"""
    permission_classes = [IsAdminStaff]

    def post(self, request, *args, **kwargs):
        from django.contrib.auth.hashers import make_password
        caller = request.user
        if caller.role not in ('super_admin', 'admin'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        # Use outletId from request if provided (super admin creating staff in another outlet)
        request_outlet_id = request.data.get('outletId')
        if request_outlet_id and caller.role == 'super_admin':
            try:
                outlet = Outlet.objects.get(id=request_outlet_id, organization=caller.outlet.organization)
            except Outlet.DoesNotExist:
                return Response({'error': 'Outlet not found within your organization'}, status=status.HTTP_404_NOT_FOUND)
        else:
            outlet = caller.outlet
        valid_roles = ('super_admin', 'admin', 'manager', 'billing_staff', 'view_only')
        role = request.data.get('role') or 'billing_staff'
        if role == 'custom':
            # UI-only value sent by older frontends ("custom permissions"): not a role. The staff
            # member's real rights are their flags, on top of the lowest billing tier.
            role = 'billing_staff'
        if role not in valid_roles:
            return Response({'error': f'Invalid role. Must be one of: {valid_roles}'}, status=status.HTTP_400_BAD_REQUEST)
        # An admin must not be able to mint a super_admin (that role bypasses outlet isolation).
        if not can_assign_role(caller, role):
            return Response({'error': f'You are not allowed to create a user with the role "{role}".'},
                            status=status.HTTP_403_FORBIDDEN)

        password = request.data.get('password', '')
        if not password:
            return Response({'error': 'password is required'}, status=status.HTTP_400_BAD_REQUEST)

        pin = request.data.get('pin', '')
        if not pin:
            return Response({'error': 'pin is required'}, status=status.HTTP_400_BAD_REQUEST)

        phone = request.data.get('phone', '')
        if Staff.objects.filter(phone=phone).exists():
            return Response({'error': 'A staff member with this phone number already exists'}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce PIN uniqueness per-outlet
        from django.contrib.auth.hashers import check_password
        for existing_staff in Staff.objects.filter(outlet=outlet, is_active=True):
            if check_password(pin, existing_staff.staff_pin):
                return Response({'error': 'This PIN is already in use by another staff member in this outlet.'}, status=status.HTTP_400_BAD_REQUEST)

        staff = Staff.objects.create_user(
            phone=phone,
            password=password,          # app login password (create_user calls set_password internally)
            name=request.data.get('name', ''),
            role=role,
            outlet=outlet,
            email=request.data.get('email'),
            staff_pin=make_password(pin),  # billing counter PIN (stored separately)
            max_discount=request.data.get('maxDiscount', 0),
            can_edit_rate=request.data.get('canEditRate', False),
            can_view_purchase_rates=request.data.get('canViewPurchaseRates', False),
            can_create_purchases=request.data.get('canCreatePurchases', False),
            can_access_reports=request.data.get('canAccessReports', False),
            can_export_gst=request.data.get('canExportGst', False),
            can_edit_sales=request.data.get('canEditSales', False),
            can_edit_purchases=request.data.get('canEditPurchases', False),
            can_modify_paid_purchases=request.data.get('canModifyPaidPurchases', False),
            can_modify_settled_vouchers=request.data.get('canModifySettledVouchers', False),
            can_modify_settled_returns=request.data.get('canModifySettledReturns', False),
            can_edit_sale_returns=request.data.get('canEditSaleReturns', False),
            can_edit_purchase_returns=request.data.get('canEditPurchaseReturns', False),
            can_edit_vouchers=request.data.get('canEditVouchers', False),
            can_view_audit_history=request.data.get('canViewAuditHistory', False),
            can_void_records=request.data.get('canVoidRecords', False),
            can_modify_draft_bill=request.data.get('canModifyDraftBill', False),
            can_modify_unpaid_bill=request.data.get('canModifyUnpaidBill', False),
            can_correct_header_fields=request.data.get('canCorrectHeaderFields', False),
            can_correct_rates_discounts=request.data.get('canCorrectRatesDiscounts', False),
            can_correct_quantities=request.data.get('canCorrectQuantities', False),
            can_correct_customer=request.data.get('canCorrectCustomer', False),
            can_modify_bill_with_return=request.data.get('canModifyBillWithReturn', False),
            can_modify_paid_bill=request.data.get('canModifyPaidBill', False),
            can_cancel_and_reissue_bill=request.data.get('canCancelAndReissueBill', False),
            can_view_bill_revision_history=request.data.get('canViewBillRevisionHistory', False),
            can_manage_partners=request.data.get('canManagePartners', False),
            shift_start_time=request.data.get('shiftStartTime') or None,
            shift_end_time=request.data.get('shiftEndTime') or None,
            weekly_off_day=request.data.get('weeklyOffDay'),
            is_active=True,
        )

        log_activity(
            action='CREATE', module='staff', entity_type='Staff', entity_id=staff.id,
            entity_label=staff.name, user=caller, outlet=staff.outlet, request=request,
            description=f"{caller.name} created staff {staff.name} with role {staff.role}",
            changes={'role': {'old': None, 'new': staff.role}},
        )

        return Response({'success': True, 'data': _serialize_staff(staff)}, status=status.HTTP_201_CREATED)


class StaffDetailView(APIView):
    """PATCH/DELETE /api/v1/staff/{pk}/"""
    permission_classes = [IsAdminStaff]

    def patch(self, request, pk, *args, **kwargs):
        from django.contrib.auth.hashers import make_password
        caller = request.user
        if caller.role not in ('super_admin', 'admin'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            if caller.role == 'super_admin':
                staff = Staff.objects.get(id=pk, outlet__organization=caller.outlet.organization)
            else:
                staff = Staff.objects.get(id=pk, outlet=caller.outlet)
        except Staff.DoesNotExist:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        # An admin must not be able to edit (or reset the password of) a super_admin account.
        if not can_manage_staff_member(caller, staff):
            return Response({'error': 'You are not allowed to modify this account.'}, status=status.HTTP_403_FORBIDDEN)

        # Nobody may lock themselves out by deactivating their own account.
        if staff.id == caller.id and 'isActive' in request.data and request.data['isActive'] in (False, 'false', 'False', 0, '0'):
            return Response({'error': 'You cannot deactivate your own account.'}, status=status.HTTP_403_FORBIDDEN)

        camel_map = {
            'maxDiscount': 'max_discount',
            'canEditRate': 'can_edit_rate',
            'canViewPurchaseRates': 'can_view_purchase_rates',
            'canCreatePurchases': 'can_create_purchases',
            'canAccessReports': 'can_access_reports',
            'canExportGst': 'can_export_gst',
            'canEditSales': 'can_edit_sales',
            'canEditPurchases': 'can_edit_purchases',
            'canModifyPaidPurchases': 'can_modify_paid_purchases',
            'canModifySettledVouchers': 'can_modify_settled_vouchers',
            'canModifySettledReturns': 'can_modify_settled_returns',
            'canEditSaleReturns': 'can_edit_sale_returns',
            'canEditPurchaseReturns': 'can_edit_purchase_returns',
            'canEditVouchers': 'can_edit_vouchers',
            'canViewAuditHistory': 'can_view_audit_history',
            'canVoidRecords': 'can_void_records',
            'canModifyDraftBill': 'can_modify_draft_bill',
            'canModifyUnpaidBill': 'can_modify_unpaid_bill',
            'canCorrectHeaderFields': 'can_correct_header_fields',
            'canCorrectRatesDiscounts': 'can_correct_rates_discounts',
            'canCorrectQuantities': 'can_correct_quantities',
            'canCorrectCustomer': 'can_correct_customer',
            'canModifyBillWithReturn': 'can_modify_bill_with_return',
            'canModifyPaidBill': 'can_modify_paid_bill',
            'canCancelAndReissueBill': 'can_cancel_and_reissue_bill',
            'canViewBillRevisionHistory': 'can_view_bill_revision_history',
            'canManagePartners': 'can_manage_partners',
            'shiftStartTime': 'shift_start_time',
            'shiftEndTime': 'shift_end_time',
            'weeklyOffDay': 'weekly_off_day',
            'isActive': 'is_active',
        }

        # Snapshot old state
        old_state = {
            'name': staff.name,
            'email': staff.email,
            'role': staff.role,
            'max_discount': float(staff.max_discount),
            'can_edit_rate': staff.can_edit_rate,
            'can_view_purchase_rates': staff.can_view_purchase_rates,
            'can_create_purchases': staff.can_create_purchases,
            'can_access_reports': staff.can_access_reports,
            'can_edit_sales': staff.can_edit_sales,
            'can_edit_purchases': staff.can_edit_purchases,
            'can_modify_paid_purchases': staff.can_modify_paid_purchases,
            'can_modify_settled_vouchers': staff.can_modify_settled_vouchers,
            'can_modify_settled_returns': staff.can_modify_settled_returns,
            'can_edit_sale_returns': staff.can_edit_sale_returns,
            'can_edit_purchase_returns': staff.can_edit_purchase_returns,
            'can_edit_vouchers': staff.can_edit_vouchers,
            'can_view_audit_history': staff.can_view_audit_history,
            'can_void_records': staff.can_void_records,
            'can_modify_draft_bill': staff.can_modify_draft_bill,
            'can_modify_unpaid_bill': staff.can_modify_unpaid_bill,
            'can_correct_header_fields': staff.can_correct_header_fields,
            'can_correct_rates_discounts': staff.can_correct_rates_discounts,
            'can_correct_quantities': staff.can_correct_quantities,
            'can_correct_customer': staff.can_correct_customer,
            'can_modify_bill_with_return': staff.can_modify_bill_with_return,
            'can_modify_paid_bill': staff.can_modify_paid_bill,
            'can_cancel_and_reissue_bill': staff.can_cancel_and_reissue_bill,
            'can_view_bill_revision_history': staff.can_view_bill_revision_history,
            'can_manage_partners': staff.can_manage_partners,
            'shift_start_time': _format_time_safe(staff.shift_start_time),
            'shift_end_time': _format_time_safe(staff.shift_end_time),
            'weekly_off_day': staff.weekly_off_day,
            'is_active': staff.is_active,
        }

        for camel, snake in camel_map.items():
            if camel in request.data:
                val = request.data[camel]
                if snake in ('shift_start_time', 'shift_end_time'):
                    if not val:
                        val = None
                    elif isinstance(val, str):
                        try:
                            parts = val.split(':')
                            import datetime
                            val = datetime.time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
                        except Exception:
                            val = None
                setattr(staff, snake, val)
        for field in ('name', 'email'):
            if field in request.data:
                setattr(staff, field, request.data[field])

        # Role changes are validated: the value must be a real role, nobody may change their own
        # role, and nobody may hand out a role above their own (only a super_admin creates
        # super_admins). This used to be a blind setattr of whatever string was sent.
        # 'custom' is not a role (an old form sent it whenever the toggles differed from a preset):
        # ignore it and keep the current role instead of failing or, worse, storing it.
        if request.data.get('role') == 'custom':
            requested_role = staff.role
        else:
            requested_role = request.data.get('role', staff.role)

        if requested_role != staff.role:
            new_role = requested_role
            if new_role not in ('super_admin', 'admin', 'manager', 'billing_staff', 'view_only'):
                return Response({'error': 'Invalid role.'}, status=status.HTTP_400_BAD_REQUEST)
            if staff.id == caller.id:
                return Response({'error': 'You cannot change your own role.'}, status=status.HTTP_403_FORBIDDEN)
            if not can_assign_role(caller, new_role):
                return Response({'error': f'You are not allowed to assign the role "{new_role}".'},
                                status=status.HTTP_403_FORBIDDEN)
            staff.role = new_role

        if 'password' in request.data and request.data['password']:
            staff.set_password(str(request.data['password']))

        if 'pin' in request.data and request.data['pin']:
            raw_pin = str(request.data['pin'])
            from django.contrib.auth.hashers import check_password
            for existing_staff in Staff.objects.filter(outlet=staff.outlet, is_active=True).exclude(id=staff.id):
                if check_password(raw_pin, existing_staff.staff_pin):
                    return Response({'error': 'This PIN is already in use by another staff member in this outlet.'}, status=status.HTTP_400_BAD_REQUEST)
            staff.staff_pin = make_password(raw_pin)

        staff.save()
        staff.refresh_from_db()

        # Snapshot new state
        new_state = {
            'name': staff.name,
            'email': staff.email,
            'role': staff.role,
            'max_discount': float(staff.max_discount),
            'can_edit_rate': staff.can_edit_rate,
            'can_view_purchase_rates': staff.can_view_purchase_rates,
            'can_create_purchases': staff.can_create_purchases,
            'can_access_reports': staff.can_access_reports,
            'can_edit_sales': staff.can_edit_sales,
            'can_edit_purchases': staff.can_edit_purchases,
            'can_modify_paid_purchases': staff.can_modify_paid_purchases,
            'can_modify_settled_vouchers': staff.can_modify_settled_vouchers,
            'can_modify_settled_returns': staff.can_modify_settled_returns,
            'can_edit_sale_returns': staff.can_edit_sale_returns,
            'can_edit_purchase_returns': staff.can_edit_purchase_returns,
            'can_edit_vouchers': staff.can_edit_vouchers,
            'can_view_audit_history': staff.can_view_audit_history,
            'can_void_records': staff.can_void_records,
            'can_modify_draft_bill': staff.can_modify_draft_bill,
            'can_modify_unpaid_bill': staff.can_modify_unpaid_bill,
            'can_correct_header_fields': staff.can_correct_header_fields,
            'can_correct_rates_discounts': staff.can_correct_rates_discounts,
            'can_correct_quantities': staff.can_correct_quantities,
            'can_correct_customer': staff.can_correct_customer,
            'can_modify_bill_with_return': staff.can_modify_bill_with_return,
            'can_modify_paid_bill': staff.can_modify_paid_bill,
            'can_cancel_and_reissue_bill': staff.can_cancel_and_reissue_bill,
            'can_view_bill_revision_history': staff.can_view_bill_revision_history,
            'can_manage_partners': staff.can_manage_partners,
            'shift_start_time': _format_time_safe(staff.shift_start_time),
            'shift_end_time': _format_time_safe(staff.shift_end_time),
            'weekly_off_day': staff.weekly_off_day,
            'is_active': staff.is_active,
        }

        changes = {}
        for key in old_state:
            if old_state[key] != new_state[key]:
                changes[key] = {'old': old_state[key], 'new': new_state[key]}
        # Record THAT a credential changed, never its value.
        if request.data.get('password'):
            changes['password'] = {'old': '***', 'new': '***'}
        if request.data.get('pin'):
            changes['pin'] = {'old': '***', 'new': '***'}

        if changes:
            log_activity(
                action='UPDATE', module='staff', entity_type='Staff', entity_id=staff.id,
                entity_label=staff.name, user=caller, outlet=staff.outlet, request=request,
                description=f"{caller.name} changed staff {staff.name}: {', '.join(sorted(changes))}",
                changes=changes,
            )

        return Response({'success': True, 'data': _serialize_staff(staff)}, status=status.HTTP_200_OK)

    def delete(self, request, pk, *args, **kwargs):
        caller = request.user
        if caller.role not in ('super_admin', 'admin'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            if caller.role == 'super_admin':
                staff = Staff.objects.get(id=pk, outlet__organization=caller.outlet.organization)
            else:
                staff = Staff.objects.get(id=pk, outlet=caller.outlet)
        except Staff.DoesNotExist:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        if not can_manage_staff_member(caller, staff):
            return Response({'error': 'You are not allowed to deactivate this account.'}, status=status.HTTP_403_FORBIDDEN)
        if staff.id == caller.id:
            return Response({'error': 'You cannot deactivate your own account.'}, status=status.HTTP_403_FORBIDDEN)

        staff.is_active = False
        staff.save(update_fields=['is_active'])

        log_activity(
            action='DELETE', module='staff', entity_type='Staff', entity_id=staff.id,
            entity_label=staff.name, user=caller, outlet=staff.outlet, request=request,
            description=f"{caller.name} deactivated staff {staff.name}",
            changes={'is_active': {'old': True, 'new': False}},
        )

        return Response({'success': True, 'data': {'id': str(staff.id), 'isActive': False}}, status=status.HTTP_200_OK)


class StaffPerformanceView(APIView):
    """GET /api/v1/staff/{pk}/performance/?from=&to="""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        from apps.billing.models import SaleInvoice, SaleItem
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncDate
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            staff = Staff.objects.get(id=pk, outlet=outlet)
        except Staff.DoesNotExist:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        from datetime import datetime
        qs = SaleInvoice.objects.filter(outlet=outlet, billed_by=staff, is_return=False)
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        if from_str:
            try:
                qs = qs.filter(invoice_date__date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(invoice_date__date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
            except ValueError:
                pass

        agg = qs.aggregate(
            total_invoices=Count('id'),
            total_sales=Sum('grand_total'),
            total_discount=Sum('discount_amount'),
            total_cash=Sum('cash_paid'),
            total_upi=Sum('upi_paid'),
            total_card=Sum('card_paid'),
            total_credit=Sum('credit_given'),
        )
        total_invoices = agg['total_invoices'] or 0
        total_sales = float(agg['total_sales'] or 0)

        by_day = list(
            qs.annotate(day=TruncDate('invoice_date'))
            .values('day').annotate(invoiceCount=Count('id'), totalAmount=Sum('grand_total'))
            .order_by('day')
        )

        top_products = list(
            SaleItem.objects.filter(invoice__in=qs)
            .values('product_name').annotate(qty=Sum('qty_strips'), totalAmount=Sum('total_amount'))
            .order_by('-totalAmount')[:10]
        )

        return Response({
            'success': True,
            'data': {
                'staffId': str(staff.id),
                'staffName': staff.name,
                'role': staff.role,
                'totalInvoices': total_invoices,
                'totalSalesAmount': total_sales,
                'totalDiscountGiven': float(agg['total_discount'] or 0),
                'avgInvoiceValue': round(total_sales / total_invoices, 2) if total_invoices > 0 else 0,
                'topProducts': [{'productName': r['product_name'], 'qty': r['qty'], 'totalAmount': float(r['totalAmount'] or 0)} for r in top_products],
                'salesByDay': [{'date': r['day'].isoformat(), 'invoiceCount': r['invoiceCount'], 'totalAmount': float(r['totalAmount'] or 0)} for r in by_day],
                'salesByPaymentMode': {
                    'cash': float(agg['total_cash'] or 0),
                    'upi': float(agg['total_upi'] or 0),
                    'card': float(agg['total_card'] or 0),
                    'credit': float(agg['total_credit'] or 0),
                },
            }
        }, status=status.HTTP_200_OK)


class StaffLeaderboardView(APIView):
    """GET /api/v1/staff/leaderboard/?from=&to="""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.billing.models import SaleInvoice
        from django.db.models import Sum, Count
        from datetime import datetime
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        staff_members = Staff.objects.filter(outlet=outlet, is_active=True)

        entries = []
        for staff in staff_members:
            qs = SaleInvoice.objects.filter(outlet=outlet, billed_by=staff, is_return=False)
            if from_str:
                try:
                    qs = qs.filter(invoice_date__date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
                except ValueError:
                    pass
            if to_str:
                try:
                    qs = qs.filter(invoice_date__date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
                except ValueError:
                    pass
            agg = qs.aggregate(total_invoices=Count('id'), total_sales=Sum('grand_total'), total_discount=Sum('discount_amount'))
            total_invoices = agg['total_invoices'] or 0
            total_sales = float(agg['total_sales'] or 0)
            entries.append({
                'staffId': str(staff.id),
                'staffName': staff.name,
                'role': staff.role,
                'totalInvoices': total_invoices,
                'totalSalesAmount': total_sales,
                'avgInvoiceValue': round(total_sales / total_invoices, 2) if total_invoices > 0 else 0,
                'totalDiscountGiven': float(agg['total_discount'] or 0),
            })

        entries.sort(key=lambda x: x['totalSalesAmount'], reverse=True)
        data = []
        for index, staff_data in enumerate(entries):
            rank = index + 1
            staff_data['rank'] = rank
            if rank == 1:
                staff_data['badge'] = 'gold'
            elif rank == 2:
                staff_data['badge'] = 'silver'
            elif rank == 3:
                staff_data['badge'] = 'bronze'
            else:
                staff_data['badge'] = None
            data.append(staff_data)

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


class ChronicMedicinesView(APIView):
    """GET /api/v1/customers/{customer_id}/chronic-medicines/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        from apps.accounts.models import RegularMedicine
        from apps.inventory.models import Batch
        from apps.billing.models import SaleInvoice, SaleItem
        from datetime import datetime, timedelta

        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        medicines = RegularMedicine.objects.filter(customer=customer)
        freq_days = {'Daily': 1, 'Weekly': 7, 'Monthly': 30, 'daily': 1, 'weekly': 7, 'monthly': 30}

        data = []
        for med in medicines:
            # Current stock for this product
            batches = Batch.objects.filter(
                outlet=outlet, product__name__iexact=med.name, qty_strips__gt=0, is_active=True
            )
            current_stock = sum(b.qty_strips for b in batches)

            # Last purchase
            last_purchase = customer.last_refill_date

            # Next due date
            interval = freq_days.get(med.frequency, 30)
            next_due = (last_purchase + timedelta(days=interval)) if last_purchase else None

            data.append({
                'id': str(med.id),
                'productId': med.product_id,
                'productName': med.name,
                'genericName': '',
                'qty': med.qty,
                'frequency': med.frequency,
                'notes': med.notes,
                'currentStock': current_stock,
                'lastPurchaseDate': last_purchase.isoformat() if last_purchase else None,
                'nextDueDate': next_due.isoformat() if next_due else None,
            })

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


class RefillAlertsView(APIView):
    """GET /api/v1/customers/refill-alerts/?days=7"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.accounts.models import RegularMedicine
        from datetime import datetime, timedelta, date

        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        days = int(request.query_params.get('days', 7))

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.billing.models import SaleItem
        today = date.today()
        cutoff = today + timedelta(days=days)
        FREQUENCY_DAYS = {
            'daily': 1,
            'weekly': 7,
            'monthly': 30,
        }

        def get_next_due_date(last_purchase_date, frequency):
            days_int = FREQUENCY_DAYS.get(frequency.lower(), 30)
            return last_purchase_date + timedelta(days=days_int)

        chronic_customers = Customer.objects.filter(outlet=outlet, is_chronic=True, is_active=True)
        data = []
        total_alerts = 0

        for customer in chronic_customers:
            medicines = RegularMedicine.objects.filter(customer=customer)
            due_medicines = []
            for med in medicines:
                # Find last SaleItem for this customer + product -> get its sale_invoice.invoice_date (wait, it says bill_date but it is invoice_date)
                last_sale = SaleItem.objects.filter(
                    sale_invoice__customer=customer, 
                    product_name=med.name
                ).order_by('-sale_invoice__invoice_date').first()
                
                if last_sale:
                    last_purchase = last_sale.sale_invoice.invoice_date.date()
                else:
                    last_purchase = customer.created_at.date()
                    
                next_due = get_next_due_date(last_purchase, med.frequency)
                
                if next_due <= cutoff:
                    days_until = (next_due - today).days
                    due_medicines.append({
                        'productName': med.name,
                        'qty': med.qty,
                        'frequency': med.frequency,
                        'lastPurchaseDate': last_purchase.isoformat(),
                        'nextDueDate': next_due.isoformat(),
                        'daysUntilDue': days_until,
                    })
                    total_alerts += 1

            if due_medicines:
                data.append({
                    'customerId': str(customer.id),
                    'customerName': customer.name,
                    'phone': customer.phone,
                    'medicines': due_medicines,
                })

        return Response({
            'success': True,
            'data': data,
            'meta': {'totalAlerts': total_alerts, 'daysFilter': days},
        }, status=status.HTTP_200_OK)


class DoctorListCreateView(APIView):
    """GET/POST /api/v1/doctors/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.accounts.models import Doctor
        from django.db.models import Q
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = Doctor.objects.filter(outlet=outlet, is_active=True)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(registration_no__icontains=search))

        total_count = qs.count()
        limit_param = request.query_params.get('limit')
        if limit_param:
            try:
                limit_val = max(1, min(200, int(limit_param)))
                qs = qs.order_by('name')[:limit_val]
            except ValueError:
                qs = qs.order_by('name')
        elif search:
            qs = qs.order_by('name')[:50]
        else:
            qs = qs.order_by('name')

        data = [{
            'id': str(d.id),
            'name': d.name,
            'phone': d.phone,
            'registrationNo': d.registration_no,
            'regNo': d.registration_no,
            'degree': d.degree,
            'qualification': d.qualification,
            'specialty': d.specialty,
            'specialization': d.specialty,
            'hospitalName': d.hospital_name,
            'address': d.address,
        } for d in qs]

        return Response({'success': True, 'data': data, 'meta': {'total': total_count}}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.data.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        doctor = Doctor.objects.create(
            outlet=outlet,
            name=request.data.get('name', ''),
            phone=request.data.get('phone', ''),
            registration_no=request.data.get('registrationNo') or request.data.get('regNo', ''),
            degree=request.data.get('degree', ''),
            qualification=request.data.get('qualification', ''),
            specialty=request.data.get('specialty') or request.data.get('specialization', ''),
            hospital_name=request.data.get('hospitalName', ''),
            address=request.data.get('address', ''),
            is_active=True,
        )
        data = {
            'id': str(doctor.id),
            'name': doctor.name,
            'phone': doctor.phone,
            'registrationNo': doctor.registration_no,
            'regNo': doctor.registration_no,
            'degree': doctor.degree,
            'qualification': doctor.qualification,
            'specialty': doctor.specialty,
            'specialization': doctor.specialty,
            'hospitalName': doctor.hospital_name,
            'address': doctor.address,
        }
        return Response({'success': True, 'data': data}, status=status.HTTP_201_CREATED)


class DoctorDetailView(APIView):
    """GET/PUT/PATCH /api/v1/doctors/{pk}/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            d = Doctor.objects.get(id=pk, outlet=outlet)
        except Doctor.DoesNotExist:
            return Response({'detail': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        data = {
            'id': str(d.id),
            'name': d.name,
            'phone': d.phone,
            'registrationNo': d.registration_no,
            'regNo': d.registration_no,
            'degree': d.degree,
            'qualification': d.qualification,
            'specialty': d.specialty,
            'specialization': d.specialty,
            'hospitalName': d.hospital_name,
            'address': d.address,
        }
        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)

    def put(self, request, pk, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.data.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            d = Doctor.objects.get(id=pk, outlet=outlet)
        except Doctor.DoesNotExist:
            return Response({'detail': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        d.name = request.data.get('name', d.name)
        d.phone = request.data.get('phone', d.phone)
        d.registration_no = request.data.get('registrationNo') or request.data.get('regNo', d.registration_no)
        d.degree = request.data.get('degree', d.degree)
        d.qualification = request.data.get('qualification', d.qualification)
        d.specialty = request.data.get('specialty') or request.data.get('specialization', d.specialty)
        d.hospital_name = request.data.get('hospitalName', d.hospital_name)
        d.address = request.data.get('address', d.address)
        d.save()

        data = {
            'id': str(d.id),
            'name': d.name,
            'phone': d.phone,
            'registrationNo': d.registration_no,
            'regNo': d.registration_no,
            'degree': d.degree,
            'qualification': d.qualification,
            'specialty': d.specialty,
            'specialization': d.specialty,
            'hospitalName': d.hospital_name,
            'address': d.address,
        }
        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)

    def patch(self, request, pk, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.data.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            d = Doctor.objects.get(id=pk, outlet=outlet)
        except Doctor.DoesNotExist:
            return Response({'detail': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        if 'name' in request.data: d.name = request.data['name']
        if 'specialization' in request.data: d.specialty = request.data['specialization']
        if 'phone' in request.data: d.phone = request.data['phone']
        if 'registrationNo' in request.data: d.registration_no = request.data['registrationNo']
        if 'qualification' in request.data: d.qualification = request.data['qualification']
        d.save()

        return Response({'success': True, 'data': {
            'id': str(d.id), 'name': d.name, 'specialization': d.specialty,
            'phone': d.phone, 'registrationNo': d.registration_no, 'qualification': d.qualification,
        }}, status=status.HTTP_200_OK)


class ChangePinView(APIView):
    """PATCH /api/v1/auth/me/pin/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, *args, **kwargs):
        from django.contrib.auth.hashers import make_password, check_password
        staff = request.user
        current_pin = str(request.data.get('currentPin', ''))
        new_pin = str(request.data.get('newPin', ''))

        blocked = _pin_blocked_response(staff)
        if blocked:
            return blocked

        if not check_password(current_pin, staff.staff_pin):
            PIN_USER_LIMITER.record_failure(staff.id)
            return Response({'error': 'Current PIN is incorrect'}, status=status.HTTP_400_BAD_REQUEST)

        if not new_pin.isdigit() or not (4 <= len(new_pin) <= 6):
            return Response({'error': 'New PIN must be 4-6 digits'}, status=status.HTTP_400_BAD_REQUEST)

        for existing_staff in Staff.objects.filter(outlet=staff.outlet, is_active=True).exclude(id=staff.id):
            if check_password(new_pin, existing_staff.staff_pin):
                return Response({'error': 'This PIN is already in use by another staff member in this outlet.'}, status=status.HTTP_400_BAD_REQUEST)

        # Only the PIN changes. This used to also overwrite the account's login password with
        # a hash of the PIN, silently destroying the password the admin had set.
        staff.staff_pin = make_password(new_pin)
        staff.save(update_fields=['staff_pin'])

        log_activity(
            action="UPDATE",
            module="staff",
            entity_type="Staff",
            entity_id=staff.id,
            entity_label=staff.name,
            description=f"Staff {staff.name} changed their PIN",
            user=staff,
            outlet=staff.outlet,
            changes={'staff_pin': {'old': '***', 'new': '***'}}
        )

        return Response({'success': True, 'data': {'message': 'PIN updated successfully'}}, status=status.HTTP_200_OK)

class CustomerOutstandingInvoicesView(APIView):
    """
    GET /api/v1/customers/<uuid:pk>/outstanding/
    Returns all unpaid SaleInvoices for a customer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        from apps.billing.models import SaleInvoice
        outlet = request.user.outlet
        try:
            customer = Customer.objects.get(id=pk, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        unpaid_invoices = SaleInvoice.objects.filter(
            outlet=outlet, 
            customer=customer, 
            amount_due__gt=0
        ).order_by('invoice_date')

        data = []
        for inv in unpaid_invoices:
            data.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'invoiceDate': inv.invoice_date.isoformat() if inv.invoice_date else None,
                'grandTotal': float(inv.grand_total),
                'outstanding': float(inv.amount_due),
            })
            
        return Response({'data': data}, status=status.HTTP_200_OK)

from rest_framework_simplejwt.views import TokenBlacklistView

class LogoutView(TokenBlacklistView):
    """
    Subclass TokenBlacklistView to log the LOGOUT event.
    """
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            # Note: TokenBlacklistView does not require authentication by default.
            user = request.user if request.user and request.user.is_authenticated else None
            desc = f"Successful logout for staff {user.name}" if user else "Successful logout"
            log_activity(
                action='LOGOUT',
                module='auth',
                user=user,
                description=desc,
            )
        return response

from apps.accounts.dashboard_service import DashboardService
# NOTE: do NOT import DRF's IsAuthenticated here. It used to shadow the project's outlet-aware
# IsAuthenticated (imported at the top of this module), so the four dashboard views below had no
# outlet check and any logged-in user could read any outlet's KPIs.

class DashboardKPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        return Response(DashboardService.get_financial_health_kpis(outlet_id))

class DashboardAgingView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        return Response(DashboardService.get_aging_summary(outlet_id))

class DashboardUrgentActionsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        return Response(DashboardService.get_urgent_actions(outlet_id))

class DashboardAuditAlertsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        return Response(DashboardService.get_audit_alerts(outlet_id))
