import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Customer } from '@/types';

type Props = Pick<Customer, 'isFamilyAccount' | 'isSharedAccountRecord' | 'isFamilyMember' | 'accountName' | 'relationship' | 'memberCount'> & { className?: string };

/** Marks a shared family account ("Family · 3 people") or a person on one ("Mother · Sharma Family Account"). Renders nothing for everyone else. */
export function FamilyBadge({ isFamilyAccount, isSharedAccountRecord, isFamilyMember, accountName, relationship, memberCount, className }: Props) {
    if (isFamilyAccount) {
        // an owner is one of the people on their own account; a purely shared record is nobody
        const people = memberCount != null ? memberCount + (isSharedAccountRecord ? 0 : 1) : null;
        return (
            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider', className)}>
                <Users className="w-3 h-3" /> Family{people != null ? ` · ${people} ${people === 1 ? 'person' : 'people'}` : ''}
            </span>
        );
    }
    if (isFamilyMember) {
        return (
            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600', className)}>
                <Users className="w-3 h-3" /> {[relationship, accountName].filter(Boolean).join(' · ')}
            </span>
        );
    }
    return null;
}
