import random
from decimal import Decimal
from datetime import timedelta, date
from django.utils import timezone
from django.db import transaction
from django.db.models import Q

from apps.core.models import Organization, Outlet
from apps.accounts.models import Customer
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem

from apps.reports.gst_snapshot_service import (
    create_sale_snapshots,
    create_sales_return_snapshots,
    create_purchase_snapshots
)

PREFIX = "SEED-"

def clean_seed_data(hard_reset=False):
    """
    If hard_reset is True, purges all transactions (Sale, Purchase, Returns, Snapshots).
    If False, purges only those whose relevant text fields start with PREFIX.
    """
    if hard_reset:
        print("Performing HARD RESET of all transactions...")
        SalesReturnItem.objects.all().delete()
        SalesReturn.objects.all().delete()
        SaleItem.objects.all().delete()
        SaleInvoice.objects.all().delete()
        PurchaseItem.objects.all().delete()
        PurchaseInvoice.objects.all().delete()
        from apps.reports.models import GSTTransactionSnapshot
        GSTTransactionSnapshot.objects.all().delete()
        Batch.objects.all().delete()
        MasterProduct.objects.all().delete()
        Customer.objects.all().delete()
        Distributor.objects.all().delete()
        Outlet.objects.all().delete()
        Organization.objects.all().delete()
    else:
        print(f"Performing targeted reset of seeded data (PREFIX: {PREFIX})...")
        SalesReturn.objects.filter(return_no__startswith=PREFIX).delete()
        SaleInvoice.objects.filter(invoice_no__startswith=PREFIX).delete()
        PurchaseInvoice.objects.filter(invoice_no__startswith=PREFIX).delete()
        # Snapshots cascade from the above deletion if parent_document_id is used, but in our case source_id is item-level and not cascading.
        # Wait, if we delete SalesReturn, SalesReturnItem deletes.
        # Let's manually delete snapshots starting with SEED- document_number
        from apps.reports.models import GSTTransactionSnapshot
        GSTTransactionSnapshot.objects.filter(document_number__startswith=PREFIX).delete()
        Batch.objects.filter(batch_no__startswith=PREFIX).delete()
        MasterProduct.objects.filter(name__startswith=PREFIX).delete()
        Customer.objects.filter(name__startswith=PREFIX).delete()
        Distributor.objects.filter(name__startswith=PREFIX).delete()
        Outlet.objects.filter(name__startswith=PREFIX).delete()
        Organization.objects.filter(name__startswith=PREFIX).delete()

