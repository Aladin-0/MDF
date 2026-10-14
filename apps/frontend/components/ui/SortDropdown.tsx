'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SortOption {
    label: string;
    value: string;
}

export interface SortDropdownProps {
    options: SortOption[];
    defaultValue?: string;
    paramName?: string;
    paramKey?: string;
    className?: string;
    triggerClassName?: string;
    placeholder?: string;
    showIcon?: boolean;
    onChange?: (value: string) => void;
}

export function SortDropdown({
    options,
    defaultValue,
    paramName = 'sort',
    paramKey,
    className,
    triggerClassName,
    placeholder = 'Sort by...',
    showIcon = false,
    onChange,
}: SortDropdownProps) {
    const key = paramKey || paramName;
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentParam = searchParams.get(key);
    const activeValue = currentParam || defaultValue || options[0]?.value;

    const handleValueChange = (val: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(key, val);
        const queryStr = params.toString();
        const targetUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
        router.push(targetUrl, { scroll: false });
        onChange?.(val);
    };

    return (
        <div className={cn('relative inline-block', className)}>
            <Select value={activeValue} onValueChange={handleValueChange}>
                <SelectTrigger
                    className={cn(
                        'h-9 min-w-[150px] gap-2 bg-background text-xs font-medium border-border/80 shadow-none hover:bg-muted/30 focus:ring-1 focus:ring-primary/40 transition-colors',
                        triggerClassName
                    )}
                >
                    <div className="flex items-center gap-1.5 truncate">
                        {showIcon && <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-muted-foreground text-[11px] font-normal shrink-0">Sort:</span>
                        <SelectValue placeholder={placeholder} />
                    </div>
                </SelectTrigger>
                <SelectContent align="end" className="text-xs">
                    {options.map((opt) => (
                        <SelectItem
                            key={opt.value}
                            value={opt.value}
                            className="text-xs font-medium cursor-pointer"
                        >
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default SortDropdown;
