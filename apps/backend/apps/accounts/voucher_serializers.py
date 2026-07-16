from rest_framework import serializers
from apps.accounts.models import (
    LedgerGroup, Ledger, Voucher, VoucherLine, VoucherBillAdjustment,
    DebitNote, DebitNoteItem, CreditNote, CreditNoteItem,
)


class LedgerGroupSerializer(serializers.ModelSerializer):
    parentId = serializers.UUIDField(source='parent_id', allow_null=True, read_only=True)

    class Meta:
        model = LedgerGroup
        fields = ['id', 'name', 'nature', 'parentId', 'isSystem']

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'name': instance.name,
            'nature': instance.nature,
            'parentId': str(instance.parent_id) if instance.parent_id else None,
            'isSystem': instance.is_system,
        }


class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ledger
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'name': instance.name,
            'groupId': str(instance.group_id),
            'groupName': instance.group.name,
            'nature': instance.group.nature,
            'openingBalance': float(instance.opening_balance),
            'balanceType': instance.balance_type,
            'currentBalance': float(instance.current_balance),
            'phone': instance.phone,
            'gstin': instance.gstin,
            'address': instance.address,
            'linkedCustomerId': str(instance.linked_customer_id) if instance.linked_customer_id else None,
            'linkedDistributorId': str(instance.linked_distributor_id) if instance.linked_distributor_id else None,
            'isSystem': instance.is_system,
            'createdAt': instance.created_at.isoformat(),
            # Contact
            'station': instance.station,
            'mailTo': instance.mail_to,
            'contactPerson': instance.contact_person,
            'designation': instance.designation,
            'phoneOffice': instance.phone_office,
            'phoneResidence': instance.phone_residence,
            'faxNo': instance.fax_no,
            'website': instance.website,
            'email': instance.email,
            'pincode': instance.pincode,
            # Compliance
            'freezeUpto': str(instance.freeze_upto) if instance.freeze_upto else None,
            'dlNo': instance.dl_no,
            'dlExpiry': str(instance.dl_expiry) if instance.dl_expiry else None,
            'vatNo': instance.vat_no,
            'vatExpiry': str(instance.vat_expiry) if instance.vat_expiry else None,
            'stNo': instance.st_no,
            'stExpiry': str(instance.st_expiry) if instance.st_expiry else None,
            'foodLicenceNo': instance.food_licence_no,
            'foodLicenceExpiry': str(instance.food_licence_expiry) if instance.food_licence_expiry else None,
            'extraHeadingNo': instance.extra_heading_no,
            'extraHeadingExpiry': str(instance.extra_heading_expiry) if instance.extra_heading_expiry else None,
            'panNo': instance.pan_no,
            'itPanNo': instance.it_pan_no,
            # GST / Tax
            'gstHeading': instance.gst_heading,
            'billExport': instance.bill_export,
            'ledgerType': instance.ledger_type,
            # Settings
            'balancingMethod': instance.balancing_method,
            'ledgerCategory': instance.ledger_category,
            'state': instance.state,
            'country': instance.country,
            'color': instance.color,
            'isHidden': instance.is_hidden,
            'retailioId': instance.retailio_id,
        }


class VoucherLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherLine
        fields = ['id', 'ledger', 'debit', 'credit', 'description']

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'ledgerId': str(instance.ledger_id),
            'ledgerName': instance.ledger.name,
            'ledger': {
                'id': str(instance.ledger_id),
                'name': instance.ledger.name,
                'groupName': instance.ledger.group.name if getattr(instance.ledger, 'group', None) else None,
            },
            'debit': float(instance.debit),
            'credit': float(instance.credit),
            'description': instance.description,
        }


class VoucherBillAdjustmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherBillAdjustment
        fields = '__all__'

    def to_representation(self, instance):
        inv_id = None
        inv_no = '—'
        inv_date = None
        grand_total = 0.0
        current_outstanding = 0.0
        inv_type = instance.invoice_type

        if inv_type == 'purchase' and instance.purchase_invoice_id:
            inv = instance.purchase_invoice
            if inv:
                inv_id = str(inv.id)
                inv_no = inv.invoice_no or '—'
                inv_date = str(inv.invoice_date) if inv.invoice_date else None
                grand_total = float(inv.grand_total)
                current_outstanding = float(inv.outstanding)
        elif inv_type == 'sale' and instance.sale_invoice_id:
            inv = instance.sale_invoice
            if inv:
                inv_id = str(inv.id)
                inv_no = inv.invoice_no or '—'
                inv_date = str(inv.invoice_date.date()) if inv.invoice_date else None
                grand_total = float(inv.grand_total)
                # Compute outstanding for sale invoices
                from django.db.models import Sum
                paid = VoucherBillAdjustment.objects.filter(
                    sale_invoice_id=inv.id
                ).aggregate(total=Sum('adjusted_amount'))['total'] or 0
                current_outstanding = max(0.0, float(inv.grand_total) - float(paid))

        return {
            'id': str(instance.id),
            'invoiceId': inv_id,
            'invoiceType': inv_type,
            'invoiceNo': inv_no,
            'invoiceDate': inv_date,
            'grandTotal': grand_total,
            'adjustedAmount': float(instance.adjusted_amount),
            'currentOutstanding': current_outstanding,
        }


class VoucherSerializer(serializers.ModelSerializer):
    lines = VoucherLineSerializer(many=True, read_only=True)

    class Meta:
        model = Voucher
        fields = '__all__'

    def to_representation(self, instance):
        adjustments = instance.bill_adjustments.select_related(
            'purchase_invoice', 'sale_invoice'
        ).all() if hasattr(instance, '_prefetched_objects_cache') or True else []
        return {
            'id': str(instance.id),
            'voucherType': instance.voucher_type,
            'voucherNo': instance.voucher_no,
            'date': str(instance.date),
            'narration': instance.narration,
            'totalAmount': float(instance.total_amount),
            'paymentMode': instance.payment_mode,
            'status': instance.status,
            'createdBy': instance.created_by.name if hasattr(instance, 'created_by') and instance.created_by else None,
            'createdAt': str(instance.created_at),
            'lines': VoucherLineSerializer(instance.lines.all(), many=True).data,
            'billAdjustments': VoucherBillAdjustmentSerializer(adjustments, many=True).data,
        }


class DebitNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebitNoteItem
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'batchId': str(instance.batch_id),
            'productName': instance.product_name,
            'qty': float(instance.qty),
            'rate': float(instance.rate),
            'gstRate': float(instance.gst_rate),
            'total': float(instance.total),
        }


class DebitNoteSerializer(serializers.ModelSerializer):
    items = DebitNoteItemSerializer(many=True, read_only=True)

    class Meta:
        model = DebitNote
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'debitNoteNo': instance.debit_note_no,
            'date': str(instance.date),
            'distributorId': str(instance.distributor_id),
            'distributorName': instance.distributor.name,
            'purchaseInvoiceId': str(instance.purchase_invoice_id) if instance.purchase_invoice_id else None,
            'reason': instance.reason,
            'subtotal': float(instance.subtotal),
            'gstAmount': float(instance.gst_amount),
            'totalAmount': float(instance.total_amount),
            'status': instance.status,
            'items': DebitNoteItemSerializer(instance.items.all(), many=True).data,
            'createdAt': instance.created_at.isoformat(),
            'updatedAt': instance.updated_at.isoformat(),
        }


class CreditNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditNoteItem
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'batchId': str(instance.batch_id),
            'productName': instance.product_name,
            'qty': float(instance.qty),
            'rate': float(instance.rate),
            'gstRate': float(instance.gst_rate),
            'total': float(instance.total),
        }


class CreditNoteSerializer(serializers.ModelSerializer):
    items = CreditNoteItemSerializer(many=True, read_only=True)

    class Meta:
        model = CreditNote
        fields = '__all__'

    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'creditNoteNo': instance.credit_note_no,
            'date': str(instance.date),
            'customerId': str(instance.customer_id) if instance.customer_id else None,
            'customerName': instance.customer.name if instance.customer_id else None,
            'saleInvoiceId': str(instance.sale_invoice_id) if instance.sale_invoice_id else None,
            'reason': instance.reason,
            'subtotal': float(instance.subtotal),
            'gstAmount': float(instance.gst_amount),
            'totalAmount': float(instance.total_amount),
            'status': instance.status,
            'items': CreditNoteItemSerializer(instance.items.all(), many=True).data,
            'createdAt': instance.created_at.isoformat(),
        }