def seed_master_data():
    """Generates Outlets, Products, Customers, Distributors"""
    print("Seeding master data...")
    org = Organization.objects.create(name=f"{PREFIX}Test Organization", slug="seed-test-org")

    outlet_mh = Outlet.objects.create(drug_license_no="DL-MH-SEED", 
        organization=org, name=f"{PREFIX}Mumbai Outlet", state="MH", state_code="27", gstin="27AAAAA0000A1Z5", 
        phone="9999999991", address="Mumbai", city="Mumbai", pincode="400001", is_active=True
    )
    
    outlet_gj = Outlet.objects.create(drug_license_no="DL-GJ-SEED", 
        organization=org, name=f"{PREFIX}Ahmedabad Outlet", state="GJ", state_code="24", gstin="24BBBBB0000B1Z5", 
        phone="9999999992", address="Ahmedabad", city="Ahmedabad", pincode="380001", is_active=True
    )

    outlets = [outlet_mh, outlet_gj]

    # Distributors
    distributors = []
    # Intra-state MH
    distributors.append(Distributor.objects.create(
        outlet=outlet_mh, name=f"{PREFIX}Pharma Dist MH", state="MH", gstin="27DDDDD0000D1Z5",
        phone="8888888881", address="Pune", city="Pune", credit_days=30, balance_type="Cr", is_active=True
    ))
    # Inter-state (GJ to MH)
    distributors.append(Distributor.objects.create(
        outlet=outlet_mh, name=f"{PREFIX}Pharma Dist GJ", state="GJ", gstin="24EEEEE0000E1Z5",
        phone="8888888882", address="Surat", city="Surat", credit_days=30, balance_type="Cr", is_active=True
    ))
    # Intra-state GJ
    distributors.append(Distributor.objects.create(
        outlet=outlet_gj, name=f"{PREFIX}Local Dist GJ", state="GJ", gstin="24FFFFF0000F1Z5",
        phone="8888888883", address="Rajkot", city="Rajkot", credit_days=30, balance_type="Cr", is_active=True
    ))

    # Customers
    customers = []
    # B2B Intra MH
    customers.append(Customer.objects.create(
        outlet=outlet_mh, name=f"{PREFIX}City Hospital (MH)", state="MH", gstin="27CCCCC0000C1Z5",
        phone="7777777771", fixed_discount=Decimal('0'), credit_limit=Decimal('10000'), outstanding=Decimal('0'),
        total_purchases=Decimal('0'), total_visits=0, is_chronic=False, is_active=True
    ))
    # B2B Inter GJ
    customers.append(Customer.objects.create(
        outlet=outlet_mh, name=f"{PREFIX}Border Clinic (GJ)", state="GJ", gstin="24GGGGG0000G1Z5",
        phone="7777777772", fixed_discount=Decimal('0'), credit_limit=Decimal('10000'), outstanding=Decimal('0'),
        total_purchases=Decimal('0'), total_visits=0, is_chronic=False, is_active=True
    ))
    # B2C
    customers.append(Customer.objects.create(
        outlet=outlet_mh, name=f"{PREFIX}Walk-in John", state="MH", gstin="",
        phone="7777777773", fixed_discount=Decimal('0'), credit_limit=Decimal('0'), outstanding=Decimal('0'),
        total_purchases=Decimal('0'), total_visits=0, is_chronic=False, is_active=True
    ))

    # Master Products
    products_data = [
        ("Paracetamol 500mg", "12340001", Decimal('12.00'), Decimal('50.00'), Decimal('35.00'), "Strip", "Blister"),
        ("Azithromycin 250mg", "12340002", Decimal('12.00'), Decimal('120.00'), Decimal('90.00'), "Strip", "Blister"),
        ("Vitamins Complex", "21069099", Decimal('18.00'), Decimal('250.00'), Decimal('180.00'), "Bottle", "Bottle"),
        ("BP Monitor", "90189019", Decimal('18.00'), Decimal('1500.00'), Decimal('1200.00'), "Piece", "Box"),
        ("Hand Strap", "90189020", Decimal('18.00'), Decimal('500.00'), Decimal('300.00'), "Piece", "Piece"),
        ("Exempted Item (Zero Tax)", "00000000", Decimal('0.00'), Decimal('100.00'), Decimal('80.00'), "Packet", "Packet"),
    ]

    products = []
    for name, hsn, rate, mrp, pur_rate, punit, ptype in products_data:
        p = MasterProduct.objects.create(
            name=f"{PREFIX}{name}", composition="Generic", manufacturer="Generic Pharma", category="Tablets",
            drug_type="Allopathic", schedule_type="H1", hsn_code=hsn, gst_rate=rate, pack_size=10 if punit=="Strip" else 1, pack_unit=punit,
            pack_type=ptype, mrp=mrp, min_qty=5, reorder_qty=10, is_fridge=False, is_discontinued=False
        )
        products.append((p, pur_rate))

    return outlets, distributors, customers, products


