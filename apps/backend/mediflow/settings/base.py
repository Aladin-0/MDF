import environ
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = env('SECRET_KEY')  # Required — must be set in .env; no fallback
FERNET_KEY = env('FERNET_KEY', default='oU1iXjUoG_2EaY5m7nB_n-1P1b2Yh9y2pYk4fJtQj8s=') # 32-url-safe base64
DEBUG = env.bool('DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['backend'])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django.contrib.postgres',
    'django_filters',
    # Local apps
    'apps.core',
    'apps.accounts',
    'apps.inventory',
    'apps.billing',
    'apps.purchases',
    'apps.attendance',
    'apps.reports',
    'apps.audit',
    'apps.gst',
    'rest_framework_simplejwt.token_blacklist',
    'import_export',
    'drf_spectacular',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.audit.middleware.AuditContextMiddleware',
    'apps.audit.core.middleware.AuditContextMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'mediflow.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'mediflow.wsgi.application'

DATABASES = {
    'default': {
        **env.db('DATABASE_URL'),
        'OPTIONS': {
            # Force PostgreSQL session timezone to IST so that all timestamps
            # (both stored and displayed) use Asia/Kolkata time.
            'options': '-c TimeZone=Asia/Kolkata',
        },
    },
    'qa': {
        **env.db('QA_DATABASE_URL', default='postgres://mediflow:mediflow@localhost:5432/mediflow_qa'),
        'OPTIONS': {
            'options': '-c TimeZone=Asia/Kolkata',
        },
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-in'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = False  # Store naive IST datetimes in DB – all services run in Asia/Kolkata (TZ env set in docker-compose)

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'accounts.Staff'

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),   # Full workday session
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.audit.authentication.AuditJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'COERCE_DECIMAL_TO_STRING': True,
}

CORS_ALLOWED_ORIGINS = env.list(
    'CORS_ALLOWED_ORIGINS',
    default=[
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]
)
import os
import sys
CORS_ALLOW_CREDENTIALS = True
CORS_EXPOSE_HEADERS = ['Content-Disposition']

# Celery
if 'test' in sys.argv or os.environ.get('CELERY_TASK_ALWAYS_EAGER') == 'True':
    CELERY_BROKER_URL = 'memory://'
    CELERY_RESULT_BACKEND = 'cache+memory://'
else:
    CELERY_BROKER_URL = env('REDIS_URL', default='redis://redis:6379/0')
    CELERY_RESULT_BACKEND = env('REDIS_URL', default='redis://redis:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Kolkata'

# Cache — use the existing Redis service (db=1 to separate from Celery on db=0)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': env('REDIS_URL', default='redis://redis:6379/1'),
        'TIMEOUT': 120,  # 2 minutes default TTL
        'KEY_PREFIX': 'mediflow',
    }
}

CELERY_TASK_ROUTES = {
    'apps.audit.tasks.create_audit_log_async': {'queue': 'audit'},
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'audit_fallback': {
            'level': 'ERROR',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/app/logs/audit_fallback.log',
            'maxBytes': 1024 * 1024 * 10,
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'audit.fallback': {
            'handlers': ['audit_fallback'],
            'level': 'ERROR',
            'propagate': False,
        },
    },
}

import os
import sys
if 'test' in sys.argv or os.environ.get('CELERY_TASK_ALWAYS_EAGER') == 'True':
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
AUDIT_V2_WRITE_ENABLED = True
AUDIT_V2_READ_ENABLED = True

# GST Sandbox Configuration
SANDBOX_PROVIDER_MODE = env('SANDBOX_PROVIDER_MODE', default='test')
SANDBOX_BASE_URL = env('SANDBOX_BASE_URL', default='https://test-api.sandbox.co.in')
ENABLE_GST_SANDBOX_LIVE_MODE = env.bool('ENABLE_GST_SANDBOX_LIVE_MODE', default=False)
