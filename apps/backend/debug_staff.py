import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
for u in User.objects.all():
    print(f"User ID: {u.id}, phone: {u.phone}, role: {u.role}, is_superuser: {u.is_superuser}, can_modify_settled_returns: {u.can_modify_settled_returns if hasattr(u, 'can_modify_settled_returns') else 'N/A'}")