def seed_purchases(outlets, distributors, products, num_purchases):
    """Generates Purchase Invoices and Batches safely to establish stock"""
    print("Seeding purchases and inventory...")
    batches = []
    start_date = timezone.now().date() - timedelta(days=90)
    
    for i in range(num_purchases):
        outlet = random.choice(outlets)
        distributor = random.choice([d for d in distributors if d.outlet == outlet]) # fallback or select valid one
        if not distributor: distributor = random.choice(distributors) # fallback just in case
        
        inv_date = start_date + timedelta(days=random.randint(0, 80))
        
        pi = PurchaseInvoice.objects.create(
            outlet=outlet, distributor=distributor, invoice_no=f"{PREFIX}PUR-{i+1}", invoice_date=inv_date,
            purchase_type="Cash", godown="Main", subtotal=Decimal('0'), discount_amount=Decimal('0'),
            taxable_amount=Decimal('0'), gst_amount=Decimal('0'), cess_amount=Decimal('0'), freight=Decimal('0'),
            round_off=Decimal('0'), ledger_adjustment=Decimal('0'), grand_total=Decimal('0'),
            amount_paid=Decimal('0'), outstanding=Decimal('0')
        )

        taxable_sum = Decimal('0')
        gst_sum = Decimal('0')

        # Add 1 to 4 random items
        items = random.sample(products, k=random.randint(1, min(4, len(products))))
        for idx, (p, p_rate) in enumerate(items):
            qty = random.randint(10, 50)
            batch_no = f"{PREFIX}B-{p.id.hex[:6]}-{i}-{idx}"
            
            # Create Batch First to satisfy constraints
            batch = Batch.objects.create(
                outlet=outlet, product=p, batch_no=batch_no, expiry_date=inv_date + timedelta(days=365),
                mrp=p.mrp, purchase_rate=p_rate, pack_size=p.pack_size, pack_unit=p.pack_unit, pack_type=p.pack_type,
                qty_strips=qty, qty_loose=0, is_active=True, is_opening_stock=False
            )
            batches.append(batch)

            taxable = (Decimal(qty) * p_rate).quantize(Decimal('0.01'))
            gst = (taxable * p.gst_rate / Decimal('100')).quantize(Decimal('0.01'))

            PurchaseItem.objects.create(
                invoice=pi, batch=batch, master_product=p, is_custom_product=False, hsn_code=p.hsn_code,
                batch_no=batch_no, expiry_date=batch.expiry_date, pkg=p.pack_size, qty=qty, actual_qty=qty * p.pack_size,
                free_qty=0, purchase_rate=p_rate, discount_pct=Decimal('0'), cash_discount_pct=Decimal('0'),
                gst_rate=p.gst_rate, cess=Decimal('0'), mrp=p.mrp, ptr=p_rate, pts=p_rate, sale_rate=p.mrp,
                freight_per_unit=Decimal('0'), other_cost_per_unit=Decimal('0'), taxable_amount=taxable, gst_amount=gst,
                cess_amount=Decimal('0'), total_amount=taxable + gst
            )

            taxable_sum += taxable
            gst_sum += gst

        pi.subtotal = taxable_sum
        pi.taxable_amount = taxable_sum
        pi.gst_amount = gst_sum
        pi.grand_total = taxable_sum + gst_sum
        pi.amount_paid = pi.grand_total
        pi.save()
        create_purchase_snapshots(pi)
    
    return batches

