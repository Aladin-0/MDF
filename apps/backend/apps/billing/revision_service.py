from decimal import Decimal
from typing import Dict, Any, Optional
from django.db import transaction
from apps.billing.models import SaleInvoice, BillRevision
from apps.audit.services import log_activity
from apps.accounts.models import Staff
from django.core.serializers.json import DjangoJSONEncoder
import json

def build_invoice_snapshot(invoice: SaleInvoice) -> Dict[str, Any]:
    """
    Build a JSON-serializable snapshot of a SaleInvoice and its items.
    """
    snapshot = {
        'id': str(invoice.id),
        'invoice_no': invoice.invoice_no,
        'invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        'customer_id': str(invoice.customer_id) if invoice.customer_id else None,
        'doctor_id': str(invoice.doctor_id) if invoice.doctor_id else None,
        'subtotal': str(invoice.subtotal),
        'discount_amount': str(invoice.discount_amount),
        'extra_discount_pct': str(invoice.extra_discount_pct),
        'taxable_amount': str(invoice.taxable_amount),
        'cgst_amount': str(invoice.cgst_amount),
        'sgst_amount': str(invoice.sgst_amount),
        'igst_amount': str(invoice.igst_amount),
        'round_off': str(invoice.round_off),
        'grand_total': str(invoice.grand_total),
        'payment_mode': invoice.payment_mode,
        'cash_paid': str(invoice.cash_paid),
        'upi_paid': str(invoice.upi_paid),
        'card_paid': str(invoice.card_paid),
        'credit_given': str(invoice.credit_given),
        'amount_paid': str(invoice.amount_paid),
        'amount_due': str(invoice.amount_due),
        'is_return': invoice.is_return,
        'billed_by_id': str(invoice.billed_by_id) if invoice.billed_by_id else None,
        'items': []
    }
    
    for item in invoice.items.all():
        item_data = {
            'id': str(item.id),
            'batch_id': str(item.batch_id),
            'product_name': item.product_name,
            'qty_strips': item.qty_strips,
            'qty_loose': item.qty_loose,
            'rate': str(item.rate),
            'mrp': str(item.mrp),
            'discount_pct': str(item.discount_pct),
            'taxable_amount': str(item.taxable_amount),
            'gst_amount': str(item.gst_amount),
            'total_amount': str(item.total_amount),
        }
        snapshot['items'].append(item_data)
        
    return snapshot

def compute_bill_revision_diff(old_snapshot: Dict[str, Any], new_snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute differences between old and new invoice snapshots.
    """
    diff = {
        'financial': {},
        'header': {},
        'items_added': [],
        'items_removed': [],
        'items_modified': []
    }
    
    # Financial fields diff
    financial_fields = ['grand_total', 'subtotal', 'taxable_amount', 'amount_paid', 'amount_due']
    for field in financial_fields:
        old_val = old_snapshot.get(field, '0')
        new_val = new_snapshot.get(field, '0')
        if str(old_val) != str(new_val):
            diff['financial'][field] = {
                'old': str(old_val),
                'new': str(new_val)
            }

    # Header fields diff
    header_fields = ['customer_id', 'doctor_id', 'billed_by_id', 'payment_mode']
    for field in header_fields:
        old_val = old_snapshot.get(field)
        new_val = new_snapshot.get(field)
        if str(old_val) != str(new_val):
            diff['header'][field] = {
                'old': str(old_val),
                'new': str(new_val)
            }
            
    # Items diff
    old_items = {item['id']: item for item in old_snapshot.get('items', [])}
    new_items = {item['id']: item for item in new_snapshot.get('items', []) if 'id' in item}
    
    for item_id, old_item in old_items.items():
        if item_id not in new_items:
            diff['items_removed'].append(old_item)
        else:
            new_item = new_items[item_id]
            item_diff = {}
            for k, v in old_item.items():
                if k != 'id' and str(v) != str(new_item.get(k)):
                    item_diff[k] = {'old': v, 'new': new_item.get(k)}
            if item_diff:
                diff['items_modified'].append({
                    'id': item_id,
                    'product_name': old_item.get('product_name'),
                    'changes': item_diff
                })
                
    for item in new_snapshot.get('items', []):
        if 'id' not in item or item['id'] not in old_items:
            diff['items_added'].append(item)
            
    return diff

def build_stock_impact_summary(diff_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate stock impact summary based on differences.
    """
    impact = {'restocked': [], 'deducted': []}
    return impact

def build_payment_impact_summary(diff_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate payment impact summary based on differences.
    """
    impact = {'refund_required': '0', 'additional_collection_required': '0'}
    if 'grand_total' in diff_summary.get('financial', {}):
        old_gt = Decimal(str(diff_summary['financial']['grand_total']['old']))
        new_gt = Decimal(str(diff_summary['financial']['grand_total']['new']))
        if new_gt < old_gt:
            impact['refund_required'] = str(old_gt - new_gt)
        elif new_gt > old_gt:
            impact['additional_collection_required'] = str(new_gt - old_gt)
    return impact

def build_return_impact_summary(diff_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate return impact summary based on differences.
    """
    return {}

def generate_revision_number(invoice: SaleInvoice) -> str:
    """
    Generate the next revision number for an invoice (e.g. INV-2026-0001-R1).
    """
    count = invoice.revisions.count()
    return f"{invoice.invoice_no}-R{count + 1}"

@transaction.atomic
def create_bill_revision_record(
    invoice: SaleInvoice,
    old_snapshot: Dict[str, Any],
    new_snapshot: Dict[str, Any],
    revision_type: str,
    modified_by: Staff,
    reason_code: str,
    reason_text: str,
    status: str = 'applied'
) -> BillRevision:
    """
    Create a BillRevision record and its associated ActivityLog.
    """
    diff_summary = compute_bill_revision_diff(old_snapshot, new_snapshot)
    
    revision_no = generate_revision_number(invoice)
    
    revision = BillRevision.objects.create(
        outlet=invoice.outlet,
        original_invoice=invoice,
        revision_number=revision_no,
        revision_type=revision_type,
        revision_status=status,
        modified_by=modified_by,
        reason_code=reason_code,
        reason_text=reason_text,
        old_snapshot_json=old_snapshot,
        new_snapshot_json=new_snapshot,
        diff_summary_json=diff_summary,
        stock_impact_json=build_stock_impact_summary(diff_summary),
        payment_impact_json=build_payment_impact_summary(diff_summary),
        return_impact_json=build_return_impact_summary(diff_summary)
    )
    
    # Fire business level audit log
    log_activity(
        action="BILL_REVISION_CREATED",
        module="billing",
        entity_type="SaleInvoice",
        entity_id=invoice.id,
        entity_label=f"Revision {revision_no} for {invoice.invoice_no}",
        description=f"Bill revision created: {reason_code} - {reason_text}",
        changes=json.loads(json.dumps(diff_summary, cls=DjangoJSONEncoder)),
        user=modified_by,
        outlet=invoice.outlet
    )
    
    return revision
