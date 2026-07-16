import sys

def fix_views():
    with open('apps/billing/views.py', 'r') as f:
        content = f.read()

    # 1. Patch SaleDetailView.put
    put_target = """        updated_by_id = str(request.user.id)
        from apps.billing.sale_update_service import atomic_sale_update, SaleServiceError
        from apps.audit.core.orchestrator import AuditOrchestrator
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from django.db import transaction

        try:
            with transaction.atomic():
                # 1. Take pre-update snapshot
                from apps.billing.models import SaleInvoice
                invoice_obj = SaleInvoice.objects.select_for_update().get(id=sale_id, outlet_id=outlet_id)
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice_obj)

                # 2. Perform business logic update
                invoice = atomic_sale_update(sale_id, request.data, outlet_id, updated_by_id)
                invoice.refresh_from_db()

                # 3. Take post-update snapshot
                new_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)

                # 4. Orchestrate audit logs
                orchestrator = AuditOrchestrator(
                    user=request.user,
                    outlet_id=outlet_id,
                    module="billing",
                    request_meta=request.META
                )
                
                # Fetch original revision context if passed, else default to standard PUT update
                action = request.data.get('revisionAction', 'standard_correction')
                reason_code = request.data.get('revisionReasonCode', 'correction')
                reason_text = request.data.get('revisionReasonText', 'Standard update')

                revision = orchestrator.record_revision(
                    entity=invoice,
                    action=action,
                    old_snapshot=old_snapshot,
                    new_snapshot=new_snapshot,
                    reason_code=reason_code,
                    reason_text=reason_text
                )
                
                orchestrator.record_activity(
                    entity=invoice,
                    action=action,
                    description=f"Updated sale invoice {invoice.invoice_no}",
                    metadata={"reason_code": reason_code, "reason_text": reason_text, "revision_id": str(revision.id)}
                )"""

    put_replacement = """        updated_by_id = str(request.user.id)
        from apps.billing.sale_update_service import atomic_sale_update, SaleServiceError
        from apps.audit.core import orchestrator
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from django.db import transaction

        try:
            with transaction.atomic():
                # 1. Take pre-update snapshot
                from apps.billing.models import SaleInvoice
                invoice_obj = SaleInvoice.objects.select_for_update().get(id=sale_id, outlet_id=outlet_id)
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice_obj)

                # 2. Perform business logic update
                invoice = atomic_sale_update(sale_id, request.data, outlet_id, updated_by_id)
                invoice.refresh_from_db()

                # 3. Take post-update snapshot
                new_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)
                
                # Fetch original revision context if passed, else default to standard PUT update
                action = request.data.get('revisionAction', 'standard_correction')
                reason_code = request.data.get('revisionReasonCode', 'correction')
                reason_text = request.data.get('revisionReasonText', 'Standard update')

                revision = orchestrator.record_revision(
                    entity=invoice,
                    action=action,
                    old_snapshot=old_snapshot,
                    new_snapshot=new_snapshot,
                    reason_code=reason_code,
                    reason_text=reason_text
                )
                
                rev_id_str = str(revision.id) if revision else ''
                orchestrator.record_activity(
                    module="billing",
                    entity=invoice,
                    action=action,
                    description=f"Updated sale invoice {invoice.invoice_no}",
                    metadata={"reason_code": reason_code, "reason_text": reason_text, "revision_id": rev_id_str}
                )"""

    if put_target in content:
        content = content.replace(put_target, put_replacement)
        print("Replaced SaleDetailView.put")
    else:
        print("FAILED to replace SaleDetailView.put")
        
    put_response_target = """return Response({'id': str(invoice.id), 'message': 'Sale invoice updated successfully', 'revisionId': str(revision.id)}, status=status.HTTP_200_OK)"""
    put_response_replacement = """return Response({'id': str(invoice.id), 'message': 'Sale invoice updated successfully', 'revisionId': rev_id_str}, status=status.HTTP_200_OK)"""
    if put_response_target in content:
        content = content.replace(put_response_target, put_response_replacement)
        print("Replaced SaleDetailView.put response")
    else:
        print("FAILED to replace SaleDetailView.put response")

    # 2. Patch SaleReviseView.post
    revise_target = """        from apps.billing.sale_update_service import atomic_sale_update, cancel_invoice, SaleServiceError
        from apps.audit.core.orchestrator import AuditOrchestrator
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from django.db import transaction

        try:
            with transaction.atomic():
                # 1. Take pre-update snapshot
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)
                
                orchestrator = AuditOrchestrator(
                    user=request.user,
                    outlet_id=outlet_id,
                    module="billing",
                    request_meta=request.META
                )

                if action == 'cancel_and_reissue':
                    # 2a. Cancel the old invoice
                    cancel_invoice(str(invoice.id), str(request.user.id), reason_text)
                    invoice.refresh_from_db()

                    # 3a. Create the replacement invoice via the creation view logic
                    from apps.billing.views import SaleCreateView
                    data_copy = request.data.copy()
                    data_copy.pop('revisionAction', None)
                    data_copy.pop('revisionReasonCode', None)
                    data_copy.pop('revisionReasonText', None)

                    create_view_instance = SaleCreateView()
                    create_view_instance.request = request
                    create_view_instance.format_kwarg = None

                    original_data = request._full_data
                    request._full_data = data_copy
                    try:
                        create_response = create_view_instance.post(request)
                    finally:
                        request._full_data = original_data

                    if create_response.status_code != 200 and create_response.status_code != 201:
                        raise SaleServiceError(f"Failed to create replacement invoice: {create_response.data}")

                    new_invoice_id = create_response.data.get('id')
                    updated_invoice = SaleInvoice.objects.get(id=new_invoice_id)
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)
                    
                    # Embed the resulting_invoice_id into the metadata so the UI/history can link them
                    new_snapshot['_resulting_invoice_id'] = str(updated_invoice.id)
                    
                    revision = orchestrator.record_revision(
                        entity=invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                    orchestrator.record_activity(
                        entity=invoice,
                        action=action,
                        description=f"Cancelled and reissued sale invoice {invoice.invoice_no}",
                        metadata={"reason_code": reason_code, "reason_text": reason_text, "resulting_invoice_id": str(updated_invoice.id), "revision_id": str(revision.id)}
                    )

                else:
                    # 2b. Perform the actual update using existing robust method
                    updated_invoice = atomic_sale_update(sale_id, request.data, outlet_id, str(request.user.id))

                    # 3b. Refresh and take post-update snapshot
                    updated_invoice.refresh_from_db()
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)

                    # 4b. Create revision record
                    revision = orchestrator.record_revision(
                        entity=updated_invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                    orchestrator.record_activity(
                        entity=updated_invoice,
                        action=action,
                        description=f"Revised sale invoice {updated_invoice.invoice_no} via {action}",
                        metadata={"reason_code": reason_code, "reason_text": reason_text, "revision_id": str(revision.id)}
                    )

            return Response({'id': str(updated_invoice.id), 'message': 'Sale invoice revised successfully', 'revisionId': str(revision.id)}, status=status.HTTP_200_OK)"""

    revise_replacement = """        from apps.billing.sale_update_service import atomic_sale_update, cancel_invoice, SaleServiceError
        from apps.audit.core import orchestrator
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from django.db import transaction

        try:
            with transaction.atomic():
                # 1. Take pre-update snapshot
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)

                if action == 'cancel_and_reissue':
                    # 2a. Cancel the old invoice
                    cancel_invoice(str(invoice.id), str(request.user.id), reason_text)
                    invoice.refresh_from_db()

                    # 3a. Create the replacement invoice via the creation view logic
                    from apps.billing.views import SaleCreateView
                    data_copy = request.data.copy()
                    data_copy.pop('revisionAction', None)
                    data_copy.pop('revisionReasonCode', None)
                    data_copy.pop('revisionReasonText', None)

                    create_view_instance = SaleCreateView()
                    create_view_instance.request = request
                    create_view_instance.format_kwarg = None

                    original_data = request._full_data
                    request._full_data = data_copy
                    try:
                        create_response = create_view_instance.post(request)
                    finally:
                        request._full_data = original_data

                    if create_response.status_code != 200 and create_response.status_code != 201:
                        raise SaleServiceError(f"Failed to create replacement invoice: {create_response.data}")

                    new_invoice_id = create_response.data.get('id')
                    updated_invoice = SaleInvoice.objects.get(id=new_invoice_id)
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)
                    
                    # Embed the resulting_invoice_id into the metadata so the UI/history can link them
                    new_snapshot['_resulting_invoice_id'] = str(updated_invoice.id)
                    
                    revision = orchestrator.record_revision(
                        entity=invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                    rev_id_str = str(revision.id) if revision else ''
                    orchestrator.record_activity(
                        module="billing",
                        entity=invoice,
                        action=action,
                        description=f"Cancelled and reissued sale invoice {invoice.invoice_no}",
                        metadata={"reason_code": reason_code, "reason_text": reason_text, "resulting_invoice_id": str(updated_invoice.id), "revision_id": rev_id_str}
                    )

                else:
                    # 2b. Perform the actual update using existing robust method
                    updated_invoice = atomic_sale_update(sale_id, request.data, outlet_id, str(request.user.id))

                    # 3b. Refresh and take post-update snapshot
                    updated_invoice.refresh_from_db()
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)

                    # 4b. Create revision record
                    revision = orchestrator.record_revision(
                        entity=updated_invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                    rev_id_str = str(revision.id) if revision else ''
                    orchestrator.record_activity(
                        module="billing",
                        entity=updated_invoice,
                        action=action,
                        description=f"Revised sale invoice {updated_invoice.invoice_no} via {action}",
                        metadata={"reason_code": reason_code, "reason_text": reason_text, "revision_id": rev_id_str}
                    )

            return Response({'id': str(updated_invoice.id), 'message': 'Sale invoice revised successfully', 'revisionId': rev_id_str}, status=status.HTTP_200_OK)"""

    if revise_target in content:
        content = content.replace(revise_target, revise_replacement)
        print("Replaced SaleReviseView.post")
    else:
        print("FAILED to replace SaleReviseView.post")
        
    with open('apps/billing/views.py', 'w') as f:
        f.write(content)

fix_views()
