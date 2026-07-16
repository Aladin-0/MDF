import re

with open("apps/backend/apps/billing/views.py", "r") as f:
    content = f.read()

# SaleDetailView.put
sale_detail_put_target = """        try:
            invoice = atomic_sale_update(sale_id, request.data, outlet_id, updated_by_id)
            return Response({'id': str(invoice.id), 'message': 'Sale invoice updated successfully'}, status=status.HTTP_200_OK)
        except SaleServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error updating sale invoice: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)"""

sale_detail_put_replacement = """        try:
            with transaction.atomic():
                from apps.audit.core.registry import SnapshotBuilderRegistry
                from apps.audit.core import orchestrator
                from apps.billing.models import SaleInvoice
                
                invoice_record = SaleInvoice.objects.get(id=sale_id, outlet_id=outlet_id)
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice_record)
    
                invoice = atomic_sale_update(sale_id, request.data, outlet_id, updated_by_id)
    
                invoice.refresh_from_db()
                new_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)
    
                revision = orchestrator.record_revision(
                    entity=invoice,
                    action=request.data.get('revisionAction') or 'UPDATE',
                    old_snapshot=old_snapshot,
                    new_snapshot=new_snapshot,
                    reason_code='direct_edit',
                    reason_text='Direct API edit'
                )
                orchestrator.record_activity(
                    action=request.data.get('revisionAction') or 'UPDATE',
                    module='billing',
                    entity=invoice,
                    reason_code='direct_edit',
                    reason_text='Direct API edit'
                )

            return Response({'id': str(invoice.id), 'message': 'Sale invoice updated successfully', 'revisionId': str(revision.id) if revision else ''}, status=status.HTTP_200_OK)
        except SaleInvoice.DoesNotExist:
            return Response({'detail': 'Sale not found'}, status=status.HTTP_404_NOT_FOUND)
        except SaleServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error updating sale invoice: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)"""

content = content.replace(sale_detail_put_target, sale_detail_put_replacement)


# SaleReviseView.post
# 1. Remove @transaction.atomic from post
content = content.replace("    @transaction.atomic\n    def post(self, request, sale_id, *args, **kwargs):", "    def post(self, request, sale_id, *args, **kwargs):")

# 2. Wrap try block
sale_revise_post_target = """        from apps.billing.revision_service import build_invoice_snapshot, create_bill_revision_record
        from apps.billing.sale_update_service import atomic_sale_update, cancel_invoice, SaleServiceError

        try:
            # 1. Take pre-update snapshot
            old_snapshot = build_invoice_snapshot(invoice)

            if action == 'cancel_and_reissue':
                # 2a. Cancel the old invoice
                cancel_invoice(str(invoice.id), str(request.user.id), reason_text)
                invoice.refresh_from_db()
                
                # 3a. Create the replacement invoice via the creation view logic
                # We reuse the post method logic to ensure identical behavior
                # Set a dummy request data so DRF view post handles it natively
                from apps.billing.views import SaleCreateView
                # Clear revisionAction from data to avoid looping or confusing the creation flow
                data_copy = request.data.copy()
                data_copy.pop('revisionAction', None)
                data_copy.pop('revisionReasonCode', None)
                data_copy.pop('revisionReasonText', None)
                
                # Instantiate view directly to preserve DRF authentication context
                create_view_instance = SaleCreateView()
                create_view_instance.request = request
                create_view_instance.format_kwarg = None
                
                # Temporarily override request data
                original_data = request._full_data
                request._full_data = data_copy
                try:
                    response = create_view_instance.post(request)
                finally:
                    request._full_data = original_data
                
                if response.status_code != 200 and response.status_code != 201:
                    # Rollback the transaction
                    raise SaleServiceError(f"Failed to create replacement invoice: {response.data}")
                
                new_invoice_id = response.data.get('id')
                updated_invoice = SaleInvoice.objects.get(id=new_invoice_id)
                new_snapshot = build_invoice_snapshot(updated_invoice)
                
                # 4a. Create revision record linking both
                revision = create_bill_revision_record(
                    invoice=invoice,
                    revision_type=action,
                    old_snapshot=old_snapshot,
                    new_snapshot=new_snapshot,
                    modified_by=request.user,
                    reason_code=reason_code,
                    reason_text=reason_text,
                )
                revision.resulting_invoice_id = updated_invoice.id
                revision.save(update_fields=['resulting_invoice_id'])
                
            else:
                # 2b. Perform the actual update using existing robust method
                updated_invoice = atomic_sale_update(sale_id, request.data, outlet_id, str(request.user.id))
                
                # 3b. Refresh and take post-update snapshot
                updated_invoice.refresh_from_db()
                new_snapshot = build_invoice_snapshot(updated_invoice)
                
                # 4b. Create revision record
                revision = create_bill_revision_record(
                    invoice=updated_invoice,
                    revision_type=action,
                    old_snapshot=old_snapshot,
                    new_snapshot=new_snapshot,
                    modified_by=request.user,
                    reason_code=reason_code,
                    reason_text=reason_text
                )
                
            return Response({'id': str(updated_invoice.id), 'message': 'Sale invoice revised successfully', 'revisionId': str(revision.id)}, status=status.HTTP_200_OK)

        except SaleServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error revising sale invoice: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)"""


