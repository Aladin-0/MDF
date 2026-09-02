from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model
from apps.core.models import Organization, Outlet

User = get_user_model()

class Command(BaseCommand):
    help = 'Purges dummy SEED-Mumbai tenant, sets up Manvta Pharma, and creates an admin user.'

    def handle(self, *args, **options):
        with transaction.atomic():
            self.stdout.write("1. Purging dummy tenants...")
            
            # Find and delete any Org/Outlet with "SEED-Mumbai"
            outlets_to_delete = Outlet.objects.filter(name__icontains="SEED-Mumbai")
            if outlets_to_delete.exists():
                self.stdout.write(f"Deleting {outlets_to_delete.count()} 'SEED-Mumbai' outlet(s).")
                outlets_to_delete.delete()
                
            orgs_to_delete = Organization.objects.filter(name__icontains="SEED-Mumbai")
            if orgs_to_delete.exists():
                self.stdout.write(f"Deleting {orgs_to_delete.count()} 'SEED-Mumbai' organization(s).")
                orgs_to_delete.delete()
                
            self.stdout.write("2. Configuring primary tenant (Manvta Pharma)...")
            org, _ = Organization.objects.get_or_create(
                name="E2E GST Org",
                defaults={"slug": "e2e-gst-org"}
            )
            
            outlet, _ = Outlet.objects.get_or_create(
                name="Manvta Pharma",
                defaults={
                    "organization": org,
                    "gstin": "27XXXXX1234A1Z5",
                    "drug_license_no": "DL-1234",
                    "city": "Mumbai",
                    "state": "Maharashtra",
                    "state_code": "27"
                }
            )
            
            # Ensure valid properties just in case it already existed with bad data
            outlet.gstin = "27XXXXX1234A1Z5"
            outlet.state = "Maharashtra"
            outlet.state_code = "27"
            outlet.save()

            self.stdout.write("3. Creating Admin User...")
            email = "admin@manvtapharma.com"
            phone = "8888888800"
            password = "Admin@12345"
            
            # Since the unique identifier for authentication might be phone or email,
            # Let's clean up any existing user with this email or phone.
            User.objects.filter(email=email).delete()
            User.objects.filter(phone=phone).delete()
            
            admin_user = User.objects.create_user(
                phone=phone,
                password=password,
                name="Manvta Admin",
                email=email,
                outlet=outlet,
                role="super_admin",
                is_staff=True,
                is_superuser=True
            )

            # Output success box
            box_width = 50
            self.stdout.write("\n" + "=" * box_width)
            self.stdout.write(" SUCCESS: MANVTA PHARMA TENANT READY".center(box_width))
            self.stdout.write("=" * box_width)
            self.stdout.write(f" Phone:    {phone}")
            self.stdout.write(f" Password: {password}")
            self.stdout.write(f" Outlet:   {outlet.name}")
            self.stdout.write("=" * box_width + "\n")
