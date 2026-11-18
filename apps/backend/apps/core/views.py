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
        # what was there before, for the audit trail (secrets are recorded as "changed", never as a value)
        _before = {f.name: getattr(settings, f.name) for f in settings._meta.concrete_fields}
        _outlet_before = {f: getattr(outlet, f) for f in ('name', 'address', 'city', 'state', 'pincode', 'phone', 'gstin', 'drug_license_no', 'invoice_footer')}

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

        # compare with what the database NOW holds (typed values), not with the raw request text left on the instance:
        # "09:00" vs time(9, 0) or "0" vs Decimal('0.00') would otherwise read as a change on every save
        self._audit_changes(request, outlet, type(settings).objects.get(pk=settings.pk), _before, _outlet_before, type(outlet).objects.get(pk=outlet.pk))

        return Response({
            'success': True,
            'data': self._serialize(settings),
            'outlet': serialize_outlet(outlet),
        }, status=status.HTTP_200_OK)

    # settings that change what the system allows or who is trusted: flagged, not just listed
    _SENSITIVE_FIELDS = {'gst_registered', 'enable_eway_bill', 'enable_einvoice', 'allowed_attendance_ips', 'attendance_latitude', 'attendance_longitude',
                         'attendance_radius_meters', 'gstin', 'drug_license_no', 'min_margin_warning_pct'}

    def _audit_changes(self, request, outlet, settings, before, outlet_before, outlet_now):
        """One event for the settings that really changed and, separately, one for a changed secret (the value is never stored)."""
        try:
            from apps.audit import recorder
            changed, secrets = [], []
            for name, old in before.items():
                new = getattr(settings, name)
                if str(old) != str(new) and name not in ('updated_at', 'id', 'outlet'):
                    (secrets if recorder.is_sensitive(name) else changed).append((name, old, new))
            for name, old in outlet_before.items():
                new = getattr(outlet_now, name)
                if str(old) != str(new):
                    changed.append((name, old, new))
            if secrets:
                recorder.safe_record('settings.secret_changed', actor=request.user, outlet=outlet, request=request, module='settings', action='UPDATE', entity_type='OutletSettings',
                                     entity_label=outlet.name, ctx={'what': ', '.join(recorder.label_of(n).lower() for n, _, _ in secrets)},
                                     changes=[{'field': n, 'before': old, 'after': new} for n, old, new in secrets], metadata={'fields': [n for n, _, _ in secrets]})
            if changed:
                names = [n for n, _, _ in changed]
                recorder.safe_record('settings.changed', actor=request.user, outlet=outlet, request=request, module='settings', action='UPDATE', entity_type='OutletSettings',
                                     entity_label=outlet.name, ctx={'what': ', '.join(recorder.label_of(n).lower() for n in names[:6]) + (f' and {len(names) - 6} more' if len(names) > 6 else '')},
                                     changes=[{'field': n, 'before': old, 'after': new} for n, old, new in changed],
                                     metadata={'fields': names, 'sensitive': any(n in self._SENSITIVE_FIELDS for n in names)})
        except Exception:
            import logging
            logging.getLogger(__name__).exception('could not audit the settings change')

