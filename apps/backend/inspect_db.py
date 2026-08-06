import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
django.setup()

from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'billing_saleitem';")
    for row in cursor.fetchall():
        print(row)
