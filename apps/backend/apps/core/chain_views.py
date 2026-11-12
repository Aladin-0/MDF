import logging
from datetime import date
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Sum, Count, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date

from apps.core.models import Organization, Outlet
from apps.billing.models import SaleInvoice
from apps.purchases.models import PurchaseInvoice
from apps.accounts.models import Customer

logger = logging.getLogger(__name__)


def own_organization_or_404(user, org_id):
    """
    A super admin manages exactly one organization: the one their current outlet belongs to.

    The org id in the URL / query string comes from the browser, so it is only ever checked
    against that, never trusted. Before, any super admin could read another chain's numbers or
    add outlets to another chain by putting its id in the request. A foreign (or malformed) id
    answers 404, the same as an unknown one, so ids cannot be probed.
    """
    own_org_id = getattr(getattr(user, 'outlet', None), 'organization_id', None)
    if own_org_id is None or str(own_org_id) != str(org_id):
        raise Http404('Organization not found')
    return get_object_or_404(Organization, id=own_org_id, is_active=True)


class AllOutletsView(APIView):
    """
    GET /api/v1/organizations/outlets/all/
    Super-admin only: returns all outlets across their organization.
    Used by the frontend Outlet Switcher so super_admin can operate
    as any outlet (billing, purchases, inventory, etc.)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'role', None) != 'super_admin':
            return Response({'detail': 'Super admin only.'}, status=status.HTTP_403_FORBIDDEN)

        # Derive organization from the super_admin's own outlet
        user_outlet_id = getattr(request.user, 'outlet_id', None)
        if not user_outlet_id:
            return Response({'detail': 'No outlet assigned to this super admin.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_outlet = Outlet.objects.select_related('organization').get(id=user_outlet_id)
            org = user_outlet.organization
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found.'}, status=status.HTTP_404_NOT_FOUND)

        if org is None:
            # Fallback: return all outlets if no org (single-outlet setup)
            outlets = Outlet.objects.filter(is_active=True).values('id', 'name', 'city', 'state', 'phone')
        else:
            outlets = Outlet.objects.filter(organization=org, is_active=True).values('id', 'name', 'city', 'state', 'phone')

        return Response({
            'success': True,
            'data': [
                {
                    'id': str(o['id']),
                    'name': o['name'],
                    'city': o['city'] or '',
                    'state': o['state'] or '',
                    'phone': o['phone'] or '',
                }
                for o in outlets
            ]
        })




class OrganizationListView(APIView):
    """GET /api/v1/organizations/ — list all organizations (super_admin only)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)

        orgs = Organization.objects.filter(is_active=True).values(
            'id', 'name', 'slug', 'plan', 'master_gstin', 'phone', 'email', 'created_at'
        )
        data = [
            {
                'id': str(o['id']),
                'name': o['name'],
                'slug': o['slug'],
                'plan': o['plan'],
                'masterGstin': o['master_gstin'],
                'phone': o['phone'],
                'email': o['email'],
                'createdAt': o['created_at'].isoformat() if o['created_at'] else None,
                'outletCount': Outlet.objects.filter(organization_id=o['id'], is_active=True).count(),
            }
            for o in orgs
        ]
        return Response({'success': True, 'data': data})


