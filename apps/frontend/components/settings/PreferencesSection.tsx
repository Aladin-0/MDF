'use client';

import { useEffect } from 'react';
import { Palette, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/use-toast';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';
import { cn } from '@/lib/utils';
import type { AppPreferences } from '@/types';

const DATE_FORMATS = [
    { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy', example: '14/03/2026' },
    { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy', example: '03/14/2026' },
    { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd', example: '2026-03-14' },
];

interface THEME_OPTION {
    id: AppPreferences['theme'];
    label: string;
    icon: React.ElementType;
    comingSoon?: boolean;
    bgClass?: string;
}

const THEME_OPTIONS: THEME_OPTION[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon, comingSoon: true, bgClass: 'bg-slate-900 text-white' },
    { id: 'system', label: 'System', icon: Monitor, comingSoon: true },
];

interface PreferencesSectionProps {
    onDirty?: () => void;
    onSaved?: () => void;
    discardKey?: number;
}

export function PreferencesSection({ onDirty, onSaved, discardKey }: PreferencesSectionProps) {
    const store = useSettingsStore();
    const { toast } = useToast();

    // Local state mirrors store directly (no form, save on each change)
    function handleThemeChange(theme: AppPreferences['theme']) {
        if (theme !== 'light') return; // Only light supported now
        store.updatePreferences({ theme });
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('dark');
        }
        toast({ title: 'Theme set to Light' });
        onSaved?.();
    }

    function handleCompactMode(v: boolean) {
        store.updatePreferences({ compactMode: v });
        if (typeof document !== 'undefined') {
            if (v) {
                document.documentElement.classList.add('compact');
            } else {
                document.documentElement.classList.remove('compact');
            }
        }
        onDirty?.();
        onSaved?.();
    }

    function handleDateFormat(fmt: string) {
        store.updatePreferences({ dateFormat: fmt });
        toast({ title: 'Date format updated' });
        onSaved?.();
    }

    useEffect(() => {
        if (discardKey !== undefined) {
            // nothing to reset — preferences are saved immediately
        }
    }, [discardKey]);

    return (
        <div className="space-y-6">
            <SettingsSectionHeader
                icon={<Palette />}
                title="App Preferences"
                description="Personal display preferences. These are saved per device."
            />

            {/* Theme */}
            <div className="rounded-xl border bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Theme</p>
                <div className="flex flex-wrap gap-3">
                    {THEME_OPTIONS.map(({ id, label, icon: Icon, comingSoon, bgClass }) => (
                        <button
                            key={id}
                            type="button"
                            disabled={comingSoon}
                            onClick={() => handleThemeChange(id)}
                            className={cn(
                                'border-2 rounded-xl p-4 flex flex-col items-center gap-2 min-w-[90px] transition-colors',
                                store.theme === id
                                    ? 'border-primary bg-primary/5'
                                    : 'border-slate-200 hover:border-slate-300',
                                comingSoon && 'opacity-60 cursor-not-allowed',
                                bgClass
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-xs font-medium">{label}</span>
                            {comingSoon && (
                                <span className="text-[10px] text-slate-400">(Coming soon)</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Compact Mode */}
            <div className="rounded-xl border bg-white px-4">
                <SettingsToggleRow
                    label="Compact mode"
                    description="Reduces padding and font sizes for more data on screen. Useful on smaller displays."
                    checked={store.compactMode}
                    onCheckedChange={handleCompactMode}
                />
            </div>

            {/* Date Format */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <Label className="text-sm font-medium">Date Format</Label>
                <Select value={store.dateFormat} onValueChange={handleDateFormat}>
                    <SelectTrigger className="w-full sm:w-64">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DATE_FORMATS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                                <span className="font-mono">{f.label}</span>
                                <span className="ml-2 text-muted-foreground text-xs">— {f.example}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How dates are displayed across the app</p>
            </div>

            {/* Language */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-sm font-medium">Language</Label>
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-normal">
                        Full multilingual support in Phase 2
                    </Badge>
                </div>
                <Select value={store.language} disabled>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hi" disabled>Hindi (हिन्दी) — Coming soon</SelectItem>
                        <SelectItem value="mr" disabled>Marathi (मराठी) — Coming soon</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Full multilingual support in Phase 2</p>
            </div>
        </div>
    );
}
