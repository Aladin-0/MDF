# ACTIVITY TRACKING — ACCESS POLICY
# ====================================
# Activity logs are visible ONLY to super administrators.
# This is intentional and must not be weakened without a
# security review.
#
# Super admin = user.role == 'super_admin'
#
# Regular staff: cannot view logs
# Outlet admins: cannot view logs
# Organization admins: cannot view logs (unless they are super admin)
# Super admins: full read-only access to all logs
#
# The logs themselves are written for ALL users and ALL actions.
# Restricting read access does not affect log completeness.

from rest_framework.permissions import BasePermission

class IsSuperAdmin(BasePermission):
    """
    Only super admin users can access activity tracking.
    This strictly checks if the user's role is 'super_admin'.
    """
    message = "Access restricted to super administrators only."
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return getattr(request.user, 'role', None) == 'super_admin'
    
    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
