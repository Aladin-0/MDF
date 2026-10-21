from .base import *

# Default to DEBUG=True in dev unless overridden in .env
DEBUG = env.bool('DEBUG', default=True)

# In development with DEBUG=True, allow all local network hosts (e.g. tablet testing)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])
if DEBUG and '*' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('*')

# In dev, we can allow all CORS origins or specify them
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