def seed_sales(outlets, customers, batches, num_sales):
    """Generates Sales and deducts stock"""
    print("Seeding sales...")
    sales = []
    start_date = timezone.now() - timedelta(days=80)

    for i in range(num_sales):
        outlet = random.choice(outlets)
        outlet_customers = [c for c in customers if c.outlet == outlet]
        customer = random.choice(outlet_customers) if outlet_customers else None
        inv_date = start_date + timedelta(days=random.randint(0, 75))

        taxable_sum = Decimal('0')
        gst_sum = Decimal('0')
        cgst_sum = Decimal('0')
        sgst_sum = Decimal('0')
        igst_sum = Decimal('0')

        # Determine if interstate (for sales it depends on customer.state vs outlet.state)
        # If no customer, defaults to intrastate
        party_state = customer.state if customer else outlet.state
        is_interstate = (party_state != outlet.state)

        si = SaleInvoice.objects.create(
            outlet=outlet, invoice_no=f"{PREFIX}INV-{i+1}", invoice_date=inv_date, customer=customer,
            subtotal=Decimal('0'), discount_amount=Decimal('0'), extra_discount_pct=Decimal('0'),
            taxable_amount=Decimal('0'), cgst_amount=Decimal('0'), sgst_amount=Decimal('0'), igst_amount=Decimal('0'),
            cgst=Decimal('0'), sgst=Decimal('0'), igst=Decimal('0'), round_off=Decimal('0'), grand_total=Decimal('0'),
            payment_mode='Cash', cash_paid=Decimal('0'), upi_paid=Decimal('0'), card_paid=Decimal('0'), credit_given=Decimal('0'),
            amount_paid=Decimal('0'), amount_due=Decimal('0'), is_return=False, is_cancelled=False
        )

        # Pick some batches from this outlet
        available_batches = [b for b in batches if b.outlet == outlet and b.qty_strips > 0]
        if not available_batches:
            continue

        selected_batches = random.sample(available_batches, k=random.randint(1, min(3, len(available_batches))))

        for batch in selected_batches:
            qty = random.randint(1, min(5, batch.qty_strips))
            # Deduct stock safely
            batch.qty_strips -= qty
            batch.save()

            rate = batch.mrp
            taxable = (Decimal(qty) * rate).quantize(Decimal('0.01'))
            gst = (taxable * batch.product.gst_rate / Decimal('100')).quantize(Decimal('0.01'))

            SaleItem.objects.create(
                invoice=si, batch=batch, product_name=batch.product.name, pack_size=batch.pack_size, pack_unit=batch.pack_unit,
                schedule_type=batch.product.schedule_type, batch_no=batch.batch_no, expiry_date=batch.expiry_date,
                mrp=batch.mrp, rate=rate, hsn_code=batch.product.hsn_code,
                qty_strips=qty, qty_loose=0, qty_returned=0, sale_mode="Pack", discount_pct=Decimal('0'),
                gst_rate=batch.product.gst_rate, taxable_amount=taxable, gst_amount=gst, total_amount=taxable + gst
            )

            taxable_sum += taxable
            gst_sum += gst
            if is_interstate:
                igst_sum += gst
            else:
                c = (gst / Decimal('2')).quantize(Decimal('0.01'))
                s = gst - c
                cgst_sum += c
                sgst_sum += s

        si.subtotal = taxable_sum
        si.taxable_amount = taxable_sum
        si.cgst_amount = cgst_sum
        si.sgst_amount = sgst_sum
        si.igst_amount = igst_sum
        si.cgst = Decimal("0")
        si.sgst = Decimal("0")
        si.igst = Decimal("0")
        si.grand_total = taxable_sum + gst_sum
        si.amount_paid = si.grand_total
        si.cash_paid = si.grand_total  # Fully paid in cash to satisfy validation
        si.save()
        create_sale_snapshots(si)
        sales.append(si)

    return sales


def seed_returns(sales, num_returns):
    """Generates Sales Returns from existing sales"""
    print("Seeding sales returns...")
    if not sales: return

    for i in range(num_returns):
        original = random.choice(sales)
        # Find items that haven't been fully returned
        items = [item for item in original.items.all() if item.qty_strips > item.qty_returned]
        if not items:
            continue

        ret = SalesReturn.objects.create(
            outlet=original.outlet, original_sale=original, return_no=f"{PREFIX}RET-{i+1}",
            return_date=original.invoice_date.date() + timedelta(days=1), reason="Damaged/Expired",
            total_amount=Decimal('0'), refund_mode="Cash"
        )

        ret_total = Decimal('0')
        for item in items:
            ret_qty = random.randint(1, item.qty_strips - item.qty_returned)
            item.qty_returned += ret_qty
            item.save()

            taxable = (Decimal(ret_qty) * item.rate).quantize(Decimal('0.01'))
            gst = (taxable * item.gst_rate / Decimal('100')).quantize(Decimal('0.01'))
            amount = taxable + gst

            SalesReturnItem.objects.create(
                sales_return=ret, original_sale_item=item, batch=item.batch, product_name=item.product_name,
                batch_no=item.batch_no, qty_returned=ret_qty, return_rate=item.rate, total_amount=amount,
                hsn_code=item.hsn_code, gst_rate=item.gst_rate, taxable_amount=taxable, gst_amount=gst
            )
            ret_total += amount
            # restore stock
            item.batch.qty_strips += ret_qty
            item.batch.save()
        
        ret.total_amount = ret_total
        ret.save()
        create_sales_return_snapshots(ret)

def run_seeder(size='medium', hard_reset=False, random_seed=None):
    if random_seed is not None:
        random.seed(random_seed)

    clean_seed_data(hard_reset)

    if size == 'small':
        n_pur, n_sale, n_ret = 10, 20, 3
    else: # medium
        n_pur, n_sale, n_ret = 40, 100, 15

    with transaction.atomic():
        outlets, distributors, customers, products = seed_master_data()
        batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
        sales = seed_sales(outlets, customers, batches, num_sales=n_sale)
        seed_returns(sales, num_returns=n_ret)

    print("Seeding complete.")

