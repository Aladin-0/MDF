import { cn } from '@/lib/utils';

interface ListBannerProps {
    tone: 'amber' | 'red';
    icon: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
}

const TONES = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900 [&_p.desc]:text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-900 [&_p.desc]:text-red-800',
};

/** The summary strip above the Expiring and Low Stock lists. */
export function ListBanner({ tone, icon, title, description, actions }: ListBannerProps) {
    return (
        <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4', TONES[tone])}>
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
                <div>
                    <p className="font-semibold">{title}</p>
                    {description && <p className="desc text-sm">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
