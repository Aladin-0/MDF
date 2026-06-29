from rest_framework.test import APITestCase
from django.test import override_settings
from apps.billing.tests.factories import (
    make_test_outlet,
    make_test_customer,
    make_test_medicine,
    make_test_staff,
    make_test_invoice,
    make_test_sales_return,
    make_test_receipt
)

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class BaseRevisionTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.outlet = make_test_outlet()
        cls.customer = make_test_customer(cls.outlet)
        cls.medicine, cls.batch = make_test_medicine(cls.outlet)

        cls.billing_staff = make_test_staff(
            cls.outlet,
            name="Billing Staff",
            phone="1111111111",
            permissions=['can_modify_unpaid_bill', 'can_correct_header_fields']
        )
        
        cls.senior_billing = make_test_staff(
            cls.outlet,
            name="Senior Billing",
            phone="2222222222",
            permissions=[
                'can_modify_unpaid_bill', 'can_correct_header_fields',
                'can_modify_bill_with_return', 'can_correct_rates_discounts',
                'can_correct_quantities'
            ]
        )
        
        cls.manager = make_test_staff(
            cls.outlet,
            name="Manager",
            phone="3333333333",
            permissions=[
                'can_modify_unpaid_bill', 'can_correct_header_fields',
                'can_modify_bill_with_return', 'can_correct_rates_discounts',
                'can_correct_quantities', 'can_modify_paid_bill',
                'can_cancel_and_reissue_bill'
            ]
        )
        
        cls.admin_user = make_test_staff(
            cls.outlet,
            name="Admin",
            phone="4444444444",
            permissions=[
                'can_modify_draft_bill', 'can_modify_unpaid_bill',
                'can_correct_header_fields', 'can_correct_rates_discounts',
                'can_correct_quantities', 'can_modify_bill_with_return',
                'can_modify_paid_bill', 'can_cancel_and_reissue_bill',
                'can_view_bill_revision_history'
            ]
        )
        
        cls.readonly_user = make_test_staff(
            cls.outlet,
            name="Readonly User",
            phone="5555555555",
            permissions=['can_view_bill_revision_history']
        )

    def authenticate_as(self, staff):
        # We need to authenticate using the user object linked to the staff
        self.client.force_authenticate(user=staff.user)
        # Add outletId header
        self.client.credentials(HTTP_OUTLETID=str(staff.outlet.id))
