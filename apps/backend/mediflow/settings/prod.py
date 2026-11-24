from .base import *

DEBUG = False
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=[])
CORS_ALLOW_ALL_ORIGINS = False

STATIC_ROOT = '/app/staticfiles'

# Keep each worker's database connection open between requests instead of opening a new one per request.
# Lives here (not base.py) because production bind-mounts its own base.py. Health checks drop a dead
# connection (e.g. after a Postgres restart) before it is reused. Set CONN_MAX_AGE=0 in .env to turn off.
DATABASES['default']['CONN_MAX_AGE'] = env.int('CONN_MAX_AGE', default=60)
DATABASES['default']['CONN_HEALTH_CHECKS'] = True

# ── Background jobs (Celery): the purchase-bill OCR scans ────────────────────────────────────────────────────────────
# Real scans take ~30 s (longest seen in production: 56 s). A scan that hangs used to hold one of the two workers for
# ever. After 4 minutes the job is told to stop (it reports "scan failed", the screen offers Retry); at 5 minutes a job
# that ignores that is killed and the worker replaced. Each worker takes the next job only when it is free (a quick
# one-page scan no longer waits behind a long one it had already grabbed), and a job is acknowledged only when done,
# so a worker crash puts it back in the queue (a job killed by the time limit is NOT retried: no endless loops).
CELERY_TASK_SOFT_TIME_LIMIT = env.int('CELERY_TASK_SOFT_TIME_LIMIT', default=240)
CELERY_TASK_TIME_LIMIT = env.int('CELERY_TASK_TIME_LIMIT', default=300)
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = False
CELERY_RESULT_EXPIRES = 3600          # results nobody reads are not kept in Redis for a day

# ── Cache in its own Redis database ─────────────────────────────────────────────────────────────────────────────────
# REDIS_URL (…/0) is the job queue; the cache used the same database, so clearing the cache could drop queued scans and
# the cache could never be given a memory limit safely. The cache now uses database 1 of the same Redis server.
if CACHES['default']['BACKEND'].endswith('RedisCache'):
    from urllib.parse import urlsplit, urlunsplit
    _cache = urlsplit(CACHES['default']['LOCATION'])
    CACHES['default']['LOCATION'] = urlunsplit(_cache._replace(path='/' + env('CACHE_REDIS_DB', default='1')))

# ── API ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# JSON only: DRF's browsable HTML pages are a developer tool, not something the shop's screens use.
REST_FRAMEWORK = {**REST_FRAMEWORK, 'DEFAULT_RENDERER_CLASSES': ('rest_framework.renderers.JSONRenderer',)}
# The OpenAPI schema (/api/schema/) describes every endpoint and is expensive to build: signed-in users only.
SPECTACULAR_SETTINGS = {**globals().get('SPECTACULAR_SETTINGS', {}), 'SERVE_PERMISSIONS': ['apps.core.permissions.IsAuthenticated']}
# nginx already compresses API answers (gzip, nginx/nginx.conf); compressing them in Django too only spent CPU in the
# few gunicorn workers.
MIDDLEWARE = [m for m in MIDDLEWARE if m != 'django.middleware.gzip.GZipMiddleware']
