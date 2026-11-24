from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Staff.pin_lookup: a receipt that lets the billing counter recognise a PIN without the slow hash check
    (see apps/accounts/pins.py). Starts empty for everyone: a PIN cannot be read back from its hash, so each
    person's receipt is written the first time they type their PIN after this migration.
    """

    dependencies = [
        ('accounts', '0030_customer_email_walk_in_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='staff',
            name='pin_lookup',
            field=models.CharField(blank=True, db_default='', default='', editable=False, max_length=128),
        ),
    ]