class OrganizationDetailView(APIView):
    """GET /api/v1/organizations/<pk>/ — get single organization with outlets."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)

        org = own_organization_or_404(request.user, pk)
        outlets = Outlet.objects.filter(organization=org, is_active=True).values(
            'id', 'name', 'city', 'state', 'gstin', 'phone'
        )
        return Response({
            'success': True,
            'data': {
                'id': str(org.id),
                'name': org.name,
                'slug': org.slug,
                'plan': org.plan,
                'masterGstin': org.master_gstin,
                'phone': org.phone,
                'email': org.email,
                'outlets': [
                    {
                        'id': str(o['id']),
                        'name': o['name'],
                        'city': o['city'],
                        'state': o['state'],
                        'gstin': o['gstin'],
                        'phone': o['phone'],
                    }
                    for o in outlets
                ],
            }
        })


class OrganizationOutletListView(APIView):
    """
    GET /api/v1/organizations/<org_id>/outlets/ — list outlets for an organization.
    POST /api/v1/organizations/<org_id>/outlets/ — create an outlet for the organization.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)
            
        org = own_organization_or_404(request.user, org_id)
        outlets = Outlet.objects.filter(organization=org, is_active=True).values(
            'id', 'name', 'city', 'state', 'gstin', 'phone'
        )
        
        data = [
            {
                'id': str(o['id']),
                'name': o['name'],
                'city': o['city'],
                'state': o['state'],
                'gstin': o['gstin'],
                'phone': o['phone'],
            }
            for o in outlets
        ]
        return Response({'success': True, 'data': data})

    def post(self, request, org_id):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)
            
        org = own_organization_or_404(request.user, org_id)
        
        # Check uniqueness manually to provide clean error messages
        gstin = request.data.get('gstin', '')
        drug_license_no = request.data.get('drug_license_no', '')
        
        if Outlet.objects.filter(gstin=gstin).exists():
            return Response({'success': False, 'error': 'An outlet with this GSTIN already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            
        if Outlet.objects.filter(drug_license_no=drug_license_no).exists():
            return Response({'success': False, 'error': 'An outlet with this Drug License Number already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            outlet = Outlet.objects.create(
                organization=org,
                name=request.data.get('name', ''),
                address=request.data.get('address', ''),
                city=request.data.get('city', ''),
                state=request.data.get('state', ''),
                pincode=request.data.get('pincode', ''),
                gstin=gstin,
                drug_license_no=drug_license_no,
                phone=request.data.get('phone', ''),
            )
            return Response({
                'success': True, 
                'data': {
                    'id': str(outlet.id),
                    'name': outlet.name
                }
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Error creating outlet: {str(e)}")
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ChainDashboardView(APIView):
    """
    GET /api/v1/organizations/dashboard/?orgId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD

    Chain-wide aggregated KPIs for a super_admin across ALL active outlets of their own org.

    Counted the same way as the rest of the reports: sales exclude returns and cancelled
    invoices; purchases and payables count only POSTED GRNs (a SAVED one is an unreviewed OCR
    scan that has not touched stock or the ledger yet).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)

        org_id = request.GET.get('orgId')
        if not org_id:
            return Response({'success': False, 'error': 'orgId is required'}, status=status.HTTP_400_BAD_REQUEST)

        today = date.today()
        try:
            from_date = parse_date(request.GET.get('from') or str(today.replace(day=1)))
            to_date = parse_date(request.GET.get('to') or str(today))
        except ValueError:  # well-formed but impossible, e.g. 2025-02-31
            from_date = to_date = None
        # parse_date returns None for text that is not a date at all. Both used to be an
        # unhandled 500.
        if not from_date or not to_date:
            return Response({'success': False, 'error': 'from and to must be valid YYYY-MM-DD dates'},
                            status=status.HTTP_400_BAD_REQUEST)
        if from_date > to_date:
            return Response({'success': False, 'error': '"from" date cannot be after "to" date'},
                            status=status.HTTP_400_BAD_REQUEST)

        org = own_organization_or_404(request.user, org_id)
        outlets = list(Outlet.objects.filter(organization=org, is_active=True).order_by('name'))
        outlet_ids = [o.id for o in outlets]

        live_sales = SaleInvoice.objects.filter(outlet_id__in=outlet_ids, is_return=False, is_cancelled=False)
        period_sales = live_sales.filter(invoice_date__date__gte=from_date, invoice_date__date__lte=to_date)
        today_sales = live_sales.filter(invoice_date__date=today)

        sales_agg = period_sales.aggregate(total=Sum('grand_total'), invoices=Count('id'))
        today_agg = today_sales.aggregate(total=Sum('grand_total'), invoices=Count('id'))

        posted_purchases = PurchaseInvoice.objects.filter(outlet_id__in=outlet_ids, status='POSTED')
        purchases_agg = posted_purchases.filter(
            invoice_date__gte=from_date, invoice_date__lte=to_date,
        ).aggregate(total=Sum('grand_total'), invoices=Count('id'))
        payables_agg = posted_purchases.filter(outstanding__gt=0).aggregate(total=Sum('outstanding'))

        receivables_agg = Customer.objects.filter(
            outlet_id__in=outlet_ids, outstanding__gt=0,
        ).aggregate(total=Sum('outstanding'))

        # One grouped query per figure instead of two queries per outlet.
        per_outlet_period = {
            row['outlet_id']: row
            for row in period_sales.values('outlet_id').annotate(total=Sum('grand_total'), invoices=Count('id'))
        }
        per_outlet_today = {
            row['outlet_id']: row['total']
            for row in today_sales.values('outlet_id').annotate(total=Sum('grand_total'))
        }

        outlet_data = []
        for outlet in outlets:
            period_row = per_outlet_period.get(outlet.id, {})
            outlet_data.append({
                'id': str(outlet.id),
                'name': outlet.name,
                'city': outlet.city,
                'state': outlet.state,
                'periodSales': float(period_row.get('total') or 0),
                'periodInvoices': period_row.get('invoices') or 0,
                'todaySales': float(per_outlet_today.get(outlet.id) or 0),
            })

        return Response({
            'success': True,
            'data': {
                'organization': {'id': str(org.id), 'name': org.name},
                'period': {'from': str(from_date), 'to': str(to_date)},
                'totalSales': {
                    'total': float(sales_agg['total'] or 0),
                    'invoices': sales_agg['invoices'] or 0,
                },
                'todaySales': {
                    'total': float(today_agg['total'] or 0),
                    'invoices': today_agg['invoices'] or 0,
                },
                'totalPurchases': {
                    'total': float(purchases_agg['total'] or 0),
                    'invoices': purchases_agg['invoices'] or 0,
                },
                'totalPayables': float(payables_agg['total'] or 0),
                'totalReceivables': float(receivables_agg['total'] or 0),
                'outlets': outlet_data,
            }
        })
