import os
import django
import pandas as pd
from django.db.models import Q

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.inventory.models import MasterProduct

def analyze():
    print("Reading stock valuation...")
    df = pd.read_excel('stock_valuation.xls', engine='xlrd', skiprows=2)
    
    # Clean column names
    df.columns = df.columns.astype(str).str.strip()
    
    # Filter out empty product names
    df = df[df['Product Name'].notna() & (df['Product Name'] != '')]
    
    # Get distinct products from the excel file
    unique_excel_products = df['Product Name'].unique()
    total_excel_products = len(unique_excel_products)
    print(f"Total distinct products in Excel file: {total_excel_products}")
    
    # Query database for all products
    db_product_names = set(MasterProduct.objects.values_list('name', flat=True))
    db_product_names_lower = {name.lower().strip() for name in db_product_names}
    
    matched = 0
    new_products = []
    
    for excel_name in unique_excel_products:
        clean_name = str(excel_name).lower().strip()
        if clean_name in db_product_names_lower:
            matched += 1
        else:
            new_products.append(excel_name)
            
    print(f"Products already on server: {matched}")
    print(f"New products (not on server): {len(new_products)}")
    
    # Check HSN and GST for matched products
    matched_products_in_db = MasterProduct.objects.filter(name__in=[n for n in unique_excel_products if str(n).lower().strip() in db_product_names_lower])
    
    missing_hsn_count = matched_products_in_db.filter(Q(hsn_code__isnull=True) | Q(hsn_code__exact='') | Q(hsn_code__exact='0')).count()
    missing_gst_count = matched_products_in_db.filter(Q(gst_rate__isnull=True) | Q(gst_rate__exact=0)).count()
    
    print(f"Of the {matched_products_in_db.count()} matched products on the server:")
    print(f" - Missing or empty HSN Code: {missing_hsn_count}")
    print(f" - Missing or 0% GST Rate: {missing_gst_count}")
    
    # Check what fields are actually available in the excel file
    columns = list(df.columns)
    has_hsn = 'HSN' in columns or any('HSN' in str(c) for c in columns)
    has_gst = 'GST' in columns or any('GST' in str(c) for c in columns)
    
    print(f"File contains HSN? {has_hsn}")
    print(f"File contains GST? {has_gst}")

if __name__ == "__main__":
    analyze()
