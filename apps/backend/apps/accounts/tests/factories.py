import factory
from apps.core.models import Organization, Outlet
from apps.accounts.models import Customer, Ledger, LedgerGroup, Staff
from apps.purchases.models import Distributor

class OrganizationFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Organization
    name = factory.Faker('company')
    slug = factory.Sequence(lambda n: f'org-{n}')

class OutletFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Outlet
    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Faker('company')
    address = factory.Faker('address')
    city = factory.Faker('city')
    state = 'Maharashtra'
    pincode = factory.Faker('postcode')
    gstin = factory.Sequence(lambda n: f'27AAAAA{n:04d}A1Z')
    drug_license_no = factory.Sequence(lambda n: f'DL-{n}')
    phone = factory.Sequence(lambda n: f'9876543{n:03d}')

class StaffFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Staff
    outlet = factory.SubFactory(OutletFactory)
    name = factory.Faker('name')
    phone = factory.Sequence(lambda n: f'99999999{n:02d}')
    role = 'admin'

class CustomerFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Customer
    outlet = factory.SubFactory(OutletFactory)
    name = factory.Faker('name')
    phone = factory.Sequence(lambda n: f'88888888{n:02d}')

class SupplierFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Distributor
    outlet = factory.SubFactory(OutletFactory)
    name = factory.Faker('company')
    phone = factory.Sequence(lambda n: f'77777777{n:02d}')
    city = factory.Faker('city')
    state = 'Maharashtra'
    gstin = factory.Sequence(lambda n: f'27BBBBB{n:04d}B1Z')

class LedgerGroupFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = LedgerGroup
    outlet = factory.SubFactory(OutletFactory)
    name = factory.Sequence(lambda n: f'Group-{n}')
    nature = 'asset'

class LedgerFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Ledger
    outlet = factory.SubFactory(OutletFactory)
    name = factory.Sequence(lambda n: f'Ledger-{n}')
    group = factory.SubFactory(LedgerGroupFactory)