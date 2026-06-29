from rest_framework import serializers
from .models import SaleItem, SaleInvoice, BillRevision
from apps.accounts.models import Customer, Doctor
from .utils.pricing import validate_sale_price
from apps.inventory.models import Batch

class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = '__all__'

    def validate(self, data):
        # Support either rate or sale_rate from payload depending on fields
        sale_rate = data.get('rate') or data.get('sale_rate')
        batch = data.get('batch')
        
        # Get pharmacy_id from context (e.g., from viewset)
        request = self.context.get('request')
        pharmacy_id = None
        
        # Determine pharmacy_id structure based on user model/view structure
        if request and hasattr(request, 'user'):
            if hasattr(request.user, 'pharmacy_id'):
                pharmacy_id = request.user.pharmacy_id
            elif hasattr(request.user, 'outlet_id'):
                pharmacy_id = request.user.outlet_id
            
        # Fallback if provided explicitly in data instead
        if not pharmacy_id and request and 'outletId' in request.data:
            pharmacy_id = request.data['outletId']

        if sale_rate and batch and pharmacy_id:
            # If batch is an ID and not an object yet, get the object
            if not isinstance(batch, Batch):
                try:
                    batch = Batch.objects.get(id=batch)
                except Batch.DoesNotExist:
                    raise serializers.ValidationError({"batch": "Invalid batch ID"})

            result = validate_sale_price(sale_rate, batch, pharmacy_id)
            if result.get('block'):
                raise serializers.ValidationError({
                    'sale_rate': result['message'],
                    'landing_cost': str(result['landing_cost']),
                    'mrp': str(result['mrp'])
                })
        return data

class SaleInvoiceSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, required=False)

    class Meta:
        model = SaleInvoice
        fields = '__all__'

    def create(self, validated_data):
        # To be implemented when moving away from raw views to viewsets
        items_data = validated_data.pop('items', [])
        invoice = SaleInvoice.objects.create(**validated_data)
        for item_data in items_data:
            SaleItem.objects.create(invoice=invoice, **item_data)
        return invoice

class BillRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillRevision
        fields = '__all__'
        depth = 1

from .models import DraftInvoice, DraftInvoiceItem

class DraftInvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftInvoiceItem
        fields = '__all__'
        read_only_fields = ('draft_invoice',)

class DraftInvoiceSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    items = DraftInvoiceItemSerializer(many=True, required=False)
    hospital_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    doctor = serializers.PrimaryKeyRelatedField(queryset=Doctor.objects.all(), required=False, allow_null=True)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    extra_discount_pct = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=0)
    round_off = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)

    class Meta:
        model = DraftInvoice
        fields = '__all__'

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        draft = DraftInvoice.objects.create(**validated_data)
        for item_data in items_data:
            DraftInvoiceItem.objects.create(draft_invoice=draft, **item_data)
        return draft

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Update header
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Replace items fully
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                DraftInvoiceItem.objects.create(draft_invoice=instance, **item_data)
                
        return instance

from .models import Quotation, QuotationItem

class QuotationItemSerializer(serializers.ModelSerializer):
    product = serializers.UUIDField(source='batch.product_id', read_only=True)
    
    class Meta:
        model = QuotationItem
        fields = '__all__'
        read_only_fields = ('quotation',)

class QuotationSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True, required=False)
    
    class Meta:
        model = Quotation
        fields = '__all__'

    def to_representation(self, instance):
        repr = super().to_representation(instance)
        if instance.customer:
            repr['customer'] = {
                'id': str(instance.customer.id),
                'name': instance.customer.name,
                'phone': getattr(instance.customer, 'phone', ''),
                'gstin': getattr(instance.customer, 'gstin', '')
            }
        return repr

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        quotation = Quotation.objects.create(**validated_data)
        for item_data in items_data:
            QuotationItem.objects.create(quotation=quotation, **item_data)
        return quotation

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Update header
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Replace items fully
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                QuotationItem.objects.create(quotation=instance, **item_data)
                
        return instance
