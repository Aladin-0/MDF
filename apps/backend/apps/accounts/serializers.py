from rest_framework import serializers
from apps.accounts.models import Customer, Doctor, Partner


class DoctorSerializer(serializers.ModelSerializer):
    """Serializer for Doctor profile."""

    class Meta:
        model = Doctor
        fields = [
            'id', 'name', 'phone', 'regNo', 'degree', 'qualification',
            'specialty', 'hospital_name', 'address', 'isActive', 'createdAt'
        ]

    def to_representation(self, instance):
        """Convert snake_case fields to camelCase."""
        data = super().to_representation(instance)
        return {
            'id': data.get('id'),
            'name': data.get('name'),
            'phone': data.get('phone'),
            'regNo': instance.registration_no,
            'degree': data.get('degree'),
            'qualification': data.get('qualification'),
            'specialty': data.get('specialty'),
            'hospitalName': data.get('hospital_name'),
            'address': data.get('address'),
            'isActive': instance.is_active,
            'createdAt': instance.created_at.isoformat(),
        }


class CustomerSerializer(serializers.ModelSerializer):
    """Serializer for Customer profile."""

    class Meta:
        model = Customer
        fields = [
            'id', 'name', 'phone', 'address', 'dob', 'gstin',
            'fixedDiscount', 'creditLimit', 'outstanding',
            'totalPurchases', 'isChronicpatient', 'isActive', 'createdAt'
        ]

    def to_representation(self, instance):
        """Convert snake_case fields to camelCase."""
        data = super().to_representation(instance)
        return {
            'id': data.get('id'),
            'name': data.get('name'),
            'phone': data.get('phone'),
            'address': instance.address,
            'dob': instance.dob.isoformat() if instance.dob else None,
            'gstin': data.get('gstin'),
            'fixedDiscount': float(instance.fixed_discount),
            'creditLimit': float(instance.credit_limit),
            'outstanding': float(instance.outstanding),
            'totalPurchases': float(instance.total_purchases),
            'isChronic': instance.is_chronic,
            'isActive': instance.is_active,
            'createdAt': instance.created_at.isoformat(),
        }


class CustomerCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating Customer."""

    class Meta:
        model = Customer
        fields = [
            'name', 'phone', 'address', 'dob', 'gstin',
            'fixedDiscount', 'creditLimit', 'isChronic'
        ]

    def create(self, validated_data):
        """Create customer and set outlet from request."""
        outlet = self.context['outlet']
        customer = Customer.objects.create(outlet=outlet, **validated_data)
        return customer

    def update(self, instance, validated_data):
        """Update customer fields."""
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class PartnerSerializer(serializers.ModelSerializer):
    """Serializer for Partner."""

    class Meta:
        model = Partner
        fields = ['id', 'name', 'profit_percentage', 'is_active', 'created_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        return {
            'id': data.get('id'),
            'name': data.get('name'),
            'profitPercentage': float(instance.profit_percentage),
            'isActive': instance.is_active,
            'createdAt': instance.created_at.isoformat(),
        }

    def create(self, validated_data):
        outlet = self.context['outlet']
        return Partner.objects.create(outlet=outlet, **validated_data)
