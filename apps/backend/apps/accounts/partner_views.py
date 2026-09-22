import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.core.permissions import IsAuthenticated
from apps.accounts.models import Partner
from apps.accounts.serializers import PartnerSerializer
from apps.core.models import Outlet

logger = logging.getLogger(__name__)

class PartnerListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        partners = Partner.objects.filter(outlet=outlet, is_active=True).order_by('name')
        serializer = PartnerSerializer(partners, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=status.HTTP_404_NOT_FOUND)
            
        if not request.user.can_manage_partners and request.user.role != 'super_admin':
            return Response({'detail': 'You do not have permission to manage partners.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = PartnerSerializer(data=request.data, context={'outlet': outlet})
        if serializer.is_valid():
            partner = serializer.save()
            import datetime
            from apps.accounts.models import PartnerShareHistory
            PartnerShareHistory.objects.create(
                partner=partner,
                profit_percentage=partner.profit_percentage,
                start_date=datetime.date.today()
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PartnerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk, outlet_id):
        try:
            return Partner.objects.get(pk=pk, outlet_id=outlet_id)
        except Partner.DoesNotExist:
            return None

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        partner = self.get_object(pk, outlet_id)
        if not partner:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = PartnerSerializer(partner)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, pk, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        partner = self.get_object(pk, outlet_id)
        if not partner:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        if not request.user.can_manage_partners and request.user.role != 'super_admin':
            return Response({'detail': 'You do not have permission to manage partners.'}, status=status.HTTP_403_FORBIDDEN)

        old_percentage = partner.profit_percentage
        serializer = PartnerSerializer(partner, data=request.data, partial=True)
        if serializer.is_valid():
            updated_partner = serializer.save()
            
            if old_percentage != updated_partner.profit_percentage:
                import datetime
                from apps.accounts.models import PartnerShareHistory
                today = datetime.date.today()
                
                old_history = PartnerShareHistory.objects.filter(partner=updated_partner, end_date__isnull=True).first()
                if old_history:
                    if old_history.start_date == today:
                        old_history.profit_percentage = updated_partner.profit_percentage
                        old_history.save()
                    else:
                        old_history.end_date = today - datetime.timedelta(days=1)
                        old_history.save()
                        PartnerShareHistory.objects.create(
                            partner=updated_partner,
                            profit_percentage=updated_partner.profit_percentage,
                            start_date=today
                        )
                else:
                    PartnerShareHistory.objects.create(
                        partner=updated_partner,
                        profit_percentage=updated_partner.profit_percentage,
                        start_date=today
                    )
                    
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    def delete(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or request.data.get('outletId')
        partner = self.get_object(pk, outlet_id)
        if not partner:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        if not request.user.can_manage_partners and request.user.role != 'super_admin':
            return Response({'detail': 'You do not have permission to manage partners.'}, status=status.HTTP_403_FORBIDDEN)
            
        partner.is_active = False
        partner.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
