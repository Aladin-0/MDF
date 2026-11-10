'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DistributorCombobox } from '@/components/shared/DistributorCombobox';
import { ModalShell } from '@/components/shared/ModalShell';
import { useDistributorList } from '@/hooks/usePurchases';

/** Pick a distributor and start a draft PO. Nothing is saved until you save it on the next screen. */
export function NewPurchaseOrderModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const router = useRouter();
    const { data: distributors, isLoading } = useDistributorList();
    const [dist, setDist] = useState('');

    const start = () => {
        if (!dist) return;
        onOpenChange(false);
        router.push(`/dashboard/purchases/orders/new?distributorId=${dist}`);
    };

    return (
        <ModalShell open={open} onClose={() => onOpenChange(false)} title="Create New PO" size="sm"
            footer={<>
                <Button onClick={start} disabled={!dist} className="flex-1">Start building PO</Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </>}>
            <p className="text-sm text-muted-foreground">Pick a distributor. The order is only saved when you save it.</p>
            <div className="space-y-1.5">
                <Label>Distributor *</Label>
                {isLoading ? <p className="text-sm text-muted-foreground">Loading distributors...</p> : (
                    <DistributorCombobox value={dist} onChange={setDist} distributors={distributors} placeholder="Search or select a distributor" />
                )}
            </div>
        </ModalShell>
    );
}