# --- Anchor Scenarios for Validation ---
def generate_deterministic_anchors():
    """
    Creates guaranteed fixed scenarios so validate_test_data can assert them perfectly.
    """
    print("Generating deterministic anchor scenarios...")
    with transaction.atomic():
        org = Organization.objects.filter(name__startswith=PREFIX).first()
        outlet_mh = Outlet.objects.filter(state="MH", name__startswith=PREFIX).first()
        outlet_gj = Outlet.objects.filter(state="GJ", name__startswith=PREFIX).first()
        
        if not org or not outlet_mh or not outlet_gj:
            print("Run standard seeder first.")
            return

        b2b_mh = Customer.objects.filter(outlet=outlet_mh, gstin__startswith="27", name__startswith=PREFIX).first()
        b2c_mh = Customer.objects.filter(outlet=outlet_mh, gstin="", name__startswith=PREFIX).first()

        prod_12 = MasterProduct.objects.filter(gst_rate=Decimal('12.00'), name__startswith=PREFIX).first()
        batch_12 = Batch.objects.filter(product=prod_12, outlet=outlet_mh).first()

        dist_gj = Distributor.objects.filter(outlet=outlet_mh, state="GJ", name__startswith=PREFIX).first()

        fixed_date = timezone.now().replace(year=2025, month=1, day=15, hour=12, minute=0, second=0)

        # 1. Intrastate B2B Sale (Outlet MH -> Customer MH) -> CGST/SGST
        batch_12.qty_strips += 10
        batch_12.save()
        
        inv1 = SaleInvoice.objects.create(
            outlet=outlet_mh, invoice_no=f"{PREFIX}ANCHOR-INV-1", invoice_date=fixed_date, customer=b2b_mh,
            subtotal=Decimal('100.00'), taxable_amount=Decimal('100.00'), cgst_amount=Decimal('6.00'), sgst_amount=Decimal('6.00'),
            igst_amount=Decimal('0.00'), cgst=Decimal('6.00'), sgst=Decimal('6.00'), igst=Decimal('0.00'),
            round_off=Decimal('0.00'), grand_total=Decimal('112.00'), payment_mode='Cash', cash_paid=Decimal('112.00'),
            upi_paid=Decimal('0.00'), card_paid=Decimal('0.00'), credit_given=Decimal('0.00'), amount_paid=Decimal('112.00'),
            amount_due=Decimal('0.00'), is_return=False, is_cancelled=False
        )
        item1 = SaleItem.objects.create(
            invoice=inv1, batch=batch_12, product_name=prod_12.name, pack_size=10, pack_unit="Strip", schedule_type="H1",
            batch_no=batch_12.batch_no, expiry_date=batch_12.expiry_date, mrp=batch_12.mrp, sale_rate=Decimal('10.00'),
            rate=Decimal('10.00'), hsn_code=prod_12.hsn_code, qty_strips=10, qty_loose=0, qty_returned=0, sale_mode="Pack",
            discount_pct=Decimal('0.00'), gst_rate=Decimal('12.00'), taxable_amount=Decimal('100.00'),
            gst_amount=Decimal('12.00'), total_amount=Decimal('112.00')
        )
        create_sale_snapshots(inv1)

        # 2. Interstate B2C Sale (Outlet MH -> Customer GJ/Unregistered or defaulting to state mismatch if possible)
        # Actually, B2C Interstate requires just a different state. We can create a dummy B2C interstate customer.
        b2c_inter = Customer.objects.create(
            outlet=outlet_mh, name=f"{PREFIX}B2C-Interstate Anchor", state="DL", gstin="",
            phone="1111111111", fixed_discount=Decimal('0'), credit_limit=Decimal('0'), outstanding=Decimal('0'),
            total_purchases=Decimal('0'), total_visits=0, is_chronic=False, is_active=True
        )
        batch_12.qty_strips += 20
        batch_12.save()

        inv2 = SaleInvoice.objects.create(
            outlet=outlet_mh, invoice_no=f"{PREFIX}ANCHOR-INV-2", invoice_date=fixed_date, customer=b2c_inter,
            subtotal=Decimal('200.00'), taxable_amount=Decimal('200.00'), cgst_amount=Decimal('0.00'), sgst_amount=Decimal('0.00'),
            igst_amount=Decimal('24.00'), cgst=Decimal('0.00'), sgst=Decimal('0.00'), igst=Decimal('24.00'),
            round_off=Decimal('0.00'), grand_total=Decimal('224.00'), payment_mode='Cash', cash_paid=Decimal('224.00'),
            upi_paid=Decimal('0.00'), card_paid=Decimal('0.00'), credit_given=Decimal('0.00'), amount_paid=Decimal('224.00'),
            amount_due=Decimal('0.00'), is_return=False, is_cancelled=False
        )
        item2 = SaleItem.objects.create(
            invoice=inv2, batch=batch_12, product_name=prod_12.name, pack_size=10, pack_unit="Strip", schedule_type="H1",
            batch_no=batch_12.batch_no, expiry_date=batch_12.expiry_date, mrp=batch_12.mrp, sale_rate=Decimal('10.00'),
            rate=Decimal('10.00'), hsn_code=prod_12.hsn_code, qty_strips=20, qty_loose=0, qty_returned=0, sale_mode="Pack",
            discount_pct=Decimal('0.00'), gst_rate=Decimal('12.00'), taxable_amount=Decimal('200.00'),
            gst_amount=Decimal('24.00'), total_amount=Decimal('224.00')
        )
        create_sale_snapshots(inv2)

        # 3. Sales Return (Returning half of INV-1)
        item1.qty_returned = 5
        item1.save()
        batch_12.qty_strips += 5
        batch_12.save()
        
        ret1 = SalesReturn.objects.create(
            outlet=outlet_mh, original_sale=inv1, return_no=f"{PREFIX}ANCHOR-RET-1",
            return_date=fixed_date.date() + timedelta(days=1), reason="Damaged",
            total_amount=Decimal('56.00'), refund_mode="Cash"
        )
        SalesReturnItem.objects.create(
            sales_return=ret1, original_sale_item=item1, batch=batch_12, product_name=prod_12.name,
            batch_no=batch_12.batch_no, qty_returned=5, return_rate=Decimal('10.00'), total_amount=Decimal('56.00'),
            hsn_code=prod_12.hsn_code, gst_rate=Decimal('12.00'), taxable_amount=Decimal('50.00'), gst_amount=Decimal('6.00')
        )
        create_sales_return_snapshots(ret1)

        # 4. Purchase ITC Case (Interstate Purchase -> IGST)
        pi1 = PurchaseInvoice.objects.create(
            outlet=outlet_mh, distributor=dist_gj, invoice_no=f"{PREFIX}ANCHOR-PUR-1", invoice_date=fixed_date.date(),
            purchase_type="Cash", godown="Main", subtotal=Decimal('500.00'), discount_amount=Decimal('0'),
            taxable_amount=Decimal('500.00'), gst_amount=Decimal('60.00'), cess_amount=Decimal('0'), freight=Decimal('0'),
            round_off=Decimal('0'), ledger_adjustment=Decimal('0'), grand_total=Decimal('560.00'),
            amount_paid=Decimal('560.00'), outstanding=Decimal('0')
        )
        PurchaseItem.objects.create(
            invoice=pi1, batch=batch_12, master_product=prod_12, is_custom_product=False, hsn_code=prod_12.hsn_code,
            batch_no=batch_12.batch_no, expiry_date=batch_12.expiry_date, pkg=10, qty=50, actual_qty=500,
            free_qty=0, purchase_rate=Decimal('10.00'), discount_pct=Decimal('0'), cash_discount_pct=Decimal('0'),
            gst_rate=Decimal('12.00'), cess=Decimal('0'), mrp=batch_12.mrp, ptr=Decimal('10.00'), pts=Decimal('10.00'), sale_rate=Decimal('10.00'),
            freight_per_unit=Decimal('0'), other_cost_per_unit=Decimal('0'), taxable_amount=Decimal('500.00'), gst_amount=Decimal('60.00'),
            cess_amount=Decimal('0'), total_amount=Decimal('560.00')
        )
        create_purchase_snapshots(pi1)
        print("Anchors generated successfully.")
