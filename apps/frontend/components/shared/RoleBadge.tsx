import { StaffRole } from '@/types';
import { cn } from '@/lib/utils';

interface RoleBadgeProps {
    role: StaffRole;
    size?: 'sm' | 'md';
}

const roleConfig: Record<StaffRole, { label: string; className: string }> = {
    super_admin: { label: 'Super Admin', className: 'bg-purple-100 text-purple-700' },
    admin: { label: 'Admin', className: 'bg-blue-100 text-blue-700' },
    manager: { label: 'Manager', className: 'bg-green-100 text-green-700' },
    billing_staff: { label: 'Billing Staff', className: 'bg-amber-100 text-amber-700' },
    view_only: { label: 'View Only', className: 'bg-slate-100 text-slate-600' },
};

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
    const config = roleConfig[role] || { label: role, className: 'bg-gray-100 text-gray-700' };

    return (
        <span
            className={cn(
                'rounded-full font-medium inline-flex items-center justify-center',
                size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1',
                config.className
            )}
        >
            {config.label}
        </span>
    );
}
