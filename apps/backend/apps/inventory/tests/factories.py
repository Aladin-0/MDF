import factory
from django.utils import timezone
from datetime import timedelta
from apps.inventory.models import MasterProduct, Batch, StockLedger

class MasterProductFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = MasterProduct
    name = factory.Faker('word')
    composition = factory.Faker('sentence')
    manufacturer = factory.Faker('company')
    category = factory.Faker('word')
    drug_type = 'allopathy'
    schedule_type = 'OTC'
    pack_size = 10
    pack_unit = 'tablet'
    pack_type = 'strip'
    mrp = 100.0
    is_fridge = False
    is_discontinued = False
ProductFactory = MasterProductFactory

class BatchFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Batch
    outlet = factory.SubFactory('apps.accounts.tests.factories.OutletFactory')
    product = factory.SubFactory(MasterProductFactory)
    batch_no = factory.Sequence(lambda n: f'BATCH-{n}')
    expiry_date = factory.LazyFunction(lambda: timezone.now().date() + timedelta(days=365))
    mrp = 100.0
    purchase_rate = 80.0
    pack_size = 10
    qty_strips = 10
    qty_loose = 0
    is_active = True

class StockLedgerFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = StockLedger
    outlet = factory.SubFactory('apps.accounts.tests.factories.OutletFactory')
    product = factory.SubFactory(MasterProductFactory)
    batch = factory.SubFactory(BatchFactory)
    txn_type = 'OPENING'
    txn_date = factory.LazyFunction(lambda: timezone.now().date())
    voucher_type = 'Opening Stock'
    qty_in = 10.0
    qty_out = 0.0
    rate = 100.0
    value_in = 1000.0
    value_out = 0.0
    running_qty = 10.0
    running_value = 1000.0