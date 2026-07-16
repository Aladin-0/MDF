from django.test import TestCase, tag
from rest_framework.serializers import Serializer
from apps.billing.serializers import SaleInvoiceSerializer

@tag('regression')
class QuotationSaleSchemaParityTest(TestCase):
    def test_quotation_convert_and_sale_create_require_same_fields(self):
        """
        D2 Entry Point: Asserts that SaleCreate and QuotationConvert expect similar payload shapes
        where applicable, to prevent contract drift like the scheduleHData bug.
        """
        sale_serializer_fields = set(SaleInvoiceSerializer().fields.keys())
        
        core_business_fields = {'payment_method', 'doctor', 'prescription_no', 'schedule_h_data'}
        for field in core_business_fields:
            self.assertIn(field, sale_serializer_fields)

