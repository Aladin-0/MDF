import pandas as pd
import random

file_path = "/home/aladin/projects/mediflow-deployement/UPDATED_STOCK_SEP-2026.xlsx"
df = pd.read_excel(file_path)

# Filter for rows that had a unit change and were likely ambiguous
# We know the old file had "PCS" and others.
# Let's just pick a random sample of 30 items that don't have obvious words in their names
obvious_keywords = ['TAB', 'CAP', 'SYP', 'INJ', 'CREAM', 'GEL', 'OINT', 'DROP', 'LOTION']

def is_ambiguous(name):
    name = str(name).upper()
    return not any(kw in name for kw in obvious_keywords)

ambiguous_df = df[df['Product Name'].apply(is_ambiguous)]

print("--- Cross-Check: 30 Random Ambiguous Products ---")
# Pick a random sample
random.seed(42) # for reproducibility
sample = ambiguous_df.sample(n=min(30, len(ambiguous_df)))

for _, row in sample.iterrows():
    print(f"Product: {row['Product Name'].ljust(35)} => Unit assigned: {row['Unit']}")

