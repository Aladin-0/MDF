from rest_framework import serializers
from apps.accounts.models import Voucher
from apps.billing.models import SaleInvoice, SaleItem
from apps.purchases.models import PurchaseInvoice, PurchaseItem
from apps.audit.core.registry import SnapshotBuilderRegistry

class VoucherAuditSerializer(serializers.ModelSerializer):
    class Meta:
        model = Voucher
        fields = [
            'id', 'voucher_no', 'date', 'voucher_type', 'total_amount',
            'narration', 'created_at', 'updated_at'
        ]

class SaleItemAuditSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = [
            'id', 'product_name', 'batch_no', 'qty_strips', 'qty_loose',
            'sale_rate', 'rate', 'mrp', 'discount_pct',
            'taxable_amount', 'gst_amount', 'total_amount'
        ]

class SaleInvoiceAuditSerializer(serializers.ModelSerializer):
    items = SaleItemAuditSerializer(many=True, read_only=True)
    header = serializers.SerializerMethodField()
    financial = serializers.SerializerMethodField()
    
    class Meta:
        model = SaleInvoice
        fields = ['id', 'header', 'financial', 'items']
        
    def get_header(self, obj):
        return {
            'invoice_no': obj.invoice_no,
            'invoice_date': obj.invoice_date.isoformat() if obj.invoice_date else None,
            'status': 'cancelled' if getattr(obj, 'is_cancelled', False) else 'posted',
            'customer_name': obj.customer.name if obj.customer else None,
        }
        
    def get_financial(self, obj):
        return {
            'subtotal': str(obj.subtotal) if obj.subtotal is not None else "0.00",
            'discount_amount': str(obj.discount_amount) if obj.discount_amount is not None else "0.00",
            'taxable_amount': str(obj.taxable_amount) if obj.taxable_amount is not None else "0.00",
            'gst_amount': str((obj.cgst_amount or 0) + (obj.sgst_amount or 0) + (obj.igst_amount or 0)),
            'grand_total': str(obj.grand_total) if obj.grand_total is not None else "0.00",
            'amount_due': str(obj.amount_due) if obj.amount_due is not None else "0.00",
            'amount_paid': str(obj.amount_paid) if obj.amount_paid is not None else "0.00",
        }

class PurchaseItemAuditSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='product.name', read_only=True, default='')
    class Meta:
        model = PurchaseItem
        fields = [
            'id', 'name', 'batch_no', 'qty', 'free_qty',
            'purchase_rate', 'mrp', 'discount_pct',
            'taxable_amount', 'gst_amount', 'total_amount'
        ]

class PurchaseInvoiceAuditSerializer(serializers.ModelSerializer):
    items = PurchaseItemAuditSerializer(many=True, read_only=True)
    header = serializers.SerializerMethodField()
    financial = serializers.SerializerMethodField()
    
    class Meta:
        model = PurchaseInvoice
        fields = ['id', 'header', 'financial', 'items']
        
    def get_header(self, obj):
        return {
            'invoice_no': obj.invoice_no,
            'invoice_date': obj.invoice_date.isoformat() if obj.invoice_date else None,
            'distributor_name': obj.distributor.name if obj.distributor else None,
        }
        
    def get_financial(self, obj):
        return {
            'subtotal': str(obj.subtotal) if obj.subtotal is not None else "0.00",
            'discount_amount': str(obj.discount_amount) if obj.discount_amount is not None else "0.00",
            'taxable_amount': str(obj.taxable_amount) if obj.taxable_amount is not None else "0.00",
            'gst_amount': str(obj.gst_amount) if getattr(obj, 'gst_amount', None) is not None else "0.00",
            'grand_total': str(obj.grand_total) if obj.grand_total is not None else "0.00",
            'outstanding': str(obj.outstanding) if getattr(obj, 'outstanding', None) is not None else "0.00",
            'paid_amount': str(obj.paid_amount) if getattr(obj, 'paid_amount', None) is not None else "0.00",
        }

# Return Audit Serializers

class SalesReturnItemAuditSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.billing.models import SalesReturnItem
        model = SalesReturnItem
        fields = ['id', 'product_name', 'batch_no', 'qty_returned', 'return_rate', 'total_amount']

class SalesReturnAuditSerializer(serializers.ModelSerializer):
    items = SalesReturnItemAuditSerializer(many=True, read_only=True)
    header = serializers.SerializerMethodField()
    financial = serializers.SerializerMethodField()

    class Meta:
        from apps.billing.models import SalesReturn
        model = SalesReturn
        fields = ['id', 'header', 'financial', 'items']

    def get_header(self, obj):
        return {
            'return_no': obj.return_no,
            'return_date': obj.return_date.isoformat() if obj.return_date else None,
            'reason': obj.reason,
            'refund_mode': obj.refund_mode,
        }

    def get_financial(self, obj):
        return {
            'total_amount': str(obj.total_amount) if obj.total_amount is not None else "0.00",
        }

class DebitNoteItemAuditSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.accounts.models import DebitNoteItem
        model = DebitNoteItem
        fields = ['id', 'product_name', 'qty', 'rate', 'gst_rate', 'total']

class DebitNoteAuditSerializer(serializers.ModelSerializer):
    items = DebitNoteItemAuditSerializer(many=True, read_only=True)
    header = serializers.SerializerMethodField()
    financial = serializers.SerializerMethodField()

    class Meta:
        from apps.accounts.models import DebitNote
        model = DebitNote
        fields = ['id', 'header', 'financial', 'items']

    def get_header(self, obj):
        return {
            'debit_note_no': obj.debit_note_no,
            'date': obj.date.isoformat() if obj.date else None,
            'reason': obj.reason,
            'status': obj.status,
        }

    def get_financial(self, obj):
        return {
            'subtotal': str(obj.subtotal) if getattr(obj, 'subtotal', None) is not None else "0.00",
            'gst_amount': str(obj.gst_amount) if getattr(obj, 'gst_amount', None) is not None else "0.00",
            'total_amount': str(obj.total_amount) if getattr(obj, 'total_amount', None) is not None else "0.00",
        }

# Register all serializers
from apps.billing.models import SalesReturn
from apps.accounts.models import DebitNote
SnapshotBuilderRegistry.register(Voucher, VoucherAuditSerializer)
SnapshotBuilderRegistry.register(SaleInvoice, SaleInvoiceAuditSerializer)
SnapshotBuilderRegistry.register(PurchaseInvoice, PurchaseInvoiceAuditSerializer)
SnapshotBuilderRegistry.register(SalesReturn, SalesReturnAuditSerializer)
SnapshotBuilderRegistry.register(DebitNote, DebitNoteAuditSerializer)
