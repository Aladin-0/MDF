from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0030_customer_email_walk_in_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='saleinvoice',
            name='extra_discount_rupees',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Bill discount as typed in rupees; empty = typed as a percentage. Kept so that modifying the bill keeps those rupees.', max_digits=12, null=True),
        ),
    ]
