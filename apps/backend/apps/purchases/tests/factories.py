import factory
from django.utils import timezone
from apps.purchases.models import PurchaseInvoice, PurchaseItem
from apps.accounts.tests.factories import OutletFactory, SupplierFactory

class PurchaseInvoiceFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = PurchaseInvoice
    outlet = factory.SubFactory(OutletFactory)
    distributor = factory.SubFactory(SupplierFactory)
    invoice_no = factory.Sequence(lambda n: f'PINV-{n:06d}')
    invoice_date = factory.LazyFunction(lambda: timezone.now().date())
    subtotal = 100.0
    taxable_amount = 100.0
    grand_total = 100.0
    purchase_type = 'credit'

class PurchaseItemFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = PurchaseItem
    invoice = factory.SubFactory(PurchaseInvoiceFactory)
    batch = factory.SubFactory('apps.inventory.tests.factories.BatchFactory')
    batch_no = factory.Faker('word')
    expiry_date = factory.LazyFunction(lambda: timezone.now().date())
    pkg = 10
    qty = 1
    actual_qty = 10
    purchase_rate = 80.0
    mrp = 100.0
    ptr = 80.0
    pts = 80.0
    taxable_amount = 80.0
    gst_amount = 0
    total_amount = 80.0

def make_purchase_invoice():
    from apps.accounts.tests.factories import OutletFactory, SupplierFactory
    outlet = OutletFactory()
    distributor = SupplierFactory(outlet=outlet)
    invoice = PurchaseInvoiceFactory(outlet=outlet, distributor=distributor)
    PurchaseItemFactory(invoice=invoice, batch__outlet=outlet)
    return invoice