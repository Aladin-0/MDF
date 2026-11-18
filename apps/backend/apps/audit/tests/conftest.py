import pytest


@pytest.fixture(autouse=True)
def audit_test_settings(settings):
    # events are written synchronously now; these keep any leftover .delay() call eager
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
    # login rate limits and the failed-write counter live in the cache: a private in-memory one per test run, so tests never depend on
    # (or fill up) the shared Redis, and a burst of test logins can not lock the next test out with a 429
    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'audit-tests'}}
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()
