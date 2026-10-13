from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from apps.core.permissions import IsAdminStaff

from apps.core.models import Outlet, OutletSettings, default_print_settings_retail, default_print_settings_wholesale


def serialize_outlet(outlet):
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


class OutletSettingsView(APIView):
    """GET/PATCH /api/v1/outlet/settings/"""
    permission_classes = [IsAdminStaff]

    def _serialize(self, settings):
        def fmt_time(t, default):
            if not t:
                return default
            if hasattr(t, 'strftime'):
                return t.strftime('%H:%M')
            return str(t)[:5]
        return {
            'openingTime': fmt_time(settings.opening_time, '09:00'),
            'closingTime': fmt_time(settings.closing_time, '21:00'),
            'gracePeriodMinutes': settings.grace_period_minutes,
            'defaultCreditDays': settings.default_credit_days,
            'invoicePrefix': settings.invoice_prefix,
            'gstRegistered': settings.gst_registered,
            'printLogo': settings.print_logo,
            'thermalPrint': settings.thermal_print,
            'printerWidth': settings.printer_width,
            'lowStockAlertDays': settings.low_stock_alert_days,
            'expiryAlertDays': settings.expiry_alert_days,
            'enableWhatsapp': settings.enable_whatsapp,
            'whatsappApiKey': settings.whatsapp_api_key,
            'enableEwayBill': settings.enable_eway_bill,
            'enableEinvoice': settings.enable_einvoice,
            'currencySymbol': settings.currency_symbol,
            'landingCostIncludeGst': settings.landing_cost_include_gst,
            'landingCostIncludeFreight': settings.landing_cost_include_freight,
            'minMarginWarningPct': str(settings.min_margin_warning_pct) if settings.min_margin_warning_pct is not None else "0.00",
            'allowedAttendanceIps': settings.allowed_attendance_ips,
            'attendanceLatitude': str(settings.attendance_latitude) if settings.attendance_latitude else None,
            'attendanceLongitude': str(settings.attendance_longitude) if settings.attendance_longitude else None,
            'attendanceRadiusMeters': settings.attendance_radius_meters,
            'printSettingsRetail': settings.print_settings_retail or default_print_settings_retail(),
            'printSettingsWholesale': settings.print_settings_wholesale or default_print_settings_wholesale(),
            'updatedAt': settings.updated_at.isoformat(),
        }

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        settings, _ = OutletSettings.objects.get_or_create(outlet=outlet)
        return Response({
            'success': True,
            'data': self._serialize(settings),
            'outlet': serialize_outlet(outlet),
        }, status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or request.query_params.get('outletId') or getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        settings, _ = OutletSettings.objects.get_or_create(outlet=outlet)

        field_map = {
            'openingTime': 'opening_time',
            'closingTime': 'closing_time',
            'gracePeriodMinutes': 'grace_period_minutes',
            'defaultCreditDays': 'default_credit_days',
            'invoicePrefix': 'invoice_prefix',
            'gstRegistered': 'gst_registered',
            'printLogo': 'print_logo',
            'thermalPrint': 'thermal_print',
            'printerWidth': 'printer_width',
            'lowStockAlertDays': 'low_stock_alert_days',
            'expiryAlertDays': 'expiry_alert_days',
            'enableWhatsapp': 'enable_whatsapp',
            'whatsappApiKey': 'whatsapp_api_key',
            'enableEwayBill': 'enable_eway_bill',
            'enableEinvoice': 'enable_einvoice',
            'currencySymbol': 'currency_symbol',
            'landingCostIncludeGst': 'landing_cost_include_gst',
            'landingCostIncludeFreight': 'landing_cost_include_freight',
            'minMarginWarningPct': 'min_margin_warning_pct',
            'allowedAttendanceIps': 'allowed_attendance_ips',
            'attendanceLatitude': 'attendance_latitude',
            'attendanceLongitude': 'attendance_longitude',
            'attendanceRadiusMeters': 'attendance_radius_meters',
            'printSettingsRetail': 'print_settings_retail',
            'printSettingsWholesale': 'print_settings_wholesale',
        }

        updated_fields = []
        for frontend_key, model_field in field_map.items():
            if frontend_key in request.data:
                setattr(settings, model_field, request.data[frontend_key])
                updated_fields.append(model_field)

        if updated_fields:
            settings.save(update_fields=updated_fields)

        # Handle updating the base Outlet model fields
        outlet_updated = []
        if 'outletName' in request.data:
            outlet.name = (request.data['outletName'] or '').strip()
            outlet_updated.append('name')
        elif 'name' in request.data:
            outlet.name = (request.data['name'] or '').strip()
            outlet_updated.append('name')

        if 'outletAddress' in request.data:
            outlet.address = (request.data['outletAddress'] or '').strip()
            outlet_updated.append('address')
        elif 'address' in request.data:
            outlet.address = (request.data['address'] or '').strip()
            outlet_updated.append('address')

        if 'outletCity' in request.data:
            outlet.city = (request.data['outletCity'] or '').strip()
            outlet_updated.append('city')
        elif 'city' in request.data:
            outlet.city = (request.data['city'] or '').strip()
            outlet_updated.append('city')

        if 'outletState' in request.data:
            outlet.state = (request.data['outletState'] or '').strip()
            outlet_updated.extend(['state', 'state_code'])
        elif 'state' in request.data:
            outlet.state = (request.data['state'] or '').strip()
            outlet_updated.extend(['state', 'state_code'])

        if 'outletPincode' in request.data:
            outlet.pincode = (request.data['outletPincode'] or '').strip()
            outlet_updated.append('pincode')
        elif 'pincode' in request.data:
            outlet.pincode = (request.data['pincode'] or '').strip()
            outlet_updated.append('pincode')

        if 'outletPhone' in request.data:
            outlet.phone = (request.data['outletPhone'] or '').strip()
            outlet_updated.append('phone')
        elif 'phone' in request.data:
            outlet.phone = (request.data['phone'] or '').strip()
            outlet_updated.append('phone')

        if 'outletGstin' in request.data:
            outlet.gstin = (request.data['outletGstin'] or '').strip().upper()
            outlet_updated.append('gstin')
        elif 'gstin' in request.data:
            outlet.gstin = (request.data['gstin'] or '').strip().upper()
            outlet_updated.append('gstin')

        if 'outletDrugLicenseNo' in request.data:
            outlet.drug_license_no = (request.data['outletDrugLicenseNo'] or '').strip()
            outlet_updated.append('drug_license_no')
        elif 'drugLicenseNo' in request.data:
            outlet.drug_license_no = (request.data['drugLicenseNo'] or '').strip()
            outlet_updated.append('drug_license_no')

        if 'invoiceFooter' in request.data:
            outlet.invoice_footer = (request.data['invoiceFooter'] or '').strip()
            outlet_updated.append('invoice_footer')

        if 'outletLogoUrl' in request.data or 'logoUrl' in request.data:
            outlet.logo_url = request.data.get('outletLogoUrl') or request.data.get('logoUrl')
            outlet_updated.append('logo_url')

        if outlet_updated:
            outlet.save(update_fields=list(set(outlet_updated)))

        return Response({
            'success': True,
            'data': self._serialize(settings),
            'outlet': serialize_outlet(outlet),
        }, status=status.HTTP_200_OK)

