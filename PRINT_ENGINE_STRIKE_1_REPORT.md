# PRINT ENGINE CUSTOMIZATION (STRIKE 1 - BACKEND JSON SCHEMA)

## 1. Python Code Updates for `OutletSettings` Model

Two new `JSONField` entries were added to `OutletSettings` in `apps/backend/apps/core/models.py`. Default dictionary generators were explicitly created to ensure new and legacy outlets fall back to robust defaults, preserving the existing print layout behavior exactly.

### Default Schemas

```python
def default_print_settings_retail():
    return {
        "template": "Thermal_80mm",
        "columns": [
            { "id": "sn", "label": "Sn.", "isVisible": True, "order": 1, "width": "10%" },
            { "id": "productName", "label": "Item", "isVisible": True, "order": 2, "width": "40%" },
            { "id": "qty", "label": "Qty", "isVisible": True, "order": 3, "width": "15%" },
            { "id": "mrp", "label": "M.R.P", "isVisible": True, "order": 4, "width": "15%" },
            { "id": "amount", "label": "Amt", "isVisible": True, "order": 5, "width": "20%" },
            { "id": "ptr", "label": "PTR", "isVisible": False, "order": 6, "width": "0%" },
            { "id": "pts", "label": "PTS", "isVisible": False, "order": 7, "width": "0%" },
            { "id": "batch", "label": "Batch", "isVisible": True, "order": 8, "width": "0%" },
            { "id": "hsn", "label": "HSN", "isVisible": False, "order": 9, "width": "0%" }
        ],
        "header": {
            "showLogo": True,
            "showDrugLicense": False,
            "showGstin": True,
            "customText": ""
        },
        "footer": {
            "bankDetails": "",
            "terms": "1. Goods once sold will not be taken back."
        }
    }

def default_print_settings_wholesale():
    return {
        "template": "A4",
        "columns": [
            { "id": "sn", "label": "Sn.", "isVisible": True, "order": 1, "width": "5%" },
            { "id": "productName", "label": "Product Name", "isVisible": True, "order": 2, "width": "25%" },
            { "id": "batch", "label": "Batch", "isVisible": True, "order": 3, "width": "10%" },
            { "id": "mrp", "label": "M.R.P", "isVisible": False, "order": 4, "width": "10%" },
            { "id": "ptr", "label": "PTR", "isVisible": True, "order": 5, "width": "10%" },
            { "id": "pts", "label": "PTS", "isVisible": True, "order": 6, "width": "10%" },
            { "id": "qty", "label": "QTY", "isVisible": True, "order": 7, "width": "10%" },
            { "id": "hsn", "label": "HSN", "isVisible": True, "order": 8, "width": "10%" },
            { "id": "amount", "label": "AMOUNT", "isVisible": True, "order": 9, "width": "10%" }
        ],
        "header": {
            "showLogo": True,
            "showDrugLicense": True,
            "showGstin": True,
            "customText": "S.P.S MANAVATA PHARMA"
        },
        "footer": {
            "bankDetails": "Bank: HDFC, A/C: 1234...",
            "terms": "1. Goods once sold will not be taken back."
        }
    }
```

### Model Update

```python
    # Dual-Mode Print Engine Configurations
    print_settings_retail = models.JSONField(default=default_print_settings_retail, blank=True)
    print_settings_wholesale = models.JSONField(default=default_print_settings_wholesale, blank=True)
```

## 2. API Exposure & Serialization Updates

The backend does not use a standard DRF serializer class for `OutletSettings`, but manually maps dictionaries in `OutletSettingsView` (`apps/backend/apps/core/views.py`). We updated both the `_serialize` function and the `patch` mutation mapping.

### `_serialize` Method Update
Added the mapping to expose JSON fields safely.
```python
            'printSettingsRetail': settings.print_settings_retail,
            'printSettingsWholesale': settings.print_settings_wholesale,
```

### `patch` Field Map Update
Enabled writes to the JSON fields when patching Settings.
```python
            'printSettingsRetail': 'print_settings_retail',
            'printSettingsWholesale': 'print_settings_wholesale',
```

## 3. Migration Instructions

The changes to the model require a new Django migration. To apply this schema change:

1. Generate the migration file:
   ```bash
   python manage.py makemigrations core
   ```
2. Apply the migration to the database:
   ```bash
   python manage.py migrate core
   ```

These have already been executed locally. The backend is now ready to safely accept and emit dynamic, dual-mode print configurations!
