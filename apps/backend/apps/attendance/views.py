import logging
import calendar
from datetime import datetime, timedelta, time
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from datetime import datetime
from django.db import transaction
import math

from apps.attendance.models import AttendanceRecord
from apps.accounts.models import Staff
from apps.core.models import Outlet, OutletSettings
from apps.core.permissions import IsAdminStaff, ADMIN_ROLES

logger = logging.getLogger(__name__)

def haversine_distance(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return float('inf')
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))

def get_client_ip(request):
    """
    Always use REMOTE_ADDR which is set by the server/reverse proxy and
    CANNOT be forged by the client. Never trust X-Forwarded-For directly
    since a client can set any value for that header.
    """
    # REMOTE_ADDR is the only trustworthy IP — set by the TCP connection itself.
    return request.META.get('REMOTE_ADDR', '')

def validate_attendance_security(request, outlet):
    """Validates if the user is authorized to mark attendance via IP or GPS."""
    # Use get_or_create so missing settings never silently bypasses security
    settings, _ = OutletSettings.objects.get_or_create(outlet=outlet)
    
    allowed_ips = [ip.strip() for ip in settings.allowed_attendance_ips.split(',') if ip.strip()] if settings.allowed_attendance_ips else []
    has_gps = bool(settings.attendance_latitude and settings.attendance_longitude)
    
    # If nothing is configured at all, allow by default
    if not allowed_ips and not has_gps:
        return True, "No security configured"

    # 1. IP Check (fast — always try first)
    client_ip = get_client_ip(request)
    
    # In local development, ::1 and 127.0.0.1 are the same device. Treat them as equivalent.
    loopback_ips = ['127.0.0.1', '::1']
    if client_ip in loopback_ips and any(ip in loopback_ips for ip in allowed_ips):
        return True, "IP Validated (Localhost)"

    if allowed_ips and client_ip in allowed_ips:
        return True, "IP Validated"

    # 2. GPS Check (fallback — only if GPS is configured)
    if has_gps:
        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        if lat is not None and lng is not None:
            distance = haversine_distance(lat, lng, settings.attendance_latitude, settings.attendance_longitude)
            if distance <= settings.attendance_radius_meters:
                return True, "GPS Validated"
            else:
                return False, f"You are {int(distance)} meters away from the outlet. Must be within {settings.attendance_radius_meters}m."
        else:
            # GPS configured but coordinates not sent by frontend
            if allowed_ips:
                return False, "Not connected to the outlet Wi-Fi. Please enable Location Services or connect to Wi-Fi to mark attendance."
            return False, "Please enable Location Services in your browser to mark attendance."

    # IP was configured but check failed, GPS is not configured
    return False, "Please connect to the outlet Wi-Fi to mark attendance."

# Default shift timings (can be moved to AttendanceSettings model later)
DEFAULT_SHIFT_START = time(9, 0)  # 9:00 AM
DEFAULT_SHIFT_END = time(18, 0)   # 6:00 PM
LATE_GRACE_PERIOD_MINUTES = 10


def serialize_attendance_record(record):
    """Serialize AttendanceRecord to response shape."""
    return {
        'id': str(record.id),
        'staffId': str(record.staff_id),
        'staffName': record.staff.name,
        'staff': {
            'id': str(record.staff.id),
            'name': record.staff.name,
            'role': record.staff.role,
        },
        'outletId': str(record.outlet_id),
        'date': record.date.isoformat(),
        'checkInTime': record.check_in_time.isoformat() if record.check_in_time else None,
        'checkOutTime': record.check_out_time.isoformat() if record.check_out_time else None,
        'status': record.status,
        'isLate': record.is_late,
        'lateByMinutes': record.late_by_minutes,
        'workingHours': float(record.working_hours) if record.working_hours else None,
        'checkInPhoto': record.check_in_photo,
        'checkOutPhoto': record.check_out_photo,
        'notes': record.notes,
        'createdAt': record.created_at.isoformat(),
    }


