'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface SettingsToggleRowProps {
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    warningMessage?: string;
    icon?: React.ReactNode;
    className?: string;
}

export function SettingsToggleRow({
    label,
    description,
    checked,
    onCheckedChange,
    disabled = false,
    warningMessage,
    icon,
    className,
}: SettingsToggleRowProps) {
    return (
        <div className={cn('py-4 border-b last:border-b-0', className)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                    {icon && (
                        <span className="text-slate-500 mt-0.5 [&>svg]:w-4 [&>svg]:h-4 shrink-0">
                            {icon}
                        </span>
                    )}
                    <div>
                        <p className="text-sm font-medium text-slate-900">{label}</p>
                        {description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
                <Switch
                    checked={checked}
                    onCheckedChange={onCheckedChange}
                    disabled={disabled}
                />
            </div>
            {warningMessage && !checked && (
                <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{warningMessage}</p>
                </div>
            )}
        </div>
    );
}
