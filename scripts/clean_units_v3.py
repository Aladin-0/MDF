import pandas as pd
import re

FILE_PATH = "/home/aladin/projects/mediflow-deployement/NEW STOCK SEP-2026.xls"
OUTPUT_PATH = "/home/aladin/projects/mediflow-deployement/UPDATED_STOCK_SEP-2026.xlsx"

# The exact Mediflow supported units
SUPPORTED_UNITS = [
    'Tablet', 'Capsule', 'Softgel', 'Syrup', 'Suspension', 'Drops', 
    'Vial', 'Bottle', 'Cream', 'Gel', 'Ointment', 'Tube', 
    'Piece', 'Jar', 'Sachet', 'Ampoule', 'Kit'
]

KEYWORD_TO_UNIT = {
    'TAB': 'Tablet', 'TABLET': 'Tablet', 'TABS': 'Tablet',
    'CAP': 'Capsule', 'CAPSULE': 'Capsule',
    'SOFTGEL': 'Softgel',
    'SYP': 'Syrup', 'SYRUP': 'Syrup',
    'SUSP': 'Suspension', 'SUSPENSION': 'Suspension',
    'DROP': 'Drops', 'DROPS': 'Drops',
    'INJ': 'Vial', 'INJECTION': 'Vial', 'VIAL': 'Vial',
    'CREAM': 'Cream', 'CRM': 'Cream',
    'GEL': 'Gel',
    'OINT': 'Ointment', 'OINTMENT': 'Ointment',
    'POWDER': 'Sachet', 'SACHET': 'Sachet', 'POW': 'Sachet',
    'WASH': 'Bottle', 'LOTION': 'Bottle', 'SHAMPOO': 'Bottle',
    'SPRAY': 'Bottle', 'RESPULE': 'Ampoule', 'ROTACAP': 'Capsule',
    'SOAP': 'Piece', 'PATCH': 'Piece', 'SUPP': 'Piece', 'IV': 'Bottle',
    'TUBE': 'Tube', 'KIT': 'Kit', 'JAR': 'Jar', 'INHALER': 'Piece',
    'SUTURE': 'Piece', 'SILK': 'Piece', 'SET': 'Piece', 'CATHETER': 'Piece',
    'NEEDLE': 'Piece', 'GLOVE': 'Piece', 'MASK': 'Piece', 'SYRINGE': 'Piece',
    'BANDAGE': 'Piece', 'DRAPE': 'Piece', 'BAG': 'Piece', 'DIAPER': 'Piece',
    'PANTS': 'Piece', 'PAMPERS': 'Piece', 'MAMYPOKO': 'Piece', 'CERELAC': 'Piece',
    'LACTOGEN': 'Piece', 'SUPPORT': 'Piece', 'BELT': 'Piece', 'WIRE': 'Piece',
    'GAUZE': 'Piece', 'TAPE': 'Piece', 'COTTON': 'Piece', 'PLAST': 'Piece', 'PASTE': 'Tube'
}

def infer_from_name(name):
    if not isinstance(name, str):
        return 'Piece'
    name_upper = name.upper()
    
    # 1. Explicit keyword match
    for kw, unit in KEYWORD_TO_UNIT.items():
        if f" {kw}" in name_upper or f"{kw} " in name_upper or name_upper.endswith(kw):
            return unit
        if f"-{kw}" in name_upper or f"_{kw}" in name_upper:
            return unit
            
    # 2. Medical Heuristics based on dosage format
    # If it has ML -> Liquid
    if 'ML' in name_upper and 'GM' not in name_upper and 'MG' not in name_upper:
        if 'OIL' in name_upper or 'WASH' in name_upper or 'SOLUTION' in name_upper:
            return 'Bottle'
        return 'Syrup'
        
    # If it has MG/MCG but no ML -> Solid dose
    if ('MG' in name_upper or 'MCG' in name_upper) and 'ML' not in name_upper:
        if re.search(r'\b(SR|ER|PR|DT|MD|XR)\b', name_upper):
            return 'Tablet'
        return 'Tablet'
        
    # If it has 'GM' -> Cream/Ointment/Sachet
    if 'GM' in name_upper:
        if 'POWDER' in name_upper:
            return 'Sachet'
        return 'Tube'
        
    # If it has an 'S' at the end of a number (e.g. 10S, 15S) which usually means a strip of tablets
    if re.search(r'\b\d+S\b', name_upper):
        return 'Tablet'
        
    # We DO NOT fallback to Tablet just because it has a number. Default to Piece.
    return 'Piece'

def main():
    print("Loading Excel file...")
    df = pd.read_excel(FILE_PATH, header=2)
    df['Old_Unit'] = df['Unit']
    
    print("Applying extremely strict medical heuristics...")
    df['Unit'] = df['Product Name'].apply(infer_from_name)
    
    print("Saving to Excel...")
    df.to_excel(OUTPUT_PATH, index=False)
    
    print("\n--- Final Anti-Cheat Summary Report ---")
    changes = df[df['Unit'] != df['Old_Unit']]
    print(f"Total rows updated: {len(changes)}")
    print("\nTop corrected units distribution:")
    print(df['Unit'].value_counts().head(20))
    print("Done!")

if __name__ == '__main__':
    main()
