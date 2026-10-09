'use client';

import React, { useEffect, useState } from 'react';
import { Printer, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { PrintSettingsConfig } from '@/types';

interface PrinterSettingsSectionProps {
    onDirty: () => void;
    onSaved: () => void;
    discardKey?: number;
}

const DEFAULT_RETAIL: PrintSettingsConfig = {
    template: 'A4',
    columns: [
        { id: "sn", label: "SN", isVisible: true, order: 1, width: "5%" },
        { id: "productName", label: "Item Name & Company", isVisible: true, order: 2, width: "31%" },
        { id: "batch", label: "Batch", isVisible: true, order: 3, width: "11%" },
        { id: "exp", label: "Exp", isVisible: true, order: 4, width: "8%" },
        { id: "qty", label: "Qty", isVisible: true, order: 5, width: "8%" },
        { id: "mrp", label: "MRP", isVisible: true, order: 6, width: "9%" },
        { id: "ptr", label: "Rate", isVisible: true, order: 7, width: "9%" },
        { id: "disc", label: "Disc", isVisible: true, order: 8, width: "7%" },
        { id: "amount", label: "Amount(₹)", isVisible: true, order: 9, width: "12%" }
    ],
    header: { showLogo: true, showDrugLicense: true, showGstin: true, customText: "S.P.S MANAVATA PHARMA" },
    footer: { bankDetails: "", terms: "1. Goods once sold will not be taken back." }
};

const DEFAULT_WHOLESALE: PrintSettingsConfig = {
    template: 'A4',
    columns: [
        { id: "sn", label: "SN", isVisible: true, order: 1, width: "4%" },
        { id: "productName", label: "Item Name & Details", isVisible: true, order: 2, width: "22%" },
        { id: "hsn", label: "HSN", isVisible: true, order: 3, width: "6%" },
        { id: "batch", label: "Batch", isVisible: true, order: 4, width: "8%" },
        { id: "exp", label: "Exp", isVisible: true, order: 5, width: "6%" },
        { id: "b_qty", label: "B-Qty", isVisible: true, order: 6, width: "5%" },
        { id: "f_qty", label: "F-Qty", isVisible: true, order: 7, width: "5%" },
        { id: "mrp", label: "MRP", isVisible: true, order: 8, width: "7%" },
        { id: "ptr", label: "PTR", isVisible: true, order: 9, width: "7%" },
        { id: "disc", label: "Disc", isVisible: true, order: 10, width: "5%" },
        { id: "gst", label: "GST", isVisible: true, order: 11, width: "5%" },
        { id: "taxable", label: "Taxable", isVisible: true, order: 12, width: "8%" },
        { id: "amount", label: "Amount(₹)", isVisible: true, order: 13, width: "12%" }
    ],
    header: { showLogo: true, showDrugLicense: true, showGstin: true, customText: "S.P.S MANAVATA PHARMA" },
    footer: { bankDetails: "Bank: HDFC, A/C: 1234...", terms: "1. Goods once sold will not be taken back." }
};

export function PrinterSettingsSection({ onDirty, onSaved, discardKey }: PrinterSettingsSectionProps) {
    const { toast } = useToast();
    const { settings, updatePrintSettings } = useOutletSettings();
    const [mode, setMode] = useState<'retail' | 'wholesale'>('retail');
    
    // Local state for edits
    const [retailConfig, setRetailConfig] = useState<PrintSettingsConfig>(DEFAULT_RETAIL);
    const [wholesaleConfig, setWholesaleConfig] = useState<PrintSettingsConfig>(DEFAULT_WHOLESALE);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (settings) {
            if (settings.printSettingsRetail?.columns) {
                const hasExp = settings.printSettingsRetail.columns.some((c: any) => c.id === 'exp');
                // Auto-heal legacy configs that are missing the new columns
                if (!hasExp || settings.printSettingsRetail.columns.length < DEFAULT_RETAIL.columns.length) {
                    setRetailConfig(DEFAULT_RETAIL);
                } else {
                    setRetailConfig(settings.printSettingsRetail);
                }
            }
            if (settings.printSettingsWholesale?.columns) {
                const hasExp = settings.printSettingsWholesale.columns.some((c: any) => c.id === 'exp');
                if (!hasExp || settings.printSettingsWholesale.columns.length < DEFAULT_WHOLESALE.columns.length) {
                    setWholesaleConfig(DEFAULT_WHOLESALE);
                } else {
                    setWholesaleConfig(settings.printSettingsWholesale);
                }
            }
        }
        setIsDirty(false);
    }, [settings, discardKey]);

    useEffect(() => {
        if (isDirty) onDirty();
    }, [isDirty, onDirty]);

    const activeConfig = mode === 'retail' ? retailConfig : wholesaleConfig;

    const setConfig = (newConfig: PrintSettingsConfig) => {
        if (mode === 'retail') {
            setRetailConfig(newConfig);
        } else {
            setWholesaleConfig(newConfig);
        }
        setIsDirty(true);
    };

    const handleColumnToggle = (id: string, isVisible: boolean) => {
        setConfig({
            ...activeConfig,
            columns: activeConfig.columns.map(c => c.id === id ? { ...c, isVisible } : c)
        });
    };

    const handleColumnMove = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === activeConfig.columns.length - 1) return;
        
        const newColumns = [...activeConfig.columns];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        const temp = newColumns[index];
        newColumns[index] = newColumns[swapIndex];
        newColumns[swapIndex] = temp;
        
        // Reassign orders
        newColumns.forEach((c, i) => c.order = i + 1);
        setConfig({ ...activeConfig, columns: newColumns });
    };

    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();
        try {
            await updatePrintSettings(mode, activeConfig);
            toast({ title: 'Printer settings saved' });
            setIsDirty(false);
            onSaved();
        } catch (error) {
            toast({ title: 'Error saving settings', variant: 'destructive' });
        }
    };

    return (
        <form onSubmit={handleSave} className="space-y-6 pb-24">
            <SettingsSectionHeader
                icon={<Printer />}
                title="Dynamic Print Engine"
                description="Configure customizable layouts for Retail and Wholesale invoices independently."
            />

            {/* Mode Switcher */}
            <div className="flex gap-4 border-b pb-2">
                <Button 
                    type="button" 
                    variant={mode === 'retail' ? 'default' : 'outline'}
                    onClick={() => setMode('retail')}
                >
                    Retail Settings (Thermal)
                </Button>
                <Button 
                    type="button" 
                    variant={mode === 'wholesale' ? 'default' : 'outline'}
                    onClick={() => setMode('wholesale')}
                >
                    Wholesale Settings (A4)
                </Button>
            </div>

            <div className="space-y-6">
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
                                        type="button" 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-8 w-8"
                                        onClick={() => handleColumnMove(idx, 'up')}
                                        disabled={idx === 0}
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-8 w-8"
                                        onClick={() => handleColumnMove(idx, 'down')}
                                        disabled={idx === activeConfig.columns.length - 1}
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Header Config */}
                <div className="border rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <h3 className="font-semibold text-lg text-slate-800">Header Details</h3>
                    <div className="space-y-2 divide-y">
                        <SettingsToggleRow
                            label="Show Logo"
                            description="Display the pharmacy logo at the top."
                            checked={activeConfig.header.showLogo}
                            onCheckedChange={(v) => setConfig({ ...activeConfig, header: { ...activeConfig.header, showLogo: v } })}
                            className="pt-2 pb-2 border-b-0"
                        />
                        <SettingsToggleRow
                            label="Show Drug License"
                            description="Display DL numbers in the header."
                            checked={activeConfig.header.showDrugLicense}
                            onCheckedChange={(v) => setConfig({ ...activeConfig, header: { ...activeConfig.header, showDrugLicense: v } })}
                            className="pt-4 pb-2 border-b-0"
                        />
                        <SettingsToggleRow
                            label="Show GSTIN"
                            description="Display GST Number in the header."
                            checked={activeConfig.header.showGstin}
                            onCheckedChange={(v) => setConfig({ ...activeConfig, header: { ...activeConfig.header, showGstin: v } })}
                            className="pt-4 pb-2 border-b-0"
                        />
                        <div className="pt-4 pb-2">
                            <Label className="text-slate-700">Custom Header Text (e.g. Shop Name override)</Label>
                            <Input 
                                className="mt-2"
                                value={activeConfig.header.customText} 
                                onChange={(e) => setConfig({ ...activeConfig, header: { ...activeConfig.header, customText: e.target.value } })}
                                placeholder="Enter custom text..."
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Config */}
                <div className="border rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <h3 className="font-semibold text-lg text-slate-800">Footer Details</h3>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-slate-700">Bank Details</Label>
                            <Textarea 
                                className="mt-2"
                                value={activeConfig.footer.bankDetails}
                                onChange={(e) => setConfig({ ...activeConfig, footer: { ...activeConfig.footer, bankDetails: e.target.value } })}
                                placeholder="Enter bank details here..."
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label className="text-slate-700">Terms & Conditions</Label>
                            <Textarea 
                                className="mt-2"
                                value={activeConfig.footer.terms}
                                onChange={(e) => setConfig({ ...activeConfig, footer: { ...activeConfig.footer, terms: e.target.value } })}
                                placeholder="Enter T&C here..."
                                rows={4}
                            />
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-end pt-4">
                    <Button type="submit">Save {mode === 'retail' ? 'Retail' : 'Wholesale'} Settings</Button>
                </div>
            </div>
            
            {/* Hidden submit for page wrapper trigger */}
            <button type="submit" id="settings-submit-btn" className="hidden">Save</button>
        </form>
    );
}
