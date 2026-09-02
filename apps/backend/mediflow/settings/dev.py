from .base import *

# Default to DEBUG=True in dev unless overridden in .env
DEBUG = env.bool('DEBUG', default=True)

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1', 'backend'])

# In dev, we can allow all CORS origins or specify them
CORS_ALLOW_ALL_ORIGINS = True