sale_revise_post_replacement = """        from apps.audit.core.orchestrator import record_revision, record_activity
        from apps.audit.core.registry import SnapshotBuilderRegistry
        from apps.billing.sale_update_service import atomic_sale_update, cancel_invoice, SaleServiceError

        try:
            with transaction.atomic():
                old_snapshot = SnapshotBuilderRegistry.build_snapshot(invoice)
    
                if action == 'cancel_and_reissue':
                    cancel_invoice(str(invoice.id), str(request.user.id), reason_text)
                    invoice.refresh_from_db()
                    
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
                        response = create_view_instance.post(request)
                    finally:
                        request._full_data = original_data
                    
                    if response.status_code != 200 and response.status_code != 201:
                        raise SaleServiceError(f"Failed to create replacement invoice: {response.data}")
                    
                    new_invoice_id = response.data.get('id')
                    updated_invoice = SaleInvoice.objects.get(id=new_invoice_id)
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)
                    new_snapshot['_resulting_invoice_id'] = str(updated_invoice.id)
                    
                    revision = record_revision(
                        entity=invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    record_activity(
                        action=action,
                        module='billing',
                        entity=invoice,
                        metadata={'resulting_invoice_id': str(updated_invoice.id)},
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    
                else:
                    updated_invoice = atomic_sale_update(sale_id, request.data, outlet_id, str(request.user.id))
                    updated_invoice.refresh_from_db()
                    new_snapshot = SnapshotBuilderRegistry.build_snapshot(updated_invoice)
                    
                    revision = record_revision(
                        entity=invoice,
                        action=action,
                        old_snapshot=old_snapshot,
                        new_snapshot=new_snapshot,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )
                    record_activity(
                        action=action,
                        module='billing',
                        entity=invoice,
                        reason_code=reason_code,
                        reason_text=reason_text
                    )

            # Return response outside atomic block
            detail_view = SaleDetailView()
            detail_view.request = request
            detail_view.format_kwarg = None
            response = detail_view.get(request, sale_id=updated_invoice.id)

            if response.status_code == 200:
                result = response.data
                result['message'] = 'Sale invoice revised successfully'
                result['revisionId'] = str(revision.id) if revision else ''
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response({'id': str(updated_invoice.id), 'message': 'Sale invoice revised successfully', 'revisionId': str(revision.id) if revision else ''}, status=status.HTTP_200_OK)

        except SaleServiceError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error revising sale invoice: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)"""

if sale_detail_put_target not in content:
    print("FAILED TO MATCH SaleDetailView.put target")
if sale_revise_post_target not in content:
    print("FAILED TO MATCH SaleReviseView.post target")
    
content = content.replace(sale_revise_post_target, sale_revise_post_replacement)

with open("apps/backend/apps/billing/views.py", "w") as f:
    f.write(content)
