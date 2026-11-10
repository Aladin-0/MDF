"""
Every (role x permission-flag) combination and the permission list the server grants for it.

The frontend (apps/frontend/lib/permission-matrix.fixture.json) is generated from this and its
local fallback rules are tested against it, so the two implementations cannot drift apart.
Regenerate with:  python manage.py dump_permission_matrix
"""
from apps.core.permissions import ROLE_RANK, effective_permissions

# (JSON key the frontend uses, Staff attribute)
FLAGS = (
    ('canCreatePurchases', 'can_create_purchases'),
    ('canEditPurchases', 'can_edit_purchases'),
    ('canEditSales', 'can_edit_sales'),
    ('canViewPurchaseRates', 'can_view_purchase_rates'),
    ('canAccessReports', 'can_access_reports'),
    ('canViewAuditHistory', 'can_view_audit_history'),
    ('canManagePartners', 'can_manage_partners'),
    ('canExportGst', 'can_export_gst'),
)


class _User:
    """Minimal stand-in for a Staff row (effective_permissions only reads role + flags)."""
    is_authenticated = True

    def __init__(self, role, **flags):
        self.role = role
        for _, attr in FLAGS:
            setattr(self, attr, flags.get(attr, False))


def build_permission_matrix():
    rows = []
    for role in sorted(ROLE_RANK, key=ROLE_RANK.get, reverse=True):
        combos = [{}] + [{attr: True} for _, attr in FLAGS] + [{attr: True for _, attr in FLAGS}]
        for combo in combos:
            flags = {key: bool(combo.get(attr, False)) for key, attr in FLAGS}
            rows.append({
                'role': role,
                'flags': flags,
                'permissions': effective_permissions(_User(role, **combo)),
            })
    return rows
