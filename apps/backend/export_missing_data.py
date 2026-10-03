import os
import django
import pandas as pd
from django.db.models import Q

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.inventory.models import MasterProduct

def export_missing_data():
    print("Reading stock valuation...")
    df = pd.read_excel('stock_valuation.xls', engine='xlrd', skiprows=2)
    
    # Clean column names
    df.columns = df.columns.astype(str).str.strip()
    
    # Filter out empty product names
    df = df[df['Product Name'].notna() & (df['Product Name'] != '')]
    
    # Clean up the product names for matching
    df['Clean Name'] = df['Product Name'].astype(str).str.lower().str.strip()
    
    # We want to keep the first occurrence of each product to get its company, unit, etc.
    unique_df = df.drop_duplicates(subset=['Clean Name'], keep='first')
    
    db_products = MasterProduct.objects.all()
    db_product_names_lower = {p.name.lower().strip(): p for p in db_products}
    
    all_data = []
    
    for _, row in unique_df.iterrows():
        clean_name = row['Clean Name']
        if clean_name in db_product_names_lower:
            p = db_product_names_lower[clean_name]
            missing_hsn = not p.hsn_code or p.hsn_code == '0'
            missing_gst = not p.gst_rate or float(p.gst_rate) == 0.0
            
            if missing_hsn or missing_gst:
                all_data.append({
                    'Product Name': p.name,
                    'Status': 'Existing - Missing Fields',
                    'Company': '',
                    'Unit/Pack': '',
                    'MRP': '',
                    'Current HSN in DB': p.hsn_code,
                    'Current GST in DB': p.gst_rate,
                    'Current Schedule': p.schedule_type,
                    'Fill New HSN Here': '',
                    'Fill New GST Here': '',
                    'Fill New Schedule Here (e.g. H, H1, X)': ''
                })
        else:
            all_data.append({
                'Product Name': row['Product Name'],
                'Status': 'Brand New Product',
                'Company': row.get('Company', ''),
                'Unit/Pack': row.get('Unit', ''),
                'MRP': row.get('M.R.P.', ''),
                'Current HSN in DB': 'N/A',
                'Current GST in DB': 'N/A',
                'Current Schedule': 'N/A',
                'Fill New HSN Here': '',
                'Fill New GST Here': '',
                'Fill New Schedule Here (e.g. H, H1, X)': ''
            })
            
    # Create DataFrame
    final_df = pd.DataFrame(all_data)
    
    # Write to Excel
    output_file = 'Missing_Products_To_Fill_Final.xlsx'
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        final_df.to_excel(writer, sheet_name='Missing Fields', index=False)
        
    print(f"Successfully generated {output_file}!")
    print(f"Total rows in sheet: {len(all_data)}")

if __name__ == "__main__":
    export_missing_data()
