'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

export interface ReportPageLayoutProps {
    title: string;
    description: string;
    breadcrumbs: BreadcrumbItem[];
    parameterBar?: ReactNode;
    exportActions?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
}

/**
 * ReportPageLayout
 * Reusable Hub & Spoke layout wrapper for standardizing individual ERP and analytical report pages.
 */
export function ReportPageLayout({
    title,
    description,
    breadcrumbs,
    parameterBar,
    exportActions,
    children,
    className,
    contentClassName,
}: ReportPageLayoutProps) {
    return (
        <div className={cn("w-full max-w-7xl mx-auto space-y-6 p-4 sm:p-6 lg:p-8", className)}>
            {/* 1. Header Section */}
            <div className="space-y-2">
                {/* Breadcrumbs */}
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav aria-label="Breadcrumbs" className="flex items-center text-xs font-medium text-slate-500 flex-wrap">
                        {breadcrumbs.map((crumb, index) => {
                            const isLast = index === breadcrumbs.length - 1;
                            return (
                                <div key={`${crumb.label}-${index}`} className="flex items-center">
                                    {index > 0 && (
                                        <span className="mx-2 text-slate-300 select-none">/</span>
                                    )}
                                    {crumb.href && !isLast ? (
                                        <Link
                                            href={crumb.href}
                                            className="text-slate-600 hover:text-slate-900 transition-colors"
                                        >
                                            {crumb.label}
                                        </Link>
                                    ) : (
                                        <span className={cn(isLast ? "text-slate-900 font-semibold" : "text-slate-600")}>
                                            {crumb.label}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                )}

                {/* Title & Description */}
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
                            {description}
                        </p>
                    )}
                </div>
            </div>

            {/* 2. Control Bar */}
            {(parameterBar || exportActions) && (
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-gray-50 p-4 rounded-lg border border-slate-200 mb-6 shadow-xs">
                    {/* Left: Parameter Bar (date range, selectors, toggles) */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {parameterBar}
                    </div>

                    {/* Right: Export Actions (download buttons, print, format options) */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                        {exportActions}
                    </div>
                </div>
            )}

            {/* 3. Content Body */}
            <div className={cn("bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6", contentClassName)}>
                {children}
            </div>
        </div>
    );
}

export default ReportPageLayout;
