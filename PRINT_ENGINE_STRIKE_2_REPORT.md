# PRINT ENGINE CUSTOMIZATION (STRIKE 2 - THE SETTINGS UI)

## 1. Zustand & API Sync Overhaul

The frontend settings layer has been refactored to decouple from local storage toggles and sync directly with the backend API.

### Changes to Types (`apps/frontend/types/index.ts`)
We removed the legacy `showMRPOnInvoice`, `showBatchOnInvoice`, and `showDoctorOnInvoice` from the `PrinterSettings` interface.
We introduced comprehensive typing for the JSON payload:
```typescript
export interface PrintSettingsConfig {
    template: 'A4' | 'Thermal_80mm' | 'Thermal_58mm';
    columns: PrintColumn[];
    header: PrintHeaderConfig;
    footer: PrintFooterConfig;
}
```
And added `printSettingsRetail` and `printSettingsWholesale` optional fields to `OutletSettings`.

### Changes to Store & Hooks (`apps/frontend/hooks/useOutletSettings.ts` & `store/settingsStore.ts`)
- The legacy toggles were stripped out of `DEFAULT_PRINTER` in Zustand.
- A new dedicated `updatePrintSettings` function was added to the `useOutletSettings` React Query hook to safely push partial JSON payloads to the backend API:
```typescript
    const updatePrintSettings = async (mode: 'retail' | 'wholesale', newJson: any) => {
        if (!outletId) return;
        const patch = mode === 'retail' 
            ? { printSettingsRetail: newJson } 
            : { printSettingsWholesale: newJson };
        await settingsApi.updateSettings(outletId, patch);
        await queryClient.invalidateQueries({ queryKey: ['outlet', 'settings', outletId] });
    };
```

---

## 2. The New Dual-Mode Settings UI

The monolithic `PrinterSettingsSection.tsx` was completely rewritten. It now maps dynamically over the robust JSON configurations.

**Key Features Implemented:**
- **Mode Toggle:** A top-level toggle cleanly separates Retail vs. Wholesale state.
- **Column Manager:** Maps over `activeConfig.columns` to render checkboxes for visibility (`isVisible`) and Arrow buttons to sort the array (`order`). Sorting automatically swaps the array indices and recalculates the `.order` properties before saving.
- **Header & Footer Edit:** Bound directly to `activeConfig.header` and `activeConfig.footer` via `Input` and `Textarea` components.

### Core Implementation Snippet
```tsx
                {/* Column Manager */}
                <div className="border rounded-xl p-4 bg-white shadow-sm">
                    <h3 className="font-semibold text-lg mb-4 text-slate-800">Column Manager</h3>
                    <p className="text-sm text-slate-500 mb-4">Toggle visibility and drag to reorder columns.</p>
                    <div className="space-y-2">
                        {activeConfig.columns.map((col, idx) => (
                            <div key={col.id} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="checkbox" 
                                        checked={col.isVisible} 
                                        onChange={(e) => handleColumnToggle(col.id, e.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary accent-primary"
                                    />
                                    <span className="font-medium text-slate-700">{col.label}</span>
                                    <span className="text-xs text-slate-400">({col.width})</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        type="button" variant="outline" size="icon" className="h-8 w-8"
                                        onClick={() => handleColumnMove(idx, 'up')} disabled={idx === 0}
                                    ><ArrowUp className="h-4 w-4" /></Button>
                                    <Button 
                                        type="button" variant="outline" size="icon" className="h-8 w-8"
                                        onClick={() => handleColumnMove(idx, 'down')} disabled={idx === activeConfig.columns.length - 1}
                                    ><ArrowDown className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
```

---

## 3. Developer QA Confirmation Checklist

Before moving to Strike 3 (Wiring the Print Components), verify the following manually via the UI:

- [ ] Open the `/dashboard/settings` route and click the "Print Settings" tab.
- [ ] Confirm you can toggle between **Retail Settings** and **Wholesale Settings**. The UI inputs (columns and headers) should hot-swap their data based on the mode.
- [ ] Uncheck a column (e.g., M.R.P) and click "Save Retail Settings".
- [ ] Open the browser's Network Tab and inspect the `PATCH` request to `/api/v1/outlet/settings/`. Confirm that `printSettingsRetail.columns` includes the updated `isVisible: false` boolean for M.R.P.
- [ ] Refresh the page and confirm the settings re-hydrate correctly from the database (persisting your toggle state).
