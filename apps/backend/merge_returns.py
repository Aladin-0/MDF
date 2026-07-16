import os
import django
import sys
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.billing.models import SalesReturn, SalesReturnItem
from apps.accounts.models import JournalEntry
from apps.audit.models import DocumentRevision
from django.db import transaction

def merge_returns():
    inv_id = "13307384-0bc3-435f-9317-5fb3ad345017" # INV-2026-000211
    
    returns = list(SalesReturn.objects.filter(original_sale_id=inv_id).order_by('created_at'))
    if len(returns) <= 1:
        print("No duplicates found to merge.")
        return
        
    primary = returns[0]
    duplicates = returns[1:]
    
    with transaction.atomic():
        for dup in duplicates:
            print(f"Merging {dup.return_no} into {primary.return_no}")
            
            # Reassign or merge items
            dup_items = SalesReturnItem.objects.filter(sales_return_id=dup.id)
            for item in dup_items:
                existing_item = SalesReturnItem.objects.filter(
                    sales_return_id=primary.id, 
                    original_sale_item_id=item.original_sale_item_id
                ).first()
                
                if existing_item:
                    existing_item.qty_returned += item.qty_returned
                    existing_item.total_amount += item.total_amount
                    existing_item.save()
                    item.delete()
                else:
                    item.sales_return_id = primary.id
                    item.save()
            
            # Reassign JournalEntries
            JournalEntry.objects.filter(source_id=dup.id).update(source_id=primary.id)
            
            # Reassign DocumentRevisions
            DocumentRevision.objects.filter(object_id=dup.id).update(object_id=primary.id)
            
            # Update primary total
            primary.total_amount += dup.total_amount
            
            # Get ContentType for SalesReturn
            from django.contrib.contenttypes.models import ContentType
            sales_return_ct = ContentType.objects.get_for_model(SalesReturn)

            # Create a revision for the merge
            DocumentRevision.objects.create(
                outlet=primary.outlet,
                content_type=sales_return_ct,
                object_id=primary.id,
                revision_number=f"{primary.return_no}-MERGE",
                revision_type='correction',
                reason_code='SYSTEM_MERGE',
                reason_text=f'Merged duplicate return {dup.return_no} into this document',
                diff_summary_json={
                    'merged_from': str(dup.id),
                    'added_amount': float(dup.total_amount)
                }
            )
            
            # Delete duplicate
            dup.delete()
            
        primary.save()
        print(f"Merge successful. Primary return {primary.return_no} now has total amount {primary.total_amount}.")

if __name__ == '__main__':
    merge_returns()