class AttendanceCheckInView(APIView):
    """
    POST /api/v1/attendance/check-in/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data
            outlet_id = payload.get('outletId')
            check_type = payload.get('type', 'check_in')
            photo = payload.get('photoBase64') or payload.get('selfieUrl')

            # SECURITY: Staff can ONLY mark their own attendance.
            # The staffId is taken from the authenticated user, not the request body.
            # This prevents anyone from faking attendance for another person.
            staff_id = str(request.user.id)

            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': 'Outlet not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            try:
                staff = Staff.objects.get(id=staff_id, outlet=outlet)
            except Staff.DoesNotExist:
                return Response(
                    {'error': {'code': 'STAFF_NOT_FOUND', 'message': 'Staff not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )
                
            # Security Validation
            is_valid, reason = validate_attendance_security(request, outlet)
            if not is_valid:
                return Response(
                    {'error': {'code': 'SECURITY_REJECTED', 'message': reason}},
                    status=status.HTTP_403_FORBIDDEN
                )

            today = datetime.now().date()
            current_time = datetime.now().time()
            
            client_ip = get_client_ip(request)
            user_agent = request.META.get('HTTP_USER_AGENT', '')[:250]
            lat = request.data.get('latitude')
            lng = request.data.get('longitude')

            with transaction.atomic():
                record, created = AttendanceRecord.objects.get_or_create(
                    outlet=outlet,
                    staff=staff,
                    date=today,
                    defaults={'status': 'present'}
                )

                if check_type == 'check_in':
                    if record.check_in_time:
                        return Response(
                            {'error': {'code': 'ALREADY_CHECKED_IN', 'message': 'Already checked in today'}},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    record.check_in_time = current_time
                    record.check_in_photo = photo
                    record.check_in_ip = client_ip
                    record.check_in_device = user_agent
                    if lat and lng:
                        record.check_in_lat = lat
                        record.check_in_lng = lng

                    grace_end = datetime.combine(today, DEFAULT_SHIFT_START) + timedelta(minutes=LATE_GRACE_PERIOD_MINUTES)
                    current_datetime = datetime.combine(today, current_time)

                    if current_datetime > grace_end:
                        record.is_late = True
                        late_delta = current_datetime - datetime.combine(today, DEFAULT_SHIFT_START)
                        record.late_by_minutes = int(late_delta.total_seconds() / 60)
                        record.status = 'late'
                    else:
                        record.status = 'present'

                elif check_type == 'check_out':
                    if not record.check_in_time:
                        return Response(
                            {'error': {'code': 'NOT_CHECKED_IN', 'message': 'No check-in record found for today'}},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    if record.check_out_time:
                        return Response(
                            {'error': {'code': 'ALREADY_CHECKED_OUT', 'message': 'Already checked out today'}},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    record.check_out_time = current_time
                    record.check_out_photo = photo
                    record.check_out_ip = client_ip
                    record.check_out_device = user_agent
                    if lat and lng:
                        record.check_out_lat = lat
                        record.check_out_lng = lng

                    check_in_datetime = datetime.combine(today, record.check_in_time)
                    check_out_datetime = datetime.combine(today, current_time)
                    working_seconds = (check_out_datetime - check_in_datetime).total_seconds()
                    working_hours = Decimal(str(round(working_seconds / 3600, 2)))
                    record.working_hours = working_hours

                record.save()

            return Response(serialize_attendance_record(record), status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Error processing attendance: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to process attendance'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AttendanceCheckOutView(APIView):
    """
    POST /api/v1/attendance/check-out/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data
            staff_id = payload.get('staffId')
            photo = payload.get('photo')

            staff = Staff.objects.get(id=staff_id)
            today = datetime.now().date()
            current_time = datetime.now().time()

            try:
                record = AttendanceRecord.objects.get(staff=staff, date=today, check_out_time__isnull=True)
            except AttendanceRecord.DoesNotExist:
                return Response({'error': {'code': 'NOT_FOUND', 'message': 'No active check-in found'}}, status=400)
                
            # Security Validation
            is_valid, reason = validate_attendance_security(request, staff.outlet)
            if not is_valid:
                return Response(
                    {'error': {'code': 'SECURITY_REJECTED', 'message': reason}},
                    status=status.HTTP_403_FORBIDDEN
                )

            record.check_out_time = current_time
            if photo:
                record.check_out_photo = photo
                
            client_ip = get_client_ip(request)
            user_agent = request.META.get('HTTP_USER_AGENT', '')[:250]
            lat = request.data.get('latitude')
            lng = request.data.get('longitude')
            
            record.check_out_ip = client_ip
            record.check_out_device = user_agent
            if lat and lng:
                record.check_out_lat = lat
                record.check_out_lng = lng
                
            check_in_dt = datetime.combine(today, record.check_in_time)
            check_out_dt = datetime.combine(today, current_time)
            working_seconds = (check_out_dt - check_in_dt).total_seconds()
            
            record.working_hours = Decimal(str(round(working_seconds / 3600, 2)))
            record.save()
            return Response(serialize_attendance_record(record), status=status.HTTP_200_OK)

        except Staff.DoesNotExist:
            return Response({'error': {'code': 'STAFF_NOT_FOUND', 'message': 'Staff not found'}}, status=404)
        except Exception as e:
            logger.error(f"Error check out: {e}")
            return Response({'error': 'Failed'}, status=500)


