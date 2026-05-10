'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { chainApi } from '@/lib/apiClient';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OutletOption {
    id: string;
    name: string;
    city: string;
    state: string;
}

interface OutletSwitcherProps {
    isCollapsed?: boolean;
}

export function OutletSwitcher({ isCollapsed = false }: OutletSwitcherProps) {
    const { user } = useAuthStore();
    const { selectedOutletId, setOutletId } = useSettingsStore();
    const [outlets, setOutlets] = useState<OutletOption[]>([]);
    const [loading, setLoading] = useState(false);

    // Only render for super_admin
    if (user?.role !== 'super_admin') return null;

    // Fetch outlets on mount
    useEffect(() => {
        setLoading(true);
        chainApi.getAllOutlets()
            .then(setOutlets)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const activeOutletId = selectedOutletId ?? user?.outlet?.id ?? '';
    const activeOutlet = outlets.find(o => o.id === activeOutletId);
    const displayName = activeOutlet?.name ?? user?.outlet?.name ?? 'Select Outlet';

    if (isCollapsed) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        title={`Outlet: ${displayName}`}
                        className="w-full flex justify-center items-center py-2 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                        <Building2 className="w-5 h-5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" className="w-56">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Outlet</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {outlets.map(o => (
                        <DropdownMenuItem
                            key={o.id}
                            className="cursor-pointer"
                            onClick={() => setOutletId(o.id)}
                        >
                            <Check className={cn('mr-2 h-4 w-4', o.id === activeOutletId ? 'opacity-100' : 'opacity-0')} />
                            <div>
                                <p className="font-medium text-sm">{o.name}</p>
                                {o.city && <p className="text-xs text-muted-foreground">{o.city}</p>}
                            </div>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 transition-colors text-sm">
                    <Building2 className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="flex-1 truncate text-left font-medium">{displayName}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Switch Operating Outlet
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {loading && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Loading outlets…</div>
                )}
                {outlets.map(o => (
                    <DropdownMenuItem
                        key={o.id}
                        className="cursor-pointer"
                        onClick={() => setOutletId(o.id)}
                    >
                        <Check className={cn('mr-2 h-4 w-4 shrink-0', o.id === activeOutletId ? 'text-primary opacity-100' : 'opacity-0')} />
                        <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{o.name}</p>
                            {o.city && (
                                <p className="text-xs text-muted-foreground">{o.city}{o.state ? `, ${o.state}` : ''}</p>
                            )}
                        </div>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
