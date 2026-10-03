# PRINT ENGINE CUSTOMIZATION AUDIT

## 1. CURRENT STATE

### Database & API (`apps/backend/apps/core/models.py`)
Currently, the backend `OutletSettings` model only stores minimal, generic printing flags as individual boolean/integer columns:
- `thermal_print` (BooleanField)
- `printer_width` (IntegerField)
- `print_logo` (BooleanField)

The backend completely lacks any schema or JSON fields for column visibility, ordering, or specific header/footer customizations. It is oblivious to the concept of Retail vs. Wholesale templates.

### Frontend State (`apps/frontend/store/settingsStore.ts`)
The `PrinterSettings` interface defines three toggles:
- `showMRPOnInvoice`
- `showBatchOnInvoice`
- `showDoctorOnInvoice`

However, these settings are **exclusively managed via Zustand's `persist` middleware (Local Storage)**. They are never synced to or from the backend API. Furthermore, they are purely global flags; there is no distinction between Retail and Wholesale configurations.

### Print Component JSX (`ManavataA4Invoice.tsx` & `InvoiceThermal.tsx`)
The JSX components completely ignore the Zustand local storage toggles.
- **Column Hardcoding:** Both components use strictly hardcoded `<table>` headers (`<th>`) and rows (`<td>`). The A4 invoice hardcodes 16 explicit columns (`Sn`, `Product Name`, `Mfg`, `Pack`, `HSN`, `Batch`, `Exp`, `M.R.P`, `PTR`, `PTS`, `QTY`, `FR`, `SGST`, `CGST`, `Gst Amo`, `AMOUNT`).
- **Info Fields:** The header details in `ManavataA4Invoice.tsx` (e.g., Shop Name, DL Nos, GSTIN, and even terms and conditions) are hardcoded directly into the layout.

---

## 2. THE BOTTLENECKS

1. **State Isolation:** The settings are trapped in the browser's Local Storage. If a user logs into a different device or clears their cache, all print customizations will be lost.
2. **Monolithic JSX Structure:** The table bodies map over `invoice.items` and return explicit `<td>` elements in a fixed order. There is no mapping layer to match item properties dynamically to an array of configured columns.
3. **Missing Duality:** There is no state mechanism to define "Retail Columns" vs. "Wholesale Columns." `ManavataA4Invoice` serves Wholesale, but if we want to print an A4 Retail bill, there is no way to hide Wholesale-specific columns (like PTR, PTS) without hardcoding new logic.
4. **Hardcoded Metadata:** Shop metadata (Drug License, Phone, address strings) in the invoice headers are deeply hardcoded instead of pulling from `OutletSettings`.

---

## 3. UPGRADE BLUEPRINT

### Step 1: Database Schema Overhaul
We must introduce a unified JSONField to store robust, dual-mode configurations in `core_outletsettings`.

**Proposed Schema Addition (`core/models.py`):**
```python
from django.db import models

class OutletSettings(models.Model):
    # ... existing fields ...
    
    # New JSON fields for dual-mode engine
    print_settings_retail = models.JSONField(default=dict, blank=True)
    print_settings_wholesale = models.JSONField(default=dict, blank=True)
```

**Proposed JSON Structure:**
```json
{
  "template": "A4", // or "Thermal_80mm"
  "columns": [
    { "id": "sn", "label": "Sn.", "isVisible": true, "order": 1, "width": "5%" },
    { "id": "productName", "label": "Product Name", "isVisible": true, "order": 2, "width": "25%" },
    { "id": "batch", "label": "Batch", "isVisible": true, "order": 3, "width": "10%" },
    { "id": "mrp", "label": "M.R.P", "isVisible": false, "order": 4, "width": "10%" },
    { "id": "ptr", "label": "PTR", "isVisible": true, "order": 5, "width": "10%" }
  ],
  "header": {
    "showLogo": true,
    "showDrugLicense": true,
    "showGstin": true,
    "customText": "S.P.S MANAVATA PHARMA"
  },
  "footer": {
    "bankDetails": "Bank: HDFC, A/C: 1234...",
    "terms": "1. Goods once sold will not be taken back."
  }
}
```

### Step 2: API & Store Wiring
1. **Backend API:** Update the `OutletSettingsSerializer` to expose and validate `print_settings_retail` and `print_settings_wholesale`.
2. **Frontend Zustand (`useSettingsStore.ts`):** Drop the legacy `PrinterSettings` (Local Storage) and integrate the new JSON blocks into the global `settingsStore`, hydrated directly from the API.

### Step 3: JSX Refactoring (The Engine Upgrade)
1. **Dynamic Table Mapper:** Refactor `ManavataA4Invoice.tsx` and `InvoiceThermal.tsx`. Instead of hardcoded headers, sort the `columns` array by `order`, filter by `isVisible`, and map the `<th>` tags dynamically.
2. **Cell Resolution Function:** Create a helper function `resolveColumnValue(item, columnId)` that uses a switch statement to extract the correct value from a `SaleItem` based on the configured column ID.
3. **Map the Rows:** Inside `<tbody>`, map over `invoice.items`. Within each row, map over the filtered `columns` array, invoking the cell resolution function to render dynamic `<td>` elements in the correct order.
4. **Header/Footer Hydration:** Replace the hardcoded shop details in `ManavataA4Invoice` with variables extracted from `settings.print_settings_wholesale.header` and `OutletSettings`.
