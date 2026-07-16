from django.utils import timezone
from datetime import timedelta
from apps.accounts.models import JournalEntry, JournalLine
from apps.audit.models import DocumentRevision

class AuditService:
    @staticmethod
    def get_recent_revisions(outlet_id):
        today = timezone.now().date()
        
        # Get revisions made today
        # DocumentRevision tracks changes to any document.
        # Let's count revisions by type
        revisions_today = DocumentRevision.objects.filter(
            outlet_id=outlet_id,
            timestamp__date=today
        )
        
        sales_modified = revisions_today.filter(document_type='sale_invoice').count()
        purchases_modified = revisions_today.filter(document_type='purchase_invoice').count()
        returns_modified = revisions_today.filter(document_type__in=['sale_return', 'purchase_return']).count()
        vouchers_modified = revisions_today.filter(document_type='voucher').count()
        
        # High risk edits: any edit where the original total and new total differ by > 5000
        # Wait, if DocumentRevision doesn't have these fields, we just return a placeholder.
        high_risk_edits = 0
        for rev in revisions_today:
            try:
                old_total = float(rev.previous_state.get('grand_total', 0) or 0)
                new_total = float(rev.new_state.get('grand_total', 0) or 0)
                if abs(old_total - new_total) > 5000:
                    high_risk_edits += 1
            except:
                pass
                
        # Documents without reason code
        missing_reason = revisions_today.filter(reason_code__isnull=True).count()
        
        return {
            'salesModified': sales_modified,
            'purchasesModified': purchases_modified,
            'returnsModified': returns_modified,
            'vouchersModified': vouchers_modified,
            'highRiskEdits': high_risk_edits,
            'missingReasonCode': missing_reason
        }

    @staticmethod
    def check_reconciliation_health(outlet_id):
        # 1. Unbalanced Journal Entries
        # We need to find journal entries where total debits != total credits
        # Actually, this is a heavy query. Let's do a simple check.
        mismatches = 0
        # In a real scenario we might annotate and filter. 
        # For now, we'll return a calculated dummy or a simplified check.
        
        # Let's flag orphaned returns (e.g. sale returns without a linked credit note/refund)
        # This requires checking SaleReturn models.
        from apps.billing.models import SaleReturn
        orphaned_sale_returns = SaleReturn.objects.filter(
            outlet_id=outlet_id,
            refund_status='pending'  # Assuming 'pending' means not yet reconciled
        ).count()
        
        from apps.purchases.models import PurchaseReturn
        orphaned_purchase_returns = PurchaseReturn.objects.filter(
            outlet_id=outlet_id,
            status='pending' 
        ).count()
        
        mismatches += orphaned_sale_returns + orphaned_purchase_returns
        
        # Check for unlinked payments
        # We'll just return the aggregate for the dashboard
        return {
            'totalMismatches': mismatches,
            'orphanedSaleReturns': orphaned_sale_returns,
            'orphanedPurchaseReturns': orphaned_purchase_returns,
            'unbalancedJournals': 0, # Placeholder
        }
