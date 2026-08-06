from .base import *

DATABASES = {
    'default': {
        **env.db('DATABASE_URL', default='postgres://mediflow:mediflow@localhost:5432/mediflow_test'),
        'OPTIONS': {
            'options': '-c TimeZone=Asia/Kolkata',
        },
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
