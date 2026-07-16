import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from apps.billing.tests.test_header_correction import HeaderCorrectionTestCase
from django.test.runner import DiscoverRunner
runner = DiscoverRunner(verbosity=2)
runner.run_tests(['apps.billing.tests.test_header_correction.HeaderCorrectionTestCase.test_header_correction_on_paid_invoice'])
