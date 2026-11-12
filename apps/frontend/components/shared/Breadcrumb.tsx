'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

export function Breadcrumb() {
    const pathname = usePathname();
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length <= 1) return null;

    const breadcrumbs = segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;

        // Capitalize and format segment
        const label = segment
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        return { href, label, isLast };
    });

    return (
        <nav aria-label="Breadcrumb" className="mt-1 flex flex-wrap items-center text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center">
                    {index > 0 && <ChevronRight className="w-3.5 h-3.5 mx-1 opacity-50" />}
                    {crumb.isLast ? (
                        <span className="text-slate-900 font-medium">{crumb.label}</span>
                    ) : (
                        <Link href={crumb.href} className="hover:text-primary transition-colors cursor-pointer">
                            {crumb.label}
                        </Link>
                    )}
                </div>
            ))}
        </nav>
    );
}
