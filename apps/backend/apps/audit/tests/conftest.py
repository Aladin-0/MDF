import pytest
from django.conf import settings

@pytest.fixture(autouse=True)
def force_audit_v1(settings):
    settings.AUDIT_V2_WRITE_ENABLED = False
    settings.AUDIT_V2_READ_ENABLED = False
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
