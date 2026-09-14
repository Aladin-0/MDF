import pandas as pd

# Read the local CSV
df = pd.read_csv('/app/missing_new_products_live.csv')

# Drop the generic 'Missing Fields' column
if 'Missing Fields' in df.columns:
    df = df.drop(columns=['Missing Fields'])

# Add new columns
df['GST %'] = ''
df['HSN Code'] = ''
df['Composition'] = ''
df['Category'] = ''
df['Drug Type (Allopathy/Ayurveda/Homeo/Surgical/General/FMCG)'] = ''
df['Pack Type (strip/bottle/vial/box/blister/tube/packet/other)'] = ''
df['Pack Unit (e.g. tablet, ml, gm)'] = ''
df['Pack Size (e.g. 10)'] = ''

# Save as Excel
df.to_excel('/app/missing_new_products.xlsx', index=False)
print("Excel file created successfully!")
