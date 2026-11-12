'use client';

import React from 'react';

interface SettingsSectionHeaderProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

export function SettingsSectionHeader({ icon, title, description }: SettingsSectionHeaderProps) {
    return (
        <div className="flex items-start gap-3 sm:gap-4 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary [&>svg]:w-5 [&>svg]:h-5">{icon}</span>
            </div>
            <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-lg">{description}</p>
            </div>
        </div>
    );
}
