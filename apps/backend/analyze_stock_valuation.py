import pandas as pd
import json

def preview_excel(filepath):
    try:
        df = pd.read_excel(filepath, engine='xlrd')
        print(df.head(20).to_json(orient="records"))
    except Exception as e:
        print(f"Error reading with xlrd: {e}")
        try:
            df = pd.read_excel(filepath, engine='openpyxl')
            print(df.head(20).to_json(orient="records"))
        except Exception as e:
            print(f"Error reading with openpyxl: {e}")
            try:
                # Sometime .xls is actually html
                with open(filepath, 'r') as f:
                    content = f.read(500)
                    print(f"Raw content start: {content}")
            except Exception as e2:
                print(f"Failed to read raw: {e2}")

if __name__ == "__main__":
    preview_excel("stock_valuation.xls")
