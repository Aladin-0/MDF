import os
import django
import pandas as pd
from datetime import datetime
import csv
import math

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.core.models import Outlet

EXCEL_PATH = '/app/NEW STOCK SEP-2026.xls'
OUTLET_NAME = 'sai'

print("Loading Excel...")
df = pd.read_excel(EXCEL_PATH, header=2).dropna(how='all')

sai_outlet = Outlet.objects.filter(name__icontains=OUTLET_NAME).first()
if not sai_outlet:
    print("Outlet not found!")
    exit(1)

missing_products = []
updated_count = 0

def parse_date(d_str):
    if pd.isna(d_str) or not isinstance(d_str, str) or d_str.strip() == '-' or d_str.strip() == '-   -':
        return None
    try:
        return datetime.strptime(d_str.strip(), '%d-%b-%y').date()
    except Exception as e:
        return None

print("Loading products into memory...")
all_products = {p.name.strip().lower(): p for p in MasterProduct.objects.all()}
processed_product_ids = set()

for index, row in df.iterrows():
    prod_name = str(row.get('Product Name', '')).strip()
    if prod_name == 'nan' or not prod_name:
        continue
    
    prod_name_lower = prod_name.lower()
    product = all_products.get(prod_name_lower)
    
    if not product:
        missing_products.append({
            'Product Name': prod_name,
            'Code': row.get('Code', ''),
            'Company': row.get('Company', ''),
            'Missing Fields': 'GST%, HSN, Category, Composition, Drug Type'
        })
        continue
    
    if product.id not in processed_product_ids:
        # Safely zero-out and deactivate old batches instead of deleting
        # This prevents ProtectedError if old batches are tied to SaleItems.
        Batch.objects.filter(outlet=sai_outlet, product=product).update(
            qty_strips=0,
            qty_loose=0,
            is_active=False
        )
        processed_product_ids.add(product.id)
    
    qty = float(row.get('Current Stock', 0) if pd.notna(row.get('Current Stock')) else 0)
    if qty < 0:
        qty = 0
    qty_strips = math.floor(qty)
    qty_loose = 0 
    
    mrp = float(row.get('M.R.P.', 0) if pd.notna(row.get('M.R.P.')) else 0)
    purc_price = float(row.get('Purchase Price', 0) if pd.notna(row.get('Purchase Price')) else 0)
    batch_no = str(row.get('Batch', 'UNKNOWN')).strip()
    if batch_no == 'nan': batch_no = 'UNKNOWN'
    
    mfg_date = parse_date(row.get('MFG'))
    exp_date = parse_date(row.get('EXP'))
    if not exp_date:
        exp_date = datetime(2027, 9, 1).date()
        
    rack = str(row.get('Rack No.', '')).strip()
    if rack == 'nan': rack = ''
    
    Batch.objects.create(
        outlet=sai_outlet,
        product=product,
        batch_no=batch_no,
        mfg_date=mfg_date,
        expiry_date=exp_date,
        mrp=mrp,
        purchase_rate=purc_price,
        qty_strips=qty_strips,
        qty_loose=qty_loose,
        rack_location=rack,
        is_active=True,
        is_opening_stock=True,
        pack_size=product.pack_size,
        pack_unit=product.pack_unit,
        pack_type=product.pack_type,
        opening_qty=qty
    )
    updated_count += 1

print(f"Successfully updated/inserted {updated_count} batches!")

csv_path = '/app/missing_new_products.csv'
if missing_products:
    unique_missing = {m['Product Name']: m for m in missing_products}.values()
    keys = list(unique_missing)[0].keys()
    with open(csv_path, 'w', newline='') as output_file:
        dict_writer = csv.DictWriter(output_file, keys)
        dict_writer.writeheader()
        dict_writer.writerows(unique_missing)
    print(f"Saved {len(unique_missing)} unique missing products to {csv_path}")
else:
    print("No missing products found!")
