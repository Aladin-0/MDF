import pandas as pd
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from duckduckgo_search import DDGS
import threading

FILE_PATH = "/home/aladin/projects/mediflow-deployement/NEW STOCK SEP-2026.xls"
OUTPUT_PATH = "/home/aladin/projects/mediflow-deployement/UPDATED_STOCK_SEP-2026.xlsx"

# The exact Mediflow supported units
SUPPORTED_UNITS = [
    'Tablet', 'Capsule', 'Softgel', 'Syrup', 'Suspension', 'Drops', 
    'Vial', 'Bottle', 'Cream', 'Gel', 'Ointment', 'Tube', 
    'Piece', 'Jar', 'Sachet', 'Ampoule', 'Kit'
]

# Quick mapping for rule-based extraction
KEYWORD_TO_UNIT = {
    'TAB': 'Tablet', 'TABLET': 'Tablet',
    'CAP': 'Capsule', 'CAPSULE': 'Capsule',
    'SOFTGEL': 'Softgel',
    'SYP': 'Syrup', 'SYRUP': 'Syrup',
    'SUSP': 'Suspension', 'SUSPENSION': 'Suspension',
    'DROP': 'Drops',
    'INJ': 'Vial', 'INJECTION': 'Vial', 'VIAL': 'Vial',
    'CREAM': 'Cream', 'CRM': 'Cream',
    'GEL': 'Gel',
    'OINT': 'Ointment', 'OINTMENT': 'Ointment',
    'POWDER': 'Sachet', 'SACHET': 'Sachet', 'POW': 'Sachet',
    'WASH': 'Bottle', 'LOTION': 'Bottle', 'SHAMPOO': 'Bottle',
    'SPRAY': 'Bottle', 'RESPULE': 'Ampoule', 'ROTACAP': 'Capsule',
    'SOAP': 'Piece', 'PATCH': 'Piece', 'SUPP': 'Piece', 'IV': 'Bottle',
    'TUBE': 'Tube', 'KIT': 'Kit', 'JAR': 'Jar'
}

def infer_from_name(name):
    if not isinstance(name, str):
        return None
    name = name.upper()
    for kw, unit in KEYWORD_TO_UNIT.items():
        if f" {kw}" in name or f"{kw} " in name or name.endswith(kw):
            return unit
        # special case for hyphenated like "AZITHRAL-500MG-TAB"
        if f"-{kw}" in name:
            return unit
    return None

def extract_brand(name):
    if not isinstance(name, str):
        return "UNKNOWN"
    name = name.upper()
    match = re.search(r'[A-Z]{3,}', name)
    if match:
        return match.group(0)
    return name.split()[0] if name.split() else name

search_cache = {}
lock = threading.Lock()

def web_search_unit(brand):
    with lock:
        if brand in search_cache:
            return search_cache[brand]
            
    # For common non-medicines that are clearly pieces/packs
    if brand in ['SYRINGE', 'CERELAC', 'LACTOGEN', 'COLOBAG', 'PAMPERS', 'MAMYPOKO', 'DIAPER']:
        with lock:
            search_cache[brand] = 'Piece'
        return 'Piece'
    
    query = f"{brand} medicine tablet syrup capsule drops injection cream"
    best_match = 'Piece'
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=3))
            if results:
                text = " ".join([r.get('body', '') + ' ' + r.get('title', '') for r in results]).lower()
                
                scores = {
                    'Tablet': text.count('tablet') + text.count(' tab '),
                    'Capsule': text.count('capsule') + text.count(' cap '),
                    'Syrup': text.count('syrup'),
                    'Suspension': text.count('suspension'),
                    'Drops': text.count('drop'),
                    'Vial': text.count('injection') + text.count('vial') + text.count('ampoule'),
                    'Cream': text.count('cream'),
                    'Gel': text.count('gel'),
                    'Ointment': text.count('ointment'),
                    'Piece': text.count('piece') + text.count('pack') + text.count('device')
                }
                
                max_score = max(scores.values())
                if max_score > 0:
                    best_match = max(scores, key=scores.get)
    except Exception as e:
        pass
        
    with lock:
        search_cache[brand] = best_match
    return best_match

def main():
    print("Loading Excel file...")
    # Use header=2 to get correct columns
    df = pd.read_excel(FILE_PATH, header=2)
    
    df['Old_Unit'] = df['Unit']
    
    print("Applying rule-based extraction from names...")
    df['New_Unit'] = df['Product Name'].apply(infer_from_name)
    
    ambiguous = df[df['New_Unit'].isnull() & df['Product Name'].notnull()]
    unique_brands = list(ambiguous['Product Name'].apply(extract_brand).unique())
    
    print(f"Identified {len(unique_brands)} unique ambiguous brands for web search.")
    
    print("Starting 10-agent threaded web search (this might take a few minutes)...")
    completed = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_brand = {executor.submit(web_search_unit, b): b for b in unique_brands}
        for future in as_completed(future_to_brand):
            completed += 1
            if completed % 50 == 0:
                print(f"Searched {completed}/{len(unique_brands)} brands...")
                
    def resolve_unit(row):
        if pd.notnull(row['New_Unit']):
            return row['New_Unit']
        if pd.isnull(row['Product Name']):
            return 'Piece'
        brand = extract_brand(row['Product Name'])
        return search_cache.get(brand, 'Piece')

    print("Applying searched units...")
    df['Unit'] = df.apply(resolve_unit, axis=1)
    df.drop(columns=['New_Unit'], inplace=True)
    
    # Save the file correctly (with original headers)
    print(f"Saving to {OUTPUT_PATH}...")
    # We should preserve the top 2 rows if possible, but since the user just wants the data fixed, 
    # and the original has weird top rows, we'll just write the cleaned table directly for easy import.
    df.to_excel(OUTPUT_PATH, index=False)
    
    print("\n--- Summary Report ---")
    changes = df[df['Unit'] != df['Old_Unit']]
    print(f"Total rows updated: {len(changes)}")
    print("\nTop corrected units distribution:")
    print(df['Unit'].value_counts().head(20))
    print("\nDone!")

if __name__ == '__main__':
    main()
