'use client';

import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * A way into the Audit Trail for the super admin, in the place of the old "Audit & Revision Watch" card.
 *
 * That card called an endpoint that was never connected (it always showed zeros) and would have shown audit
 * information to managers, while the audit trail is super-admin only (docs/AUDIT_TRAIL.md, docs/ACCESS_CONTROL.md).
 * Everyone else sees nothing here.
 */
export function AuditTrailLink() {
    const { hasPermission } = usePermissions();
    if (!hasPermission('view_audit_trail')) return null;
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck className="h-5 w-5 text-slate-700" aria-hidden="true" />
                    Audit Trail
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    Who changed bills, purchases and stock, and what needs a look (edits after payment, big discounts, cancellations).
                </p>
                <Link
                    href="/admin/audit"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-primary hover:bg-muted sm:w-auto"
                >
                    Open the Audit Trail <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            </CardContent>
        </Card>
    );
}