class AttendanceTodayView(APIView):
    """
    GET /api/v1/attendance/today/?outletId=xxx
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
        
        today = datetime.now().date()
        records = AttendanceRecord.objects.filter(outlet=outlet, date=today).select_related('staff')
        
        # Data isolation: Non-admins can only see their own attendance
        if request.user.role not in ADMIN_ROLES:
            records = records.filter(staff_id=request.user.id)
        
        results = [serialize_attendance_record(r) for r in records]
        return Response(results, status=status.HTTP_200_OK)


class AttendanceMonthlyView(APIView):
    """
    GET /api/v1/attendance/?outletId=xxx&month=2026-03
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        month_str = request.query_params.get('month') # expected YYYY-MM
        staff_id = request.query_params.get('staffId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
            
        qs = AttendanceRecord.objects.filter(outlet=outlet).select_related('staff')
        
        if month_str:
            try:
                year, month = map(int, month_str.split('-'))
                qs = qs.filter(date__year=year, date__month=month)
            except ValueError:
                pass
                
        # Data isolation: Non-admins can only see their own attendance
        if request.user.role not in ADMIN_ROLES:
            qs = qs.filter(staff_id=request.user.id)
        elif staff_id:
            qs = qs.filter(staff_id=staff_id)
            
        results = [serialize_attendance_record(r) for r in qs.order_by('date', 'staff__name')]
        return Response(results, status=status.HTTP_200_OK)


class AttendanceSummaryView(APIView):
    """
    GET /api/v1/attendance/summary/?outletId=xxx&month=2026-03
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        month_str = request.query_params.get('month') 
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
            
        if not month_str:
            return Response({'detail': 'month parameter is required'}, status=400)
            
        try:
            year, month = map(int, month_str.split('-'))
        except ValueError:
            return Response({'detail': 'invalid month format'}, status=400)
        
        staff_list = Staff.objects.filter(outlet=outlet, is_active=True)
        records = AttendanceRecord.objects.filter(
            outlet=outlet, 
            date__year=year, 
            date__month=month
        )
        
        # Data isolation: Non-admins can only see their own attendance
        if request.user.role not in ADMIN_ROLES:
            staff_list = staff_list.filter(id=request.user.id)
            records = records.filter(staff_id=request.user.id)
        
        _, num_days = calendar.monthrange(year, month)
        
        results = []
        for staff in staff_list:
            staff_records = [r for r in records if r.staff_id == staff.id]
            
            present_days = sum(1 for r in staff_records if r.status in ['present', 'late'])
            late_days = sum(1 for r in staff_records if r.status == 'late' or r.is_late)
            absent_days = sum(1 for r in staff_records if r.status == 'absent')
            half_days = sum(1 for r in staff_records if r.status == 'half_day')
            total_hours = sum((r.working_hours or 0) for r in staff_records)
            
            check_ins = [datetime.combine(r.date, r.check_in_time) for r in staff_records if r.check_in_time]
            avg_check_in = None
            if check_ins:
                avg_seconds = sum((ci.hour * 3600 + ci.minute * 60 + ci.second) for ci in check_ins) / len(check_ins)
                h = int(avg_seconds // 3600)
                m = int((avg_seconds % 3600) // 60)
                avg_check_in = f"{h:02d}:{m:02d}:00"
                
            attendance_pct = (present_days / num_days) * 100 if num_days > 0 else 0
            
            results.append({
                'staffId': str(staff.id),
                'staffName': staff.name,
                'role': staff.role,
                'month': month,
                'year': year,
                'totalWorkingDays': num_days,
                'presentDays': present_days,
                'absentDays': absent_days,
                'lateDays': late_days,
                'halfDays': half_days,
                'totalHoursWorked': float(total_hours),
                'avgCheckInTime': avg_check_in or "00:00:00",
                'attendancePct': round(attendance_pct, 1)
            })
            
        return Response(results, status=status.HTTP_200_OK)


class AttendanceManualView(APIView):
    """
    POST /api/v1/attendance/manual/
    SECURITY: Requires Admin or Super Admin. Regular staff CANNOT call this.
    """
    permission_classes = [IsAdminStaff]  # Only admin & super_admin can manually mark attendance

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        staff_id = request.data.get('staffId')
        date_str = request.data.get('date')
        status_val = request.data.get('status')
        notes = request.data.get('notes')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
            staff = Staff.objects.get(id=staff_id, outlet=outlet)
        except (Outlet.DoesNotExist, Staff.DoesNotExist):
            return Response({'detail': 'Outlet or Staff not found'}, status=404)
            
        try:
            record_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except TypeError:
             return Response({'detail': 'Date string required'}, status=400)
        
        record, created = AttendanceRecord.objects.get_or_create(
            outlet=outlet,
            staff=staff,
            date=record_date,
            defaults={'status': status_val}
        )
        
        record.status = status_val
        record.notes = notes
        
        check_in = request.data.get('checkInTime')
        check_out = request.data.get('checkOutTime')
        if check_in:
            record.check_in_time = datetime.strptime(check_in, '%H:%M:%S').time() if len(check_in) > 5 else datetime.strptime(check_in, '%H:%M').time()
        if check_out:
            record.check_out_time = datetime.strptime(check_out, '%H:%M:%S').time() if len(check_out) > 5 else datetime.strptime(check_out, '%H:%M').time()
            
        if record.check_in_time and record.check_out_time:
            ci = datetime.combine(record_date, record.check_in_time)
            co = datetime.combine(record_date, record.check_out_time)
            record.working_hours = Decimal(str(round((co - ci).total_seconds() / 3600, 2)))
            
        record.save()
        
        return Response(serialize_attendance_record(record), status=status.HTTP_200_OK)


class AttendanceMyIpView(APIView):
    """
    GET /api/v1/attendance/my-ip/
    Returns the client IP address as seen by the backend server.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response({'ip': get_client_ip(request)})
