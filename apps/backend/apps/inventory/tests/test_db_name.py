import pytest
from django.db import connection

@pytest.mark.django_db
def test_print_db_name():
    print(f"\nDB NAME IS: {connection.settings_dict['NAME']}")

