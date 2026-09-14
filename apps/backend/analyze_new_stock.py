import os
import django
import pandas as pd

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.prod")
os.environ["DATABASE_URL"] = "postgres://mediflow:mediflow@localhost:5433/mediflow"
django.setup()

from apps.inventory.models import MasterProduct

def analyze():
    # 1. Get all product names from the database
    db_product_names = set(MasterProduct.objects.values_list('name', flat=True))
    print(f"Total MasterProducts in DB: {len(db_product_names)}")

    # 2. Read the Excel file
    excel_path = '../../NEW STOCK SEP-2026.xls'
    df = pd.read_excel(excel_path, header=2).dropna(how='all')
    
    excel_product_names = set(df['Product Name'].dropna().unique())
    print(f"Total Unique Products in Excel: {len(excel_product_names)}")

    # 3. Find the differences
    new_in_excel = excel_product_names - db_product_names
    old_in_both = excel_product_names.intersection(db_product_names)
    
    print(f"Products in both (will be overwritten/updated): {len(old_in_both)}")
    print(f"New Products (need to be added): {len(new_in_excel)}")

    # 4. Generate report of new products
    df_new = df[df['Product Name'].isin(new_in_excel)]
    
    # Save a CSV with only the new items
    df_new.to_csv('../../missing_new_products.csv', index=False)
    print("Saved missing_new_products.csv")

if __name__ == '__main__':
    analyze()
