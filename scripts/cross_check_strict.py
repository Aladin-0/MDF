import pandas as pd

file_path = "/home/aladin/projects/mediflow-deployement/UPDATED_STOCK_SEP-2026.xlsx"
df = pd.read_excel(file_path)

errors = []

for idx, row in df.iterrows():
    name = str(row['Product Name']).upper()
    unit = row['Unit']
    
    if name == 'NAN':
        continue
        
    # Check contradictions
    if 'INHALER' in name and unit == 'Tablet':
        errors.append(f"{name} -> {unit} (Expected Piece/Inhaler)")
    if 'SUTURE' in name or 'SILK' in name or 'ROUND BODIED' in name:
        if unit == 'Tablet':
            errors.append(f"{name} -> {unit} (Expected Piece)")
    if 'SET' in name and 'I.V' in name and unit == 'Tablet':
        errors.append(f"{name} -> {unit} (Expected Piece)")
    if 'POWDER' in name and unit in ['Tube', 'Tablet']:
        errors.append(f"{name} -> {unit} (Expected Sachet/Piece)")
    if 'SOAP' in name and unit != 'Piece':
        errors.append(f"{name} -> {unit} (Expected Piece)")
    if 'SHAMPOO' in name and unit not in ['Bottle', 'Piece']:
        errors.append(f"{name} -> {unit} (Expected Bottle)")

print(f"Total potential hallucinations found: {len(errors)}")
if errors:
    print("Sample of hallucinations:")
    for e in errors[:20]:
        print(e)
