import os

services_file = '/home/asta/coding/MDF/apps/backend/apps/purchases/services.py'

with open(services_file, 'r') as f:
    content = f.read()

# 1. Add reason code extraction and validation
reason_logic = """
        reason_code = payload.get('revisionReasonCode')
        reason_text = payload.get('revisionReasonText')
        if purchase_invoice.status == 'posted':
            if not reason_code or not reason_text:
                raise PurchaseServiceError("Editing a posted purchase invoice requires a reason code and explanation.")
            if len(reason_text.strip()) < 10:
                raise PurchaseServiceError("Reason explanation must be at least 10 characters.")

        from apps.purchases.revision_service import build_purchase_snapshot, create_purchase_revision_record
        old_snapshot = build_purchase_snapshot(purchase_invoice)
        from apps.audit.core import flags
        from apps.audit.core.registry import SnapshotBuilderRegistry
        old_snapshot_v2 = SnapshotBuilderRegistry.build_snapshot(purchase_invoice) if flags.is_v2_write_enabled() else {}
"""

# Find where to inject reason logic. Right after checking permissions.
content = content.replace("        old_state = {", reason_logic + "\n        old_state = {", 1)

# 2. Add revision record creation
revision_record_logic = """
        # --- Create Revision Record ---
        new_snapshot = build_purchase_snapshot(purchase_invoice)
        create_purchase_revision_record(
            invoice=purchase_invoice,
            revision_type='MODIFICATION',
            old_snapshot=old_snapshot,
            new_snapshot=new_snapshot,
            modified_by=staff,
            reason_code=reason_code or 'OTHER',
            reason_text=reason_text or 'No reason provided'
        )
        if flags.is_v2_write_enabled():
            new_snapshot_v2 = SnapshotBuilderRegistry.build_snapshot(purchase_invoice)
            from apps.audit.core.orchestrator import AuditOrchestrator
            AuditOrchestrator.record_revision(
                instance=purchase_invoice,
                revision_type='MODIFICATION',
                old_snapshot=old_snapshot_v2,
                new_snapshot=new_snapshot_v2,
                reason_code=reason_code or 'OTHER',
                reason_text=reason_text or 'No reason provided'
            )
"""

# Find where to inject revision record creation. Right after setting new_state, before returning.
content = content.replace("        return purchase_invoice", revision_record_logic + "\n        return purchase_invoice", 1)

with open(services_file, 'w') as f:
    f.write(content)

print("Patched services.py")
