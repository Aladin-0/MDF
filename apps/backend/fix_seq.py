import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT MAX(CAST(SUBSTRING(invoice_no FROM '\d+$') AS INTEGER)) FROM billing_saleinvoice WHERE invoice_no LIKE 'INV-%'")
    max_val = cursor.fetchone()[0] or 0
    print(f"Max value: {max_val}")
    
    # Actually we can just update the sequence if it exists.
    # What is the sequence name?
    # Let's see how invoice_no is generated in models.py
