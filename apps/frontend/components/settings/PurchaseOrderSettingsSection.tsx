'use client';

import { ClipboardList } from 'lucide-react';
import { POSettingsTab } from '@/components/purchases/POSettingsTab';
import { SettingsSectionHeader } from './SettingsSectionHeader';

/** Purchase order settings live in Settings with the other outlet-wide options. The form keeps its own Save (it asks for the password again). */
export function PurchaseOrderSettingsSection() {
    return (
        <div>
            <SettingsSectionHeader
                icon={<ClipboardList />}
                title="Purchase Orders"
                description="How purchase orders are numbered, sent to distributors and closed. Saving asks for your password."
            />
            <POSettingsTab />
        </div>
    );
}
