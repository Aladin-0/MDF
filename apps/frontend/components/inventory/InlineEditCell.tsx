'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PACK_TYPE_OPTIONS, PACK_UNIT_OPTIONS } from '@/constants/productBehavior';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';
import type { MasterProduct } from '@/types';

export type QuickEditField = 'gstRate' | 'hsnCode' | 'scheduleType' | 'packType' | 'packSize' | 'packUnit';

export const QUICK_EDIT_LABELS: Record<QuickEditField, string> = {
    gstRate: 'GST Rate (%)',
    hsnCode: 'HSN Code',
    scheduleType: 'Schedule Type',
    packType: 'Pack Type',
    packSize: 'Pack Size',
    packUnit: 'Unit Name',
};

interface InlineEditCellProps {
    product: MasterProduct;
    field: QuickEditField;
    onSave: (value: string | number) => Promise<void>;
}

/** One editable cell of the "Quick Edit" column. Selects save as soon as you pick; text and numbers on Enter or the tick. */
export function InlineEditCell({ product, field, onSave }: InlineEditCellProps) {
    const stored = (product as any)[field];
    const [value, setValue] = useState<string>(String(stored ?? ''));
    const [saving, setSaving] = useState(false);
    const label = `${QUICK_EDIT_LABELS[field]} for ${product.name}`;

    useEffect(() => { setValue(String(stored ?? '')); }, [stored, field]);

    const save = async (next: string) => {
        const numeric = field === 'gstRate' || field === 'packSize';
        const final = numeric ? Number(next) : next;
        if (numeric && Number.isNaN(final)) return;
        setSaving(true);
        try { await onSave(final); } catch { setValue(String(stored ?? '')); /* the caller already told the user; show the saved value again */ }
        finally { setSaving(false); }
    };

    const isSelect = field === 'packType' || field === 'scheduleType' || field === 'packUnit';
    const options =
        field === 'packType' ? PACK_TYPE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label as string }))
        : field === 'scheduleType' ? SCHEDULE_TYPE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label as string }))
        : PACK_UNIT_OPTIONS.map((o) => ({ value: o.value as string, label: o.label as string }));
    // show a stored value the list does not offer (e.g. "Capsule" with different casing) instead of an empty box
    const shown = options.some((o) => o.value.toLowerCase() === value.toLowerCase()) ? options : [...options, { value, label: value }];
    const dirty = value !== String(stored ?? '');

    if (isSelect) {
        return (
            <div className="flex w-40 items-center gap-1">
                <Select value={value} onValueChange={(v) => { setValue(v); void save(v); }} disabled={saving}>
                    <SelectTrigger aria-label={label} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{shown.filter((o) => o.value).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            </div>
        );
    }

    return (
        <div className="flex w-40 items-center gap-1">
            <Input
                aria-label={label}
                name={field}
                type={field === 'gstRate' || field === 'packSize' ? 'number' : 'text'}
                autoComplete="off"
                spellCheck={false}
                className="h-8 px-2 text-xs tabular-nums"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save(value); }}
            />
            <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 shrink-0 p-0"
                aria-label={`Save ${label}`}
                title="Save (or press Enter)"
                onClick={() => void save(value)}
                disabled={saving || !dirty}
            >
                {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            </Button>
        </div>
    );
}
